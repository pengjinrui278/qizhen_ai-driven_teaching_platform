const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const store = read('apps/web/src/lib/quote-store.ts');
const surface = read('apps/web/src/lib/QuoteSurface.tsx');
const tray = read('apps/web/src/lib/QuoteTray.tsx');
const panes = read('apps/web/src/lib/QuotePanes.tsx');
const course = read('apps/web/src/lib/CourseChat.tsx');
const ai = read('apps/web/src/lib/AILearning.tsx');

assert.doesNotMatch(store, /MAX_PIECES|PIECE_SOURCE_LIMIT|pieceLimit|canAddPiece/,
  '引用存储不应再限制片段数量或截断单段回答');
assert.doesNotMatch(surface, /pieceLimit|slice\(0\s*,\s*pieceLimit\)/,
  '手动添加引用不应再截取前若干段');
assert.match(surface, /exists\s*\?\s*current\.filter\(p=>p\.key!==piece\.key\)\s*:\s*\[\.\.\.current,piece\]/,
  '再次点击已选段落应能取消该段');
assert.doesNotMatch(tray, /pieceLimit|\$\{limit\}|\/\s*\{pieceLimit\}/,
  '引用计数不应显示数量上限');
assert.doesNotMatch(panes, /limit=\{12\}/, '子页面不应保留硬编码的12段上限');
for (const [name, source] of [['CourseChat', course], ['AILearning', ai]]) {
  assert.doesNotMatch(source, /pieceLimit|slice\(0\s*,\s*pieceLimit\)/,
    `${name} 整体引用不应截取前12段`);
}

console.log('PASS: 整篇回答可全部引用，且每段可自由添加或取消。');
