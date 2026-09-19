# 学镜 ZJU 本地连接器（开发者预览）

这是一个**只监听 `127.0.0.1`** 的本地辅助程序。它在用户电脑上完成浙大统一认证，读取本科教务课表和“学在浙大”待办，并导出经过最小化处理的 JSON。

## 安全边界

- 学号、密码、CAS Cookie、教务 Cookie 和“学在浙大”Session 不发送到 `learningmirror.cn`。
- 密码只用于当前登录请求，不写入文件、数据库或日志。
- Cookie 只存在本进程内存；关闭程序或点击“断开并清除”即清空。
- 本地 HTTP 服务固定绑定 `127.0.0.1:8765`，不监听局域网或公网。
- 只允许预先列出的浙大 HTTPS 主机；遇到验证码、异常跳转或协议变化会停止，而不是绕过验证。
- 导出的 JSON 不包含学号、密码、Cookie 或原始接口响应。

> 这是开发者预览，不代表浙江大学官方授权。请只连接本人账号、小规模测试；公开分发或面向真实用户开放前仍需确认校方规则与数据授权。

## 启动

Windows 用户可以直接双击 `start-local.bat`。首次会在当前目录创建独立的 `.venv` 并安装依赖。

也可以手动启动：

```powershell
cd apps/zju-connector
python -m pip install -e ".[dev]"
python -m learning_mirror_zju_connector
```

程序会打开 <http://127.0.0.1:8765>。在本地页面输入本人账号密码，连接后选择学年和学季即可同步。

也可先启动连接器，再在 `https://learningmirror.cn/student/resources?mode=live` 的“我的课表”中点击“在本机连接浙大”。连接器只向允许的学镜页面回传标准化课表，不回传学号、密码或 Cookie。

## 当前范围

- 本科生统一认证；
- 本科教务课表；
- “学在浙大”待办/DDL；
- 本地预览和标准化 JSON 导出。

暂未包含研究生教务、成绩、考试、课件下载、素拓和智云课堂。下一步应先用本人账号完成真实链路验收，再逐项增加连接器。

## 测试

测试使用 `httpx.MockTransport` 模拟上游，不需要、也不得把真实密码写入测试：

```powershell
pytest
```

## 参考与许可

认证请求顺序和安全边界参考了 MIT 许可的 [CampusOS](https://github.com/Harry-Linner/CampusOS) 固定提交 `58e9474e2ee480170eb6e38b7ef2a785f774eeac`。本实现使用 Python 独立编写；CampusOS 许可证见其仓库 `LICENSE`。
