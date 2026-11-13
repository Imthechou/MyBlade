const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const target=process.env.PLAYTEST_TARGET||'runtime';
const out='audit-playtest/'+target;
fs.mkdirSync(out,{recursive:true});
const issues=[],scenes=[];
async function snapshot(page,name){
  await page.waitForTimeout(600);
  const state=await page.evaluate(()=>({
    title:document.title,phase:document.querySelector('#v19-forge')?.dataset.phase,
    activePage:document.querySelector('.page.is-active')?.dataset.page,
    viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,
    buttons:[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length).map(b=>b.innerText.trim()).filter(Boolean).slice(0,24),
    canvases:[...document.querySelectorAll('canvas')].filter(c=>c.getClientRects().length).map(c=>[c.clientWidth,c.clientHeight])
  }));
  await page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});
  console.log('STAGE',name,JSON.stringify(state));scenes.push({name,...state});
  if(state.scrollWidth>state.viewport[0]+1)issues.push('Horizontal overflow '+name);
  return state;
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 try{
 for(const [w,h,label] of [[390,844,'mobile'],[1366,768,'desktop']]){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:label==='mobile',hasTouch:label==='mobile'});
  const page=await context.newPage();page.setDefaultTimeout(11000);
  page.on('pageerror',e=>issues.push(label+' JS '+e.message));
  page.on('console',m=>{if(m.type()==='error')issues.push(label+' CONSOLE '+m.text().slice(0,250))});
  page.on('response',r=>{if(r.status()>=400)issues.push(label+' HTTP '+r.status()+' '+r.url())});
  await page.goto(process.env.PLAYTEST_BASE_URL||'http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await snapshot(page,label+'-home');
  const start=page.getByRole('button',{name:/开始锻刀|继续锻刀/}).first();
  if(await start.count()){
   const onboarding=page.getByRole('button',{name:/知道了，开始第一把刀|我知道了|跳过引导/}).first();
   if(await onboarding.count()&&await onboarding.isVisible()){
     console.log('DISMISS_ONBOARDING',label);
     await onboarding.click();await snapshot(page,label+'-onboarding-dismissed');
   }
   const view = page.locator('#homeStage .blade-view-controls');
   await view.getByRole('button', { name: '复位视角' }).waitFor();
   assert.equal(await view.getByRole('button').count(), 1);
   await start.click();await snapshot(page,label+'-forge');
   const forgeView = page.locator('#v19-forge .stage-footer');
   assert.equal(await forgeView.getByRole('button', { name: '复位视角' }).count(), 1);
   if(label==='mobile'){
    for(const [name,regex] of [['lamp',/打灯/],['knock',/敲石/],['reveal',/开石/],['refine',/去精炼/]]){
      const action=page.getByRole('button',{name:regex}).first();
      if(await action.count()&&await action.isVisible()){
        try{await action.click();await snapshot(page,label+'-'+name)}
        catch(e){issues.push('INTERACT '+name+' '+e.message.slice(0,180))}
      }else console.log('ACTION_ABSENT',name);
    }
   }
  }else issues.push('START_BUTTON_MISSING '+label);
  await context.close();
 }
 }finally{await browser.close()}
 fs.writeFileSync(out+'/results.json',JSON.stringify({scenes,issues},null,2));
 console.log('FINAL_ISSUES',JSON.stringify(issues));
 if(issues.length)process.exitCode=1;
})().catch(e=>{console.error('PLAYTEST_FATAL',e.stack||e);process.exitCode=1});
