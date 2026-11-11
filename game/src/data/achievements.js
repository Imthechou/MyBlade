/**
 * 数据配置层 · 成就（V2.1 §23.2）
 *
 * 「成就鼓励玩家尝试不同玩法，而不只是重复累计点击次数。」
 * 奖励只给 CR / 内容解锁 / 称号 / 收藏装饰 / 刃线外观 ——
 * **称号与装饰不直接提高基础六维**（V2.1 §23.2），避免永久成长变成战力碾压。
 *
 * 每条成就的 check(record|progress) 由 core/progress.js 调用，
 * 本文件只声明条件与奖励，不含判定流程。
 */

import { LEGACY_MODE } from '../platform/env.js';
import { SIGNATURES } from '../v19/forge.js';
import { V19_RARITY_MIN, V19_RISK_GOALS } from '../v19/workshop.js';

const legacyAchievements = [
  // ── 锻造 ──
  { id: 'AC_first_forge', group: 'forge', name: '第一把刀', desc: '完成第一次锻造', reward: { cr: 30 } },
  { id: 'AC_forge_10', group: 'forge', name: '熟手', desc: '累计完成 10 次锻造', goal: 10, metric: 'forgeCount', reward: { cr: 80 } },
  { id: 'AC_forge_50', group: 'forge', name: '锻造匠人', desc: '累计完成 50 次锻造', goal: 50, metric: 'forgeCount', reward: { cr: 200, unlock: 'title:匠人' } },

  // ── 稀有度 ──（2026-10-14：成刀轴扩到 6 档，补齐第 6 档的成就，保持每档各一条）
  { id: 'AC_rarity_fine', group: 'rarity', name: '初出茅庐', desc: '锻出第一把精良成刀', rarity: 'fine', reward: { cr: 20 } },
  { id: 'AC_rarity_rare', group: 'rarity', name: '小有名气', desc: '锻出第一把稀有成刀', rarity: 'rare', reward: { cr: 40 } },
  { id: 'AC_rarity_epic', group: 'rarity', name: '匠艺显现', desc: '锻出第一把史诗成刀', rarity: 'epic', reward: { cr: 80 } },
  { id: 'AC_rarity_legend', group: 'rarity', name: '名匠之路', desc: '锻出第一把传说成刀', rarity: 'legend', reward: { cr: 150, unlock: 'title:名匠' } },
  { id: 'AC_rarity_mythic', group: 'rarity', name: '神话初现', desc: '锻出第一把神话成刀', rarity: 'mythic', reward: { cr: 300, unlock: 'title:神话锻者' } },

  // ── 分数 ──
  { id: 'AC_score_450', group: 'score', name: '登堂入室', desc: '成刀评分达到 450', goal: 450, metric: 'bestScore', reward: { cr: 120 } },
  { id: 'AC_score_700', group: 'score', name: '接近极限', desc: '成刀评分达到 700', goal: 700, metric: 'bestScore', reward: { cr: 260, unlock: 'title:极限' } },

  // ── 风险经营（V2.1 §23.2「在不同 Risk 区间成功完成锻造」）──
  { id: 'AC_risk_60', group: 'risk', name: '临界生还', desc: '在峰值 Risk ≥60 的情况下完成锻造', goal: 60, metric: 'bestPeakRiskClear', reward: { cr: 90 } },
  { id: 'AC_risk_90', group: 'risk', name: '刀尖行走', desc: '在峰值 Risk ≥90 的情况下完成锻造', goal: 90, metric: 'bestPeakRiskClear', reward: { cr: 220, unlock: 'title:蹈刃者' } },

  // ── 特性与 Combo ──
  { id: 'AC_trait_master', group: 'trait', name: '高阶共鸣', desc: '获得一个 6 层高阶基础特性', reward: { cr: 100 } },
  { id: 'AC_special_first', group: 'trait', name: '签名初现', desc: '首次获得特殊标签特性', reward: { cr: 70 } },
  { id: 'AC_combo_first', group: 'combo', name: '意外发现', desc: '首次触发隐藏 Combo', reward: { cr: 100 } },
  { id: 'AC_combo_5', group: 'combo', name: '组合猎手', desc: '发现 5 条隐藏 Combo', goal: 5, metric: 'comboFound', reward: { cr: 200 } },
  { id: 'AC_combo_all', group: 'combo', name: '配方全书', desc: '发现全部隐藏 Combo', goal: 10, metric: 'comboFound', reward: { cr: 400, unlock: 'title:配方师' } },

  // ── 赛事 ──
  { id: 'AC_match_first', group: 'arena', name: '初登赛场', desc: '参加第一场赛事', reward: { cr: 40 } },
  { id: 'AC_win_10', group: 'arena', name: '常胜', desc: '累计赢下 10 场比赛', goal: 10, metric: 'matchWins', reward: { cr: 120 } },
  { id: 'AC_branch_clear', group: 'arena', name: '分支登顶', desc: '完成任意一个赛事分支的传奇梯度', reward: { cr: 180, unlock: 'title:分支冠军' } },
  { id: 'AC_national_win', group: 'arena', name: '全国冠军', desc: '赢下全国大赛决赛', reward: { cr: 300, unlock: 'title:全国冠军' } },
  { id: 'AC_apex_win', group: 'arena', name: '全球巅峰', desc: '赢下全球巅峰赛', reward: { cr: 500, unlock: 'title:巅峰' } },

  // ── 收藏与图鉴 ──
  { id: 'AC_collect_10', group: 'collection', name: '藏刀初成', desc: '收藏 10 把成刀', goal: 10, metric: 'bladeCount', reward: { cr: 100 } },
  { id: 'AC_collect_types', group: 'collection', name: '刀型收藏家', desc: '收藏至少 6 种不同刀型', goal: 6, metric: 'knifeTypeCount', reward: { cr: 180 } },
  { id: 'AC_codex_50', group: 'codex', name: '见多识广', desc: '图鉴发现 50 项内容', goal: 50, metric: 'codexCount', reward: { cr: 150 } },
  { id: 'AC_daily_7', group: 'daily', name: '七日不辍', desc: '连续七天完成每日任务目标', goal: 7, metric: 'dailyStreak', reward: { cr: 200, unlock: 'edgeSkin:七日' } },
];

