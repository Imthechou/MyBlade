/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/arenaThemes.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const THEMES = [
    {
      id: 'frost', name: '极寒',
      desc: '低温淬炼之夜，冷静与韧性决定生死。',
      stats: { toughness: 1, craft: 1 },
      eventTypes: { disadvantage: 1.15, normal: 1.0 },
      styleBoost: ['press', 'precise'],
      testBias: 'pressure',
    },
    {
      id: 'magma', name: '熔岩',
      desc: '高炉余温未散，爆发与锋利在此刻最值钱。',
      stats: { strength: 1, sharpness: 1 },
      eventTypes: { edge: 1.2, special: 1.15 },
      styleBoost: ['overload', 'edge'],
      testBias: 'chop',
    },
    {
      id: 'gale', name: '疾风',
      desc: '节奏快到听不见锤声，抓住转瞬的空档。',
      stats: { sharpness: 1, spirit: 1 },
      eventTypes: { edge: 1.25, chain: 1.15 },
      styleBoost: ['edge'],
      testBias: 'chop',
    },
    {
      id: 'volt', name: '雷暴',
      desc: '高压下的对决，一记失误就是连锁反应。',
      stats: { strength: 1, spirit: 1 },
      eventTypes: { chain: 1.3, special: 1.2 },
      styleBoost: ['overload', 'edge'],
      testBias: 'rope',
    },
    {
      id: 'dusk', name: '暗夜',
      desc: '看不清对方的牌，靠直觉与灵性判断。',
      stats: { spirit: 1, design: 1 },
      eventTypes: { special: 1.25 },
      styleBoost: ['quench', 'composite'],
      testBias: 'rope',
    },
    {
      id: 'abyss', name: '深谷',
      desc: '持久战，把每一分优势守住到底。',
      stats: { toughness: 1, design: 1 },
      eventTypes: { normal: 1.15, chain: 1.1 },
      styleBoost: ['press', 'composite'],
      testBias: 'pressure',
    },
    {
      id: 'solar', name: '烈日',
      desc: '全场聚光，评委盯着工艺的每一寸。',
      stats: { craft: 1, design: 1 },
      eventTypes: { edge: 1.1, normal: 1.05 },
      styleBoost: ['precise', 'quench'],
      testBias: 'rope',
    },
    {
      id: 'iron', name: '铁幕',
      desc: '没有花活，硬实力碾过去。',
      stats: { strength: 1, toughness: 1 },
      eventTypes: { disadvantage: 1.2 },
      styleBoost: ['press'],
      testBias: 'pressure',
    },
  ];

  K3D.arenaThemes = {
    THEMES,
    byId(id) { return THEMES.find((t) => t.id === id) || null; },
    /**
     * 按 seed 确定性抽一个主题（§8.15 禁 Math.random）。
     * @returns {object} 主题对象
     */
    roll(seed, rand) {
      if (!rand) {
        let a = 0;
        const s = String(seed);
        for (let i = 0; i < s.length; i++) a = (Math.imul(a, 31) + s.charCodeAt(i)) >>> 0;
        a |= 0;
        rand = function () {
          a = (a + 0x6D2B79F5) | 0;
          let t = Math.imul(a ^ (a >>> 15), 1 | a);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      return THEMES[Math.floor(rand() * THEMES.length) % THEMES.length];
    },
  };

export const arenaThemes = __reg.proxy.arenaThemes;
