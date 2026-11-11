/**
 * 数据配置层 · 工艺标签字典（V2.1 §8）
 *
 * ── 分层依据 ──
 * 卡池实际有 27 个标签，而 V2.1 §8.1 写的是「第一阶段采用 6–8 个核心基础标签」。
 * 处理方式：**保留 27 个标签的全部语义**（它们仍被 50 条特性与 10 条隐藏 Combo
 * 的条件树引用，删掉会让这些内容集体失效），但按 V2.1 的职责分成三层：
 *
 *   · BASE（8 个）—— 参与 2/4/6 层成长与评分倍率（§8.1 / §13.1）。
 *     入选标准是"真正能代表加工方向"且**阶段覆盖 ≥6**
 *     （一个标签每个阶段最多贡献 1 层，覆盖不足 6 个阶段就永远到不了 6 层门槛）。
 *   · SPECIAL（5 个）—— 稀有工艺/签名工艺，获得即登记绑定特性，不累计层数（§8.2）。
 *   · FLAVOR（14 个）—— 记录工艺倾向与视觉倾向，不生成特性，但仍是特性/Combo 的条件。
 *
 * 覆盖率实测（tools/ 分析脚本）：precision 9 / flow 9 / stable 8 / oxide 7 /
 * clean 6 / mirror 6 / cold 6 / heat 6 / edge 6 / layer 6，均 ≥6，门槛可达。
 */

/** 8 个核心基础标签 —— 参与 2/4/6 层成长 */
export const BASE_TAGS = Object.freeze([
  { id: 'precision', name: '精密', desc: '加工精度优先，倾向工艺与完成度' },
  { id: 'stable', name: '稳态', desc: '结构稳定优先，倾向韧性与容错' },
  { id: 'flow', name: '流动', desc: '纹路流动优先，倾向设计与灵性' },
  { id: 'layer', name: '层叠', desc: '折叠层积优先，倾向韧性与强度' },
  { id: 'edge', name: '刃线', desc: '刃口处理优先，倾向锋利' },
  { id: 'heat', name: '热相', desc: '高温工艺优先，倾向强度与灵性' },
  { id: 'cold', name: '冷相', desc: '低温工艺优先，倾向韧性与锋利' },
  { id: 'oxide', name: '氧化', desc: '发色与表面控制优先，倾向设计与灵性' },
]);

/** 特殊工艺标签 —— 获得即登记绑定特性（§8.2） */
export const SPECIAL_TAGS = Object.freeze([
  { id: 'signature', name: '签名', desc: '签名工艺，独占的稀有手法' },
  { id: 'void', name: '暗域', desc: '暗面处理，低反射与沉色' },
  { id: 'spectral', name: '偏相', desc: '异常相变，难以复现的表面' },
  { id: 'resonance', name: '共鸣', desc: '共振工艺，放大既有倾向' },
  { id: 'mirror', name: '镜面', desc: '极致抛光，反射优先' },
]);

/** 修饰/风味标签 —— 记录倾向，不生成特性，但参与特性与 Combo 条件 */
export const FLAVOR_TAGS = Object.freeze([
  { id: 'unstable', name: '失稳' }, { id: 'repair', name: '修复' },
  { id: 'grip', name: '握持' }, { id: 'curve', name: '弧线' },
  { id: 'fold', name: '折叠' }, { id: 'rigid', name: '刚性' },
  { id: 'weather', name: '战痕' }, { id: 'clean', name: '净面' },
  { id: 'balanced', name: '均衡' }, { id: 'flex', name: '回弹' },
  { id: 'light', name: '轻质' }, { id: 'impact', name: '冲击' },
  { id: 'hetero', name: '异质' }, { id: 'utility', name: '实用' },
]);

const ALL = [...BASE_TAGS, ...SPECIAL_TAGS, ...FLAVOR_TAGS];

export const TAGS = Object.freeze(ALL);
export const TAG_BY_ID = Object.freeze(Object.fromEntries(ALL.map((t) => [t.id, t])));

const BASE_IDS = new Set(BASE_TAGS.map((t) => t.id));
const SPECIAL_IDS = new Set(SPECIAL_TAGS.map((t) => t.id));

export const isBaseTag = (id) => BASE_IDS.has(id);
export const isSpecialTag = (id) => SPECIAL_IDS.has(id);
export const isFlavorTag = (id) => !BASE_IDS.has(id) && !SPECIAL_IDS.has(id);
export const tagName = (id) => (TAG_BY_ID[id] ? TAG_BY_ID[id].name : id);

export default TAGS;
