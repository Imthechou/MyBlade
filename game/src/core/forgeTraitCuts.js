/**
 * 工艺构筑 → 45 秒切割的玩法钩子（不重新增加永久六维）。
 *
 * 与 bladeAdapter 的五项正式测试适配系数是两条独立能力链：
 * 这里消费切割引擎现有的 weak / combo / armor / wear / ice 等事件参数。
 * 同一基础标签只读最高档一次；不读取旧版 LEGACY 特性以免重复结算。
 */
import { isBaseTag, tagName } from '../data/tags.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const NUM = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const RANK = layers => layers >= 6 ? 3 : layers >= 4 ? 2 : layers >= 2 ? 1 : 0;
const strength = rank => [0, .5, .75, 1][rank] || 0;

/** 工艺名称与触发说明同时供构筑 UI 读取；最终效果以本模块为唯一规则来源。 */
export const CUT_TRAIT_STYLES = Object.freeze({
  precision: { name: '弱点洞察', text: '精准触及弱点时额外得分' },
  stable: { name: '稳刃', text: '硬靶冲击时减少刀况损耗' },
  flow: { name: '连绵', text: '延长连击窗口，连切累积更快' },
  layer: { name: '破层', text: '交叉切割向相邻目标传递裂痕' },
  edge: { name: '一刀断', text: '提高软靶切断效率' },
  heat: { name: '热裂', text: '硬靶突破增强，但刀损略高' },
  cold: { name: '寒链', text: '冰靶破裂可波及附近目标' },
  oxide: { name: '流光', text: '完美切割的判定宽度与得分提高' },
});

export function resolveForgeCutTraits(blade) {
  const layers = {};
  if (Array.isArray(blade?.tagTiers)) {
    for (const item of blade.tagTiers) {
      if (!isBaseTag(item?.tagId)) continue;
      layers[item.tagId] = Math.max(layers[item.tagId] || 0, NUM(item.effectiveLayers ?? item.layers));
    }
  }
  if (blade?.tags && typeof blade.tags === 'object' && !Array.isArray(blade.tags)) {
    for (const [tag, n] of Object.entries(blade.tags)) {
      if (isBaseTag(tag)) layers[tag] = Math.max(layers[tag] || 0, NUM(n));
    }
  }
  const acquired = [];
  for (const [tag, count] of Object.entries(layers)) {
    const rank = RANK(count);
    if (!rank || !CUT_TRAIT_STYLES[tag]) continue;
    acquired.push({ id: tag, name: CUT_TRAIT_STYLES[tag].name, text: CUT_TRAIT_STYLES[tag].text,
      tagName: tagName(tag), layers: count, rank, intensity: strength(rank) });
  }
  for (const id of new Set(blade?.traits || [])) {
    const extra = {
      ST_signature: ['锻者署名', '无失误完成挑战时获得额外收益'],
      ST_void: ['暗域护刃', '刀况低时自动进行一次补救'],
      ST_spectral: ['偏相定位', '弱点切割收益提高'],
      ST_resonance: ['三连共鸣', '每三连击进一步提高连切收益'],
      ST_mirror: ['镜面判定', '完美切割的容错提高'],
    }[id];
    if (extra) acquired.push({ id, name: extra[0], text: extra[1], rank: 1, intensity: 1 });
  }
  return acquired;
}

export function applyForgeCutTraits(params, blade) {
  const p = { ...params };
  const effects = resolveForgeCutTraits(blade);
  for (const e of effects) {
    const s = e.intensity;
    switch (e.id) {
      case 'precision':
        p.weakMap = Math.max(p.weakMap || 0, 1);
        p.weakScore = (p.weakScore || 0) + 12 * s;
        break;
      case 'stable':
        p.wearHardMult *= 1 - .17 * s;
        break;
      case 'flow':
        p.comboWindow += .55 * s;
        p.comboStep += .035 * s;
        break;
      case 'layer':
        p.crackSpread = Math.max(p.crackSpread || 0, .37 * s);
        p.hardPowerMult *= 1 + .06 * s;
        break;
      case 'edge':
        p.softBase *= 1 + .15 * s;
        break;
      case 'heat':
        p.hardPowerMult *= 1 + .20 * s;
        p.wearHardMult *= 1 + .10 * s; // 风险与收益同时出现
        break;
      case 'cold':
        p.iceChain = Math.max(p.iceChain || 0, 1.15 * s);
        p.wearHardMult *= 1 - .06 * s;
        break;
      case 'oxide':
        p.perfectMult *= 1 + .11 * s;
        p.scoreMult *= 1 + .04 * s;
        break;
      case 'ST_signature':
        p.flawlessMult *= 1.12;
        break;
      case 'ST_void':
        p.emergencyHeal += 16;
        break;
      case 'ST_spectral':
        p.weakMap = Math.max(p.weakMap || 0, 1);
        p.weakScore += 7;
        break;
      case 'ST_resonance':
        p.tripleBonus += .045;
        break;
      case 'ST_mirror':
        p.perfectMult *= 1.075;
        break;
    }
  }
  // 强化始终限幅，不能被高阶工艺 + 多次赛事 buff 堆穿玩法。
  p.wearHardMult = clamp(p.wearHardMult, .62, 1.5);
  p.hardPowerMult = clamp(p.hardPowerMult, .7, 1.6);
  p.perfectMult = clamp(p.perfectMult, .8, 1.3);
  p.comboWindow = clamp(p.comboWindow, 1.5, 2.6);
  p.comboStep = clamp(p.comboStep, 0, .18);
  p.softBase = clamp(p.softBase, 0, 4);
  p.iceChain = clamp(p.iceChain, 0, 1.25);
  p.crackSpread = clamp(p.crackSpread, 0, .45);
  p.forgeTraits = effects.map(({ id, name, text, rank, layers }) => ({ id, name, text, rank, layers }));
  return p;
}
