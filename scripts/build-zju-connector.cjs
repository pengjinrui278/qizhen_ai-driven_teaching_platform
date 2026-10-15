// Build a deterministic, source-only Windows bundle for the local ZJU connector.
// The bundle never contains credentials and only installs declared Python dependencies when started.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {zip} = require("./build-windows-helper.cjs");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "apps/zju-connector");
const out = path.join(root, "apps/web/public/downloads/zju");
const archiveName = "learning-mirror-zju-connector.zip";
const files = [
  "start-local.bat",
  "pyproject.toml",
  "src/learning_mirror_zju_connector/__init__.py",
  "src/learning_mirror_zju_connector/__main__.py",
  "src/learning_mirror_zju_connector/app.py",
  "src/learning_mirror_zju_connector/client.py",
  "src/learning_mirror_zju_connector/index.html",
  "src/learning_mirror_zju_connector/normalizers.py",
];

const instructions = `学镜学习空间·浙大本地连接器\r\n\r\n1. 请先解压缩全部文件，不要直接在 ZIP 内运行。\r\n2. 确保电脑已安装 Python 3.11 或更高版本。\r\n3. 双击 start-local.bat，首次启动会创建本地环境并安装依赖。\r\n4. 保持命令行窗口运行，回到学镜点击“我已启动，打开连接器”。\r\n\r\n连接器仅监听 127.0.0.1:8765。学号、密码和 Cookie 不会发送到学镜服务器。\r\n`;

function build(){
  fs.mkdirSync(out, {recursive:true});
  const entries = files.map(name => [name, fs.readFileSync(path.join(source, name))]);
  entries.unshift(["使用说明.txt", Buffer.from(instructions, "utf8")]);
  const archive = zip(entries);
  fs.writeFileSync(path.join(out, archiveName), archive);
  const manifest = {
    version:"0.1.0",
    file:archiveName,
    sha256:crypto.createHash("sha256").update(archive).digest("hex"),
    bytes:archive.length,
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`ZJU connector: ${archiveName} built (${archive.length} bytes)`);
  return manifest;
}

if(require.main === module) build();
module.exports = {build};
