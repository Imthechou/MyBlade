const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = process.env.PLAYTEST_BASE_URL || 'http://127.0.0.1:4173/';
const output = process.env.CARD_QA_OUTPUT || 'audit/collection';
const tiers = ['common', 'fine', 'rare', 'epic', 'legend', 'mythic'];
fs.mkdirSync(output, { recursive: true });

async function openCollection(page, count = 6, motion = 'full') {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ count, motion, tiers }) => {
    const { freshRun, offers } = await import(new URL('src/v19/forge.js', location.href));
    const { STORAGE_KEY } = await import(new URL('src/platform/storage.js', location.href));
    const run = freshRun(20261118);
    const visual = {
      model: 'straight', fit: 'ink', ore: offers(run)[0], purity: 70, hits: 6,
      marks: {}, highlights: [], stability: 65, skin: { ...run.skin, metal: 'silver', pattern: 'damascus' },
    };
    const collection = Array.from({ length: count }, (_, index) => ({
      id: 'card-fixture-' + index,
      bladeName: '回潮',
      knifeType: 'knife_straight',
      knifeTypeId: 'straight',
      qualityName: 'B',
      rarity: tiers[index % tiers.length],
      score: 72 + index,
      canEnterArena: true,
      stats: { strength: 68, toughness: 75, sharpness: 78, craft: 75, design: 64, spirit: 64 },
      arenaHistory: index === 4 ? [{ id: 'confirmed-final', tier: 'national', win: true, champion: true, recordedAt: 1 }] : [],
      v19Visual: visual,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 1, cr: 42, collection, settings: { tutorialSeen: true, sound: false, motion },
    }));
  }, { count, motion, tiers });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '藏刀阁' }).click();
  await page.locator('.ws-collection-grid .bcv-open').first().waitFor();
}

async function capture(locator, filename) {
  await locator.screenshot({ path: path.join(output, filename), animations: 'disabled' });
}

