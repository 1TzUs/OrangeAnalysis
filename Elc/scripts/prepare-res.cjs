/**
 * 组装 Electron 内置资源（res/web、res/ocr）
 * 从各打包产物复制到 Elc/res，供 electron-builder extraResources 使用。
 * 运行：npm run prepare
 */
const fs = require('node:fs');
const path = require('node:path');

const ELc_ROOT = path.resolve(__dirname, '..');
const THREE_ROOT = path.resolve(ELc_ROOT, '..');
const RES = path.join(ELc_ROOT, 'res');

// Web 产物来源：server/build/web/web_service.exe + server/public/*
const WEB_EXE_SRC = path.join(THREE_ROOT, 'server', 'build', 'web', 'web_service.exe');
const PUBLIC_SRC = path.join(THREE_ROOT, 'server', 'public');
// OCR 产物来源：build/elc-ocr/ocr_service.exe
const OCR_EXE_SRC = path.join(THREE_ROOT, 'build', 'elc-ocr', 'ocr_service.exe');

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const sp = path.join(src, entry.name);
    const dp = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

function assertFile(p, label) {
  if (!fs.existsSync(p)) {
    console.error(`[prepare] 缺少 ${label}: ${p}`);
    process.exit(1);
  }
}

assertFile(WEB_EXE_SRC, 'web_service.exe');
assertFile(OCR_EXE_SRC, 'ocr_service.exe');
assertFile(PUBLIC_SRC, 'server/public');

// Web：exe + public
const resWeb = path.join(RES, 'web');
rmrf(resWeb);
fs.mkdirSync(resWeb, { recursive: true });
fs.copyFileSync(WEB_EXE_SRC, path.join(resWeb, 'web_service.exe'));
copyDir(PUBLIC_SRC, path.join(resWeb, 'public'));

// OCR：单文件 exe（--onefile）
const resOcr = path.join(RES, 'ocr');
rmrf(resOcr);
fs.mkdirSync(resOcr, { recursive: true });
fs.copyFileSync(OCR_EXE_SRC, path.join(resOcr, 'ocr_service.exe'));

console.log('[prepare] res/ 组装完成:');
console.log('  -', path.join(resWeb, 'web_service.exe'));
console.log('  -', path.join(resWeb, 'public'));
console.log('  -', path.join(resOcr, 'ocr_service.exe'));