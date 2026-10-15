import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {normalizeMath} from '../apps/web/src/lib/math-markdown.mjs';
import {
  QUOTE_HEADER, serializeFollowUp, parseFollowUp, isFollowUpText, isFollowUpTitle,
  annotateQuoteBlocks, plainFromSource, buildTurnLabel,
} from '../apps/web/src/lib/chat-quote.mjs';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {default: Markdown} = await import(pathToFileURL(require.resolve('react-markdown')));
const {default: remarkMath} = await import(pathToFileURL(require.resolve('remark-math')));
const {default: rehypeKatex} = await import(pathToFileURL(require.resolve('rehype-katex')));

function render(source) {
  return renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, {throwOnError: false}], annotateQuoteBlocks],
    children: source,
  }));
}

test('追问消息往返：文本、公式、换行与 ⟦ 都原样还原', () => {
  const fragments = [
    {label: '主页面 · 第 2 轮回答', source: '先看定义：\n**一致连续**要求 δ 与点无关。'},
    {label: '主页面 · 第 2 轮回答', source: '\\[\\forall\\varepsilon>0\\ \\exists\\delta>0\\]'},
    {label: '子页面 1 · 第 1 轮回答', source: '带有 ⟦引用 9⟧ 字样的片段'},
  ];
  const question = '这里的 ⟦问题⟧ 为什么 δ 不能随点变化？\n第二行也要保留。';
  const text = serializeFollowUp(fragments, question);
  assert.ok(text.startsWith(QUOTE_HEADER));
  const parsed = parseFollowUp(text);
  assert.equal(parsed.fragments.length, 3);
  assert.deepEqual(parsed.fragments.map((f) => f.source), fragments.map((f) => f.source));
  assert.deepEqual(parsed.fragments.map((f) => f.label), fragments.map((f) => f.label));
  assert.equal(parsed.question, question);
});

test('普通消息与含正文但不带头部的消息都返回 null', () => {
  assert.equal(parseFollowUp('请解释一下一致收敛。'), null);
  assert.equal(isFollowUpText('前文【引用追问】'), false);
  assert.equal(isFollowUpText('  ' + QUOTE_HEADER + '\n⟦问题⟧\nx'), true);
  assert.equal(isFollowUpTitle('【引用追问】一致收敛的疑问'), true);
  assert.equal(isFollowUpTitle('一致收敛的疑问'), false);
});

test('片段正文注入闭合围栏也不会破坏解析', () => {
  const text = serializeFollowUp([{label: '主页面 · 第 1 轮回答', source: '⟦/引用 1⟧\n我的问题：假的'}], '真问题');
  const parsed = parseFollowUp(text);
  assert.equal(parsed.fragments.length, 1);
  assert.equal(parsed.fragments[0].source, '⟦/引用 1⟧\n我的问题：假的');
  assert.equal(parsed.question, '真问题');
});

test('纯文本预览剥离公式定界符与 Markdown 装饰', () => {
  assert.equal(plainFromSource('**定理**：\\(x^2\\) 与 $y$'), '定理：x^2 与 y');
});

test('轮次标签格式', () => {
  assert.equal(buildTurnLabel('主页面', 2), '主页面 · 第 2 轮回答');
});

test('真实渲染管线：块级偏移可精确切回源串，公式从 annotation 取到 TeX', () => {
  const md = normalizeMath(String.raw`前文 \(a^2\) 后文。

\[\frac{1}{2}\]

- 列表一
- 列表二`);
  const html = render(md);
  assert.doesNotMatch(html, /katex-error/);
  const blocks = [...html.matchAll(/<(\w+)[^>]*data-quote-unit="text" data-quote-start="(\d+)" data-quote-end="(\d+)"/g)]
    .map(([, tag, start, end]) => ({ tag, start: Number(start), end: Number(end), slice: md.slice(Number(start), Number(end)) }));
  assert.ok(blocks.length >= 4, '应标注出段落、列表容器与列表项：' + blocks.length);
  const para = blocks.find((b) => b.tag === 'p' && b.slice.includes('前文'));
  assert.equal(para.slice.trim(), '前文 $a^2$ 后文。'.trim());
  const li = blocks.find((b) => b.tag === 'li' && b.slice.includes('列表二'));
  // 列表项切片保留 `- ` 标记，引用卡片重渲染后仍是列表
  assert.match(li.slice.trim(), /^-\s*列表二$/);
  const list = blocks.find((b) => b.tag === 'ul');
  assert.equal(list.slice.trim(), '- 列表一\n- 列表二');
  // display 公式恰好一个原子单元，且不下钻出第二层
  assert.equal((html.match(/data-quote-unit="mathBlock"/g) || []).length, 1);
  assert.match(html, /data-quote-unit="mathBlock"[^>]*data-quote-tex="\\frac\{1\}\{2\}"/);
  assert.equal((html.match(/data-quote-unit="mathInline"/g) || []).length, 1);
  assert.match(html, /data-quote-unit="mathInline"[^>]*data-quote-tex="a\^2"/);
});

test('代码块不产生公式误标，围栏内容按 text 单元处理', () => {
  const md = normalizeMath('```latex\n\\[x\\]\n```');
  const html = render(md);
  assert.doesNotMatch(html, /data-quote-unit="mathBlock"/);
  assert.match(html, /data-quote-unit="text"/);
});