const scoreGoal = goal => ({ id: 'AC_score_' + goal, goal, desc: `成刀评分达到 ${goal}` });
const riskGoal = goal => ({ id: 'AC_risk_' + goal, goal, desc: `在单锤断裂概率达到 ${goal}% 后成功成刀` });
const v19Changes = {
  AC_first_forge: { desc: '鉴定并收藏第一把成刀', goal: 1, metric: 'bladeCount' },
  AC_score_450: scoreGoal(V19_RARITY_MIN.legend),
  AC_score_700: scoreGoal(V19_RARITY_MIN.mythic),
  AC_risk_60: riskGoal(V19_RISK_GOALS[0]),
  AC_risk_90: riskGoal(V19_RISK_GOALS[1]),
  AC_trait_master: { id: 'AC_skin_iii', name: '高阶工艺', desc: '鉴定一把带有 III 档刀面工艺的成刀', metric: 'skinTier', goal: 3 },
  AC_special_first: { id: 'AC_skin_ii', name: '锋芒初露', desc: '鉴定一把带有 II 档或更高工艺的成刀', metric: 'skinTier', goal: 2 },
  AC_combo_first: { desc: '鉴定第一把签名刀皮', metric: 'comboFound', goal: 1 },
  AC_combo_5: { id: 'AC_combo_2', desc: '发现 2 种签名刀皮', goal: 2 },
  AC_combo_all: { desc: '发现全部签名刀皮', goal: SIGNATURES.length },
  AC_match_first: { desc: '完成第一场正式赛事' },
  AC_win_10: { desc: '赢下 10 场正式赛事' },
  AC_apex_win: { desc: '赢得三刀巅峰赛冠军' },
  AC_daily_7: { reward: { cr: 200, unlock: 'title:七日不辍' } },
};

export const ACHIEVEMENTS = Object.freeze(LEGACY_MODE ? legacyAchievements :
  legacyAchievements.map(achievement => ({ ...achievement, ...v19Changes[achievement.id] })));

export const ACHIEVEMENT_BY_ID = Object.freeze(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a])));
export const achievementsOfGroup = (g) => ACHIEVEMENTS.filter((a) => a.group === g);

export const ACHIEVEMENT_GROUPS = Object.freeze([
  { id: 'forge', name: '锻造' },
  { id: 'rarity', name: '稀有度' },
  { id: 'score', name: '评分' },
  { id: 'risk', name: '风险经营' },
  { id: 'trait', name: '特性' },
  { id: 'combo', name: '隐藏组合' },
  { id: 'arena', name: '赛事' },
  { id: 'collection', name: '收藏' },
  { id: 'codex', name: '图鉴' },
  { id: 'daily', name: '每日' },
]);

export default ACHIEVEMENTS;
