// 把静态导出（apps/web/dist）当静态站点起来，给验收脚本一个快速稳定的目标。
// 同时把 /api 反代到本机 API：这样浏览器看到的是同源请求（不受 CORS 名单限制），
// 也能避开 dev server 编译 mermaid 极慢的问题。
// 用法：node scripts/serve-static.cjs [端口] [目录]
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 3016);
const root = path.resolve(process.argv[3] || path.join(__dirname, '..', 'apps', 'web', 'dist'));
const apiTarget = process.env.MIRROR_DEV_API_URL || 'http://127.0.0.1:8015';
const apiUrl = new URL(apiTarget);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  // 静态导出的 RSC 载荷是 .txt，Next 用 text/x-component 取它
  '.txt': 'text/x-component; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.map': 'application/json',
};

if (!fs.existsSync(root)) {
  console.error(`静态导出不存在：${root}\n先跑 apps/web 的 next build（NODE_ENV=production）。`);
  process.exit(1);
}

http.createServer((req, res) => {
  // /api 一律反代给本机 API（同源，免 CORS 名单）
  if ((req.url || '').startsWith('/api/')) {
    const upstream = http.request({
      hostname: apiUrl.hostname, port: apiUrl.port || 80,
      path: req.url, method: req.method, headers: {...req.headers, host: apiUrl.host},
    }, back => { res.writeHead(back.statusCode, back.headers); back.pipe(res); });
    upstream.on('error', () => {
      res.writeHead(502, {'Content-Type': 'application/json; charset=utf-8'});
      res.end(JSON.stringify({detail: `连不上 API（${apiTarget}），请确认后端已启动。`}));
    });
    req.pipe(upstream);
    return;
  }

  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(root, path.normalize(url).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  else if (!path.extname(file)) file += '.html';

  fs.readFile(file, (err, data) => {
    if (err) {
      // 目录形式（/student/notes/ -> /student/notes/index.html）
      fs.readFile(path.join(file.replace(/\.html$/, ''), 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('not found'); return; }
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}).end(data2);
      });
      return;
    }
    res.writeHead(200, {'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
                        'Cache-Control': 'no-store'}).end(data);
  });
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
