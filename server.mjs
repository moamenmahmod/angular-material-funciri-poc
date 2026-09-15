import {createServer} from 'node:http';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';

const APP_HOST = '127.0.0.1';
const APP_PORT = 4216;
const LOGGER_HOST = '127.0.0.1';
const LOGGER_PORT = 4217;
const DIST = join(import.meta.dirname, 'dist', 'browser');
const HITS_FILE = join(import.meta.dirname, 'logger-hits.json');
const hits = [];

function saveHits() {
  writeFileSync(HITS_FILE, `${JSON.stringify(hits, null, 2)}\n`);
}

function sendFile(res, file) {
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  res.writeHead(200, {'content-type': contentTypes[extname(file)] ?? 'application/octet-stream'});
  res.end(readFileSync(file));
}

const appServer = createServer((req, res) => {
  const requestPath = (req.url ?? '/').split('?')[0];
  const relative = requestPath.replace(/^\/+/, '');
  const candidate = normalize(join(DIST, relative));
  if (relative && candidate.startsWith(DIST) && existsSync(candidate)) {
    sendFile(res, candidate);
    return;
  }
  sendFile(res, join(DIST, 'index.html'));
});

const loggerServer = createServer((req, res) => {
  const receivedAt = new Date().toISOString();
  if (
    (req.url ?? '').startsWith('/collect') ||
    (req.url ?? '').startsWith('/paint-red') ||
    (req.url ?? '').startsWith('/paint-green')
  ) {
    const record = {
      sequence: hits.length + 1,
      receivedAt,
      method: req.method,
      requestTarget: req.url,
      referer: req.headers.referer ?? '',
      secFetchSite: req.headers['sec-fetch-site'] ?? '',
      secFetchMode: req.headers['sec-fetch-mode'] ?? '',
      remoteAddress: req.socket.remoteAddress,
    };
    hits.push(record);
    saveHits();
    console.log(`[logger hit ${record.sequence}] ${record.requestTarget}`);
    res.writeHead(200, {
      'content-type': 'image/svg+xml',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    const paint = (req.url ?? '').startsWith('/paint-green') ? '#00ff00' : '#ff0000';
    res.end(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fresh-gradient">' +
        `<stop offset="0" stop-color="${paint}"/><stop offset="1" stop-color="${paint}"/>` +
        '</linearGradient></defs></svg>',
    );
    return;
  }
  if (req.url === '/hits') {
    res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
    res.end(JSON.stringify(hits, null, 2));
    return;
  }
  res.writeHead(404, {'content-type': 'text/plain'});
  res.end('not found');
});

saveHits();
appServer.listen(APP_PORT, APP_HOST, () => {
  console.log(`SPA: http://localhost:${APP_PORT}//${LOGGER_HOST}:${LOGGER_PORT}/collect`);
});
loggerServer.listen(LOGGER_PORT, LOGGER_HOST, () => {
  console.log(`logger: http://${LOGGER_HOST}:${LOGGER_PORT}/hits`);
});

function shutdown() {
  appServer.close();
  loggerServer.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
