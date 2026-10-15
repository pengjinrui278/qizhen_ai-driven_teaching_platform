const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sidebar = fs.readFileSync(path.join(root, "apps/web/src/lib/StudentSidebar.tsx"), "utf8");
const caddy = fs.readFileSync(path.join(root, "Caddyfile"), "utf8");

assert(!sidebar.includes('from "next/link"'), "学生侧边栏必须使用完整页面导航，避免跨版本 RSC 路由失配");
assert(sidebar.includes('<a key={key} href={href(key)}'), "学生导航项必须使用原生链接");
assert(caddy.includes("path('*.txt') && header({'Sec-Fetch-Dest':'document'})"), "Caddy 必须识别顶层 RSC 文档请求");
assert(caddy.includes("uri strip_suffix .txt"), "Caddy 必须移除误打开的 RSC 后缀");
assert(caddy.includes("redir {uri} 302"), "顶层 RSC 文档必须重定向回 HTML 路径");

console.log("PASS static navigation cannot expose raw RSC payloads");
