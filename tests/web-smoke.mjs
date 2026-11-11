import fs from 'node:fs';
import { chromium } from 'playwright';

fs.mkdirSync('artifacts',{recursive:true});
const issues = [];
let browser;
try {
  browser = await chromium.launch({headless:true,args:[
    '--enable-webgl','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader'
  ]});
  const page = await browser.newPage({viewport:{width:540,height:960},deviceScaleFactor:1});
  page.on('pageerror',err=>issues.push('JS '+err.message));
  page.on('console',msg=>{if(msg.type()==='error')issues.push('console '+msg.text())});
  page.on('requestfailed',req=>issues.push('resource '+req.url()+' '+(req.failure()?.errorText||'')));
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__MYBLADE?.ready===true,undefined,{timeout:120000});
  await page.waitForTimeout(800);
  await page.screenshot({path:'artifacts/01-initial.png'});
  const first=await page.evaluate(()=>window.__MYBLADE);
  if(first.cutCount!==0)throw new Error('Expected initial cutCount 0');

  // Verify runtime shader/lighting changes through actual input, not a mocked canvas.
  await page.locator('canvas').first().click({position:{x:18,y:360}});
  await page.keyboard.press('c');
  await page.keyboard.press('l');
  await page.waitForFunction(()=>window.__MYBLADE?.colorIndex===1 && window.__MYBLADE.light!==2.4,undefined,{timeout:10000});
  await page.waitForTimeout(300);
  await page.screenshot({path:'artifacts/02-look-adjusted.png'});

  // Drag crosses the center cut zone; Godot handles it as swipe input.
  await page.mouse.move(115,520);
  await page.mouse.down();
  await page.mouse.move(412,390,{steps:18});
  await page.mouse.up();
  await page.waitForFunction(()=>window.__MYBLADE?.cutCount===1 && window.__MYBLADE.split,undefined,{timeout:15000});
  await page.waitForTimeout(520);
  await page.screenshot({path:'artifacts/03-split-physics.png'});
  await page.waitForFunction(()=>window.__MYBLADE?.split===false,undefined,{timeout:10000});
  const result=await page.evaluate(()=>window.__MYBLADE);
  if(issues.length)throw new Error(issues.join('\n'));
  fs.writeFileSync('artifacts/report.json',JSON.stringify({ok:true,initial:first,after:result,issues},null,2));
  console.log('PASS Godot WebGL: loaded, material control changed, 3D wood split, regenerated, zero browser errors');
} catch(e) {
  fs.writeFileSync('artifacts/report.json',JSON.stringify({ok:false,error:String(e),issues},null,2));
  console.error(e);
  process.exitCode=1;
} finally {
  if(browser)await browser.close();
}
