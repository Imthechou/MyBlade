const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const out = 'audit-arena';
fs.mkdirSync(out, { recursive: true });
const target = process.env.PLAYTEST_BASE_URL || 'http://127.0.0.1:4173/';
const records = [], errors = [];
const ui = key => '[data-trial="' + key + '"]';

function observeRenderedTargets() {
  const proto = CanvasRenderingContext2D.prototype;
  const setTransform = proto.setTransform;
  const drawImage = proto.drawImage;
  window.renderedTargets = [];
  proto.setTransform = function (...args) {
    if (this.canvas.matches('.trial-frame canvas')) window.renderedTargets = [];
    return setTransform.apply(this, args);
  };
  proto.drawImage = function (image, ...args) {
    if (image instanceof HTMLImageElement && image.src.includes('/assets/v19/targets/') &&
        this.canvas.matches('.trial-frame canvas')) {
      const m = this.getTransform();
      window.renderedTargets.push([m.e / this.canvas.width, m.f / this.canvas.height]);
    }
    return drawImage.call(this, image, ...args);
  };
}

async function nativeSwipe(cdp, box, from, to, height) {
  const touchPoints = fraction => [{
    x: box.x + box.width * fraction, y: box.y + box.height * height, id: 1,
  }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(from) });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: touchPoints(from + (to - from) * i / 8),
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function waitForRow(page) {
  await page.waitForFunction(() => {
    const points = window.renderedTargets;
    return points.length === 3 && points.every(([, y]) => y >= .49 && y < .565) &&
      Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y)) < .02;
  });
}

async function snapshot(page, name) {
  const data = await page.evaluate(() => ({
    screen: document.querySelector('#v19-arena')?.dataset.screen,
    phase: document.querySelector('.trial-frame')?.dataset.act,
    hits: document.querySelector('[data-trial="hits"]')?.textContent,
    combo: document.querySelector('[data-trial="combo"]')?.textContent,
    report: document.querySelector('.arena-report')?.innerText,
    scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth,
  }));
  assert.ok(data.scrollWidth <= data.viewport, 'Horizontal overflow in ' + name);
  records.push({ name, ...data });
  await page.screenshot({ path: out + '/' + name + '.png' });
  console.log('ARENA_SCENE', name, JSON.stringify(data));
  return data;
}

async function captureErrors(page) {
  page.on('pageerror', error => errors.push('JS ' + error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push('CONSOLE ' + message.text().slice(0, 320)); });
  page.on('response', response => { if (response.status() >= 400) errors.push('HTTP ' + response.status() + ' ' + response.url()); });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push('NETWORK ' + request.url());
  });
}

async function dismissGuide(page) {
  await page.waitForTimeout(650);
  const guide = page.getByRole('button', { name: /知道了，开始第一把刀/ }).first();
  if (await guide.isVisible()) await guide.click();
}

async function practice(page, cdp) {
  await page.goto(new URL('#/arena', target).href, { waitUntil: 'domcontentloaded' });
  await dismissGuide(page);
  await snapshot(page, '01-arena-lobby');
  await page.getByRole('button', { name: '借刀开斩' }).click();
  const canvas = page.locator('.trial-frame canvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.height > 250);
  await waitForRow(page);
  const positions = await page.evaluate(() => window.renderedTargets);
  const height = positions[0][1];
  await nativeSwipe(cdp, box, .06, .94, height);
  const live = await snapshot(page, '02-arena-native-triple-cut');
  assert.ok(Number(live.hits) >= 3, 'One native swipe should break the first three light targets');
  await page.locator('.arena-report').waitFor({ timeout: 15000 });
  const report = await snapshot(page, '03-arena-practice-report');
  assert.match(report.report, /试刀结束/);
  assert.match(report.report, /一刀最多/);
  assert.match(report.report, /表现最佳/);
  await page.getByRole('button', { name: '去锻第一把刀' }).click();
  await page.locator('#v19-forge[data-phase="ore"]').waitFor();
}

async function quick(page, cdp) {
  await page.evaluate(async () => {
    const { get } = await import(new URL('src/core/progress.js', location.href));
    const { commitSave } = await import(new URL('src/core/saveTransaction.js', location.href));
    return commitSave(get(), draft => {
      draft.collection.push({
        id: 'arena-qa-blade', bladeName: '测试青锋', rarity: 'fine', rarityName: '精良', score: 152,
        canEnterArena: true, traits: [], combos: [],
        stats: { strength: 77, toughness: 73, sharpness: 82, craft: 66, design: 65, spirit: 60 },
      });
      draft.workshopV41.xp = 79;
      return { ok: true };
    });
  });
  await page.goto(new URL('#/arena', target).href);
  await page.getByRole('button', { name: '开始快赛' }).click();
  const box = await page.locator('.trial-frame canvas').boundingBox();
  assert.equal(await page.locator(ui('time')).textContent(), '30″');
  await waitForRow(page);
  await nativeSwipe(cdp, box, .04, .96, await page.evaluate(() => window.renderedTargets[0][1]));
  assert.ok(Number(await page.locator(ui('hits')).textContent()) >= 3);
  await page.waitForFunction(() => window.renderedTargets.length === 0);
  await waitForRow(page);
  await nativeSwipe(cdp, box, .04, .96, await page.evaluate(() => window.renderedTargets[0][1]));
  assert.ok(Number(await page.locator(ui('hits')).textContent()) >= 4);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const pausedAt = await page.locator(ui('time')).textContent();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator(ui('time')).textContent(), pausedAt);
  await page.getByRole('button', { name: '继续挥刀' }).click();
  await page.locator('.trial-frame[data-act="1"]').waitFor({ timeout: 14000 });
  await page.locator('.trial-frame[data-act="2"]').waitFor({ timeout: 14000 });
  await page.locator('.arena-report').waitFor({ timeout: 14000 });
  const report = await snapshot(page, '04-arena-quick-growth');
  assert.match(report.report, /工坊 Lv\.2/);
  assert.match(report.report, /里程碑/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#v19-arena[data-screen="lobby"]').waitFor();
  assert.match(await page.locator('#v19-arena .arena-hero').innerText(), /工坊 Lv\.2/);
  const saved = await page.evaluate(async () => {
    const { get } = await import(new URL('src/core/progress.js', location.href));
    const save = get();
    return { mastery: save.v19.arena.mastery['arena-qa-blade'], stats: save.collection[0].stats };
  });
  assert.ok(saved.mastery.bestSwipe >= 3 && saved.mastery.xp > 0);
  assert.equal(saved.stats.sharpness, 82);
}

(async () => {
  const browser = await chromium.launch({
    headless: true, args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(observeRenderedTargets);
    const page = await context.newPage();
    page.setDefaultTimeout(14000);
    await captureErrors(page);
    const cdp = await context.newCDPSession(page);
    await practice(page, cdp);
    await quick(page, cdp);
  } finally {
    await browser.close();
  }
})().catch(error => {
  errors.push(error.stack || error.message);
}).finally(() => {
  fs.writeFileSync(out + '/results.json', JSON.stringify({ records, errors }, null, 2));
  console.log('ARENA_RESULT', JSON.stringify({ screens: records.length, errors }));
  if (errors.length) process.exitCode = 1;
});