async function inspect(browser, width, height, touch, motion = 'full') {
  const tag = `${width}x${height}${motion === 'reduced' ? '-reduced' : ''}`;
  const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await openCollection(page, 6, motion);
    const grid = page.locator('.ws-collection-grid');
    const cards = grid.locator('.bcv-open');
    assert.equal(await cards.count(), 6);
    await grid.locator('.v19-thumb-image').first().waitFor({ timeout: 20000 });
    const prints = await cards.evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return {
        className: node.className,
        texture: getComputedStyle(node).backgroundImage,
        foil: getComputedStyle(node.querySelector('.bcv-foil')).clipPath,
        ratio: rect.width / rect.height,
        fits: rect.left >= 0 && rect.right <= innerWidth + 1,
        scrolling: document.documentElement.scrollWidth > innerWidth + 1,
      };
    }));
    assert.equal(new Set(prints.map(({ texture }) => texture)).size, 6, 'Each print uses a distinct static texture');
    assert.equal(new Set(prints.map(({ foil }) => foil)).size, 5, 'The six finishes have five masks including matte and its brushed counterpart');
    assert.ok(prints.every(({ ratio, fits, scrolling }) => fits && !scrolling && Math.abs(ratio - 63 / 88) < .03));
    assert.equal(await grid.locator('.bcv-honor').count(), 1);
    assert.equal(await grid.locator('.rarity--legend .bcv-honor').textContent(), '冠军');
    assert.equal(await grid.locator('[data-tilting]').count(), 0);
    for (const tier of tiers) {
      const card = grid.locator(`.bcv-open.rarity--${tier}`);
      await card.scrollIntoViewIfNeeded();
      await card.locator('.v19-thumb-image').waitFor({ timeout: 20000 });
      await capture(card, `card-${tag}-${tier}.png`);
    }

    const mythic = grid.locator('.bcv-open.rarity--mythic');
    await mythic.click();
    const sheet = page.getByRole('dialog', { name: '回潮' });
    const stage = sheet.locator('.bcv-tilt-stage');
    const face = stage.locator('.bcv-face');
    await stage.waitFor();
    await face.locator('.v19-thumb-image').waitFor();
    assert.equal(await sheet.locator('canvas').count(), 0, 'Card view does not mount a live 3D scene');
    await stage.focus();
    await stage.press('ArrowRight');
    if (motion === 'reduced') {
      assert.equal(await stage.getAttribute('data-tilting'), null);
    } else {
      await page.waitForFunction(() => document.querySelector('.bcv-tilt-stage').dataset.tilting === 'true');
      assert.match(await face.getAttribute('style'), /--tilt-y: 2.5deg/);
      if (!touch) {
        await stage.hover({ position: { x: 10, y: 40 } });
        await page.waitForFunction(() => parseFloat(document.querySelector('.bcv-tilt-stage .bcv-face').style.getPropertyValue('--tilt-y')) < -5);
      }
      await capture(stage, `tilt-${tag}.png`);
      await stage.press('Home');
      assert.equal(await stage.getAttribute('data-tilting'), null);
    }

    await sheet.getByRole('button', { name: '卡背', exact: true }).click();
    assert.equal(await sheet.getByRole('button', { name: '卡背', exact: true }).getAttribute('aria-pressed'), 'true');
    await sheet.locator('.bcv-detail').waitFor();
    assert.match(await sheet.locator('.bcv-archive').innerText(), /六维属性|评分/);

    if (width === 390 && motion === 'full') {
      await capture(sheet, `archive-${tag}.png`);
      const model = sheet.getByRole('button', { name: '3D 鉴赏', exact: true });
      await model.click();
      await sheet.locator('.blade-detail-stage canvas').waitFor({ timeout: 20000 });
      await sheet.getByRole('button', { name: '卡面', exact: true }).click();
      assert.equal(await sheet.locator('.blade-detail-stage canvas').count(), 0);
      await model.click();
      await sheet.locator('.blade-detail-stage canvas').waitFor({ timeout: 20000 });
      await sheet.getByRole('button', { name: '卡面', exact: true }).click();
      const client = await context.newCDPSession(page);
      await stage.scrollIntoViewIfNeeded();
      const box = await stage.boundingBox();
      const x = box.x + box.width * .32;
      const y = box.y + box.height * .45;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + box.width * .37, y }] });
      await page.waitForFunction(() => document.querySelector('.bcv-tilt-stage').dataset.tilting === 'true');
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await stage.getAttribute('data-tilting'), null);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 46 }] });
      assert.equal(await stage.getAttribute('data-tilting'), null, 'A vertical swipe must not tilt the card');
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await stage.evaluate(node => getComputedStyle(node).touchAction.includes('pan-y')), true);
      await sheet.getByRole('button', { name: '重命名' }).click();
      await page.getByRole('textbox', { name: '新的刀名' }).fill('回潮·留档');
      await page.getByRole('button', { name: '保存刀名' }).click();
      assert.equal(await face.locator('.bcv-name').textContent(), '回潮·留档');
    }

    const openSheet = page.locator('.blade-detail-sheet');
    await openSheet.getByRole('button', { name: '关闭' }).click();
    await openSheet.waitFor({ state: 'detached' });
    if (width !== 390 || motion !== 'full') {
      assert.equal(await mythic.evaluate(node => node === document.activeElement), true);
    }
    const comparison = grid.getByRole('button', { name: '加入比较' });
    if (width === 390 && motion === 'full') {
      await comparison.nth(0).click();
      await comparison.nth(0).click();
      await page.getByRole('button', { name: '比较这两把' }).click();
      await page.getByRole('dialog').waitFor();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${tag} · 六档静帧 / 单卡倾斜 / 真实赛印 / 卡背 / 焦点`);
    return { tag, prints };
  } finally {
    await context.close();
  }
}

async function pagination(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await openCollection(page, 500);
    const cards = page.locator('.ws-collection-grid .bcv-open');
    assert.equal(await cards.count(), 24);
    await page.getByRole('button', { name: '末页', exact: true }).click();
    assert.equal(await cards.count(), 20);
    console.log('PASS 500 blades · 24 per page / 20 on last page');
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const results = [];
    for (const config of [[320, 568, true], [390, 844, true], [430, 932, true], [1280, 900, false], [390, 844, true, 'reduced']]) {
      results.push(await inspect(browser, ...config));
    }
    await pagination(browser);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
