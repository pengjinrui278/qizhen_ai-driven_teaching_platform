const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schedulePath = path.join(root, "apps/web/src/lib/ZjuSchedule.tsx");
const source = fs.readFileSync(schedulePath, "utf8");
const outputDir = path.join(root, "apps/web/public/downloads/zju");
require("./build-zju-connector.cjs").build();

assert.match(
  source,
  /downloads\/zju\/learning-mirror-zju-connector\.zip/,
  "课表页必须向未安装用户提供本地连接器下载入口",
);
assert.match(
  source,
  /先下载并启动本地连接器/,
  "主操作必须先说明需要启动本地连接器",
);
assert.match(
  source,
  /我已启动，打开连接器/,
  "只能在用户确认已启动后打开 127.0.0.1",
);

const archivePath = path.join(
  outputDir,
  "learning-mirror-zju-connector.zip",
);
assert.ok(fs.existsSync(archivePath), "构建必须产出可下载的连接器 ZIP");
const archive = fs.readFileSync(archivePath);
for (const required of [
  "start-local.bat",
  "pyproject.toml",
  "src/learning_mirror_zju_connector/__main__.py",
  "src/learning_mirror_zju_connector/app.py",
  "src/learning_mirror_zju_connector/client.py",
  "src/learning_mirror_zju_connector/index.html",
  "src/learning_mirror_zju_connector/normalizers.py",
]) {
  assert.ok(archive.includes(Buffer.from(required)), `ZIP 缺少 ${required}`);
}

console.log("PASS ZJU connector setup-first flow and downloadable bundle");
fs.rmSync(outputDir, {recursive:true, force:true});
