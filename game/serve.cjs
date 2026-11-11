const { createServer } = require('node:http');
const { createReadStream, stat, readFileSync, statSync } = require('node:fs');
const { extname, relative, resolve, sep } = require('node:path');
const { createHash } = require('node:crypto');
const { createGzip, gzipSync, constants } = require('node:zlib');
const { pipeline } = require('node:stream');
const { version } = require('./package.json');

const root = __dirname;

/**
 * 首屏样式合并：源码仍按 ①tokens ②base ③components ④pages ⑤numeric 分层，
 * 但浏览器只发一个请求。顺序必须与 index.html 注释里的分层一致，否则覆盖关系会变。
 */
const STYLE_ORDER = [
  'css/tokens.css', 'css/base.css', 'css/components.css',
  'css/pages/shell.css', 'css/pages/forge.css', 'css/pages/appraise.css',
  'css/pages/arena.css', 'css/pages/workshop.css', 'css/pages/v19.css',
  'css/numeric.css',
];
let styleBundleCache = null;

function styleBundle() {
  const files = STYLE_ORDER.map(name => resolve(root, name));
  const key = files.map(file => {
    try { const info = statSync(file); return `${info.size}:${Math.floor(info.mtimeMs)}`; }
    catch { return '0'; }
  }).join('|');
  if (styleBundleCache?.key === key) return styleBundleCache;
  const css = files.map(file => {
    try { return readFileSync(file, 'utf8'); }
    catch { return `/* missing: ${relative(root, file)} */`; }
  }).join('\n');
  const etag = `W/"s${createHash('sha1').update(css).digest('hex').slice(0, 16)}"`;
  styleBundleCache = { key, css, etag, gzip: gzipSync(Buffer.from(css), { level: constants.Z_BEST_SPEED }) };
  return styleBundleCache;
}
const projectId = createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 16);
const types = {
  '.jpg': 'image/jpeg', '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json; charset=utf-8', '.hdr': 'application/octet-stream',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const assetTypes = new Set(['.glb', '.hdr', '.jpg', '.png', '.svg', '.webp']);
const textTypes = new Set(['.css', '.gltf', '.html', '.js', '.json', '.mjs', '.svg']);

// 发布白名单（见 docs/发布与目录说明.md）。新增运行期资源目录时必须在此登记。
const PUBLIC_PREFIXES = ['/assets/', '/src/', '/css/'];
const PUBLIC_FILES = new Set(['/index.html', '/legacy.html', '/package.json', '/运行说明.txt']);
function isPublicPath(pathname) {
  return PUBLIC_FILES.has(pathname) || PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function acceptsGzip(value = '') {
  return value.split(',').some(token => {
    const [coding, quality] = token.trim().toLowerCase().split(';').map(part => part.trim());
    return coding === 'gzip' && (quality === undefined || Number(quality.split('=')[1]) > 0);
  });
}

function createGameServer() {
  return createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end('Bad request'); return; }
    if (pathname === '/__bladeforge_health') {
      const body = JSON.stringify({ app: 'blade-forge', version, projectId });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body); return;
    }
    if (pathname === '/__styles.css') {
      const { css, etag, gzip: packed } = styleBundle();
      const headers = {
        'Cache-Control': 'no-cache', ETag: etag, Vary: 'Accept-Encoding',
        'Content-Type': 'text/css; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
      };
      if ((req.headers['if-none-match'] || '').split(',').map(x => x.trim()).includes(etag)) {
        res.writeHead(304, headers).end(); return;
      }
      const useGzip = acceptsGzip(req.headers['accept-encoding']);
      res.writeHead(200, { ...headers, ...(useGzip
        ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': Buffer.byteLength(css) }) });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(useGzip ? packed : css); return;
    }
    if (pathname === '/') pathname = '/index.html';
    // Local development/history files are not part of the public game bundle.
    if (pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden'); return;
    }
    // 发布白名单：只提供游戏运行所需路径；备份、归档、测试、文档、工具与服务端脚本一律 404。
    if (!isPublicPath(pathname)) {
      res.writeHead(404).end('Not found'); return;
    }
    const target = resolve(root, `.${pathname}`);
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || rel.startsWith(sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    stat(target, (err, info) => {
      if (err || !info.isFile()) {
        res.writeHead(!err || err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 500).end('Not found'); return;
      }
      const extension = extname(target).toLowerCase();
      const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      const headers = {
        'Cache-Control': assetTypes.has(extension) ? 'public, max-age=3600' : 'no-cache',
        ETag: etag,
        'Last-Modified': info.mtime.toUTCString(),
        'X-Content-Type-Options': 'nosniff',
      };
      // Compress source modules and the text-encoded offline audio bank. Meshopt
      // GLBs, PNGs and other already-compressed media travel unchanged.
      const compressible = textTypes.has(extension) && info.size >= 2048;
      const gzip = compressible && acceptsGzip(req.headers['accept-encoding']);
      if (compressible) headers.Vary = 'Accept-Encoding';
      // HTML / modules revalidate on each visit; unchanged resources cost no body bytes.
      if ((req.headers['if-none-match'] || '').split(',').map(x => x.trim()).includes(etag)) {
        res.writeHead(304, headers).end(); return;
      }
      res.writeHead(200, { ...headers, 'Content-Type': types[extension] || 'application/octet-stream',
        ...(gzip ? { 'Content-Encoding': 'gzip' } : { 'Content-Length': info.size }) });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = createReadStream(target);
      const body = gzip ? [stream, createGzip({ level: constants.Z_BEST_SPEED })] : [stream];
      pipeline(...body, res, () => {});
    });
  });
}

module.exports = { createGameServer, projectId };
if (require.main === module) {
  const port = Number.parseInt(process.argv[2] || '8123', 10);
  const host = process.argv[3] || '127.0.0.1';
  const server = createGameServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用。请重新双击上一级目录的「开始游戏.cmd」，它会检查并复用已有服务。` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`锻刀大赛 v${version} 已启动：http://${host}:${port}/`);
    console.log('按 Ctrl+C 或关闭此窗口停止服务。');
  });
}
