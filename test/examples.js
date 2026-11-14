/* Checks examples/webhook-server.js: a guide posted to it is saved as a
   folder, a wrong secret and a wrong format are refused, and an id cannot
   climb out of the guides folder. Run: node test/examples.js */
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-guides-'));
process.env.GUIDES_DIR = dir;
process.env.SECRET = 'test-secret';
const { server } = require('../examples/webhook-server.js');

function fail(msg) { console.error('FAIL ' + msg); process.exitCode = 1; }
function ok(msg) { console.log('ok   ' + msg); }

// a 1x1 JPEG stands in for a picture
const PIXEL = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const guide = {
  format: 'step-guide/1', id: '../../escape', title: 'How to: Demo', intro: '',
  steps: [
    { n: 1, sentence: 'Click "Save changes".', image: { type: 'image/jpeg', data: PIXEL }, clip: null },
    { n: 2, sentence: 'Open the menu.', image: { type: 'image/jpeg', data: PIXEL }, clip: { type: 'image/jpeg', frames: [PIXEL, PIXEL] } }
  ]
};

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + server.address().port + '/guides';
  const post = (body, token) => fetch(url, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) });
  try {
    (await post(guide, 'wrong')).status === 401 ? ok('wrong secret refused') : fail('wrong secret accepted');
    (await post({ format: 'other' }, 'test-secret')).status === 400 ? ok('other formats refused') : fail('other format accepted');
    const res = await post(guide, 'test-secret');
    const body = await res.json();
    res.status === 200 && body.url ? ok('guide accepted, answered with a url') : fail('answer ' + res.status);
    const saved = fs.readdirSync(dir);
    saved.length === 1 && saved[0] === 'escape' ? ok('the id cannot leave the guides folder') : fail('saved as ' + JSON.stringify(saved));
    const files = fs.readdirSync(path.join(dir, saved[0])).sort();
    const want = ['README.md', 'guide.json', 'step-01.jpg', 'step-02-clip-0.jpg', 'step-02-clip-1.jpg', 'step-02.jpg'];
    JSON.stringify(files) === JSON.stringify(want) ? ok('saved guide.json, README.md, a picture per step and the clip pictures') : fail('files ' + JSON.stringify(files));
    fs.readFileSync(path.join(dir, saved[0], 'README.md'), 'utf8').includes('2. Open the menu.') ? ok('README.md lists the steps') : fail('README.md');
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
