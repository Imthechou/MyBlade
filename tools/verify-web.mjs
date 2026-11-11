import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';

const ROOT=path.resolve('build');
function locateIndex(dir,depth=0) {
  if(depth>5||!fs.existsSync(dir))return null;
  if(fs.existsSync(path.join(dir,'index.html')))return dir;
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(item.isDirectory()){
      const found=locateIndex(path.join(dir,item.name),depth+1);
      if(found)return found;
    }
  }
  return null;
}
const WEB=locateIndex(ROOT);
if(!WEB)throw new Error('Missing Cocos built index.html below build/. Cocos build must succeed first.');
fs.mkdirSync('artifacts',{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm',
  '.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.bin':'application/octet-stream'};
const server=http.createServer((req,res)=>{
  try{
    const filename=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    const resolved=path.resolve(WEB,'.'+filename);
    if(resolved!==WEB&&!resolved.startsWith(WEB+path.sep)){res.writeHead(403);res.end();return;}
    const file=fs.statSync(resolved).isDirectory()?path.join(resolved,'index.html'):resolved;
    res.setHeader('Content-Type',mime[path.extname(file).toLowerCase()]||'application/octet-stream');
    fs.createReadStream(file).on('error',()=>{if(!res.headersSent)res.writeHead(404);res.end()}).pipe(res);
  }catch(e){res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(8123,'127.0.0.1',resolve));
let browser,errors=[];
try {
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>globalThis.__MYBLADE?.ready===true,undefined,{timeout:90000});
  await page.waitForTimeout(1500);
  await page.screenshot({path:'artifacts/01-normal.png'});
  const before=await page.evaluate(()=>globalThis.__MYBLADE.state.cutCount);
  await page.evaluate(()=>globalThis.__MYBLADE.setLook({color:[130,187,219],pattern:.95,light:34000}));
  await page.waitForTimeout(150);
  await page.screenshot({path:'artifacts/02-look.png'});
  await page.evaluate(()=>globalThis.__MYBLADE.slash());
  await page.waitForFunction(count=>globalThis.__MYBLADE.state.cutCount===count+1,before,{timeout:10000});
  await page.waitForTimeout(380);
  await page.screenshot({path:'artifacts/03-split.png'});
  const state=await page.evaluate(()=>globalThis.__MYBLADE.state);
  if(!state.split||state.cutCount!==before+1)throw new Error('wood cut did not complete');
  if(errors.length)throw new Error('runtime JS errors: '+errors.join(' | '));
  fs.writeFileSync('artifacts/result.json',JSON.stringify({ok:true,state,errors,web:WEB},null,2));
  console.log('PASS: Web Cocos 3D loaded, look changed, wood split, no JS errors');
} catch(e) {
  fs.writeFileSync('artifacts/result.json',JSON.stringify({ok:false,error:String(e),errors},null,2));
  throw e;
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
