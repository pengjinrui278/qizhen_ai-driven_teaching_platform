import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {normalizeMath} from '../apps/web/src/lib/math-markdown.mjs';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const {default: Markdown} = await import(pathToFileURL(require.resolve('react-markdown')));
const {default: remarkMath} = await import(pathToFileURL(require.resolve('remark-math')));
const {default: rehypeKatex} = await import(pathToFileURL(require.resolve('rehype-katex')));
test('display delimiters become isolated blocks; code is preserved', () => {
  assert.equal(normalizeMath('`\\[x\\]`'), '`\\[x\\]`');
  assert.equal(normalizeMath('```latex\n\\[x\\]\n```'), '```latex\n\\[x\\]\n```');
  assert.match(normalizeMath('前文\\[x^2\\]后文'), /前文\n\n\$\$\nx\^2\n\$\$\n\n后文/);
});
for (const [name, formula] of [
  ['aligned', String.raw`\begin{aligned}a&=b+c\\d&=e\end{aligned}`],
  ['matrix', String.raw`\begin{pmatrix}1&2\\3&4\end{pmatrix}`],
  ['cases', String.raw`f(x)=\begin{cases}x^2&x>0\\0&x\le0\end{cases}`],
]) test(name + ' renders in actual Markdown/KaTeX pipeline', () => {
  const html = renderToStaticMarkup(React.createElement(Markdown, {
    remarkPlugins: [remarkMath], rehypePlugins: [[rehypeKatex, {throwOnError: false}]],
    children: normalizeMath('说明\\[' + formula + '\\]继续'),
  }));
  assert.match(html, /katex-display/);
  assert.doesNotMatch(html, /katex-error/);
});
