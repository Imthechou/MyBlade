/**
 * 数据配置层 —— 统一出口
 *
 * 上层（core / ui）只 import 本文件，不直接 import data/legacy/**。
 * 这样"已交付内容"与"V2 新增规则"的边界是显式的，
 * 将来替换内容源也只需改 data/ 内部。
 */

import * as balance from './balance.js';
import * as stages from './stages.js';
import * as tags from './tags.js';
import * as cards from './cards.js';
import * as traits from './traits.js';
import * as combos from './combos.js';
import * as knifeTypes from './knifeTypes.js';
import * as achievements from './achievements.js';
import * as codex from './codex.js';
import * as daily from './daily.js';
import * as branches from './arena/branches.js';
import * as events from './arena/events.js';
import * as opponents from './arena/opponents.js';
import * as tournaments from './arena/tournaments.js';
import * as team from './arena/team.js';

export const arena = { branches, events, opponents, tournaments, team };

export {
  balance, stages, tags, cards, traits, combos, knifeTypes,
  achievements, codex, daily,
};

export default {
  balance, stages, tags, cards, traits, combos, knifeTypes,
  achievements, codex, daily, arena,
};
