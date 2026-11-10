/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/finishOverrides.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
const K3D = __reg.proxy;

  'use strict';

  /**
   * 键 = 决策卡 id；值 = 要并进 write.variants.finish 的参数。
   * 只写需要覆盖的键（其余仍用 cardWrites.js 的原始值 + finishes12 的 defaults）。
   */
  const OVERRIDES = {
    /* S5_20「蓝紫流界」（legend 签名 · F10 彩色油膜）
     * —— 这张卡的卡数据里 oldName 就写着「多普勒淬」，卡面 targetDescription 是
     *    「淬火｜视角相关的蓝紫流色，保留金属底反射」，tags 含 flow。
     *    用户口径：「需要有决策卡组合能稳定复现 csgo 的多普勒效果」。
     * 原实现：F10 的颜色形状全由 mask = mix(pattern, height, 0.35) 驱动，而 pattern/height
     *    来自 S3 纹理；S5 预览底是 T01 素面、明暗差极小 → mask 近似常量 → 渲出来是
     *    "一片平涂的蓝紫"，完全没有多普勒的大理石流动色块（R12 实测：8 材质 × 4 图案源
     *    × 正/斜两机位 = 64 格全是均匀色块，见 bf_r12/doppler/多普勒探索_正面.jpg）。
     * 现在：接通此前**从未被 F10 读取**的 f3.z（iridescence）作为「多普勒大理石结构强度」
     *    → shader 里走一条**纹理无关**的双八度域扭曲大理石场，直接驱动四段调色板
     *    （pal0 → pal3），得到"深底 + 大块流动彩斑"。
     * 稳定性：色块布局只由卡参数 + S1 材质锚点决定，不读 seeds → 同一张卡每局都是同一个
     *    多普勒；色板随 S1 材质派生 → 换材质 = 蓝宝石 / 红宝石 / 紫相位 等不同变体。
     * 零回归：iridescence(f3.z) 全项目仅 F08 的 4 张卡在读，3 张 F10 卡都没写它。 */
    S5_20: { iridescence: 0.88 },

    /* S5_21「神淬虹纹」（legend，F10 彩色油膜）
     * 用户口径：「要做成 csgo 渐变之色的感觉」。
     * 原实现：F10 多普勒——颜色锁在纹理节点上（依赖 pattern），而 S5 预览底是
     * T01 素面、pattern 近乎常量 → 渲出来几乎是均匀的一层，看不出"渐变"。
     * 现在：接通 F10 的 gradient 开关 → 沿刀身长轴的平滑宽幅渐变（紫→品红→橙→金），
     * 与纹理无关，纯靠 tAxis，所以任何底纹都能读出完整的 Fade。 */
    S5_21: { gradient: 0.92 },

    /* S5_22「玄蚀紫界」（legend，F04 发黑氧化）
     * 用户口径：「要是紫色的」。
     * 原实现：F04 只做 mix(color, color*(1-0.82*dk)) 纯压暗——在近黑底材上
     * 就是一团黑/橄榄，读不出卡名里的"紫"。
     * 现在：接通 F04 的 gradient(染色强度) + tintHex(染色目标) → 保明暗结构地染向紫色，
     * 并在纹理脊线处留一道更亮的紫边（对应卡面文案「暗化表层带细微紫黑边界」）。 */
    S5_22: { gradient: 0.80, tintHex: '#7b34d6' },
  };

  const IDS = Object.keys(OVERRIDES);

  /** 取某张卡的覆盖参数（无则 null）。深拷贝一层，避免调用方改到常量表。 */
  function get(id) {
    const o = OVERRIDES[id];
    return o ? JSON.parse(JSON.stringify(o)) : null;
  }
  function has(id) { return Object.prototype.hasOwnProperty.call(OVERRIDES, id); }

  /** 传入运行时卡对象或卡 id，返回其覆盖参数 */
  function forCard(card) {
    if (!card) return null;
    return get(typeof card === 'string' ? card : card.id);
  }

  K3D.finishOverrides = { OVERRIDES, IDS, get, has, forCard };

  /* ── 装载期自检（只告警、不抛异常，避免一张卡的数据问题拖垮整个游戏）──
   *    ① id 必须真实存在于 cardsV11；
   *    ② 覆盖里的键必须已经是该卡 finishId 的合法参数，或者是本表引入的两个新键。
   *       写错键名（例如把 gradient 拼成 gradiant）不会被 shader 读到 → 表现为
   *       「改了没效果」，是最难排查的一类问题，所以这里显式点名。 */
  try {
    const NEW_KEYS = { gradient: 1, tintHex: 1 };
    const known = {
      F04: { amount: 1, darkness: 1 }, F05: { amount: 1, gradient: 1, tintHex: 1 },
      F06: { amount: 1, heatSpread: 1, phase: 1 }, F07: { amount: 1, temperature: 1 },
      F08: { amount: 1, hueShift: 1, iridescence: 1 },
      F09: { amount: 1, coat: 1, tintHex: 1 },
      F10: { strength: 1, preserveRatio: 1, fresnelPower: 1, fresnelIntensity: 1, colorPhase: 1, paletteShift: 1,
        // ★ 2026-10-13（R12）F10 的「多普勒大理石结构强度」：接通此前 F10 从不读取的
        //   f3.z（iridescence）。F08 也读这个槽位，但 finId 分支互斥，同卡不会同时命中。
        iridescence: 1 },
      F11: { amount: 1, coat: 1 },
      F12: { amount: 1, fresnelPower: 1, flowSpeed: 1, tintHex: 1 },
    };
    for (const id of IDS) {
      const hasById = !!(K3D.cardsV11 && K3D.cardsV11.byId);
      const card = hasById ? K3D.cardsV11.byId(id) : null;
      if (hasById && !card) { console.warn('[finishOverrides] 未知卡 id：' + id); continue; }
      const w = (K3D.cardWrites && K3D.cardWrites.get) ? (K3D.cardWrites.get(id) || {}) : {};
      const finId = w.finishId || null;
      const allow = known[finId] || {};
      for (const k of Object.keys(OVERRIDES[id])) {
        if (!allow[k] && !NEW_KEYS[k]) {
          console.warn('[finishOverrides] ' + id + ' (finishId=' + finId + ') 上的键「' + k
            + '」不在该工艺的参数表里，shader 不会读到它 → 表现为"改了没效果"。');
        }
      }
    }
  } catch (e) { /* 自检失败不影响运行 */ }

export const finishOverrides = __reg.proxy.finishOverrides;
