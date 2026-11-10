/**
 * Canvas2D 赛事共用时钟与正式赛切割结算桥。
 * 无 UI 依赖，方便低帧率/暂停/赛场结算单测。
 */
export function advanceArenaClock(run, elapsedSeconds, tick) {
  if (!run || run.paused || run.done || run.phase?.endsWith('-choice')) return run;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return run;
  // 只在前台 RAF 推进；document.hidden 时 UI 已立即暂停。
  // 不截断真实流逝的时间，防止软件渲染/低帧率导致 45 秒变成数分钟。
  let left = elapsedSeconds;
  while (left > 0.000001 && !run.paused && !run.done && !run.phase?.endsWith('-choice')) {
    const step = Math.min(left, 0.125);
    tick(run, step);
    left -= step;
  }
  return run;
}

/** 正式赛事切割分项：同一 run 结果转换成操作质量，永久刀数据不受损。 */
export function formalCutPayload(run) {
  const result = run?.result;
  if (!run?.done || !result) return null;
  // 目标基于 45 秒局：熟练切断/补刀/连击可达满利用率；零操作严格为零。
  const score = Math.max(0, Number(result.score) || 0);
  const kills = Math.max(0, Number(result.kills) || 0);
  const normalizedScore = Math.min(1, score / (result.structure ? 1000 : 1800));
  const normalizedKills = Math.min(1, kills / 18);
  const measure = Number((result.structure ? normalizedScore :
    Math.min(1, normalizedScore * 0.8 + normalizedKills * 0.2)).toFixed(3));
  const loss = Math.max(0, Number(run.damage) || 0);
  const maxHealth = Math.max(1, Number(run.maxHealth) || 100);
  return {
    measure,
    detail: {
      source: 'arenaChallenge', duration: run.total,
      score, kills, misses: result.misses, structure: result.structure || null,
      bestSwipe: result.bestSwipe, maxCombo: result.maxCombo, maxStreak:result.maxStreak,
      route: result.route, finale: result.finale,
      grade: result.grade, version:result.version,
      choicesMade:result.choicesMade, buffs:result.buffs,
      perfects:result.perfects, weakHits:result.weakHits, armorBreaks:result.armorBreaks,
      crossCuts:result.crossCuts, secondaryKills:result.secondaryKills, metrics:result.metrics,
      health:result.health, maxHealth:result.maxHealth, materials:result.materials, objectives:result.objectives, resonances:result.resonances,
    },
    temporaryDamage: Number(Math.min(1, loss / maxHealth).toFixed(3)),
    failed: run.health<=0 || !!result.fractured || !!result.riskStop,
  };
}
