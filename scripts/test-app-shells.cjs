const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const desktop = read('apps/desktop/main.cjs');
const capacitor = JSON.parse(read('apps/android/capacitor.config.json'));
const manifest = JSON.parse(read('apps/web/public/manifest.webmanifest'));
const mobile = read('apps/web/src/lib/student-home.css');

assert.match(desktop, /https:\/\/learningmirror\.cn/);
assert.match(desktop, /nodeIntegration:\s*false/);
assert.match(desktop, /contextIsolation:\s*true/);
assert.match(desktop, /sandbox:\s*true/);
assert.equal(capacitor.server.url, 'https://learningmirror.cn');
assert.equal(capacitor.server.cleartext, false);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/student?mode=live');
assert.match(mobile, /@media\(max-width:540px\)/);
assert.match(mobile, /position:fixed;left:0;right:0;top:auto;bottom:0/);
assert.match(mobile, /env\(safe-area-inset-bottom\)/);

console.log('PASS: Windows/Android 壳均连接正式站点，移动端导航与安全区适配已启用。');
