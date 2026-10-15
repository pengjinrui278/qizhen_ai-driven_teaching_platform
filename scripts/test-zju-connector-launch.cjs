const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schedule = fs.readFileSync(path.join(root, "apps/web/src/lib/ZjuSchedule.tsx"), "utf8");
const connector = fs.readFileSync(
  path.join(root, "apps/zju-connector/src/learning_mirror_zju_connector/index.html"),
  "utf8",
);

assert.match(schedule, />导入课表<\/button>/, "课表页应只提供明确的导入入口");
assert.doesNotMatch(schedule, /导入连接器 JSON|下载 Windows 本地连接器|showConnectorSetup/);
assert.match(connector, /id="username"/);
assert.match(connector, /id="password"/);
assert.match(connector, /id="importSchedule"/);
assert.match(connector, /request\("\/api\/connect"/);
assert.match(connector, /request\("\/api\/sync"/);
assert.match(connector, /postMessage\(\{type:"learning-mirror-zju-snapshot"/);
assert.doesNotMatch(connector, /id="year"|id="season"|id="download"|id="send"|id="sync"/);

console.log("PASS one-button timetable import with automatic local sync");
