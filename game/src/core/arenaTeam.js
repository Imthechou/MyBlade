/**
 * Apex team3 provisional core. Each manually dispatched round is still an
 * ordinary Arena.createMatch('apex') match; this module adds no scoring,
 * rewards, auto-dispatch, or early BO3 termination.
 *
 * UI integration: createTeam from three eligible BladeRecord snapshots, call
 * dispatchBlade only after the player selects a blade, then drive the returned
 * match with the existing Arena APIs. Call completeRound after match.done;
 * currentMatch is safe to use after JSON restore (Arena.choose does not need
 * the lost rng function). A successful dispatch consumes that blade for this
 * team immediately, even if the match is later abandoned.
 */
import * as Arena from './arena.js';
import { hasStructuralFailure } from './arenaChallenge.js';
import { TEAM_POLICY } from '../data/arena/team.js';

let generatedIdCounter = 0;
const POLICY_KEYS = new Set(['provisional', 'rosterSize', 'roundCount']);

const failure = (code, reason) => ({ ok: false, code, reason });

function resolvePolicy(policy) {
  if (policy == null || typeof policy !== 'object' || Array.isArray(policy)) {
    return failure('INVALID_POLICY', '团队赛规则配置无效');
  }
  for (const key of Object.keys(policy)) {
    if (!POLICY_KEYS.has(key)) return failure('INVALID_POLICY', `团队赛规则包含不支持的字段：${key}`);
  }
  const resolved = { ...TEAM_POLICY, ...policy };
  if (resolved.provisional !== true || resolved.rosterSize !== 3
      || !Number.isInteger(resolved.roundCount)
      || ![1, 3].includes(resolved.roundCount)
      || resolved.roundCount > resolved.rosterSize) {
    return failure('INVALID_POLICY', '团队赛规则值非法（仅支持 provisional、3人阵容及1或3轮）');
  }
  return { ok: true, policy: Object.freeze(resolved) };
}

function isEligibleBlade(blade) {
  return !!blade && typeof blade === 'object' && !Array.isArray(blade)
    && typeof blade.id === 'string' && blade.id.trim().length > 0
    && !blade.fractured && blade.canEnterArena !== false
    && !!blade.stats && typeof blade.stats === 'object' && !Array.isArray(blade.stats)
    && ['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit']
      .every(stat => Number.isFinite(blade.stats[stat]) && blade.stats[stat] >= 0)
    && Number.isFinite(blade.score) && blade.score >= 0;
}

/** Validate an exact-size roster of distinct, intact, Arena-eligible snapshots. */
export function validateRoster(blades, { policy = TEAM_POLICY } = {}) {
  const resolved = resolvePolicy(policy);
  if (!resolved.ok) return resolved;
  if (!Array.isArray(blades) || blades.length !== resolved.policy.rosterSize) {
    return failure('INVALID_ROSTER_SIZE', `阵容必须恰好包含${resolved.policy.rosterSize}把成刀`);
  }
  const ids = new Set();
  for (const blade of blades) {
    if (!isEligibleBlade(blade)) return failure('INELIGIBLE_BLADE', '阵容只能包含有编号、未断裂且具备参赛资格的成刀');
    if (ids.has(blade.id)) return failure('DUPLICATE_BLADE', '阵容中不能重复选择同一把刀');
    ids.add(blade.id);
  }
  return { ok: true };
}

function cloneSnapshot(value) {
  // BladeRecord snapshots are plain save data; JSON cloning detaches nested stats
  // and matches the persistence format used by the surrounding application.
  return JSON.parse(JSON.stringify(value));
}

function nextTeamId() {
  generatedIdCounter += 1;
  return `team-${Date.now().toString(36)}-${generatedIdCounter.toString(36)}`;
}

/** Create a team3 session. No progress, reward, or settlement side effect occurs here. */
export function createTeam({ blades, seed = null, theme = null, styleId = null, policy = TEAM_POLICY, id = null } = {}) {
  const resolved = resolvePolicy(policy);
  if (!resolved.ok) return resolved;
  const valid = validateRoster(blades, { policy: resolved.policy });
  if (!valid.ok) return valid;
  if (id !== null && (typeof id !== 'string' || !id.trim())) {
    return failure('INVALID_ID', '团队赛编号必须是非空字符串');
  }
  if (seed !== null && (typeof seed !== 'number' || !Number.isFinite(seed))) {
    return failure('INVALID_SEED', '团队赛种子必须是有限数字或 null');
  }
  let roster;
  try {
    roster = cloneSnapshot(blades);
  } catch (_) {
    return failure('INVALID_ROSTER', '阵容快照无法保存');
  }
  let themeSnapshot;
  try {
    themeSnapshot = theme == null ? null : cloneSnapshot(theme);
  } catch (_) {
    return failure('INVALID_THEME', '赛事主题无法保存');
  }
  const teamId = id ?? nextTeamId();
  return {
    ok: true,
    team: {
      version: 1,
      id: teamId,
      mode: 'team3',
      tier: 'apex',
      policy: resolved.policy,
      seed,
      theme: themeSnapshot,
      styleId,
      roster,
      usedBladeIds: [],
      rounds: [],
      activeMatch: null,
      status: 'ready',
      result: null,
      settlement: null,
    },
  };
}

