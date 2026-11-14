/* A small receiver for the webhook destination: saves each guide it is sent
   as a folder with guide.json, one picture per step and a README.md you can
   read on GitHub or in any Markdown viewer. No dependencies.

   Run:  node examples/webhook-server.js            (listens on 127.0.0.1:8787)
         PORT=9000 SECRET=change-me node examples/webhook-server.js
   Then in the extension's Settings choose "Webhook" with the address
   http://127.0.0.1:8787/guides and, if you set SECRET, the same secret.

   It is a starting point for your own system, not a server to put on the
   internet as it is. */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.SECRET || '';
const DIR = path.resolve(process.env.GUIDES_DIR || path.join(process.cwd(), 'guides'));
const MAX = 200 * 1024 * 1024;   // a long guide with clips is tens of MB, never this

function answer(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// the id becomes a folder name, so only letters and digits get through
function safeId(id) { return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'guide-' + Date.now(); }

function save(guide) {
  const id = safeId(guide.id);
  const dir = path.join(DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'guide.json'), JSON.stringify(guide, null, 2));
  const lines = ['# ' + (guide.title || 'Guide'), ''];
  if (guide.intro) lines.push(guide.intro, '');
  (guide.steps || []).forEach((s, i) => {
    const n = i + 1;
    lines.push(n + '. ' + (s.sentence || ''));
    if (s.image && s.image.data) {
      const name = 'step-' + String(n).padStart(2, '0') + '.jpg';
      fs.writeFileSync(path.join(dir, name), Buffer.from(s.image.data, 'base64'));
      lines.push('', '   ![Step ' + n + '](' + name + ')', '');
    }
    // a clip is kept as numbered pictures; turn them into one file however your system likes
    ((s.clip && s.clip.frames) || []).forEach((f, k) => {
      fs.writeFileSync(path.join(dir, 'step-' + String(n).padStart(2, '0') + '-clip-' + k + '.jpg'), Buffer.from(f, 'base64'));
    });
  });
  fs.writeFileSync(path.join(dir, 'README.md'), lines.join('\n') + '\n');
  return id;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/guides') return answer(res, 404, { error: 'POST guides to /guides' });
  if (SECRET && req.headers.authorization !== 'Bearer ' + SECRET) return answer(res, 401, { error: 'Wrong or missing secret' });
  let size = 0; const parts = [];
  req.on('data', (c) => { size += c.length; if (size > MAX) req.destroy(); else parts.push(c); });
  req.on('end', () => {
    let guide;
    try { guide = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { return answer(res, 400, { error: 'Not JSON' }); }
    if (!guide || guide.format !== 'step-guide/1') return answer(res, 400, { error: 'Expected format step-guide/1' });
    const id = save(guide);
    console.log('saved "' + (guide.title || id) + '" (' + (guide.steps || []).length + ' steps) in ' + path.join(DIR, id));
    // the guide's page in the extension links to this address
    answer(res, 200, { url: 'file://' + path.join(DIR, id, 'README.md') });
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => console.log('Saving guides into ' + DIR + '\nWebhook address: http://127.0.0.1:' + PORT + '/guides'));
}
module.exports = { server, save };
