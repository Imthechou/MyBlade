const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const output = 'audit';
fs.mkdirSync(output,{recursive:true});
const scenes = [];
const errors = [];
async function shot(page, label) {
  console.log('CAPTURE_START', label);
  await page.waitForTimeout(750);
  const state = await page.evaluate(() => ({
    phase: document.querySelector('#v19-forge')?.dataset.phase,
    heading: document.querySelector('#v19-forge #title')?.textContent,
    actions: document.querySelector('#v19-forge #actions')?.innerText.slice(0,130),
    text: document.querySelector('#v19-forge #panel')?.innerText.slice(0,350),
    widths: [document.documentElement.scrollWidth,innerWidth],
    canvas: document.querySelector('#v19-forge #scene')?.getBoundingClientRect().toJSON(),
    visualCss: Boolean(Array.from(document.styleSheets).some(s=>s.href?.includes('forge-art-direction.css')))
  }));
  console.log('SCENE',label,JSON.stringify(state));
  const bytes=await page.screenshot({type:'jpeg',quality:64,animations:'disabled',timeout:9000,path:output+'/'+label+'.jpg'});
  console.log('SHOT_BEGIN_'+label);
  console.log(bytes.toString('base64'));
  console.log('SHOT_END_'+label);
  scenes.push({name:label,...state});
}
async function presentedStage(page, mode, after = 0) {
  await page.locator('#v19-forge #stage canvas').waitFor({ state: 'visible', timeout: 14000 });
  await page.evaluate(async () => {
    const host = document.querySelector('#v19-forge #stage');
    const { attachForgeStage } = await import('/src/v19/sharedStage.js');
    window.testForgeStage = attachForgeStage(host);
  });
  const result = await page.waitForFunction(({ mode, after }) => {
    const stage = window.testForgeStage;
    const host = stage.canvas.parentElement;
    if (host?.dataset.loading === 'true') return false;
    if (stage.mode !== mode || stage.shown !== stage.want || !stage.onScreen || !stage.content.visible ||
        !stage.mesh?.visible || !(stage.lastRender >= Math.max(stage.entered, after))) return false;
    return {
      mode, shown: stage.shown, gripStyle: stage.active.uniforms.fGripStyle?.value,
      stand: Boolean(stage.displayStand?.visible), fitting: stage.fit?.id ?? null,
      drawCalls: stage.renderer.info.render.calls,
    };
  }, { mode, after }, { timeout: 14000 });
  return result.jsonValue();
}
async function saveCanvasFrame(page, variable, name) {
  const handle = await page.waitForFunction(key => window[key], variable, { timeout: 10000 });
  const { image, ...data } = await handle.jsonValue();
  fs.writeFileSync(output + '/' + name + '.png', Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'));
  return data;
}
async function run() {
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 const page=await context.newPage();
 page.setDefaultTimeout(7500);
 page.setDefaultNavigationTimeout(12000);
 page.on('pageerror',err=>errors.push('JS '+err.stack));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForTimeout(650); // first-run tutorial appears asynchronously
 const intro=page.getByRole('button',{name:/知道了，开始第一把刀/}).first();
 if(await intro.count()&&await intro.isVisible()) await intro.click();
 await page.evaluate(async () => {
   const { openFurnace } = await import('/src/core/v19Progress.js');
   return openFurnace({ seed: 20261152 }).ok;
 });
 await page.getByRole('button',{name:/开始锻刀/}).click();
 await shot(page,'01_ore');
 await page.getByRole('button',{name:'打灯'}).click();
 await shot(page,'02_lamp');
 await page.locator('[data-action="tap-ore"]').click();
 await shot(page,'03_knock');
 await page.getByRole('button',{name:/开石/}).click();
 await page.waitForTimeout(1200);
 await shot(page,'04_reveal');
 await page.getByRole('button',{name:/去精炼/}).click();
 await shot(page,'05_refine');
 const heatButton=page.locator('#heat-button');
 await heatButton.focus();
 await page.keyboard.down('Space');
 const hotGuide=page.locator('#heat-note[data-guide="cool"]');
 try {
   await hotGuide.waitFor({state:'visible',timeout:4500});
   assert.match(await hotGuide.textContent(),/松手降温/);
 } finally {
   await page.keyboard.up('Space');
 }
 const coldGuide=page.locator('#heat-note[data-guide="warm"]');
 await coldGuide.waitFor({state:'visible',timeout:4500});
 assert.match(await coldGuide.textContent(),/按住鼓风/);
 await page.getByRole('button',{name:'返回首页'}).click();
 // Start the browser-driven pour from a reproducible, qualified furnace.
 const heated = await page.evaluate(async () => {
   const { forgeSession, commitFurnace } = await import('/src/core/v19Progress.js');
   return commitFurnace(forgeSession().run, ({ run }) => {
     if (run.phase !== 'refine') return false;
     Object.assign(run.refining, { step: 'molten', temperature: 73, elapsed: 7, active: 7, stable: 7,
       quality: 75, damage: 4, draft: 0 });
     return true;
   }).ok;
 });
 assert.ok(heated);
 await page.getByRole('button',{name:'继续锻刀'}).click();
 await presentedStage(page, 'refine');
 await page.evaluate(async () => {
   const { attachForgeStage } = await import('/src/v19/sharedStage.js');
   const stage = attachForgeStage(document.querySelector('#stage'));
   stage.observeFrame = () => {
     const heat = stage.active?.uniforms.fHeat?.value;
     if (stage.refiningStep !== 'cast' || stage.shown !== 'blank' || !(heat > .50)) return;
     window.forgeCastFrame = { heat, image: stage.canvas.toDataURL() };
     stage.observeFrame = null;
   };
 });
 await page.getByRole('button',{name:'浇注',exact:true}).click();
 const cast = await saveCanvasFrame(page, 'forgeCastFrame', '05b_pour_hot_billet');
 assert.ok(cast.heat > .5, 'Manual pour should visibly produce a hot billet before forging');
 await presentedStage(page, 'forge');
 const scene = page.locator('#v19-forge #scene');
 for (let hit = 1; hit <= 7; hit++) {
   await scene.press('Space');
   await page.waitForFunction(count => {
     const stage = window.testForgeStage;
     return stage.run?.hits === count && !stage.blow && stage.shown === stage.want;
   }, hit, { timeout: 8000 });
 }
 const forge = await presentedStage(page, 'forge');
 assert.equal(forge.gripStyle, 0, 'The complete knife should use its forged surface before fitting');
 assert.ok(forge.drawCalls > 1);
 await shot(page,'06_forge');
 await shot(page,'06b_forge_wait');
 const point = await page.evaluate(async () => {
   const { attachForgeStage } = await import('/src/v19/sharedStage.js');
   const stage = attachForgeStage(document.querySelector('#stage'));
   const target = stage.zoneAnchors().belly;
   const rect = stage.canvas.getBoundingClientRect();
   stage.observeFrame = (_, __, mode, blow) => {
     if (mode !== 'forge' || !blow?.landed) return;
     const { local, mesh } = stage.lastImpact;
     const head = stage.hammer.localToWorld(stage.hammerContactOffset.clone());
     const touch = mesh.localToWorld(local.clone());
     const face = new window.THREE.Vector3(-1, 0, 0).applyQuaternion(stage.hammer.quaternion);
     window.forgeImpactFrame = { error: head.distanceTo(touch),
       alignment: -face.dot(stage.lastImpact.normal), sparks: stage.sparks.particles.length,
       image: stage.canvas.toDataURL() };
     stage.observeFrame = null;
   };
   return { x: target.x + rect.left, y: target.y + rect.top };
 });
 await page.touchscreen.tap(point.x, point.y);
 const impact = await saveCanvasFrame(page, 'forgeImpactFrame', '07b_hammer_contact');
 assert.ok(impact.error < .045 && impact.alignment > .99 && impact.sparks > 0,
   'Hammer face and sparks should meet the tapped steel at the surface angle');
 await shot(page,'07_impact');
 const hammer=await page.locator('#hit-count').textContent();
 console.log('HAMMER_RESULT',hammer);
 if(Number.parseInt(hammer,10)<8)throw new Error('Hammer did not hit');
 await page.getByRole('button',{name:/收锤/}).click();
 assert.equal((await presentedStage(page, 'fit')).gripStyle, 0);
 await shot(page,'08_fit');
 const beforeFit = await page.evaluate(() => performance.now());
 await page.locator('[data-action="select-fit"]').first().click();
 const fitted = await presentedStage(page, 'fit', beforeFit);
 assert.ok(fitted.gripStyle > 0, 'Fitting should replace the handle surface');
 assert.ok(fitted.fitting);
 await shot(page,'09_fit_selected');
 await page.getByRole('button',{name:/确认并鉴定/}).click();
 const appraisal = await presentedStage(page, 'appraise');
 assert.ok(appraisal.gripStyle > 0);
 assert.equal(appraisal.stand, true);
 await shot(page,'10_appraise');
 console.log('FORGE_PRESENTATION', JSON.stringify({ cast, forge, impact, fitted, appraisal }));
 const stats=await page.locator('.stat-list .stat').count();
 console.log('STAT_COUNT',stats);
 if(stats!==6)throw new Error('Missing final six attributes');
 // Check key mobile touch targets, not every compact decorative icon.
 const targets=await page.evaluate(()=>Array.from(document.querySelectorAll('#v19-forge #actions button')).map(el=>({
   text:el.innerText, height:Math.round(el.getBoundingClientRect().height),
 })));
 console.log('ACTION_TOUCH_SIZES',JSON.stringify(targets));
 await page.getByRole('button',{name:'带此刀去试斩'}).click();
 await page.locator('.arena-blade-select [data-thumb-blade][data-state="ready"]').waitFor({timeout:14000});
 assert.equal(await page.locator('.arena-blade-select [data-thumb-blade] img').count(),1);
 await context.close();
 const desktop=await browser.newContext({viewport:{width:1365,height:768}});
 const big=await desktop.newPage();
 big.on('pageerror',e=>errors.push('DESKTOP '+e.message));
 await big.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await big.waitForTimeout(650);
 const desktopIntro=big.getByRole('button',{name:/知道了，开始第一把刀/}).first();
 if(await desktopIntro.count()&&await desktopIntro.isVisible())await desktopIntro.click();
 await big.getByRole('button',{name:/继续锻刀|开始锻刀/}).click();
 await big.waitForTimeout(1000);
 const desktopLayout=await big.evaluate(()=>({xscroll:document.documentElement.scrollWidth>innerWidth,heading:document.querySelector('#title')?.innerText}));
 console.log('DESKTOP',JSON.stringify(desktopLayout));
 await desktop.close();
 await browser.close();
 fs.writeFileSync(output+'/results.json',JSON.stringify({scenes,errors,desktopLayout},null,2));
 console.log('BROWSER_ERRORS',JSON.stringify(errors));
 const fatal=errors.filter(x=>/Shader Error|ERROR: 0:|WebGLProgram|Uncaught|Cannot read|404|500|SyntaxError|TypeError|ReferenceError/i.test(x));
 if(fatal.length)throw new Error('Fatal browser errors: '+fatal.slice(0,7).join('; '));
}
run().catch(e=>{console.error('AUDIT_FAILED',e.stack||String(e));process.exit(1)});
