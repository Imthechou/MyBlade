const { createServer } = require('node:http');
const { createReadStream, stat } = require('node:fs');
const { extname, relative, resolve, sep } = require('node:path');
const { createHash } = require('node:crypto');
const { createGzip, constants } = require('node:zlib');
const { pipeline } = require('node:stream');
const { version } = require('./package.json');

const root = __dirname;
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
    if (pathname === '/') pathname = '/index.html';
    // Local development/history files are not part of the public game bundle.
    if (pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(403).end('Forbidden'); return;
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
