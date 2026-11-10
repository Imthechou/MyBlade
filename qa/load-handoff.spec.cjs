const { chromium } = require('playwright');
const fs=require('node:fs');
const out='audit-load';
fs.mkdirSync(out,{recursive:true});
const issues=[];
const records=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function snap(page,name){
  const data=await page.evaluate(()=>({
    page:document.querySelector('.page.is-active')?.dataset.page,
    phase:document.querySelector('#v19-forge')?.dataset.phase,
    homeReady:!!document.querySelector('.home-start'),
    three:!!globalThis.THREE?.GLTFLoader,
    canvasHost:document.querySelector('#scene')?.parentElement?.id,
    horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
    resources:performance.getEntriesByType('resource').filter(r=>/three\\.bundle|three\\.addons|models\\/.test(r.name)).map(r=>({
      path:new URL(r.name).pathname,duration:Math.round(r.duration),size:r.transferSize})),
  }));
  await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});
  console.log('CHECK',name,JSON.stringify(data));
  records.push({name,...data});
  if(data.horizontalOverflow)issues.push('horizontal overflow '+name);
  return data;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const page=await context.newPage();
  page.setDefaultTimeout(13000);
  page.on('pageerror',e=>{if(issues.length<5)console.log('PAGE_ERROR_NOW',Date.now(),String(e.stack).slice(0,1100));issues.push('JS '+e.stack)});
  page.on('console',msg=>{if(msg.type()==='error'){if(issues.length<5)console.log('CONSOLE_ERROR_NOW',Date.now(),msg.text().slice(0,600));issues.push('CONSOLE '+msg.text())}});
  page.on('response',r=>{if(r.status()>=400)issues.push('HTTP '+r.status()+' '+r.url())});
  // Artificially delay engine download: home controls should not be blocked.
  await page.route('**/src/render/legacy/three.bundle.js',async route=>{
    console.log('ENGINE_DOWNLOAD_DEFERRED');
    await sleep(1500);
    await route.continue();
  });
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('.home-start').waitFor({state:'visible'});
  const early=await snap(page,'01_home_before_engine');
  if(!early.homeReady)issues.push('Home controls blocked by engine');
  if(early.three)console.log('INFO Three already loaded before early screenshot');
  await page.waitForFunction(()=>Boolean(globalThis.THREE?.GLTFLoader),{timeout:20000});
  await page.waitForTimeout(900);
  const home=await snap(page,'02_home_with_showcase');
  if(home.canvasHost!=='homeStage')issues.push('Home scene not mounted');
  const modelCountBefore=home.resources.filter(r=>r.path.includes('models/')).length;
  console.log('HOME_MODEL_REQUEST_COUNT',modelCountBefore);
  const start=page.getByRole('button',{name:/开始锻刀|继续锻刀/});
  await start.click();
  await page.waitForFunction(()=>document.querySelector('#v19-forge')?.dataset.phase==='ore',{timeout:15000});
  await snap(page,'03_forge_early');
  await page.waitForTimeout(1450);
  const ore=await snap(page,'04_forge_ore_ready');
  if(ore.canvasHost!=='stage')issues.push('Forge stage did not receive canvas');
  if(ore.phase!=='ore')issues.push('Forge did not enter ore');
  await page.getByRole('button',{name:/返回首页/}).click();
  await page.waitForTimeout(1100);
  await snap(page,'05_home_return');
  await page.getByRole('button',{name:/继续锻刀|开始锻刀/}).click();
  await snap(page,'06_reenter_early');
  await page.waitForTimeout(950);
  await snap(page,'07_reenter_ore');
  const mode=await page.locator('#v19-forge').getAttribute('data-phase');
  if(mode!=='ore')issues.push('Re-entering forge lost its phase');
  // End-to-end UI checks for original gameplay.
  await page.getByRole('button',{name:/开石/}).click();
  await page.waitForTimeout(1350);
  await snap(page,'08_reveal');
  await page.getByRole('button',{name:/去精炼/}).click();
  await snap(page,'09_refine');

  // Finish an actual saved blade, then launch a *new* furnace from the
  // collection showcase. This reproduces the reported "old knife flashes".
  const savedBlade=await page.evaluate(async()=>{
    const {forgeSession,commitFurnace}=await import('/src/core/v19Progress.js');
    const {strike}=await import('/src/v19/forge.js');
    const current=forgeSession().run;
    return commitFurnace(current,({run})=>{
      if(run.phase!=='refine')return false;
      run.purity=Math.min(98,(run.ore?.purity||67)+17);
      run.stability=91;
      run.refinement={result:'good',quality:75,damage:4,stable:8,purity:run.purity,stability:91,bonus:3};
      run.refining=null;
      run.phase='forge';
      for(let n=0;n<7;n++){
        const zone=['belly','edge','tip'][n%3];
        strike(run,zone,{u:.35+n*.06,v:zone==='edge'?.13:.46});
        if(run.phase==='broken')return false;
      }
      return true;
    });
  });
  if(!savedBlade?.ok)issues.push('Could not prepare saved-blade regression');
  else {
    await page.getByRole('button',{name:/返回首页/}).click();
    await page.getByRole('button',{name:/继续锻刀|开始锻刀/}).click();
    await page.waitForTimeout(1000);
    await snap(page,'10_prepared_forged_blade');
    await page.getByRole('button',{name:/收锤/}).click();
    await page.locator('[data-action="select-fit"]').first().click();
    await page.getByRole('button',{name:/确认并鉴定/}).click();
    await page.waitForTimeout(750);
    await snap(page,'11_saved_blade_appraisal');
    await page.getByRole('button',{name:/返回首页/}).click();
    await page.waitForTimeout(1050);
    await snap(page,'12_home_owned_blade');
    await page.evaluate(async()=>{
      const {ForgeStage}=await import('/src/v19/stage.js');
      if(ForgeStage.prototype.__handoffInstrumented)return;
      const old=ForgeStage.prototype.suspendPresentation;
      ForgeStage.prototype.suspendPresentation=function(...args){
        old.apply(this,args);
        (globalThis.__handoffReports ||= []).push({
          shown:this.shown,mode:this.mode,
          contentVisible:this.content.visible,
          meshVisible:this.mesh?.visible,
        });
      };
      ForgeStage.prototype.__handoffInstrumented=true;
      globalThis.__handoffReports=[];
    });
    await page.getByRole('button',{name:/开始锻刀/}).click();
    await page.waitForFunction(()=>document.querySelector('#v19-forge')?.dataset.phase==='ore');
    await snap(page,'13_fresh_forge_after_owned_blade');
    await page.waitForTimeout(750);
    await snap(page,'14_fresh_ore_ready');
    const handoffs=await page.evaluate(()=>globalThis.__handoffReports||[]);
    console.log('OWNED_BLADE_HANDOFF',JSON.stringify(handoffs));
    if(!handoffs.length||handoffs.some(x=>x.contentVisible||x.meshVisible))
      issues.push('Old knife remained visible during reattachment');
  }
  await context.close();
  // The first UI should still be responsive with simulated slow engine.
  const desktop=await browser.newContext({viewport:{width:1366,height:768}});
  const pc=await desktop.newPage();pc.setDefaultTimeout(10000);
  pc.on('pageerror',e=>issues.push('PC JS '+e.message));
  await pc.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await pc.locator('.home-start').waitFor();
  await snap(pc,'15_desktop');
  await desktop.close();
 } finally {await browser.close();}
 fs.writeFileSync(out+'/result.json',JSON.stringify({records,issues},null,2));
 console.log('QA_ISSUES',JSON.stringify(issues));
 if(issues.length)process.exitCode=1;
})().catch(e=>{console.error('QA_FATAL',e.stack||e);process.exit(1)});
