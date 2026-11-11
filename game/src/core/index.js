/**
 * 核心玩法层 —— 统一出口
 *
 * 表现层（ui）只 import 本文件，不深入 core 内部文件。
 * core 内部可以互相调用；core **不允许** import ui / render。
 */

import * as attributes from './attributes.js';
import * as risk from './risk.js';
import * as tags from './tags.js';
import * as traits from './traits.js';
import * as combos from './combos.js';
import * as cards from './cards.js';
import * as forge from './forge.js';
import * as hammer from './hammer.js';
import * as edge from './edge.js';
import * as scoring from './scoring.js';
import * as appraise from './appraise.js';
import * as arena from './arena.js';
import * as arenaTeam from './arenaTeam.js';
import * as arenaSlice from './arenaSlice.js';
import * as arenaFormal from './arenaFormal.js';
import * as bladeAdapter from './bladeAdapter.js';
import * as testScoring from './testScoring.js';
import * as events from './events.js';
import * as forgeBonuses from './forgeBonuses.js';
import * as arenaV41Growth from './arenaV41Growth.js';
import * as arenaV41Specialties from './arenaV41Specialties.js';
import * as arenaCareerV41 from './arenaCareerV41.js';
import * as daily from './daily.js';
import * as economy from './economy.js';
import * as progress from './progress.js';
import * as recipe from './recipe.js';

export {
  attributes, risk, tags, traits, combos, cards, forge, hammer, edge,
  scoring, appraise, arena, arenaTeam, arenaSlice, arenaFormal,
  bladeAdapter, testScoring, events, forgeBonuses, arenaV41Growth, arenaV41Specialties, arenaCareerV41,
  daily, economy, progress, recipe,
};

/** 一局的标准流程（供 UI / 无头验证共用，避免两处各写一遍顺序） */
export async function playRun(run, chooser) {
  const { PHASE } = forge;
  let guard = 0;
  while (!run.finished && guard++ < 64) {
    if (run.phase === PHASE.SELECT) {
      const card = chooser(run);
      if (!card) break;
      forge.confirmCard(run, card);
    } else if (run.phase === PHASE.HAMMER) {
      const strikes = (chooser.strikes != null ? chooser.strikes : 3);
      for (let i = 0; i < strikes && run.phase === PHASE.HAMMER; i++) {
        const r = forge.hammerStrike(run);
        if (r.fractured) break;
      }
      if (run.phase === PHASE.HAMMER) forge.endHammer(run);
    } else if (run.phase === PHASE.EDGE) {
      /* rework T05：真实采样优先；未提供时用确定性兜底轨迹（仅无头验证用） */
      if (chooser.edgePath) forge.submitEdge(run, chooser.edgePath);
      else edge.autoPlay(run, chooser.edgeQuality ?? 0.7);
    } else break;
  }
  return run;
}

export default {
  attributes, risk, tags, traits, combos, cards, forge, hammer, edge,
  scoring, appraise, arena, arenaTeam, arenaSlice, arenaFormal,
  bladeAdapter, testScoring, events, forgeBonuses,
  daily, economy, progress, recipe, playRun,
};
