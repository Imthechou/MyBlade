// One transparent WebP per target, shared by the arena lobby and active cutting canvas.
// Cache a tiny alpha mask per image so swipes must intersect visible art, not its empty rectangle.
// Deliberately avoid the old 116×135 embedded fallback: upscaling it caused blurry hits.
export const ART_BOUNDS = {
  wood: [94, 22, 305, 394], shield: [77, 14, 323, 394], ice: [75, 20, 325, 390],
  gel: [78, 22, 321, 390], steel: [64, 18, 336, 391], bamboo: [58, 47, 342, 364],
  card: [51, 28, 349, 388], pineapple: [73, 18, 326, 392], rope: [87, 18, 312, 392],
};

const images = new Map();
const MASK_SIZE = 64;
function buildMask(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MASK_SIZE;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, MASK_SIZE, MASK_SIZE);
    const pixels = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
    const alpha = new Uint8Array(MASK_SIZE * MASK_SIZE);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    return alpha;
  } catch {
    return null; // Keep the bounding-box fallback on browsers where pixels cannot be read.
  }
}
const asset = key => new URL('../../../assets/v19/targets/' + key + '.webp?v=404', import.meta.url).href;
export const targetThumbnail = key => asset(key);

export function warmTargets(keys) {
  for (const key of keys) {
    if (!Object.hasOwn(ART_BOUNDS, key)) continue;
    let entry = images.get(key);
    if (!entry) {
      entry = { full: null, mask: null, retryAt: 0 };
      images.set(key, entry);
    }
    if (entry.full || performance.now() < entry.retryAt) continue;
    const full = entry.full = new Image();
    full.decoding = 'async';
    full.onload = () => { entry.mask = buildMask(full); };
    full.onerror = () => {
      entry.mask = null;
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

/** null = image unavailable, boolean = whether this normalized point touches visible art.
 * Sample a single 64² cached mask with a small touch-friendly tolerance.
 */
export function targetAlphaAt(key, x, y, tolerance = 2) {
  const alpha = images.get(key)?.mask;
  if (!alpha) return null;
  const cx = Math.floor(x * MASK_SIZE), cy = Math.floor(y * MASK_SIZE);
  if (cx < 0 || cy < 0 || cx >= MASK_SIZE || cy >= MASK_SIZE) return false;
  // A small diamond-shaped touch tolerance favors fast thumbs without hitting blank corners.
  for (let oy = -tolerance; oy <= tolerance; oy++) {
    for (let ox = -tolerance; ox <= tolerance; ox++) {
      if (Math.abs(ox) + Math.abs(oy) > tolerance + 1) continue;
      const px = cx + ox, py = cy + oy;
      if (px >= 0 && py >= 0 && px < MASK_SIZE && py < MASK_SIZE && alpha[py * MASK_SIZE + px] > 45) return true;
    }
  }
  return false;
}
