/** 双击入口：固定本地源以保留浏览器存档，复用当前项目已有服务。 */
const { get } = require('node:http');
const { spawn } = require('node:child_process');
const { createGameServer, projectId } = require('../serve.cjs');
const port = 8123;
const host = '127.0.0.1';
const url = `http://${host}:${port}/`;
const noOpen = process.argv.includes('--no-open');

function openGame() {
  console.log(`游戏地址：${url}`);
  if (noOpen) return;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  const browser = spawn(command, args, { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.on('error', () => console.error('自动打开浏览器失败，请复制上方地址到浏览器。'));
  browser.unref();
}

function inspectExisting() {
  return new Promise(resolve => {
    const req = get(url + '__bladeforge_health', { timeout: 2000 }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
      res.on('end', () => {
        try { const info = JSON.parse(body); resolve(res.statusCode === 200 && info.app === 'blade-forge' && info.projectId === projectId); }
        catch (_) { resolve(false); }
      });
      res.on('error', () => resolve(false));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

const server = createGameServer();
server.on('error', async error => {
  if (error.code === 'EADDRINUSE' && await inspectExisting()) {
    console.log('当前项目的游戏服务已经启动，直接打开游戏。');
    openGame();
  } else {
    console.error(error.code === 'EADDRINUSE'
      ? '8123 端口被其他程序占用。请关闭占用程序后重试；为保留原存档，启动器不会自动换端口。'
      : `启动失败：${error.message}`);
    process.exitCode = 1;
  }
});
server.listen(port, host, () => {
  console.log('锻刀大赛服务已启动。保持此窗口打开；关闭窗口或按 Ctrl+C 停止。');
  openGame();
});
