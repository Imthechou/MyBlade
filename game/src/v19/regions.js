// Fractions and long-axis angles from blade-forge-3d/game/src/render/legacy/regions.js.
const profiles = {
  balisong: [.5, .5, -6], bayonet: [.39, .39, 0], folding: [.45, .45, -8],
  gladius: [.52, .52, -2], karambit: [.45, .45, -16], kris: [.33, .33, 4],
  machete: [.32, .315, -5], saber: [.335, .335, -4], skull: [.34, .34, -5],
  straight: [.42, .42, 0], survival: [.445, .445, -5], tangdao: [.35, .35, -2],
};

export const KNIFE_IDS = Object.keys(profiles);
const feather = .012;

function smooth(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function regionAt(id, along, cross) {
  const profile = profiles[id];
  if (!profile) return { blade: 1, guard: 0, grip: 0 };
  const [bladeStart, guardStart, angle] = profile;
  const radians = angle * Math.PI / 180;
  const axis = along * Math.cos(radians) + cross * Math.sin(radians);
  const blade = Math.max(smooth(bladeStart - feather, bladeStart + feather, axis),
    .35 * smooth(bladeStart - .05, bladeStart + feather, axis));
  const guard = (1 - blade) * smooth(guardStart - feather, guardStart + feather, axis);
  return { blade, guard, grip: 1 - blade - guard };
}
