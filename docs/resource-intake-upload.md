# 把教材放进资源中心（生产服务器）

> 面向：有 `124.220.5.87` SSH 权限的同学
> 目标：让 https://learningmirror.cn/student/resources 里出现教材（数学分析上下册 + 电子电路基础）
> 预计耗时：15 分钟（含 121 MB 上传）

---

## 0. 为什么现在资源中心是空的

不是「忘了传文件」这么简单，有**两个原因叠在一起**：

1. **容器里根本看不到那个目录。** 教材清单放在服务器的 `data/resource-intake/R3/`，而 `compose.prod.yml` 里 api 容器只挂了 `coursepacks` 和 `materials` 两个目录，**没有挂 `data/`**。所以在容器里 `/app/data/resource-intake/R3` 这个路径不存在。
2. **那份清单不在 Git 里。** `data/` 是 gitignore 的，`deploy-prod.sh` 只做 `git reset --hard origin/main`，所以清单和大文件永远不会跟着部署走。

两个都不解决，传了文件也看不到。

> ⚠️ `docs/deploy.md` 里那句「`git lfs pull` 下载教材大文件」是**过期的**：`.gitattributes` 虽然写了 `/materials/** filter=lfs`，但 `.gitignore` 第 6 行就是 `materials/`，main 上实际没有跟踪任何 materials 文件。**别去 `git lfs pull`，不会有东西下来。**

---

## 1. 前置：要拿到的东西

| 东西 | 从哪来 |
|---|---|
| `R3/` 目录（6 个文件，121 MB） | 主负责人给你的压缩包 / 网盘链接 |
| 服务器 SSH | `ssh ubuntu@124.220.5.87` |
| 服务器上的 `.env` | 已经在 `/home/ubuntu/app/.env`，**不要动也不要提交** |

`R3/` 里应该是这 6 个文件：

```
catalog.json                          教材清单（书目信息）
rights.json                           授权清单（谁能看到、谁能读原件）
circuits-alexander-sadiku-6e.pdf      12,996,692 字节
circuits-alexander-sadiku-6e.png         275,054 字节
chen-jixiu-3e-vol1.pdf                59,252,386 字节
chen-jixiu-3e-vol1.png                   196,029 字节
chen-jixiu-3e-vol2.pdf                54,311,331 字节
chen-jixiu-3e-vol2.png                   241,364 字节
```

---

## 2. 操作步骤

### 第 1 步：确认代码已经带上挂载

```bash
ssh ubuntu@124.220.5.87
cd /home/ubuntu/app
git fetch origin && git log --oneline -1 origin/main
grep -n "resource-intake" compose.prod.yml
```

**必须能看到这一行**：

```
      - ./data/resource-intake:/app/data/resource-intake:ro
```

看不到就说明挂载那次提交还没合进 main，**先停下来找主负责人**，别继续传文件。

### 第 2 步：**先用 ubuntu 身份建目录**

```bash
mkdir -p /home/ubuntu/app/data/resource-intake/R3
```

⚠️ **这一步不能跳、也不能放到部署之后。** 如果先部署、再建目录，Docker 会以 **root 属主**把缺失的挂载点建出来，之后 `ubuntu` 用户就写不进去了（会报 Permission denied），得用 sudo 改属主才能救。

### 第 3 步：上传（在你自己的电脑上执行，不是服务器上）

```bash
# 把 <解压后的目录> 换成你解压出来的 R3 目录路径
scp -r <解压后的目录>/R3/* ubuntu@124.220.5.87:/home/ubuntu/app/data/resource-intake/R3/
```

上传完在服务器上核对：

```bash
cd /home/ubuntu/app/data/resource-intake/R3
ls -la
sha256sum chen-jixiu-3e-vol1.pdf chen-jixiu-3e-vol2.pdf circuits-alexander-sadiku-6e.pdf
```

**三个 PDF 的 sha256 必须是**（catalog.json 里登记了，对不上后端会判定为「原件待就绪」而不是报错，很容易以为传成功了）：

```
730d822036865ff647c9dac6170b5df0fa6646344a2a524263969d0d21f60f84  chen-jixiu-3e-vol1.pdf
e7a1f37b894ebff8f0b24e16a90fd623ac6b8f0424c2f810cdab080088ea2927  chen-jixiu-3e-vol2.pdf
d34d111a0a34b17f1b2246355d9fa44eb453a07ca08305b058499c83ffc47569  circuits-alexander-sadiku-6e.pdf
```

### 第 4 步：改 `rights.json` —— **这一步最容易漏**

`rights.json` 里的 `content_accounts` 是**一串账号 ID**，决定谁能打开 PDF。随包给的那份里的 ID 是**开发机上的账号**，跟生产库里的对不上 —— 直接传上去，结果是「目录能看见书名，但谁都点不开」。

先查生产库里的账号：

```bash
cd /home/ubuntu/app
docker compose -f compose.prod.yml exec -T postgres \
  psql -U mirror -d mirror -c "select id, username, nickname, role from accounts where status='active' order by created_at;"
```

然后编辑 `R3/rights.json`，把要授权的账号 ID 填进对应条目的 `content_accounts`（格式照抄现有那几个 32 位十六进制串）。三个 resource_id 是：

