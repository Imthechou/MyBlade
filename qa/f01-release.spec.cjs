const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const base = process.env.PLAYTEST_BASE_URL || 'http://127.0.0.1:4173/';
const directory = process.env.F01_QA_OUTPUT || 'audit/f01';
fs.mkdirSync(directory, { recursive: true });

const action = (page, name) => page.locator(`#v19-forge [data-action="${name}"]`);
const battle = (page, name) => page.locator(`#v19-arena [data-arena-action="${name}"]`);
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('bladeforge.v4.save.f01-playtest')));
const shot = (page, name) => page.screenshot({ animations: 'disabled', path: path.join(directory, name + '.png') });

async function swipe(page, client, locator, y, from = .10, to = .90) {
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 50 && box.height > 30);
  const points = x => [{ x: box.x + box.width * x, y: box.y + box.height * y }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) });
  for (let step = 1; step <= 8; step++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + (to - from) * step / 8) });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function hammer(page, zones) {
  for (const [index, zone] of zones.entries()) {
    await page.waitForFunction(() => document.querySelector('#v19-forge').dataset.swinging !== 'true');
    await page.locator('#strike-' + zone).click();
    await page.waitForFunction(count => Number(document.querySelector('#hit-count')?.textContent.match(/^\d+/)?.[0]) === count,
      index + 1, { timeout: 9000 });
  }
}

async function oreLayout(page, free = false) {
  await page.locator('#stage[data-loading="false"] #scene').waitFor();
  const layout = await page.evaluate(() => {
    const tools = document.querySelector('#ore-tools .inspection-tools').getBoundingClientRect();
    const dock = document.querySelector('#actions').getBoundingClientRect();
    const buy = document.querySelector('#actions [data-action="buy"]').getBoundingClientRect();
    const cards = [...document.querySelectorAll('#ore-options .ore-card')];
    return {
      contained: cards.every(card => {
        const box = card.getBoundingClientRect();
        const label = card.querySelector('.ore-card-label').getBoundingClientRect();
        return label.top >= box.top && label.bottom <= box.bottom + 1 && box.bottom < tools.top;
      }),
      fullButton: Math.abs(dock.width - buy.width) <= 1,
      viewport: buy.bottom <= innerHeight + 1 && document.documentElement.scrollWidth <= innerWidth + 1,
    };
  });
  assert.ok(layout.contained, 'Material names and prices must fit above the inspection controls');
  assert.ok(layout.viewport, 'The buy button must fit in the visible viewport');
  if (free) assert.ok(layout.fullButton, 'The only buy action should span the dock');
}

async function forge(page, label, zones, fitIndex = 0, ordered = false) {
  await action(page, 'buy').click();
  const order = page.locator('#furnace-order-status');
  if (ordered) await order.waitFor(); else assert.equal(await order.isVisible(), false);
  await action(page, 'to-refine').click({ timeout: 12000 });
  const heat = page.locator('#heat-button');
  await heat.focus();
  await page.keyboard.down('Space');
  try {
    // The safety cast is exercised here through sustained input and the actual simulation clock.
    await action(page, 'finish').waitFor({ timeout: 18000 });
  } finally {
    await page.keyboard.up('Space');
  }
  if (ordered) assert.match(await order.innerText(), /刀腹 0 \/ 2/);
  await hammer(page, zones);
  if (ordered) assert.match(await order.innerText(), /目标已达成.*鉴定后 \+12 CR/);
  await action(page, 'finish').click();
  await action(page, 'select-fit').nth(fitIndex).click();
  await action(page, 'appraise').click();
  await page.locator('#v19-forge[data-phase="appraise"]').waitFor();
  if (ordered) assert.match(await order.innerText(), /达标.*已入账 \+12 CR/);
  await page.locator('#stage[data-loading="false"] canvas').waitFor();
  await page.evaluate(async () => {
    const { attachForgeStage } = await import(new URL('src/v19/sharedStage.js', document.baseURI));
    const stage = attachForgeStage(document.querySelector('#stage'));
    if (stage.mode !== 'appraise' || stage.lastRender < stage.entered || stage.shown !== stage.want ||
        !stage.content.visible || !stage.mesh?.visible || !stage.displayStand?.visible || stage.renderer.info.render.calls < 2) {
      throw new Error('The appraised knife and its stand have not been rendered');
    }
  });
  await shot(page, label);
  return saved(page);
}

