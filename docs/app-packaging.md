# 学镜桌面端与 Android 端

## 同步方式

Windows Electron 与 Android Capacitor 都以 `https://learningmirror.cn` 为唯一内容源。网页发布后，应用下一次打开或刷新时直接获得新版本，不需要为普通页面更新重新安装客户端。原生壳仅在权限、图标、最低系统版本或安全策略变化时重新发版。

## Windows

- 安装包：`LearningMirror-Windows-Setup-<版本>-<架构>.exe`
- 便携版：`LearningMirror-Windows-Portable-<版本>-<架构>.exe`
- 本地构建：`pnpm build:desktop`
- 默认禁用 Node 注入，启用上下文隔离和渲染进程沙箱；非学镜域名使用系统浏览器打开。

## Android

- 测试安装包：`LearningMirror-Android.apk`
- 最低版本：Android 7.0（API 24）
- 本地构建：安装 JDK 21 与 Android SDK 后运行 `pnpm build:android`
- 客户端只允许 HTTPS 正式站点，不允许明文网络请求。

当前自动化产物是内部测试签名 APK。若要提交应用商店或长期覆盖安装，应在仓库外生成并妥善保管发布密钥，再通过 GitHub Actions Secrets 注入签名参数；不得把 `.jks`、口令或真实账号提交到仓库。

## 自动打包

`.github/workflows/build-apps.yml` 支持手动运行，也会在推送 `app-v*` 标签时构建：

- Windows x64 安装版与便携版
- Windows ARM64 安装版与便携版
- Android APK

标签构建成功后，产物会同时进入 GitHub Release，便于统一下载。
