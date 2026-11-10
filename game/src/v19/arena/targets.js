// One transparent WebP per target, shared by the arena lobby and active cutting canvas.
// Deliberately avoid the old 116×135 embedded fallback: upscaling it caused blurry hits.
export const ART_BOUNDS = {
  wood: [94, 22, 305, 394], shield: [77, 14, 323, 394], ice: [75, 20, 325, 390],
  gel: [78, 22, 321, 390], steel: [64, 18, 336, 391], bamboo: [58, 47, 342, 364],
  card: [51, 28, 349, 388], pineapple: [73, 18, 326, 392], rope: [87, 18, 312, 392],
};

const images = new Map();
const asset = key => new URL('../../../assets/v19/targets/' + key + '.webp?v=404', import.meta.url).href;
export const targetThumbnail = key => asset(key);

export function warmTargets(keys) {
  for (const key of keys) {
    if (!Object.hasOwn(ART_BOUNDS, key)) continue;
    let entry = images.get(key);
    if (!entry) {
      entry = { full: null, retryAt: 0 };
      images.set(key, entry);
    }
    if (entry.full || performance.now() < entry.retryAt) continue;
    const full = entry.full = new Image();
    full.decoding = 'async';
    full.onerror = () => {
      entry.full = null;
      entry.retryAt = performance.now() + 4000;
    };
    full.src = asset(key);
  }
}

export function targetSprite(key) {
  const entry = images.get(key);
  return entry?.full?.complete && entry.full.naturalWidth ? entry.full : null;
}
