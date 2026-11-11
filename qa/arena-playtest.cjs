const {chromium}=require('playwright');
const fs=require('node:fs');
const out='audit-arena';fs.mkdirSync(out,{recursive:true});
const errors=[],records=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();page.setDefaultTimeout(12000);
 page.on('pageerror',e=>errors.push('JS '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text().slice(0,320))});
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
 page.on('requestfailed',r=>errors.push('NETWORK '+r.url()+' '+r.failure()?.errorText));
 const snap=async name=>{
  const state=await page.evaluate(()=>({
    route:document.querySelector('.page.is-active')?.dataset.page,
    screen:document.querySelector('#v19-arena')?.dataset.screen,
    trial:Boolean(document.querySelector('#v19-arena .trial-frame canvas')),
    hit:document.querySelector('[data-trial="hits"]')?.textContent,
    wear:document.querySelector('[data-trial="durability"]')?.textContent,
    combo:document.querySelector('[data-trial="combo"]')?.textContent,
    overlay:document.querySelector('#v19-arena')?.innerText.slice(0,400),
    visibleCanvas:[...document.querySelectorAll('#v19-arena canvas')].map(e=>e.getBoundingClientRect().toJSON()),
    scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth
  }));
  await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});
  console.log('ARENA_SCENE',name,JSON.stringify(state));records.push({name,...state});
  if(state.scrollWidth>state.viewport)errors.push('HORIZONTAL_OVERFLOW '+name);
  return state;
 };
 const target=process.env.PLAYTEST_BASE_URL||'http://127.0.0.1:4173/';
 await page.goto(target,{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(650);
 const guide=page.getByRole('button',{name:/知道了，开始第一把刀/}).first();
 if(await guide.count()&&await guide.isVisible()) await guide.click();
 await page.getByRole('button',{name:'赛事',exact:true}).click();
 await page.waitForTimeout(700);
 await snap('01-arena-lobby');
 const loan=page.locator('#v19-arena [data-arena-action="loan"]').first();
 if(!await loan.count())throw new Error('No practice loan button; cannot try without forged blade');
 await loan.click();
 await page.waitForTimeout(1000);
 const start=await snap('02-arena-game-start');
 if(!start.trial)throw new Error('Trial canvas did not mount');
 const canvas=page.locator('#v19-arena .trial-frame canvas').first();
 const r=await canvas.boundingBox();
 if(!r)throw new Error('Trial canvas invisible');
 // Native Chromium touch gesture, not a mouse-only stand-in for a mobile game.
 const cdp=await context.newCDPSession(page);
 const touchBefore=Number(await page.locator('[data-trial="hits"]').textContent())||0;
 const sx=r.x+r.width*.07,ex=r.x+r.width*.93,sy=r.y+r.height*.56;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
 for(let step=1;step<=14;step++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{
     x:sx+(ex-sx)*step/14,y:sy+Math.sin(step/14*Math.PI)*2,id:1,
   }]});
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await snap('02a-arena-first-touch');
 await page.waitForTimeout(110);
 const touchAfter=Number(await page.locator('[data-trial="hits"]').textContent())||0;
 if(touchAfter<=touchBefore)throw new Error('Real touchscreen swipe did not cut a target');
 console.log('ARENA_TOUCH',JSON.stringify({before:touchBefore,after:touchAfter}));
 for(let i=0;i<14;i++){
   const yy=r.y+r.height*(.28+(i%5)*.11);
   const left=r.x+r.width*.12,right=r.x+r.width*.88;
   await page.mouse.move(i%2?right:left,yy);
   await page.mouse.down();
   for(let step=1;step<=8;step++)await page.mouse.move((i%2?right:left)+(i%2?-1:1)*(right-left)*step/8, yy+(step-4)*2,{steps:1});
   await page.mouse.up();
   await page.waitForTimeout(175);
 }
 const after=await snap('03-arena-after-swipes');
 if(Number(after.hit||0)<3)throw new Error('Touch swipes failed to cut enough visible targets: '+after.hit);
 await page.waitForTimeout(11100);
 const report=await snap('04-arena-report');
 if(report.screen!=='report'||!report.overlay.includes('试刀结束'))throw new Error('Tournament did not complete with a visible report');
 if(!report.overlay.includes('表现最佳'))throw new Error('Performance section missing from report');
 await context.close();
 }finally{await browser.close()}
 fs.writeFileSync(out+'/results.json',JSON.stringify({records,errors},null,2));
 console.log('ARENA_RESULT',JSON.stringify({screens:records.length,errors}));
 if(errors.length)process.exitCode=1;
})().catch(e=>{console.error('ARENA_FAILED',e.stack||e);process.exitCode=1});
