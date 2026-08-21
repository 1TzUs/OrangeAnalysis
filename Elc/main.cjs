/**
 * 战报分析 - Electron 主进程（壳进程）
 * 职责：首次运行时把内置的 web/、ocr/ 复制到用户数据目录，拉起两个 exe，
 * 等待 Web 服务就绪后加载 localhost:3001 到窗口；退出时关闭两个子进程。
 *
 * 运行时放在 userData 下而非 resources：保证 records.json / tmp 可写且持久
 * （resources 在安装后被只读，portable 单 exe 每次解压到临时目录会丢数据）。
 */
const { app, BrowserWindow } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

// 是否开发模式（ELC_DEV=1）：直接使用仓库内 res/web、res/ocr，不复制
const DEV_MODE = !!process.env.ELC_DEV;

// 内置资源根：打包后由 electron-builder 复制到 resources（源于 res/）
const RES_DIR = () => (DEV_MODE ? path.resolve(__dirname, 'res') : process.resourcesPath);
// 运行时根：用户数据目录（可写、持久）
const RUN_DIR = () => (DEV_MODE ? path.resolve(__dirname, 'res') : path.join(app.getPath('userData'), 'runtime'));

const WEB_DIR = () => path.join(RUN_DIR(), 'web');
const OCR_DIR = () => path.join(RUN_DIR(), 'ocr');
const WEB_EXE = () => path.join(WEB_DIR(), 'web_service.exe');
const OCR_EXE = () => path.join(OCR_DIR(), 'ocr_service.exe');

const WEB_PORT = 3001;
const OCR_PORT = 5050;

let childWeb = null;
let childOcr = null;
let mainWindow = null;

/** 递归复制目录 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

/** 确保运行时目录存在：从内置资源同步 web_/ocr_（仅缺失时复制一次） */
function ensureRuntime() {
  if (DEV_MODE) return; // 开发模式直接引用
  if (!fs.existsSync(WEB_EXE())) copyDir(path.join(RES_DIR(), 'web'), WEB_DIR());
  if (!fs.existsSync(OCR_EXE())) copyDir(path.join(RES_DIR(), 'ocr'), OCR_DIR());
}

/** 等待某个 HTTP 服务就绪（轮询） */
function waitForServer(url, timeoutMs = 40000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`服务 ${url} 在 ${timeoutMs}ms 内未就绪`));
        } else {
          setTimeout(tryOnce, 700);
        }
      });
      req.setTimeout(3000, () => req.destroy());
    };
    tryOnce();
  });
}

/** 启动一个 exe 并记录句柄 */
function startService(exe, args, dir) {
  const child = spawn(exe, args, {
    cwd: dir,
    env: { ...process.env },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', (err) => console.error(`启动失败 ${exe}:`, err.message));
  return child;
}

/** 结束子进程（Windows 用 taskkill 连带结束孙进程） */
function kill(child) {
  if (!child || child.pid == null) return;
  try {
    execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } catch (_) {
    try { child.kill(); } catch (_) { /* 已退出 */ }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: '战报分析',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  ensureRuntime();
  if (!fs.existsSync(WEB_EXE())) throw new Error(`未找到 ${WEB_EXE()}`);
  if (!fs.existsSync(OCR_EXE())) throw new Error(`未找到 ${OCR_EXE()}`);

  // 1) 先起 OCR（Web 依赖 OCR），再起 Web
  childOcr = startService(OCR_EXE(), [String(OCR_PORT)], OCR_DIR());
  await new Promise((r) => setTimeout(r, 900));
  childWeb = startService(WEB_EXE(), [], WEB_DIR());

  // 2) 等待 Web 就绪后开窗口
  await waitForServer(`http://localhost:${WEB_PORT}`);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  kill(childWeb);
  kill(childOcr);
});