```
circuits-alexander-sadiku-6e
chen-jixiu-3e-vol1
chen-jixiu-3e-vol2
```

`rights.json` 每个条目的含义：

| 字段 | 作用 |
|---|---|
| `catalog_authenticated` | 登录用户能不能**看到书名/版次/封面**（现在是 `true`） |
| `catalog_accounts` | 额外允许的账号（一般留空） |
| `content_authenticated` | **所有**登录用户能不能读 PDF。设成 `true` 等于对全站公开 |
| `content_accounts` | 额外允许读 PDF 的账号 ID —— **要授权谁就填这里** |

> 📌 **这是要主负责人拍板的事**，别自己决定。`docs/data-rights.md` 写得很清楚：「用户持有电子书不自动等于可向公网分发，正式分享须另行确认使用范围」。**建议保持 `content_authenticated: false`，只把确有必要的人加进 `content_accounts`。**

### 第 5 步：部署

```bash
ssh ubuntu@124.220.5.87 'bash /home/ubuntu/app/scripts/deploy-prod.sh'
```

这个脚本会 `git reset --hard origin/main`、重建容器（**这一步才会让新挂载生效**）、刷新课程包，最后做健康检查。

> `git reset --hard` **不会**删掉你刚传的文件 —— `data/` 是 gitignore 的，属于未跟踪文件。以后每次部署都不用重传。

### 第 6 步：验证

```bash
# 容器里能不能看到文件
docker compose -f compose.prod.yml exec -T api ls -la /app/data/resource-intake/R3/

# 接口有没有吐出来（未登录会 401，正常）
curl -s -o /dev/null -w "%{http_code}\n" https://learningmirror.cn/api/v2/material-library
```

然后用**被授权的那个账号**登录 https://learningmirror.cn/student/resources ，应该看到：

```
共 3 项可见资料 · 第 1 页
[封面] 数学分析（第三版）上册   第三版 · 上册   陈纪修 / 於崇华 / 金路   381 页   [主教材]   [阅读 PDF]
[封面] 数学分析（第三版）下册   第三版 · 下册   ...                        442 页   [主教材]   [阅读 PDF]
[封面] Fundamentals of Electric Circuits   第六版   ...                    990 页             [阅读 PDF]
```

**按钮文案是判断依据**：`阅读 PDF` = 一切正常；`访问受限` = 第 4 步的账号 ID 没配对；`原件待就绪` = 文件没传全或 sha256 对不上。

---

## 3. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面「共 0 项可见资料」 | 挂载没生效，或 `catalog.json` 不在容器里 | 回去看第 1、2 步；`docker compose exec api ls /app/data/resource-intake/R3/` |
| 目录是空的，`ls` 报 Permission denied | 目录被 Docker 以 root 建出来了 | `sudo chown -R ubuntu:ubuntu /home/ubuntu/app/data` |
| 有书名但按钮是「访问受限」 | `content_accounts` 里没有当前账号 | 回第 4 步 |
| 有书名但按钮是「原件待就绪」 | PDF 缺文件 / sha256 不匹配 / 文件不是真 PDF | 回第 3 步核 sha256 |
| 页面报「资源目录暂不可用」(503) | `catalog.json` 格式不对 | 用 `python -m json.tool catalog.json` 验一下 JSON |
| 封面显示「暂无可用封面」 | `.png` 没传或文件名不一致 | 封面文件名必须与 `catalog.json` 里的 `cover_filename` 完全一致 |

---

## 4. 授权与合规（请务必看一遍）

- 这批教材在 `docs/data-rights.md` 下的定位是**受控范围内的教学使用**，不是公开分发。上线前请确认使用范围。
- 参赛材料的红线是「样式与提交材料中不得包含教材原文或原书习题全文」——**平台内的受控阅读**与**把教材正文放进提交材料**是两件事，后者不要做。
- 三个 resource_id 都是服务端**显式白名单**（`resource_library.py` 的 `INTAKE_ALLOWLIST`）。清单里出现不等于会展示 —— 这是刻意设计的，避免「传上来就公开」。
- 教材原件不要提交进 Git 仓库。

---

## 5. 一页速查

```bash
# 1. 确认挂载已在 main
ssh ubuntu@124.220.5.87
cd /home/ubuntu/app && git fetch origin && grep -n "resource-intake" compose.prod.yml

# 2. 先建目录（必须用 ubuntu 身份，且在部署之前）
mkdir -p /home/ubuntu/app/data/resource-intake/R3

# 3. 上传（在自己的电脑上）
scp -r ./R3/* ubuntu@124.220.5.87:/home/ubuntu/app/data/resource-intake/R3/

# 4. 核 sha256，并按生产账号 ID 改 rights.json
#    docker compose -f compose.prod.yml exec -T postgres psql -U mirror -d mirror \
#      -c "select id, username from accounts where status='active';"

# 5. 部署（让新挂载生效）
ssh ubuntu@124.220.5.87 'bash /home/ubuntu/app/scripts/deploy-prod.sh'

# 6. 用被授权的账号打开 https://learningmirror.cn/student/resources 看有没有「阅读 PDF」
```
