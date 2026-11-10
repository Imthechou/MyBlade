const { chromium } = require('playwright');
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
 await page.getByRole('button',{name:/开始锻刀/}).click();
 await shot(page,'01_ore');
 await page.getByRole('button',{name:'打灯'}).click();
 await shot(page,'02_lamp');
 await page.getByRole('button',{name:'敲石'}).click();
 await shot(page,'03_knock');
 await page.getByRole('button',{name:/开石/}).click();
 await page.waitForTimeout(1200);
 await shot(page,'04_reveal');
 await page.getByRole('button',{name:/去精炼/}).click();
 await shot(page,'05_refine');
 // This changes only disposable CI test storage, not the player's real saved game.
 const result=await page.evaluate(async()=>{
   const {forgeSession,commitFurnace}=await import('/src/core/v19Progress.js');
   const {strike}=await import('/src/v19/forge.js');
   const current=forgeSession().run;
   return commitFurnace(current,({run})=>{
     if(run.phase!=='refine') return false;
     run.purity=Math.min(98,(run.ore?.purity||68)+17);
     run.stability=91;
     run.refinement={result:'good',quality:75,damage:4,stable:8,purity:run.purity,stability:91,bonus:3};
     run.refining=null;
     run.phase='forge';
     for(let n=0;n<7;n++){
       const z=['belly','edge','tip'][n%3];
       strike(run,z,{u:.35+n*.065,v:z==='edge'?.13:.46});
       if(run.phase==='broken') return false;
     }
     return true;
   });
 });
 console.log('SEEDED_STAGE_FOR_VISUAL_REVIEW',JSON.stringify(result).slice(0,800));
 if(!result?.ok) throw new Error('Could not prepare visual forge fixture: '+JSON.stringify(result));
 await page.getByRole('button',{name:'返回首页'}).click();
 await page.getByRole('button',{name:/继续锻刀|开始锻刀/}).click();
 await page.waitForTimeout(1750);
 await shot(page,'06_forge');
 const scene=page.locator('#v19-forge #scene');
 await scene.focus();
 await page.keyboard.press('Space');
 await page.waitForTimeout(550);
 await shot(page,'07_impact');
 const hammer=await page.locator('#hit-count').textContent();
 console.log('HAMMER_RESULT',hammer);
 if(Number.parseInt(hammer,10)<8)throw new Error('Hammer did not hit');
 await page.getByRole('button',{name:/收锤/}).click();
 await shot(page,'08_fit');
 await page.locator('[data-action="select-fit"]').first().click();
 await shot(page,'09_fit_selected');
 await page.getByRole('button',{name:/确认并鉴定/}).click();
 await shot(page,'10_appraise');
 const stats=await page.locator('.stat-list .stat').count();
 console.log('STAT_COUNT',stats);
 if(stats!==6)throw new Error('Missing final six attributes');
 // Check key mobile touch targets, not every compact decorative icon.
 const targets=await page.evaluate(()=>Array.from(document.querySelectorAll('#v19-forge #actions button')).map(el=>({
   text:el.innerText, height:Math.round(el.getBoundingClientRect().height),
 })));
 console.log('ACTION_TOUCH_SIZES',JSON.stringify(targets));
 await context.close();
 const desktop=await browser.newContext({viewport:{width:1365,height:768}});
 const big=await desktop.newPage();
 big.on('pageerror',e=>errors.push('DESKTOP '+e.message));
 await big.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
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
