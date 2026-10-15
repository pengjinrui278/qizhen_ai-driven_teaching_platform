const {app, BrowserWindow, shell, session} = require('electron');
const path = require('node:path');

const APP_URL = process.env.LEARNING_MIRROR_URL || 'https://learningmirror.cn';
const allowedHosts = new Set(['learningmirror.cn', 'www.learningmirror.cn', '127.0.0.1', 'localhost']);

function allowed(url) {
  try {
    const value = new URL(url);
    return ['https:', 'http:'].includes(value.protocol) && allowedHosts.has(value.hostname);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    title: '学镜学习空间',
    width: 1280,
    height: 840,
    minWidth: 390,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: '#eef2f7',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.webContents.setUserAgent(`${win.webContents.getUserAgent()} LearningMirrorDesktop/${app.getVersion()}`);
  win.webContents.setWindowOpenHandler(({url}) => {
    if (allowed(url)) return {action: 'allow'};
    void shell.openExternal(url);
    return {action: 'deny'};
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (allowed(url)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  win.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    win.loadFile(path.join(__dirname, 'offline.html'), {query: {target: url || APP_URL}});
  });
  win.loadURL(APP_URL);
}

app.setAppUserModelId('cn.learningmirror.desktop');
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
