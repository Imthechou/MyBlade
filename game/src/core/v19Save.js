/** V19 adds only the current furnace and new-format cutting progress to the main save. */
const map = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const phases = ['ore', 'reveal', 'refine', 'forge', 'fit', 'appraise', 'broken'];
const roundCount = { quick: 1, daily: 1, school: 1, national: 5, apex: 3 };

export function normalizeV19(raw) {
  const value = map(raw);
  const forge = map(value.forge);
  const arena = map(value.arena);
  const active = map(arena.active);
  const validForge = phases.includes(forge.phase) && Number.isSafeInteger(forge.seed) &&
    forge.skin?.levels && Number.isInteger(forge.selected) && forge.selected >= 0 && forge.selected < 3 &&
    (forge.phase === 'ore' || forge.ore) && (forge.phase !== 'refine' || forge.refining?.version === 2) &&
    (!['appraise', 'broken'].includes(forge.phase) || typeof forge.resultId === 'string');
  const validArena = Object.hasOwn(roundCount, active.mode) && typeof active.id === 'string' &&
    Array.isArray(active.reports) && active.reports.length < roundCount[active.mode] &&
    Array.isArray(active.qualified) && Array.isArray(active.roster) && active.roster.length === (active.mode === 'apex' ? 3 : 1) &&
    active.roster.every(blade => typeof blade?.id === 'string' && Array.isArray(blade.stats) && blade.stats.length === 6 && blade.stats.every(Number.isFinite)) &&
    (active.mode !== 'school' || (['press', 'edge', 'precise', 'quench', 'composite', 'overload'].includes(active.school) &&
      Number.isInteger(active.grade) && active.grade >= 0 && active.grade < 5));
  return {
    ...value,
    forge: validForge ? { ...forge, revision: Number.isSafeInteger(forge.revision) ? forge.revision : 0 } : null,
    arena: {
      ...arena, active: validArena ? active : null, daily: map(arena.daily),
      best: map(arena.best), mastery: map(arena.mastery),
    },
  };
}
