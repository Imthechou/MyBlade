/** Forge V4 card gain budget: S4/S7 specialist stats come mainly from the minigames.
 * Keep every authored card name, rarity, texture, risk and tag intact.
 */
import { STAT_KEYS } from './balance.js';
const OTHER = ['toughness', 'craft', 'design', 'spirit'];
export const RARITY_BUDGET = Object.freeze({ common:27, fine:34, rare:43, epic:53, legend:64, mythic:77 });
export const SPECIALIST_CARD = Object.freeze({ common:4, fine:5, rare:7, epic:9, legend:12, mythic:16 });
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function normalizeForgeCardStats(raw, original) {
  const rarity=raw.rarity||'common', stage=raw.stage;
  const budget=RARITY_BUDGET[rarity]||RARITY_BUDGET.common;
  const result={},debt={};
  for(const key of STAT_KEYS) {
    const v=Number(original[key]||0);
    if(v<0 && (OTHER.includes(key)||(stage==='S4'&&key==='strength')||(stage==='S7'&&key==='sharpness')))
      debt[key]=-clamp(Math.abs(v)*.16,1,6);
  }
  const weights=OTHER.map(k=>Math.max(0,original[k]||0));
  const sum=weights.reduce((a,b)=>a+b,0);
  const normalized=sum>0?weights.map(v=>v/sum):
    OTHER.map(k=>({toughness:.30,craft:.28,design:.24,spirit:.18})[k]);
  for(let i=0;i<OTHER.length;i++) result[OTHER[i]]=Math.round(
    budget*(normalized[i]*.82+.18/OTHER.length)*100)/100;
  const key=stage==='S4'?'strength':stage==='S7'?'sharpness':null;
  if(key)result[key]=SPECIALIST_CARD[rarity]||4;
  for(const [k,v] of Object.entries(debt))result[k]=Math.round(((result[k]||0)+v)*100)/100;
  if(key)result[key]=Math.max(2,result[key]||0);
  return result;
}