/** Dispatch exactly the player's chosen unused roster blade into one Apex match. */
export function dispatchBlade(team, bladeId) {
  if (!team || typeof team !== 'object' || team.mode !== 'team3' || team.version !== 1) {
    return failure('INVALID_TEAM', '团队赛数据无效');
  }
  const resolved = resolvePolicy(team.policy);
  if (!resolved.ok) return resolved;
  if (team.status === 'complete' || team.status === 'settled' || team.result) {
    return failure('TEAM_COMPLETE', '团队赛已经结束');
  }
  if (team.activeMatch || team.status === 'round') return failure('ROUND_ACTIVE', '当前轮次尚未完成');
  if (team.status !== 'ready' || !Array.isArray(team.rounds) || !Array.isArray(team.usedBladeIds)) {
    return failure('INVALID_TEAM_STATE', '团队赛当前状态不能派刀');
  }
  if (team.rounds.length >= resolved.policy.roundCount) return failure('TEAM_COMPLETE', '团队赛轮数已满');
  if (typeof bladeId !== 'string' || !bladeId) return failure('INVALID_BLADE_ID', '请选择有效的参赛刀');
  const blade = Array.isArray(team.roster) && team.roster.find((item) => item?.id === bladeId);
  if (!blade) return failure('BLADE_NOT_IN_ROSTER', '只能派出本队阵容中的成刀');
  if (!isEligibleBlade(blade)) return failure('INELIGIBLE_BLADE', '所选成刀已失去参赛资格');
  if (team.usedBladeIds.includes(bladeId) || team.rounds.some((round) => round?.bladeId === bladeId)) {
    return failure('BLADE_ALREADY_USED', '每把刀在本场团队赛中只能出战一次');
  }
  const index = team.rounds.length;
  const roundSeed = team.seed == null ? null : (team.seed + index) >>> 0;
  let created;
  try {
    created = Arena.createMatch({
      blade,
      tier: 'apex',
      styleId: team.styleId ?? null,
      seed: roundSeed,
      theme: team.theme,
    });
  } catch (_) {
    return failure('MATCH_CREATE_FAILED', '本轮比赛创建失败');
  }
  if (!created?.ok || !created.match) return failure('MATCH_CREATE_FAILED', created?.reason || '本轮比赛创建失败');
  const match = created.match;
  // Arena keeps its original match logic; only the identifier is replaced to be
  // stable across same-millisecond dispatches and unambiguous within this team.
  match.id = `${team.id}:round:${index + 1}`;
  team.usedBladeIds.push(bladeId);
  team.activeMatch = match;
  team.status = 'round';
  return { ok: true, match };
}

/** Return the active underlying Arena match, or null when no round is in flight. */
export function currentMatch(team) {
  return team && team.mode === 'team3' && team.activeMatch ? team.activeMatch : null;
}

function validFractureEvidence(match, bladeId) {
  const result = match?.result;
  const info = result?.fractureInfo;
  if (!result?.bladeDestroyed) return !info && !match?.fractureInfo;
  if (!match?.fractureInfo) return false;
  const performance = match?.fieldTest?.result?.performance;
  return !!info
    && info.bladeId === bladeId
    && info.matchId === match.id
    && hasStructuralFailure(performance)
    && JSON.stringify(info.evidence) === JSON.stringify(performance.risk);
}

function roundWon(round) {
  return round?.match?.result?.bladeDestroyed ? false : round?.match?.result?.win === true;
}

/** Compute final majority from completed round records only; no early decision. */
export function teamResult(team) {
  if (!team || team.mode !== 'team3' || !Array.isArray(team.rounds)) return null;
  const resolved = resolvePolicy(team.policy);
  if (!resolved.ok || team.rounds.length !== resolved.policy.roundCount) return null;
  if (!team.rounds.every((round) => round?.match?.done && typeof round.match.result?.win === 'boolean')) return null;
  const wins = team.rounds.filter(roundWon).length;
  const losses = team.rounds.length - wins;
  return { win: wins > losses, wins, losses, roundCount: resolved.policy.roundCount };
}

/** Record the completed active round; invalid/duplicate attempts leave team unchanged. */
export function completeRound(team) {
  if (!team || typeof team !== 'object' || team.mode !== 'team3' || team.version !== 1) {
    return failure('INVALID_TEAM', '团队赛数据无效');
  }
  const resolved = resolvePolicy(team.policy);
  if (!resolved.ok) return resolved;
  if (team.status === 'complete' || team.status === 'settled' || team.result) {
    return failure('TEAM_COMPLETE', '团队赛已经结束');
  }
  const match = team.activeMatch;
  if (team.status !== 'round' || !match) return failure('NO_ACTIVE_ROUND', '当前没有待结算的轮次');
  if (!match.done || !match.result || typeof match.result.win !== 'boolean') {
    return failure('ROUND_NOT_FINISHED', '请先完成本轮比赛');
  }
  const index = Array.isArray(team.rounds) ? team.rounds.length : -1;
  const expectedId = `${team.id}:round:${index + 1}`;
  const bladeId = match.blade?.id;
  if (index < 0 || index >= resolved.policy.roundCount || match.tier !== 'apex'
      || match.id !== expectedId || typeof bladeId !== 'string'
      || !team.usedBladeIds?.includes(bladeId)
      || !team.roster?.some((blade) => blade?.id === bladeId)
      || team.rounds.some((round) => round?.bladeId === bladeId)) {
    return failure('INVALID_ROUND', '本轮记录与团队赛阵容或轮次不一致');
  }
  if (!validFractureEvidence(match, bladeId)) {
    return failure('INVALID_FRACTURE_EVIDENCE', '断刀结算缺少一致的实际接触履历');
  }
  const round = { index: index + 1, bladeId, match };
  team.rounds.push(round);
  team.activeMatch = null;
  if (team.rounds.length === resolved.policy.roundCount) {
    team.status = 'complete';
    team.result = teamResult(team);
    return { ok: true, round, result: team.result };
  }
  team.status = 'ready';
  return { ok: true, round };
}

export { TEAM_POLICY };
export default { validateRoster, createTeam, dispatchBlade, currentMatch, completeRound, teamResult, TEAM_POLICY };
