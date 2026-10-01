// Serves release assets on 127.0.0.1 with GitHub's URL forms, for the installer tests.
// usage: node test/release-server.mjs DIR    (prints the port, then serves until killed)
//
// DIR holds one folder per tag with its assets, and latest.txt naming the latest tag.
//   /<owner>/<repo>/releases/latest/download/<a>  -> 302 to /<owner>/<repo>/releases/download/<latest>/<a>
//   /<owner>/<repo>/releases/download/<tag>/<a>   -> 302 to /assets/<tag>/<a>
//   /assets/<tag>/<a>                             -> the file, or 404 when it is missing
// So a missing asset gives 302 and then 404, as on GitHub. Control files beside an asset:
//   .truncate-<a>  holds N: send a full Content-Length, then N bytes, then drop the connection
//   .corrupt-<a>   present: flip every bit of the middle byte
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
if (!process.argv[2] || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
  console.error('usage: node test/release-server.mjs DIR');
  process.exit(2);
}

// One path segment that cannot name a control file or leave the folder.
const plain = (s) => typeof s === 'string' && s !== '' && !s.startsWith('.') && !s.includes('/');

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Content-Length': 0 });
  res.end();
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

function serve(req, res, tag, asset) {
  const file = join(root, tag, asset);
  if (!statSync(file, { throwIfNoEntry: false })?.isFile()) return notFound(res);
  const body = readFileSync(file);
  if (existsSync(join(root, tag, `.corrupt-${asset}`)) && body.length) body[body.length >> 1] ^= 0xff;
  const truncate = join(root, tag, `.truncate-${asset}`);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': body.length });
  if (existsSync(truncate)) {
    const n = Number.parseInt(readFileSync(truncate, 'utf8'), 10) || 0;
    res.write(body.subarray(0, n), () => req.socket.destroy());
  } else {
    res.end(body);
  }
}

const server = createServer((req, res) => {
  let parts;
  try {
    parts = new URL(req.url, 'http://127.0.0.1').pathname.split('/').slice(1).map(decodeURIComponent);
  } catch {
    return notFound(res);
  }
  const [owner, repo, releases, kind, third, fourth] = parts;
  if (parts.length === 3 && owner === 'assets' && plain(repo) && plain(releases)) return serve(req, res, repo, releases);
  if (parts.length !== 6 || !plain(owner) || !plain(repo) || releases !== 'releases') return notFound(res);
  const base = `/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases`;
  if (kind === 'latest' && third === 'download' && plain(fourth)) {
    const latest = existsSync(join(root, 'latest.txt')) ? readFileSync(join(root, 'latest.txt'), 'utf8').trim() : '';
    if (!plain(latest)) return notFound(res);
    return redirect(res, `${base}/download/${encodeURIComponent(latest)}/${encodeURIComponent(fourth)}`);
  }
  if (kind === 'download' && plain(third) && plain(fourth)) {
    return redirect(res, `/assets/${encodeURIComponent(third)}/${encodeURIComponent(fourth)}`);
  }
  notFound(res);
});

server.listen(0, '127.0.0.1', () => console.log(server.address().port));
