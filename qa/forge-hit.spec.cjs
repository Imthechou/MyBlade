const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const output = 'audit-forge-hit';
fs.mkdirSync(output, { recursive: true });
const errors = [];
const records = [];

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    });
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('http://127.0.0.1:4173/#/forge', { waitUntil: 'domcontentloaded' });
    await page.locator('#v19-forge #scene').waitFor({ state: 'visible' });
    await page.waitForTimeout(650);
    const intro = page.getByRole('button', { name: /知道了，开始第一把刀/ }).first();
    if (await intro.isVisible()) await intro.click();
    const models = await page.evaluate(async () => {
      const { attachForgeStage, bindStageInput } = await import('/src/v19/sharedStage.js');
      const { freshRun, buyOre } = await import('/src/v19/forge.js');
      const { KNIFE_IDS } = await import('/src/v19/regions.js');
      const host = document.querySelector('#v19-forge #stage');
      const stage = window.coverageStage = attachForgeStage(host);
      const run = window.coverageRun = freshRun(20261152);
      buyOre({ run, credits: 100 });
      Object.assign(run, { phase: 'forge', hits: 8, purity: 83, stability: 90,
        refinement: { quality: 86 }, fit: null });
      Object.assign(run.skin, { metal: 'silver', pattern: 'damascus', film: 'none', fx: 'none' });
      Object.assign(run.skin.levels, { metal: 2, pattern: 2, film: 0, fx: 0 });
      document.querySelector('#v19-forge').dataset.phase = 'forge';
      host.dataset.mode = 'forge';
      document.querySelector('#ore-tools').hidden = true;
      window.coverageDone = 0;
      const input = new AbortController();
      bindStageInput(stage, {
        signal: input.signal, canAdjust: () => false,
        onTap(event) {
          const hit = stage.hit(event.clientX, event.clientY);
          if (!hit) {
            window.coverageContact = { hit: false };
            window.coverageDone++;
            return;
          }
          const result = { type: 'polish', zone: hit.zone, mark: hit.position };
          let captured = false;
          stage.observeFrame = (_, __, mode, blow) => {
            if (mode !== 'forge' || !blow?.landed || captured) return;
            captured = true;
            const face = new window.THREE.Vector3(-1, 0, 0).applyQuaternion(stage.hammer.quaternion);
            const point = stage.hammer.localToWorld(stage.hammerContactOffset.clone());
            window.coverageContact = { hit: true, zone: hit.zone,
              error: point.distanceTo(hit.mesh.localToWorld(hit.local.clone())),
              alignment: -face.dot(hit.normal), u: hit.position.u, v: hit.position.v,
              image: window.coverageCapture ? stage.canvas.toDataURL() : null };
          };
          stage.swing(hit, result, () => stage.impact(hit, result), () => {
            stage.observeFrame = null;
            window.coverageDone++;
          });
        },
      });
      return KNIFE_IDS;
    });
    for (const model of models) {
      for (const yaw of [0, 2.65]) {
        await page.evaluate(async ({ model, yaw }) => {
          const stage = window.coverageStage;
          const run = { ...window.coverageRun, model };
          await stage.sync(run, run.ore, null);
          stage.resetView(false);
          stage.view.turn(yaw, 0, false);
          stage.invalidate(300);
        }, { model, yaw });
        await page.waitForFunction(id => {
          const stage = window.coverageStage;
          return stage.shown === id && stage.content.visible && stage.onScreen && !stage.blow &&
            stage.lastRender >= stage.entered && performance.now() - stage.lastRender < 200;
        }, model);
        // Wait for the camera and rotation to reach the rendered pose.
        await page.waitForTimeout(180);
        const points = await page.evaluate(() => {
          const stage = window.coverageStage;
          const { coords } = stage.active;
          const rect = stage.canvas.getBoundingClientRect();
          const candidates = stage.active.coords.guides.map(local => {
            const region = coords.region(local.x, local.y);
            return { local, u: coords.along(local.x), v: coords.across(local.x, local.y), ...region };
          });
          const rules = {
            handle: item => item.grip > .8,
            shoulder: item => Math.abs(item.u - coords.bladeRoot) < .055,
            belly: item => item.blade > .6 && item.u < .85 && item.v > .33 && item.v < .67,
            edge: item => item.blade > .6 && item.u < .86 && item.v < .24,
            tip: item => item.blade > .6 && item.u > .89,
          };
          const positions = {};
          for (const [part, accepts] of Object.entries(rules)) {
            for (const item of candidates.filter(accepts)) {
              const screen = stage.project(stage.mesh.localToWorld(item.local.clone()), rect);
              if (screen.x < rect.left + 12 || screen.x > rect.right - 12 ||
                  screen.y < rect.top + 55 || screen.y > rect.bottom - 25) continue;
              const contact = stage.hit(screen.x, screen.y);
              if (contact && Math.abs(contact.position.u - item.u) < .06) {
                positions[part] = screen;
                break;
              }
            }
          }
          return { positions, gripStyle: stage.active.uniforms.fGripStyle.value,
            empty: stage.hit(rect.left + 6, rect.top + 6) === null };
        });
        assert.equal(points.gripStyle, 0);
        assert.ok(points.empty, model + ' should reject empty background taps');
        for (const part of ['handle', 'shoulder', 'belly', 'edge', 'tip']) {
          const point = points.positions[part];
          assert.ok(point, model + ' lacks a tappable ' + part + ' at yaw ' + yaw);
          const before = await page.evaluate(capture => {
            window.coverageCapture = capture;
            window.coverageContact = null;
            return window.coverageDone;
          }, ['bayonet', 'karambit', 'tangdao'].includes(model) && yaw === 0 && part === 'belly');
          await page.touchscreen.tap(point.x, point.y);
          await page.waitForFunction(done => window.coverageDone > done, before);
          const contact = await page.evaluate(() => window.coverageContact);
          assert.ok(contact?.hit, model + ' touch missed ' + part);
          assert.ok(contact.error < .04 && contact.alignment > .99,
            model + ' hammer failed to meet ' + part + ' at its surface angle');
          if (contact.image) {
            fs.writeFileSync(output + '/' + model + '-contact.png',
              Buffer.from(contact.image.split(',')[1], 'base64'));
          }
          delete contact.image;
          records.push({ model, yaw, part, ...contact });
        }
      }
    }
    assert.equal(records.length, 120);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    fs.writeFileSync(output + '/results.json', JSON.stringify({ records, errors }, null, 2));
  }
  console.log('FORGE_HIT_COVERAGE', JSON.stringify({
    contacts: records.length, models: [...new Set(records.map(record => record.model))],
    maxContactError: Math.max(...records.map(record => record.error)),
    minimumAlignment: Math.min(...records.map(record => record.alignment)), errors,
  }));
}

run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
