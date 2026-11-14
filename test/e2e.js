/* End-to-end check in a real Chromium: makes a guide on a local demo site,
   undoes a step, finishes, checks what was kept, downloads the HTML and
   sends the guide to a local webhook.

   Run: node test/e2e.js   (needs the "playwright" package and its Chromium)

   Pressing the toolbar icon cannot be scripted, so the test loads a copy of
   the extension that may reach 127.0.0.1 and starts the guide the way the
   popup's button does. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || path.join(ROOT, 'test', 'out');
const SECRET = 'hunter2-should-never-be-kept';
const TYPED = 'typed-email@example.com';

function fail(msg) { console.error('FAIL ' + msg); process.exitCode = 1; }
function ok(msg) { console.log('ok   ' + msg); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const received = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        received.push({ auth: req.headers.authorization, body: JSON.parse(body) });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ url: 'https://example.com/guides/1' }));
      });
      return;
    }
    const file = path.join(__dirname, 'site', path.basename(req.url.split('?')[0]) || 'a.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(file));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  // a copy of the extension that may reach the demo site (stands in for the icon press)
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-'));
  fs.cpSync(ROOT, ext, { recursive: true, filter: (p) => !/[\\/](\.git|node_modules|test)([\\/]|$)/.test(p.slice(ROOT.length)) });
  const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  man.host_permissions = ['<all_urls>'];   // captureVisibleTab needs all sites or a real icon press
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext]
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = sw.url().split('/')[2];

    const page = await ctx.newPage();
    await page.goto(base + '/a.html');
    const started = await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: url });
      return new Promise((r) => start(tab.id, r));
    }, base + '/a.html');
    started.ok ? ok('guide started') : fail('start: ' + JSON.stringify(started));

    const panel = page.locator('step-guide-panel');
    await panel.waitFor({ state: 'attached' });
    ok('panel is on the page');
    await page.screenshot({ path: path.join(OUT, 'panel-1280.png') });

    const pause = () => page.waitForTimeout(900);
    await page.click('#save'); await pause();
    await page.click('#email'); await page.keyboard.type(TYPED); await pause();
    await page.click('#pw'); await page.keyboard.type(SECRET); await pause();
    await page.click('#news'); await pause();
    await page.click('#news'); await pause();         // undone below
    const count = () => panel.evaluate((h) => h.shadowRoot.querySelector('.count b').textContent);
    (await count()) === '5' ? ok('5 clicks, 5 steps') : fail('count after 5 clicks: ' + (await count()));
    await panel.evaluate((h) => [...h.shadowRoot.querySelectorAll('button')].find((b) => /Undo/.test(b.textContent)).click());
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, 'panel-steps-1280.png') });
    (await count()) === '4' ? ok('Undo took one out') : fail('count after undo: ' + (await count()));

    // Pause: a click while paused is not a step
    await panel.evaluate((h) => [...h.shadowRoot.querySelectorAll('button')].find((b) => b.textContent === 'Pause').click());
    await page.waitForTimeout(300);
    await page.click('#save'); await pause();
    (await count()) === '4' ? ok('a click while paused is not kept') : fail('count while paused: ' + (await count()));
    await panel.evaluate((h) => [...h.shadowRoot.querySelectorAll('button')].find((b) => b.textContent === 'Resume').click());
    await page.waitForTimeout(300);

    // a move to another page of the same site: the panel comes back by itself
    await page.click('#next'); await page.waitForLoadState('load');
    await page.locator('step-guide-panel').waitFor({ state: 'attached', timeout: 5000 });
    ok('panel came back after moving to another page');
    await page.waitForTimeout(500);
    await page.click('text=Cards'); await pause();
    // a click that sets something moving: its step gets a clip
    await page.click('#more'); await page.waitForTimeout(3500);
    // a drag: one step, and its clip shows the thing moving
    const kb = await page.locator('#knob').boundingBox();
    await page.mouse.move(kb.x + 20, kb.y + 20); await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(kb.x + 20 + i * 25, kb.y + 20); await page.waitForTimeout(100); }
    await page.mouse.up(); await page.waitForTimeout(2500);
    await page.click('#done'); await pause();
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'panel-390.png') });
    await page.setViewportSize({ width: 1280, height: 800 });

    const opened = ctx.waitForEvent('page');
    await page.locator('step-guide-panel').evaluate((h) => [...h.shadowRoot.querySelectorAll('button')].find((b) => /Finish/.test(b.textContent)).click());
    const view = await opened;
    await view.waitForLoadState('load');
    await view.waitForSelector('#steps li');
    view.url().startsWith('chrome-extension://' + extId + '/guide.html') ? ok('Finish opened the guide page') : fail('opened ' + view.url());

    const sentences = await view.$$eval('.say', (els) => els.map((e) => e.value));
    const want = ['Click "Save changes".', 'Click the "Email address" field.', 'Click the "Password" field.', 'Tick "Send me the newsletter".',
                  'Click "Go to billing".', 'Open the "Cards" tab.', 'Click "More options".', 'Drag "Invoice card".', 'Click "Download invoice".'];
    JSON.stringify(sentences) === JSON.stringify(want) ? ok('9 steps with the right sentences, the drag as one step') : fail('sentences: ' + JSON.stringify(sentences));
    const title = await view.inputValue('#title');
    title === 'How to: Demo shop: settings' ? ok('title: ' + title) : fail('title: ' + title);

    // what is kept: never anything typed, never a query string
    const kept = await view.evaluate(async (id) => {
      const g = await Store.guide(id); const rows = await Store.steps(id);
      return JSON.stringify(Format.portable(g, rows));
    }, new URL(view.url()).searchParams.get('id'));
    !kept.includes(SECRET) && !kept.includes(TYPED) ? ok('nothing typed is in the guide') : fail('typed text was kept');
    const clipped = JSON.parse(kept).steps.map((s) => (s.clip ? s.clip.frames.length : 0));
    console.log('     pictures per clip, step by step: ' + JSON.stringify(clipped));
    clipped[6] >= 2 ? ok('the menu that opened got a clip (' + clipped[6] + ' pictures)') : fail('no clip on the menu step');
    clipped[7] >= 2 ? ok('the drag got a clip (' + clipped[7] + ' pictures)') : fail('no clip on the drag step');
    clipped[1] === 0 && clipped[2] === 0 ? ok('no clip while a field had the cursor or a password was on screen') : fail('a field step got a clip');
    clipped[0] === 0 && clipped[5] === 0 ? ok('steps where nothing moved keep a still picture') : fail('a still step got a clip');
    await view.locator('li.step').nth(6).scrollIntoViewIfNeeded();
    await view.waitForTimeout(700);
    await view.locator('li.step').nth(6).screenshot({ path: path.join(OUT, 'clip-a.png') });
    await view.waitForTimeout(1600);
    await view.locator('li.step').nth(6).screenshot({ path: path.join(OUT, 'clip-b.png') });
    fs.writeFileSync(path.join(OUT, 'guide.json'), kept);
    if (process.env.DOCS) {
      // frames of the drag step playing, for docs/clip.gif (scripts/make-docs.py)
      const drag = view.locator('li.step').nth(7);
      await drag.scrollIntoViewIfNeeded();
      fs.mkdirSync(path.join(OUT, 'clip-frames'), { recursive: true });
      for (let i = 0; i < 24; i++) {
        await drag.locator('.pic').screenshot({ path: path.join(OUT, 'clip-frames', String(i).padStart(2, '0') + '.png') });
        await view.waitForTimeout(250);
      }
    }

    await view.screenshot({ path: path.join(OUT, 'guide-1280.png'), fullPage: false });
    await view.setViewportSize({ width: 390, height: 844 });
    await view.evaluate(() => window.scrollTo(0, 0));
    await view.screenshot({ path: path.join(OUT, 'guide-390.png') });
    await view.setViewportSize({ width: 1280, height: 800 });

    // the password field was painted over in its picture (step 4 shows the page after typing it)
    const html = await view.evaluate(async (id) => Export.html(Format.portable(await Store.guide(id), await Store.steps(id))), new URL(view.url()).searchParams.get('id'));
    fs.writeFileSync(path.join(OUT, 'export.html'), html);
    const exp = await ctx.newPage();
    await exp.goto('file://' + path.join(OUT, 'export.html'));
    (await exp.$$('li')).length === 9 ? ok('downloaded web page has 9 steps and opens on its own') : fail('export steps');
    await exp.screenshot({ path: path.join(OUT, 'export-1280.png') });
    await exp.setViewportSize({ width: 390, height: 844 });
    await exp.screenshot({ path: path.join(OUT, 'export-390.png') });
    await exp.close();

    // no destination yet: the page says so and there is no Send
    (await view.isHidden('#send')) ? ok('no destination: no Send button, kept in the browser') : fail('Send shown with no destination');

    // a webhook destination, then Send
    await view.evaluate((url) => chrome.storage.local.set({ destination: 'webhook', config: { webhook: { url: url, token: 's3cret' } }, autoSend: true }), base + '/hook');
    await view.reload(); await view.waitForSelector('#send:not([hidden])');
    await view.click('#send');
    await view.waitForSelector('#sendnote.good', { timeout: 10000 });
    const got = received[0];
    got && got.body.format === 'step-guide/1' && got.body.steps.length === 9 && got.auth === 'Bearer s3cret' && got.body.steps[0].image.data.length > 1000
      ? ok('webhook got the guide: format step-guide/1, 9 steps with pictures, the secret as a Bearer header')
      : fail('webhook got ' + JSON.stringify(got && { auth: got.auth, n: got.body.steps.length }));
    (await view.textContent('#sendnote')).includes('Open it there') ? ok('page links to the copy on the other system') : fail('no link');
    await view.screenshot({ path: path.join(OUT, 'sent-1280.png') });

    const lib = await ctx.newPage();
    await lib.goto('chrome-extension://' + extId + '/library.html');
    await lib.waitForSelector('#list li');
    await lib.screenshot({ path: path.join(OUT, 'library-1280.png') });
    const opt = await ctx.newPage();
    await opt.goto('chrome-extension://' + extId + '/options.html');
    await opt.waitForTimeout(300);
    await opt.screenshot({ path: path.join(OUT, 'options-1280.png') });
    await lib.setViewportSize({ width: 390, height: 844 });
    await lib.screenshot({ path: path.join(OUT, 'library-390.png') });
    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 320, height: 330 });
    await pop.goto('chrome-extension://' + extId + '/popup.html');
    await pop.waitForTimeout(300);
    await pop.screenshot({ path: path.join(OUT, 'popup.png') });
  } finally {
    await ctx.close();
    server.close();
  }
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