async function firstLoop(browser, width, height, full) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const client = await context.newCDPSession(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const url = new URL(base);
    url.searchParams.set('playtest', 'f01');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '开始锻刀' }).click();
    assert.match(await action(page, 'buy').textContent(), /免费开石/);
    assert.equal(await action(page, 'select-ore').count(), 2);
    await oreLayout(page, true);
    await shot(page, `ore-${width}`);
    let state = await forge(page, `first-blade-${width}`, ['belly', 'belly', 'edge', 'edge', 'edge', 'edge']);
    assert.equal(state.cr, 38);
    assert.equal(state.collection[0].seriesSlot, '01');
    const firstBlade = state.collection[0].id;
    await action(page, 'enter-tournament').click();
    await battle(page, 'register').click();
    const warmup = page.locator('[data-warmup]');
    await warmup.waitFor();
    await swipe(page, client, warmup, .5);
    await battle(page, 'start-first').waitFor({ state: 'hidden' });
    await page.waitForTimeout(1100);
    await swipe(page, client, page.locator('.trial-frame canvas'), .52);
    await page.getByRole('heading', { name: '首刀试斩通过' }).waitFor({ timeout: 16000 });
    state = await saved(page);
    assert.equal(state.cr, 42);
    assert.equal(state.v19.launch.firstPassed, true);
    assert.equal(state.collection[0].firstTrialStamp, true);
    assert.match(await page.locator('.arena-next-build').innerText(), /再锻一把重锋.*木靶几划破壳/);
    assert.equal(await battle(page, 'forge-compare').textContent(), '锻第二把刀');
    await shot(page, `first-trial-${width}`);
    assert.deepEqual(errors, []);

    if (full) {
      await page.getByRole('button', { name: '信用点余额' }).click();
      const wallet = page.getByRole('dialog', { name: '工坊钱包' });
      assert.match(await wallet.innerText(), /首刀试斩\s*\+4 CR/);
      await wallet.getByRole('button', { name: '关闭' }).click();
      await wallet.waitFor({ state: 'detached' });
    }
    await battle(page, 'forge-compare').click();
    assert.match(await action(page, 'buy').textContent(), /14 CR/);
    await oreLayout(page);
    const orderButton = action(page, 'toggle-commission');
    assert.equal(await orderButton.getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('.furnace-cost').innerText(), /成刀净额 −8 CR/);
    if (!full) {
      await shot(page, `optional-order-${width}`);
      const advanced = page.locator('.furnace-settings summary');
      const blueprint = page.getByLabel('图样', { exact: true });
      await advanced.click();
      await blueprint.scrollIntoViewIfNeeded();
      const control = await blueprint.boundingBox();
      const dock = await page.locator('#actions').boundingBox();
      assert.ok(control.y + control.height <= dock.y, 'Advanced controls can scroll into view above the dock');
      console.log(`PASS ${width}px · ore layout, first trial, second furnace with optional order`);
      return;
    }
    await orderButton.click();
    assert.match(await page.locator('.furnace-cost').innerText(), /达标净额 \+4 CR/);
    await action(page, 'select-ore').nth(1).click();
    assert.equal(await orderButton.getAttribute('aria-pressed'), 'false');
    await action(page, 'select-ore').first().click();
    assert.equal(await orderButton.getAttribute('aria-pressed'), 'false');
    await orderButton.click();
    assert.equal(await orderButton.getAttribute('aria-pressed'), 'true');
    await shot(page, 'confirmed-order');
    state = await forge(page, 'second-blade', ['belly', 'belly', 'belly', 'belly', 'tip', 'tip'], 1, true);
    assert.equal(state.cr, 46);
    const secondBlade = state.collection.find(blade => blade.id !== firstBlade);
    assert.equal(secondBlade.v19Visual.ore.family, 'coal');
    await action(page, 'enter-comparison').click();
    await page.getByRole('button', { name: '开始同靶对照' }).waitFor();
    assert.equal(await page.locator('.arena-blade-select').count(), 2);
    await page.evaluate(() => { location.hash = '#/forge'; });
    await action(page, 'open-collection').click();
    await page.getByRole('button', { name: /F01 首辑图鉴/ }).click();
    const issue = page.getByRole('dialog', { name: 'F01 首辑图鉴' });
    assert.equal(await issue.locator('.ws-f01-slot').count(), 6);
    assert.match(await issue.locator('.ws-f01-slot[data-unlocked=true]').innerText(), /F01—01/);
    await shot(page, 'series');
    await issue.getByRole('button', { name: '关闭' }).click();
    await issue.waitFor({ state: 'detached' });
    const grid = page.locator('.ws-collection-grid');
    await grid.locator(`[data-blade-id="${secondBlade.id}"] .bcv-open`).click();
    const detail = page.locator('.blade-detail-sheet');
    await detail.getByRole('button', { name: '卡背', exact: true }).click();
    const ledger = detail.getByRole('region', { name: '作品账单' });
    assert.match(await ledger.innerText(), /\+4 CR/);
    assert.match(await ledger.innerText(), /−14 CR/);
    await shot(page, 'ledger');
    await detail.getByRole('button', { name: '关闭' }).click();
    await detail.waitFor({ state: 'detached' });
    for (const id of [firstBlade, secondBlade.id]) {
      await grid.locator(`[data-blade-id="${id}"]`).getByRole('button', { name: '加入比较' }).click();
    }
    await page.getByRole('button', { name: '比较这两把' }).click();
    await page.getByRole('button', { name: '带这两把刀同靶对照' }).click();
    await battle(page, 'register').click();
    for (const round of [1, 2]) {
      const canvas = page.locator('.trial-frame canvas');
      await canvas.waitFor();
      await page.waitForTimeout(1100);
      await swipe(page, client, canvas, .52);
      await page.waitForTimeout(3950);
      await swipe(page, client, canvas, .54);
      await page.locator('.comparison-report').waitFor({ timeout: 13000 });
      if (round === 1) await battle(page, 'continue').click();
    }
    const result = await saved(page);
    const comparison = result.arena.history.filter(item => item.tier === 'compare').at(-1).v19;
    assert.equal(result.cr, 46);
    assert.equal(comparison.rounds.length, 2);
    assert.deepEqual(comparison.rounds.map(item => item.calibration.shell), [2, 1]);
    await shot(page, 'two-blade-comparison');
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal((await saved(page)).cr, 46);
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    console.log(`PASS ${width}px · first forge + trial, commission, wallet/knife ledger, F01, two-blade match, reload`);
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    await firstLoop(browser, 390, 844, true);
    await firstLoop(browser, 320, 568, false);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
