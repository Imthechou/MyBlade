import { sectionContour } from './ore-section.js';
import { makeBladeMaterial, makeCutMaterial, makeMeltMaterial, makeOreMaterial, setSurface, surfaceUniforms } from './materials.js';
import { FAMILIES, ORE_VARIANTS, oreMaterialOf, oreOptics, oreInspection, oreModelId, familyOf, modelCandidates } from './forge.js';
import { KNIFE_IDS, regionAt } from './regions.js';
import { RenderBudget } from './render-budget.js';
import { knifeDetails, makeFittingHardware } from './knife-details.js';
import { BladeView } from './bladeView.js';

const T = globalThis.THREE;
const localAssets = new URL('../../assets/v19/', import.meta.url);
const sharedAssets = new URL('../../assets/', import.meta.url);
const modelFiles = {
  molten: 'molten_sphere_small', blank: 'blank_ingot_small',
  ...Object.fromEntries(FAMILIES.flatMap(family => ORE_VARIANTS.map((_, variant) => {
    const id = `ore_${family.id}_${variant}`;
    return [id, id];
  }))),
  ...Object.fromEntries(KNIFE_IDS.map(id => [id, 'knife_' + id])),
};
const doubleEdge = new Set(['gladius', 'kris', 'skull']);
const finishSlots = ['metal', 'pattern', 'film', 'fx'];
const oreProfiles = { river: [1.54, 1.50, 1.54], frost: [1.55, 1.35, 1.55], coal: [1.62, 1.50, 1.57], meteor: [1.72, 1.53, 1.62], ochre: [1.58, 1.73, 1.57] };
const familyOrder = FAMILIES.map(f => f.id);
const isOreModel = id => typeof id === 'string' && /^ore_(river|frost|coal|meteor|ochre)_[0-3]$/.test(id);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const lerp = (a, b, t) => a + (b - a) * t;

/* 每个工序一个机位。正交相机下，机位高度决定俯仰观感：
   锻打压到砧面附近，视线略抬；精炼略低看炉球；检视与鉴定回到正面。 */
const CAMERA_FRAMES = {
  stage: { height: .53, aim: -.07, depth: 6 },
  gallery: { height: .79, aim: -.07, depth: 6.4 },
  ore: { height: .55, aim: -.08, depth: 6 },
  reveal: { height: .50, aim: -.05, depth: 6 },
  refine: { height: .53, aim: -.07, depth: 6 },
  forge: { height: .02, aim: -.30, depth: 5.5 },
  broken: { height: .16, aim: -.24, depth: 5.8 },
  fit: { height: .53, aim: -.07, depth: 6 },
  appraise: { height: .50, aim: -.05, depth: 6 },
};

function setOreOptics(uniforms,ore) {
  const rock=oreMaterialOf(ore),optics=oreOptics(ore);
  uniforms.oreCoreColor.value.set(optics.core);
  uniforms.oreTint.value.set(optics.core);
  uniforms.oreHostVein.value.set(rock.vein);
  uniforms.oreVeinColor.value.set(optics.core).lerp(new T.Color('#e2e8e4'),.30);
  uniforms.oreExposure.value=optics.exposure;
  uniforms.oreClarity.value=optics.clarity;
  uniforms.oreTransmission.value=oreInspection(ore).transmission;
  return optics;
}

function coordinates(geometry, id) {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const binCount = 40;
  const minY = Array(binCount).fill(Infinity);
  const maxY = Array(binCount).fill(-Infinity);
  const length = max.x - min.x;
  const along = x => clamp((x - min.x) / length, 0, .9999);
  const cross = y => clamp((y - min.y) / (max.y - min.y), 0, 1);
  const region = (x, y) => regionAt(id, along(x), cross(y));
  const bin = x => Math.floor(along(x) * binCount);
  for (let i = 0; i < pos.count; i++) {
    const k = bin(pos.getX(i));
    const y = pos.getY(i);
    minY[k] = Math.min(minY[k], y);
    maxY[k] = Math.max(maxY[k], y);
  }
  const attrib = new Float32Array(pos.count * 4);
  const gripBounds = new T.Box3();
  const point = new T.Vector3();
  let bladeRoot = 1;
  const sample = (values, u, fallback) => {
    const n = u * binCount - .5;
    const low = clamp(Math.floor(n), 0, binCount - 1);
    const a = values[low], b = values[Math.min(low + 1, binCount - 1)];
    if (!Number.isFinite(a)) return Number.isFinite(b) ? b : fallback;
    return Number.isFinite(b) ? lerp(a, b, clamp(n - low, 0, 1)) : a;
  };
  const across = (u, y) => {
    const bottom = sample(minY, u, min.y);
    return clamp((y - bottom) / Math.max(.001, sample(maxY, u, max.y) - bottom), 0, 1);
  };
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const t = along(point.x);
    const v = across(t, point.y);
    const { blade, grip } = region(point.x, point.y);
    if (blade > .60) bladeRoot = Math.min(bladeRoot, t);
    if (grip > .95) gripBounds.expandByPoint(point);
    const edgeDistance = doubleEdge.has(id) ? Math.min(v, 1 - v) : v;
    const sharp = clamp((.24 - edgeDistance) / .23, 0, 1) * blade * (id === 'blank' ? .23 : 1);
    attrib.set([t, v, grip, sharp], i * 4);
  }
  geometry.setAttribute('forgeCoord', new T.BufferAttribute(attrib, 4));
  const guides = minY.flatMap((bottom, index) => {
    const t = (index + .5) / binCount;
    if (!Number.isFinite(bottom)) return [];
    const x = min.x + t * length;
    return [.20, .50, .80].map(fraction => new T.Vector3(x, lerp(bottom, maxY[index], fraction), max.z * .50))
      .filter(point => region(point.x, point.y).blade > .60);
  });
  return { guides, along, region, bladeRoot: bladeRoot < 1 ? bladeRoot : 0, across: (x, y) => across(along(x), y),
    pommel: new T.Vector3(min.x, (minY[0] + maxY[0]) * .5, 0),
    gripCenter: gripBounds.getCenter(new T.Vector3()),
    crossSection: (u, v) => new T.Vector2(min.x + u * length, lerp(sample(minY, u, min.y), sample(maxY, u, max.y), v)) };
}

function oreSection(geometry, cut, crust = .5) {
  const rim = sectionContour(geometry.attributes.position.array, geometry.index?.array, cut);
  if (rim.length < 3) throw new Error('The mineral section is not closed');
  const center = rim.reduce((sum,p) => [sum[0]+p[0]/rim.length,sum[1]+p[1]/rim.length],[0,0]);
  const scale = .94 - crust*.035;
  const inside = rim.map(p => [lerp(center[0],p[0],scale),lerp(center[1],p[1],scale)]);
  const positions = [], rimWeights = [];
  const vertex = (p,w) => { positions.push(cut,p[0],p[1]); rimWeights.push(w); };
  for (const face of T.ShapeUtils.triangulateShape(inside.map(p => new T.Vector2(...p)),[])) {
    for(const i of face)vertex(inside[i],0);
  }
  for(let i=0;i<rim.length;i++){
    const j=(i+1)%rim.length;
    vertex(inside[i],0);vertex(rim[i],1);vertex(rim[j],1);
    vertex(inside[i],0);vertex(rim[j],1);vertex(inside[j],0);
  }
  const slice = new T.BufferGeometry();
  slice.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  slice.setAttribute('cutRim',new T.Float32BufferAttribute(rimWeights,1));
  slice.computeVertexNormals();
  return slice;
}

function studio(renderer, daylight = false) {
  const room = new T.Scene();
  const floor = new T.Mesh(new T.BoxGeometry(10, 10, 10), new T.MeshBasicMaterial({ color: daylight ? 0x414144 : 0x242731, side: T.BackSide }));
  room.add(floor);
  const softbox = (x, y, z, width, height, color, energy, map = null) => {
    const mat = new T.MeshBasicMaterial({ color, map, side: T.DoubleSide, toneMapped: false });
    mat.color.multiplyScalar(energy);
    const object = new T.Mesh(new T.PlaneGeometry(width, height), mat);
    object.position.set(x, y, z);
    object.lookAt(0, 0, 0);
    room.add(object);
  };
  let diffusion;
  if (daylight) {
    const size = 64;
    const values = new Uint8Array(size * size * 4);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const x = (col + .5) * 2 / size - 1;
        const y = (row + .5) * 2 / size - 1;
        const value = Math.round(255 * (1 - x * x) ** 1.35 * (1 - y * y) ** .82);
        const i = (row * size + col) * 4;
        values[i] = values[i + 1] = values[i + 2] = value;
        values[i + 3] = 255;
      }
    }
    diffusion = new T.DataTexture(values, size, size);
    diffusion.magFilter = diffusion.minFilter = T.LinearFilter;
    diffusion.needsUpdate = true;
    softbox(-2.15, 2.0, 3.30, 4.3, 5.5, 0xfdfcff, 3.3, diffusion);
    softbox(2.65, .50, 2.20, 3.15, 4.6, 0xe3e5e8, 1.48, diffusion);
    softbox(.6, 1.70, -3.10, 4.6, 4.2, 0xefeeec, 1.60, diffusion);
    softbox(0, -2.35, 2.20, 5.2, 3.8, 0xd9d1c5, .83, diffusion);
  } else {
    softbox(-1.8, 2.1, 3.4, 4.6, .8, 0xffe9d0, 4.3);
    softbox(2.8, .15, 2.8, 1.2, 4.6, 0xb0d1ff, 2.25);
    softbox(.7, -1.3, 2.4, 5.2, .46, 0xc5dae7, 2.05);
    softbox(-2.1, .2, -3.8, 4.2, 1.4, 0xf4a273, 1.55);
  }
  const generator = new T.PMREMGenerator(renderer);
  const map = generator.fromScene(room, .025, .1, 18);
  generator.dispose();
  diffusion?.dispose();
  room.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); });
  return map;
}

function light(color, intensity, x, y, z, scene) {
  const key = new T.DirectionalLight(color, intensity);
  key.position.set(x, y, z);
  scene.add(key);
  return key;
}

function bevel(points, depth, size) {
  const outline = new T.Shape();
  points.forEach(([x, y], i) => i === 0 ? outline.moveTo(x, y) : outline.lineTo(x, y));
  outline.closePath();
  const geometry = new T.ExtrudeGeometry(outline, {
    depth, bevelEnabled: true, bevelThickness: size, bevelSize: size, bevelSegments: 1, steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/* ── 工坊场景：地面、锻炉、淬火桶、挂料架 ──────────────────────────────
   全部程序化低模，颜色压在暗钢与炭灰区间，只做背景，不与刀抢对比。 */

function radialTexture(inner = 'rgba(255,255,255,.55)', outer = 'rgba(255,255,255,0)') {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(.55, inner.replace(/[\d.]+\)$/, '.22)'));
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

function makeDisplayStand() {
  const stand = new T.Group();
  const shape = new T.Shape();
  const x = .66, y = .29, r = .12;
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  const slab = new T.ExtrudeGeometry(shape, { depth: .125, bevelThickness: .024, bevelSize: .024, bevelSegments: 3, curveSegments: 5 });
  const base = new T.Mesh(slab, new T.MeshStandardMaterial({ color: 0x2d2b2c, roughness: .55, metalness: .31 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -.157;
  stand.add(base);
  const seat = new T.Mesh(new T.CylinderGeometry(.135, .17, .043, 20), new T.MeshStandardMaterial({ color: 0x252525, roughness: .82 }));
  seat.scale.z = .82;
  seat.position.y = -.02;
  stand.add(seat);
  const shadow = new T.Mesh(new T.PlaneGeometry(2.02, 1.20), new T.MeshBasicMaterial({
    map: radialTexture('rgba(0,0,0,.75)'), transparent: true, depthWrite: false, toneMapped: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(.15, -.183, .02);
  stand.add(shadow);
  return stand;
}

function makeGround() {
  const group = new T.Group();
  /* 大平面 + 径向渐变贴图：近处有光、远处沉入黑，避免“一块圆盘浮在虚空里”。 */
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * .04, size / 2, size / 2, size * .52);
  gradient.addColorStop(0, '#3a322b');
  gradient.addColorStop(.42, '#241f1b');
  gradient.addColorStop(1, '#100e0c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const floor = new T.Mesh(
    new T.PlaneGeometry(16, 16),
    new T.MeshStandardMaterial({ map: texture, roughness: .97, metalness: .03 }),
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);
  // 铁砧下的接触阴影：一块渐变贴图，比真阴影便宜，也不会随相机抖动。
  const shadow = new T.Mesh(
    new T.PlaneGeometry(1.5, .78),
    new T.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,.62)'), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(.1, .012, -.3);
  group.add(shadow);
  return group;
}

function makeWorkshop() {
  const group = new T.Group();
  const stone = new T.MeshStandardMaterial({ color: 0x3a332e, roughness: .94, metalness: .06 });
  const iron = new T.MeshStandardMaterial({ color: 0x4a4640, roughness: .62, metalness: .55 });
  const wood = new T.MeshStandardMaterial({ color: 0x2f2620, roughness: .88 });
  const steel = new T.MeshStandardMaterial({ color: 0x5b5f63, roughness: .46, metalness: .72 });

  /* 锻炉：体块 + 炉口发光面 + 烟囱 */
  const furnace = new T.Group();
  furnace.add(new T.Mesh(new T.BoxGeometry(1.18, 1.16, .82), stone));
  const mouth = new T.Mesh(new T.PlaneGeometry(.52, .44), new T.MeshBasicMaterial({ color: 0xff7f38, toneMapped: false }));
  mouth.position.set(0, -.1, .42);
  furnace.add(mouth);
  const lintel = new T.Mesh(new T.BoxGeometry(1.28, .12, .9), iron);
  lintel.position.y = .62;
  furnace.add(lintel);
  const chimney = new T.Mesh(new T.BoxGeometry(.3, .78, .3), stone);
  chimney.position.set(0, 1.02, -.1);
  furnace.add(chimney);
  furnace.position.set(-1.42, .6, -.95);
  group.add(furnace);

  /* 淬火桶：木桶 + 铁箍 + 水面 */
  const barrel = new T.Group();
  barrel.add(new T.Mesh(new T.CylinderGeometry(.3, .26, .64, 14, 1, true), wood));
  for (const y of [.2, -.2]) {
    const band = new T.Mesh(new T.TorusGeometry(.29, .018, 6, 16), iron);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    barrel.add(band);
  }
  const water = new T.Mesh(new T.CircleGeometry(.275, 18), new T.MeshStandardMaterial({ color: 0x10161a, roughness: .16, metalness: .35 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = .28;
  barrel.add(water);
  barrel.position.set(1.44, .32, -.78);
  group.add(barrel);

  /* 挂料架：两根立柱 + 横梁 + 三块待锻钢坯剪影 */
  const rack = new T.Group();
  for (const x of [-.42, .42]) {
    const post = new T.Mesh(new T.BoxGeometry(.07, 1.5, .07), iron);
    post.position.set(x, .75, 0);
    rack.add(post);
  }
  const beam = new T.Mesh(new T.BoxGeometry(1.02, .06, .06), iron);
  beam.position.y = 1.42;
  rack.add(beam);
  for (const [x, len] of [[-.26, .52], [0, .62], [.26, .46]]) {
    const blank = new T.Mesh(new T.BoxGeometry(.075, len, .022), steel);
    blank.position.set(x, 1.38 - len / 2, .01);
    rack.add(blank);
    const hook = new T.Mesh(new T.BoxGeometry(.012, .07, .012), iron);
    hook.position.set(x, 1.4, .01);
    rack.add(hook);
  }
  rack.position.set(1.52, 0, -1.35);
  rack.rotation.y = -.32;
  group.add(rack);

  return group;
}

function makeSmoke() {
  const texture = radialTexture('rgba(214,206,196,.42)', 'rgba(214,206,196,0)');
  const group = new T.Group();
  const items = [];
  for (let i = 0; i < 6; i++) {
    const sprite = new T.Sprite(new T.SpriteMaterial({
      map: texture, transparent: true, opacity: 0, depthWrite: false, color: 0x9d938a,
    }));
    sprite.position.set(-1.15, .75, -.55);
    group.add(sprite);
    items.push({ sprite, life: 3.4 + i * .31, age: i * .58, drift: .1 + (i % 3) * .05 });
  }
  return { group, items };
}

function makeAnvil() {
  const group = new T.Group();
  const dark = new T.MeshStandardMaterial({ color: 0x494f60, metalness: .74, roughness: .50 });
  const top = new T.MeshStandardMaterial({ color: 0x6d7487, metalness: .78, roughness: .39 });
  const base = new T.Mesh(bevel([[-.67, 0], [.67, 0], [.58, .10], [.29, .17], [.22, .34], [.46, .42], [-.46, .42], [-.22, .34], [-.30, .16], [-.60, .09]], .55, .028), dark);
  const crown = new T.Mesh(bevel([[-1.35, .51], [-.62, .55], [-.53, .59], [.67, .59], [.74, .48], [.59, .38], [-.69, .38], [-.98, .43]], .62, .025), top);
  group.add(base, crown);
  const foot = new T.Mesh(new T.CylinderGeometry(.72, .81, .12, 20), new T.MeshStandardMaterial({ color: 0x414455, roughness: .78 }));
  foot.position.y = -.07;
  group.add(foot);
  for (const x of [-.42, .43]) {
    const pin = new T.Mesh(new T.CylinderGeometry(.023, .023, .02, 8), top);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(x, .47, .33);
    group.add(pin);
  }
  group.position.set(0, -.91, -.22);
  group.rotation.y = -.12;
  return group;
}

function makeHammer() {
  const group = new T.Group();
  const iron = new T.MeshStandardMaterial({ color: 0x555359, metalness: .82, roughness: .34 });
  const ring = new T.MeshStandardMaterial({ color: 0x9d775c, metalness: .62, roughness: .39 });
  const wood = new T.MeshStandardMaterial({ color: 0x503026, roughness: .65 });
  const head = new T.Mesh(bevel([[-.26, -.10], [-.15, -.14], [.20, -.14], [.26, -.08], [.26, .075], [.20, .13], [-.20, .13], [-.26, .075]], .26, .023), iron);
  const shaft = new T.Mesh(new T.CylinderGeometry(.045, .055, .72, 8), wood);
  shaft.position.set(.043, .45, 0);
  const ferrule = new T.Mesh(new T.CylinderGeometry(.06, .06, .13, 8), ring);
  ferrule.position.set(.043, .18, 0);
  const pommel = new T.Mesh(new T.CylinderGeometry(.061, .057, .047, 8), ring);
  pommel.position.set(.043, .79, 0);
  group.add(head, shaft, ferrule, pommel);
  return group;
}

function makeCrucible() {  const group = new T.Group();
  const profile = [[.13,-.27],[.48,-.27],[.70,-.18],[.87,.06],[.87,.14],[.81,.16],[.75,.11],[.69,-.045],[.49,-.17],[.13,-.17]];
  const ceramic = new T.MeshStandardMaterial({ color: 0x3e312b, roughness: .72, metalness: .24, side: T.DoubleSide });
  group.add(new T.Mesh(new T.LatheGeometry(profile.map(([r,y]) => new T.Vector2(r,y)), 32), ceramic));
  const rim = new T.Mesh(new T.TorusGeometry(.81, .015, 6, 32), new T.MeshBasicMaterial({ color: 0xb86d40, toneMapped: false }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .145;
  group.add(rim);
  return group;
}

function makeSparks() {
  const max = 104;
  const geometry = new T.BufferGeometry();
  const positions = new Float32Array(max * 3);
  const color = new Float32Array(max * 3);
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('color', new T.BufferAttribute(color, 3).setUsage(T.DynamicDrawUsage));
  const material = new T.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { pointScale: { value: Math.min(devicePixelRatio, 1.5) } },
    vertexShader: `varying vec3 shade;
      uniform float pointScale;
      void main() {
        shade = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
        gl_PointSize = (2. + 3.4*clamp(max(max(color.r,color.g),color.b),0.,1.))*pointScale;
      }`,
    fragmentShader: `varying vec3 shade;
      void main() {
        float f = 1.-smoothstep(.06,.49,length(gl_PointCoord-.5));
        gl_FragColor = vec4(shade, f);
      }`,
  });
  const view = new T.Points(geometry, material);
  view.frustumCulled = false;
  view.visible = false;
  return { max, view, geometry, positions, color, particles: [] };
}

export class ForgeStage {
  constructor(canvas, initialModels = []) {
    this.canvas = canvas;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.loader = new T.GLTFLoader();
    this.cache = new Map();
    this.pending = new Map();
    this.prefetchedModels = new Map();
    // Start the offered specimens while the renderer builds the studio lighting.
    for (const id of initialModels) this.load(id).catch(() => {});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.budget = new RenderBudget(this.renderer.getPixelRatio());
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    this.scene = new T.Scene();
    this.camera = new T.OrthographicCamera(-2, 2, 1.2, -1.2, .1, 20);
    this.camera.position.set(0, .53, 6);
    this.camera.lookAt(0, -.07, 0);
    this.gripTarget = new T.Vector3();
    this.studioEnvironment = studio(this.renderer);
    this.scene.environment = this.studioEnvironment.texture;
    this.ambient=new T.HemisphereLight(0xd7e4ff,0x453025,.93);
    this.scene.add(this.ambient);
    this.key = light(0xffcfad, 2.9, -2.7, 3.1, 4.8, this.scene);
    this.rimLight=light(0xb9d8ff,1.1,3.5,1.1,2.5,this.scene);
    this.sweep = light(0xe9fbff, 0, -2.7, 1.5, 1.5, this.scene);
    this.flash = new T.PointLight(0xff8b44, 0, 3, 1.8);
    this.scene.add(this.flash);
    this.lampLight=new T.SpotLight(0xfff0d4,0,8,.23,.58,1.7);
    this.lampLight.position.set(.20,.25,2.1);
    this.lampLight.target.position.set(.16,.09,0);
    this.scene.add(this.lampLight,this.lampLight.target);
    this.cutFill = new T.PointLight(0xf3e7d7, 0, 5.5, 1.65);
    this.cutFill.position.set(0, .35, 2.7);
    this.scene.add(this.cutFill);
    this.content = new T.Group();
    this.content.position.y = .13;
    this.scene.add(this.content);
    this.anvil = makeAnvil();
    this.crucible = makeCrucible();
    this.hammer = makeHammer();
    this.hammerHome = new T.Vector3(1.17, .54, .56);
    this.ground = makeGround();
    this.workshop = makeWorkshop();
    this.ember = new T.PointLight(0xff7a33, 0, 4.2, 1.7);
    this.ember.position.set(-1.25, .55, -.45);
    this.smoke = makeSmoke();
    this.workshop.add(this.smoke.group, this.ember);
    this.scene.add(this.ground, this.workshop);
    this.dentLocal = new T.Vector3();
    this.dentAt = -9999;
    this.dentPower = 0;
    this.camHeight = .53;
    this.camAim = -.07;
    this.camDepth = 6;
    this.sparks = makeSparks();
    const trailGeometry = new T.BufferGeometry();
    trailGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    this.trail = new T.Line(trailGeometry, new T.LineBasicMaterial({ color: 0xffcf9a, transparent: true, opacity: 0, depthWrite: false }));
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.anvil, this.crucible, this.hammer, this.sparks.view, this.trail);
    this.warmed = new Set();
    this.warmQueue = [];
    this.warmQueued = new Set();
    this.warmBusy = false;
    this.warmTicket = null;
    this.warmScenes = new Map();
    this.thumbnailCache = new Map();
    this.oreUniforms = {
      oreTint: { value: new T.Color() }, oreSeed: { value: 0 },
      oreReveal: { value: 0 }, oreGrade: { value: 0 }, oreHeat: { value: 0 }, oreClue: { value: 0 },
      oreFamily: { value: 0 }, oreVein: { value: .5 }, oreFlaw: { value: .5 },
      oreLuster: { value: .5 }, orePurity: { value: .6 },
      oreDensity: { value: .5 }, oreCrust: { value: .5 }, oreMaterial: { value: 0 },
      oreRoughness: { value: .9 }, oreMetalness: { value: .1 },
      oreBaseColor: { value: new T.Color('#565b5c') }, oreVeinColor: { value: new T.Color('#9da9aa') },
      oreCoreColor: { value: new T.Color('#a6bfc5') }, oreHostVein: { value: new T.Color('#bbc8c7') },
      oreExposure: { value: .55 }, oreClarity: { value: .5 },
      oreTransmission: { value: .3 }, oreWindow: { value: 0 }, oreLamp: { value: 0 },
    };
    this.meltUniforms = { meltClock: { value: 0 }, meltHeat: { value: .65 }, meltClean: { value: 0 }, meltFailed: { value: 0 }, meltTint: { value: new T.Color() }, meltSeed: { value: .5 } };
    this.inspection = 'natural';
    this.previewSteel = false;
    this.mode = 'ore';
    this.want = 'ore_river_0';
    this.mesh = null;
    this.view = new BladeView();
    this.heat = 0;
    this.entered = performance.now();
    this.raycaster = new T.Raycaster();
    this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dirtyUntil = 0;
    this.refiningRunning = false;
    this.onScreen = true;
    new ResizeObserver(() => this.resize()).observe(canvas);
    if (typeof IntersectionObserver === 'function') new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      if (this.onScreen) this.invalidate(250);
    }).observe(canvas);
    this.setRendering(true);
  }

  setRendering(enabled) {
    if (this.rendering === enabled) return;
    this.rendering = enabled;
    cancelAnimationFrame(this.frameId);
    if (!enabled) {
      this.blow = null;
      this.refiningRunning = false;
      return;
    }
    this.previousFrame = 0;
    this.onScreen = true;
    this.resize();
    this.scheduleWarm();
    this.frameId = requestAnimationFrame(this.frame);
  }

  setGallery(enabled) {
    if (Boolean(this.gallery) === enabled) return;
    this.gallery = enabled;
    if (enabled && !this.displayStand) {
      this.galleryEnvironment = studio(this.renderer, true);
      this.displayStand = makeDisplayStand();
      this.scene.add(this.displayStand);
    }
    this.scene.environment = (enabled ? this.galleryEnvironment : this.studioEnvironment).texture;
    if (this.displayStand) this.displayStand.visible = false;
    this.key.position.set(enabled ? -3.0 : -2.7, 3.1, enabled ? 3.9 : 4.8);
    this.rimLight.position.set(3.5, 1.1, enabled ? -.8 : 2.5);
    this.rimLight.color.set(enabled ? 0xf1eee7 : 0xb9d8ff);
    this.ambient.color.set(enabled ? 0xf6f4ef : 0xd7e4ff);
    this.ambient.groundColor.set(enabled ? 0x514b45 : 0x453025);
    this.invalidate(250);
  }

  hidePresentation() {
    this.content.visible = false;
    if (this.displayStand) this.displayStand.visible = false;
    this.renderer.clear();
  }

  load(id, priority = 'auto') {
    if (this.cache.has(id)) return Promise.resolve(this.cache.get(id));
    if (this.pending.has(id)) return this.pending.get(id);
    const name = modelFiles[id] + '.glb';
    const ore = isOreModel(id);
    const original = new URL('models/' + name, ore ? localAssets : sharedAssets);
    const request = ore ? this.loader.loadAsync(original.href) : this.loadWorkshopModel(id, original, priority);
    const pending = request.then(({ scene }) => {
      let source;
      scene.traverse(obj => { if (obj.isMesh && !source) source = obj; });
      const geometry = source.geometry;
      const process = ore || id === 'molten';
      const coords = process ? null : coordinates(geometry, id);
      const uniforms = ore ? this.oreUniforms : id === 'molten' ? this.meltUniforms : surfaceUniforms();
      if (coords) {
        uniforms.fBladeRoot.value = coords.bladeRoot;
        if (knifeDetails[id]) uniforms.fGrind.value.fromArray(knifeDetails[id].grind);
      }
      const material = ore ? makeOreMaterial(source.material, uniforms, id.split('_')[1]) :
        id === 'molten' ? makeMeltMaterial(uniforms) : makeBladeMaterial(source.material, uniforms, id === 'blank');
      const mesh = new T.Mesh(geometry, material);
      const asset = { mesh, coords, uniforms };
      this.cache.set(id, asset);
      if (knifeDetails[id]) {
        const knives = [...this.cache.keys()].filter(key => knifeDetails[key]);
        let excess = knives.length - 5;
        for (const key of knives) {
          if (excess <= 0) break;
          if (key === id || key === this.shown || key === this.want || key === this.warmingId) continue;
          this.disposeAsset(key);
          excess--;
        }
      }
      return asset;
    }).finally(() => this.pending.delete(id));
    this.pending.set(id, pending);
    return pending;
  }

  disposeAsset(id) {
    const item = this.cache.get(id);
    const { material, geometry } = item.mesh;
    geometry.dispose();
    material.map?.dispose();
    material.normalMap?.dispose();
    material.roughnessMap?.dispose();
    material.dispose();
    item.hardware?.geometry.dispose();
    item.hardware?.material.dispose();
    item.uniforms.fMarks?.value.dispose();
    this.cache.delete(id);
    this.warmed.delete(id);
  }

  // Shared full-resolution GLB set: the legacy viewer and V19 now load the same files.
  // Preloading is retained so uncompressed geometry can be parsed before display.
  async fetchWorkshopModel(id, priority) {
    const source = new URL(`models/${modelFiles[id]}.glb`, sharedAssets);
    const response = await fetch(source, { priority });
    return response.ok ? response.arrayBuffer() : null;
  }

  prefetchWorkshopModel(id, priority) {
    if (navigator.connection?.saveData ||
        this.cache.has(id) || this.pending.has(id) || this.prefetchedModels.has(id)) return;
    this.prefetchedModels.set(id, this.fetchWorkshopModel(id, priority).catch(() => null));
  }

  async loadWorkshopModel(id, original, priority) {
    const prefetched = this.prefetchedModels.get(id);
    this.prefetchedModels.delete(id);
    try {
      const data = await (prefetched ?? this.fetchWorkshopModel(id, priority));
      if (data) return await this.loader.parseAsync(data, original.href);
    } catch (error) {
      console.warn('[forge] preloaded GLB unavailable; using direct load', error);
    }
    return this.loader.loadAsync(original.href);
  }

  makeThumbnailStage() {
    const uniforms = T.UniformsUtils.clone(this.oreUniforms);
    const specimen = new T.Mesh(undefined, makeOreMaterial(null, uniforms));
    specimen.rotation.set(.20, .28, -.14);
    const scene = new T.Scene();
    scene.environment = this.studioEnvironment.texture;
    scene.add(specimen, new T.HemisphereLight(0xe8efff, 0x302e2b, 1.3));
    light(0xffe7d1, 3, -2, 3, 4, scene);
    light(0xc6e5ff, 1.1, 3, 1, 2, scene);
    const camera = new T.OrthographicCamera(-1.08, 1.08, .75, -.75, .1, 10);
    camera.position.set(0, .15, 4);
    camera.lookAt(0, 0, 0);
    const width = 216, height = 150;
    const target = new T.WebGLRenderTarget(width, height);
    target.texture.colorSpace = T.SRGBColorSpace;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return { uniforms, specimen, scene, camera, target, canvas, ctx,
      image: ctx.createImageData(width, height), pixels: new Uint8Array(width * height * 4) };
  }

  oreThumbnail(ore) {
    const key = [ore.id,ore.figure,ore.material,ore.variant,ore.window,ore.tint,ore.exposure,ore.clarity].join('|');
    if(this.thumbnailCache.has(key))return this.thumbnailCache.get(key);
    const pending=this.load(oreModelId(ore)).then(({mesh})=>{
      this.thumbnailStage ??= this.makeThumbnailStage();
      const { uniforms: u, specimen, scene, camera, target, canvas, ctx, image, pixels } = this.thumbnailStage;
      const rock=oreMaterialOf(ore);
      for(const [name,value] of Object.entries({oreSeed:ore.figure,oreGrade:0,oreHeat:0,oreReveal:0,oreLamp:0,
        oreFamily:familyOrder.indexOf(ore.family),oreMaterial:rock.style,oreRoughness:rock.roughness,
        oreMetalness:rock.metalness,oreWindow:ore.window?1:0,oreVein:ore.vein/100,oreFlaw:ore.flaw/100,
        oreLuster:ore.luster/100,oreDensity:ore.density/100,oreCrust:ore.crust/100,orePurity:ore.purity/100}))u[name].value=value;
      u.oreBaseColor.value.set(rock.base);setOreOptics(u,ore);
      specimen.geometry = mesh.geometry;
      const { width, height } = target;
      const renderer=this.renderer, old=renderer.getRenderTarget(), color=renderer.getClearColor(new T.Color()),alpha=renderer.getClearAlpha();
      try{
        renderer.setRenderTarget(target);renderer.setClearColor(0x000000,0);renderer.render(scene,camera);
        renderer.readRenderTargetPixels(target,0,0,width,height,pixels);
        for(let y=0;y<height;y++)image.data.set(pixels.subarray((height-y-1)*width*4,(height-y)*width*4),y*width*4);
        ctx.putImageData(image,0,0);return canvas.toDataURL('image/png');
      }finally{
        renderer.setRenderTarget(old);renderer.setClearColor(color,alpha);
        this.invalidate(100);
      }
    }).catch(error=>{this.thumbnailCache.delete(key);throw error;});
    this.thumbnailCache.set(key,pending);
    while(this.thumbnailCache.size>12)this.thumbnailCache.delete(this.thumbnailCache.keys().next().value);
    return pending;
  }

  warm(id) {
    if (this.warmed.has(id) || this.warmQueued.has(id)) return;
    this.warmQueued.add(id);
    this.warmQueue.push(id);
    this.scheduleWarm();
  }

  scheduleWarm(delay = 32) {
    if (!this.rendering || this.warmTicket != null || this.warmBusy || !this.warmQueue.length) return;
    this.warmTicket = setTimeout(() => {
      const ready = () => { this.warmTicket = null; this.pumpWarm(); };
      this.warmTicket = typeof requestIdleCallback === 'function' ? requestIdleCallback(ready, { timeout: 300 }) : setTimeout(ready, 0);
    }, delay);
  }

  busyForWarm() {
    return !this.rendering || document.hidden || this.blow || (this.mode === 'refine' && this.refiningRunning && this.refiningStep !== 'cast');
  }

  warmScene(id) {
    const profile = id === 'molten' ? 'refine' : 'forge';
    if (!this.warmScenes.has(profile)) {
      const scene = new T.Scene();
      scene.environment = this.studioEnvironment.texture;
      for (const light of [this.ambient, this.key, this.rimLight, ...(profile === 'forge' ? [this.flash] : [])]) {
        const copy = light.clone(); copy.visible = true; scene.add(copy);
      }
      this.warmScenes.set(profile, scene);
    }
    return this.warmScenes.get(profile);
  }

  warmDraw(scene, mesh) {
    const { renderer, camera } = this;
    const viewport = renderer.getViewport(new T.Vector4());
    const scissor = renderer.getScissor(new T.Vector4());
    const scissorTest = renderer.getScissorTest();
    scene.add(mesh);
    try {
      // A tiny draw also warms the driver pipeline and uploads geometry.
      // Keep it in the clipped corner of the real framebuffer so the
      // lighting, output space and multisampling match the anvil.
      renderer.setViewport(0, 0, 4, 4);
      renderer.setScissor(0, 0, 4, 4);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
    } finally {
      scene.remove(mesh);
      renderer.setViewport(viewport);
      renderer.setScissor(scissor);
      renderer.setScissorTest(scissorTest);
      this.invalidate(80);
    }
  }

  async pumpWarm() {
    if (this.warmBusy || !this.warmQueue.length) return;
    if (this.busyForWarm()) { this.scheduleWarm(120); return; }
    this.warmBusy = true;
    const id = this.warmQueue.shift();
    this.warmingId = id;
    let requeued = false;
    try {
      if (this.warmed.has(id)) return;
      const { mesh } = await this.load(id);
      if (this.busyForWarm()) { this.warmQueue.unshift(id); requeued = true; return; }
      const temporary = new T.Scene();
      temporary.environment = this.studioEnvironment.texture;
      const specimen = mesh.clone(false);
      temporary.add(specimen);
      const target = this.warmScene(id);
      if (this.renderer.extensions.has('KHR_parallel_shader_compile')) await this.renderer.compileAsync(temporary, this.camera, target);
      else this.renderer.compile(temporary, this.camera, target);
      if (this.busyForWarm()) { this.warmQueue.unshift(id); requeued = true; return; }
      if (KNIFE_IDS.includes(id)) this.warmDraw(target, specimen);
      this.warmed.add(id);
    } catch (error) {
      console.warn('Model preload', id, error);
    } finally {
      if (!requeued) this.warmQueued.delete(id);
      this.warmingId = null;
      this.warmBusy = false;
      this.scheduleWarm(80);
    }
  }

  prepareRun(run) {
    if (!run.ore) return;
    const { normal, rare } = modelCandidates(run);
    if (this.preloadSeed !== run.seed) {
      this.preloadSeed = run.seed;
      const keep = new Set(['ore_river_0', oreModelId(run.ore), 'molten', 'blank', normal, ...rare, run.model, this.shown]);
      this.warmQueue = this.warmQueue.filter(id => keep.has(id));
      this.warmQueued = new Set([...this.warmQueue, ...(this.warmingId && keep.has(this.warmingId) ? [this.warmingId] : [])]);
      for (const id of this.cache.keys()) if (!keep.has(id)) this.disposeAsset(id);
      for (const id of this.prefetchedModels.keys()) if (!keep.has(id)) this.prefetchedModels.delete(id);
      if (run.phase === 'reveal' || run.phase === 'refine') {
        for (const id of ['molten', 'blank', normal]) {
          this.prefetchWorkshopModel(id, id === 'molten' ? 'auto' : 'low');
          this.warm(id);
        }
      } else if (run.phase === 'forge' && run.hits < 4) {
        this.warm(normal);
      }
    }
    if (run.phase === 'forge' && run.hits >= 8) for (const id of rare) this.warm(id);
  }

  setHeat(heat, running = false) {
    this.refiningRunning = running;
    this.heat = heat.temperature / 100;
    this.meltUniforms.meltHeat.value = this.heat;
    this.meltUniforms.meltClean.value = heat.quality / 100;
    this.oreUniforms.oreHeat.value = heat.step === 'ore' ? this.heat : 0;
  }

  resize() {
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.aspect = width / height;
    const vertical = this.verticalSpan = Math.max(2.0, 3.85 / this.aspect);
    this.camera.left = -vertical * this.aspect / 2;
    this.camera.right = vertical * this.aspect / 2;
    this.camera.top = vertical / 2;
    this.camera.bottom = -vertical / 2;
    this.camera.updateProjectionMatrix();
    this.invalidate(200);
  }

  invalidate(duration = 180) {
    this.dirtyUntil = Math.max(this.dirtyUntil || 0, performance.now() + duration);
  }

  sync(run, ore, fit) {
    this.run = run;
    this.fit = run.phase === 'fit' || run.phase === 'appraise' ? fit : null;
    const previous = this.mode;
    this.mode = run.phase;
    const failedRefining = run.last?.type === 'refine-fail';
    // Zero-intensity lights still cost a PBR lighting loop. Keep only the
    // phase's lighting types, retaining the exact active light contributions.
    this.lampLight.visible = this.mode === 'ore';
    this.sweep.visible = ['reveal', 'fit', 'appraise'].includes(this.mode);
    this.flash.visible = ['reveal', 'forge'].includes(this.mode) || this.mode === 'broken' && !failedRefining;
    this.cutFill.visible = this.mode === 'reveal';
    if (this.mode !== 'refine') this.refiningRunning = false;
    this.invalidate(previous !== this.mode ? 760 : 300);
    if (previous !== this.mode) {
      this.entered = performance.now();
      this.resetView(false);
      if (this.mode !== 'broken') this.clearPieces();
      if (this.mode !== 'reveal') this.clearOrePieces();
      this.inspection = 'natural';
      this.previewSteel = false;
    }
    const stone = this.mode === 'ore' || this.mode === 'reveal' || run.refining?.step === 'ore';
    if (run.refining?.step && run.refining.step !== this.refiningStep) {
      if (run.refining.step === 'molten') this.emit(new T.Vector3(0, -.20, .25), new T.Color('#ee814b'), 13, false, true);
      if (run.refining.step === 'cast') this.emit(new T.Vector3(0, -.28, .35), new T.Color('#ffd18e'), 18, false);
    }
    this.refiningStep = run.refining?.step;
    if (ore) {
      if(this.inspectedOre?.id !== ore.id || this.inspectedOre?.figure !== ore.figure){
        if (stone) this.resetView(false);
        this.inspection='natural';
        this.oreCutGeometry?.dispose(); this.oreCutGeometry=null;
      }
      this.inspectedOre = ore;
      const rock = oreMaterialOf(ore);
      const optics=setOreOptics(this.oreUniforms,ore);
      this.oreUniforms.oreBaseColor.value.set(rock.base);
      this.oreUniforms.oreWindow.value=ore.window ? 1 : 0;
      this.oreUniforms.oreLamp.value=this.mode==='ore' && this.inspection==='lamp' ? 1 : 0;
      this.oreUniforms.oreMaterial.value = rock.style;
      this.oreUniforms.oreRoughness.value = rock.roughness;
      this.oreUniforms.oreMetalness.value = rock.metalness;
      this.oreUniforms.oreSeed.value = ore.figure;
      this.oreUniforms.oreClue.value = ore.clue / 2;
      this.oreUniforms.oreGrade.value = this.mode === 'reveal' ? ore.grade : 0;
      this.oreUniforms.oreFamily.value = Math.max(0, familyOrder.indexOf(ore.family));
      this.oreUniforms.oreVein.value = (ore.vein ?? 52) / 100;
      this.oreUniforms.oreFlaw.value = (ore.flaw ?? 43) / 100;
      this.oreUniforms.oreLuster.value = (ore.luster ?? 50) / 100;
      this.oreUniforms.orePurity.value = (ore.purity ?? 60) / 100;
      this.oreUniforms.oreDensity.value = (ore.density ?? 57) / 100;
      this.oreUniforms.oreCrust.value = (ore.crust ?? 50) / 100;
      this.stoneShape = ore.figure;
      this.stoneFamily = ore.family;
      this.meltUniforms.meltTint.value.set(optics.core);
      this.meltUniforms.meltSeed.value=ore.figure ?? .5;
    }
    if (this.mode !== 'refine') this.oreUniforms.oreHeat.value = 0;
    if (run.seed !== undefined) this.prepareRun(run);
    this.meltUniforms.meltFailed.value = failedRefining ? 1 : 0;
    if (failedRefining) {
      this.meltUniforms.meltHeat.value = .08;
      this.meltUniforms.meltClean.value = 0;
    }
    this.want = failedRefining ? run.refinement.reason === 'unmelted' ? oreModelId(ore) : 'molten' :
      this.mode === 'reveal' && this.previewSteel ? 'straight' : stone ? oreModelId(ore) : run.refining?.step === 'molten' ? 'molten' : run.model;
    if (this.cache.has(this.want)) {
      this.show(this.want);
      return null;
    }
    const id = this.want;
    this.hidePresentation();
    return this.load(id).then(() => {
      if (this.want !== id) return false;
      this.show(id);
      return true;
    }).catch(error => {
      console.error('Blade model', error);
      return false;
    });
  }

  show(id) {
    if (!this.cache.has(id)) return;
    this.invalidate(300);
    const asset = this.cache.get(id);
    if (this.shown !== id) {
      this.cache.delete(id);
      this.cache.set(id, asset);
      if (isOreModel(this.shown)) {
        this.clearOrePieces();
        this.oreCutGeometry?.dispose();
        this.oreCutGeometry = null;
      }
      if (this.mesh) this.content.remove(this.mesh);
      this.content.add(asset.mesh);
      this.active = asset;
      this.mesh = asset.mesh;
      this.shown = id;
      this.mesh.visible = true;
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.position.set(0, 0, 0);
      this.mesh.scale.setScalar(isOreModel(id) ? 1.58 : id === 'molten' ? 1.45 : id === 'blank' ? 2.35 : 2.74);
      this.swapAt = performance.now();
    }
    this.content.visible = true;
    if (asset.coords && this.run) {
      setSurface(asset.uniforms, this.run.ore ? this.run : {...this.run,ore:this.inspectedOre}, this.fit);
      if (this.fit && knifeDetails[id] && asset.hardware === undefined) {
        asset.hardware = makeFittingHardware(asset.mesh, asset.coords, knifeDetails[id].anchors);
        if (asset.hardware) asset.mesh.add(asset.hardware);
      }
      if (asset.hardware) {
        asset.hardware.visible = Boolean(this.fit);
        if (this.fit) asset.hardware.material.color.set(this.fit.accent);
      }
      if (this.lastImpact) {
        asset.uniforms.fHit.value.copy(this.lastImpact.local);
        if (performance.now() - this.bangedAt < 30) asset.uniforms.fPulse.value = Math.min(1.3, this.bangPower);
      }
    }
    if (isOreModel(id)) {
      const [x, y, z] = oreProfiles[this.stoneFamily] || oreProfiles.river;
      const variation = (this.stoneShape ?? .5) - .5;
      this.mesh.scale.set(x + variation * .055, y - variation * .04, z + variation * .04);
    }
    if (isOreModel(id) && this.mode === 'reveal' && !this.orePieces) this.cutOre();
    if (!isOreModel(id) && this.mode === 'broken' && this.run?.last?.type !== 'refine-fail' && !this.blow && !this.pieces) {
      const position = this.run?.last?.mark;
      const bounds = this.mesh.geometry.boundingBox;
      this.split(new T.Vector3(position && bounds ? lerp(bounds.min.x, bounds.max.x, position.u) : 0, 0, 0));
      this.splitAt -= 600;
    }
  }

  cutOre() {
    const cut = .015;
    const slice = this.oreCutGeometry ??= oreSection(this.mesh.geometry, cut, this.oreUniforms.oreCrust.value);
    const section = this.oreCutMaterial ??= makeCutMaterial(this.oreUniforms);
    this.orePieces = [-1, 1].map(direction => {
      const plane = new T.Plane();
      const material = makeOreMaterial(this.mesh.material, this.oreUniforms, this.stoneFamily);
      material.clippingPlanes = [plane];
      const group = new T.Group();
      group.add(new T.Mesh(this.mesh.geometry, material), new T.Mesh(slice, section));
      group.scale.copy(this.mesh.scale);
      this.content.add(group);
      return { group, material, plane, direction, cut };
    });
    this.mesh.visible = false;
  }

  clearOrePieces() {
    if (!this.orePieces) return;
    for (const { group, material } of this.orePieces) {
      this.content.remove(group);
      material.dispose();
    }
    this.orePieces = null;
    if (this.mesh) this.mesh.visible = true;
  }

  /** 炉口薄烟：六张精灵缓慢上升、横向漂移、渐隐。只在工坊场景里可见。 */
  animateSmoke(dt, active) {
    const on = active && !this.reduceMotion;
    for (const item of this.smoke.items) {
      item.age += dt;
      if (item.age > item.life) item.age -= item.life;
      const p = item.age / item.life;
      const { sprite } = item;
      sprite.position.y = .55 + p * 1.65;
      sprite.position.x = -1.12 + Math.sin((item.age + item.drift * 9) * .8) * item.drift;
      sprite.position.z = -.6 + Math.cos(item.age * .55) * .06;
      sprite.material.opacity = on ? Math.sin(Math.PI * p) ** 1.3 * .15 : 0;
      const scale = .46 + p * 1.1;
      sprite.scale.set(scale, scale, 1);
    }
  }

  animateOreCut(elapsed) {    if (!this.orePieces) return;
    const time = this.reduceMotion ? 1 : clamp((elapsed - 110) / 650, 0, 1);
    const slide = 1 - (1 - time) ** 3;
    const jolt = this.reduceMotion ? 0 : Math.sin(Math.min(1, elapsed / 160) * Math.PI) * .022;
    for (const { group, plane, direction, cut } of this.orePieces) {
      group.position.set(direction * (.49 * slide + jolt), direction * .026 * slide - .025 * slide, -.07 * slide);
      group.rotation.set(.018 * slide, direction * 1.08 * slide, direction * .065 * slide);
      group.updateWorldMatrix(true, false);
      plane.setFromNormalAndCoplanarPoint(
        new T.Vector3(direction, 0, 0).transformDirection(group.matrixWorld),
        group.localToWorld(new T.Vector3(cut, 0, 0)),
      );
    }
  }

  setInspection(mode) {
    if(this.mode!=='ore' || !['natural','lamp','window'].includes(mode))return;
    this.inspection = mode;
    this.oreUniforms.oreLamp.value = mode==='lamp' ? 1 : 0;
    if (mode === 'window') {
      this.view.reset(false);
      this.view.turn(-.20, -.08, false);
    }
    this.invalidate(250);
  }

  toggleMineralPreview() {
    if(this.mode!=='reveal')return;
    this.previewSteel=!this.previewSteel;
    this.resetView(false);
    this.clearOrePieces();
    this.sync(this.run,this.inspectedOre,this.fit);
    return this.previewSteel;
  }

  tapOre() {
    if(this.mode==='ore'){this.tappedAt=performance.now();this.invalidate(700);}
  }

  get canZoom() {
    return ['forge', 'fit', 'appraise'].includes(this.mode) ||
      (this.mode === 'reveal' && this.previewSteel) ||
      (this.mode === 'broken' && this.run?.last?.type !== 'refine-fail');
  }

  turn(dx, dy) {
    const blade = this.canZoom;
    if (blade && !dx) return;
    this.view.turn(dx * (this.gallery ? .012 : .016), blade ? 0 : dy * .012, blade && !this.reduceMotion);
    this.invalidate(180);
  }

  resetView(animate = this.canZoom) {
    this.view.reset(animate && !this.reduceMotion);
    this.invalidate(260);
  }

  get gripFocus() { return this.view.target.grip > 0; }

  setGripFocus(enabled) {
    this.view.focusGrip(enabled && this.mode === 'fit', !this.reduceMotion);
    this.invalidate(260);
  }

  zoomBy(factor, from, to) {
    if (!this.canZoom || !Number.isFinite(factor) || factor <= 0) return;
    this.view.zoomBy(factor, {
      from, to, min: this.gallery ? .78 : .68, max: this.gallery ? 2.25 : 2.6, animate: !this.reduceMotion,
    });
    this.invalidate(180);
  }

  project(world, rect) {
    const p = world.clone().project(this.camera);
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  }

  /**
   * 三个落锤区在画布内的屏幕锚点。
   * 把「刀腹塑纹 / 刃侧上色 / 刀尖生光」从一行文字变成贴在刀身上的三个热区，
   * 玩家不用读说明就知道该点哪里。坐标随刀型与相机变化实时重算。
   */
  zoneAnchors() {
    if (!this.active?.coords) return null;
    const { coords } = this.active;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const put = (u, v) => {
      const section = coords.crossSection(u, v);
      const screen = this.project(this.mesh.localToWorld(new T.Vector3(section.x, section.y, 0)), rect);
      return { x: screen.x - rect.left, y: screen.y - rect.top };
    };
    return {
      tip: put(.93, .5),
      edge: put(.70, doubleEdge.has(this.shown) ? .86 : .10),
      belly: put(.40, .46),
    };
  }

  hit(clientX, clientY) {
    if (!this.active?.coords || this.mode !== 'forge') return null;
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    const impact = this.raycaster.intersectObject(this.mesh, false)[0];
    let local = impact && this.mesh.worldToLocal(impact.point.clone());
    const { coords } = this.active;
    if (local && coords.region(local.x, local.y).blade < .42) return null;
    if (!local) {
      let best = Infinity;
      for (const guide of coords.guides) {
        const screen = this.project(this.mesh.localToWorld(guide.clone()), rect);
        const distance = Math.hypot(screen.x - clientX, screen.y - clientY);
        if (distance < best) { best = distance; local = guide.clone(); }
      }
      if (best > (matchMedia('(pointer: coarse)').matches || this.aspect < 1.35 ? 26 : 18)) return null;
    }
    const u = coords.along(local.x), v = coords.across(local.x, local.y);
    const zone = u > .86 ? 'tip' : v < .30 || (doubleEdge.has(this.shown) && v > .70) ? 'edge' : 'belly';
    return { local, world: this.mesh.localToWorld(local.clone()), zone, position: { u, v }, mesh: this.mesh };
  }

  keyboardHit() {
    if (!this.content.visible || !this.active?.coords) return null;
    const guides = this.active.coords.guides;
    const local = guides[Math.floor(guides.length * .47)].clone();
    const { coords } = this.active;
    return { local, world: this.mesh.localToWorld(local.clone()), zone: 'belly', mesh: this.mesh,
      position: { u: coords.along(local.x), v: coords.across(local.x, local.y) } };
  }

  swing(hit, event, onImpact, onReady) {
    const severe = event.type === 'break' || event.notable;
    const stop = severe ? 88 : event.type === 'surge' ? 76 : event.type === 'scar' ? 66 : 54;
    if (hit.mesh === this.mesh) hit.world.copy(this.mesh.localToWorld(hit.local.clone()));
    // 锤头停在刀面右前方：中心点若压在刀身上，看起来会像“插进刀里”。
    const reach = hit.world.clone().add(new T.Vector3(.18, .015, .12));
    const lift = this.hammerHome.clone().add(new T.Vector3(-.12, .26, .03));
    this.blow = { hit, onImpact, onReady, start: performance.now(), landed: false, contact: 190, stop,
      end: severe ? 560 : event.type === 'surge' ? 520 : 468, reach, lift };
  }

  impact(hit, event) {
    const high = event.type === 'surge' || event.notable;
    const broken = event.type === 'break';
    this.bangedAt = performance.now();
    this.dentAt = this.bangedAt;
    this.dentLocal.copy(hit.local);
    this.dentPower = broken ? 1.7 : high ? 1.2 : .78;
    const uniforms = this.active?.uniforms;
    const slot = finishSlots.indexOf(event.change?.slot) + 1;
    const action = event.change?.action;
    const finish = [slot, action === 'upgrade' ? 2 : action === 'fade' ? 3 : 1,
      uniforms?.fCodes?.value.w ?? 0, uniforms?.fLevels?.value.w ?? 0];
    this.lastImpact = { local: hit.local.clone(), zone: hit.zone, large: high || broken, wave: high || Boolean(event.change), finish };
    this.bangPower = broken ? 1.6 : high ? 1.2 : .72;
    this.flash.position.copy(hit.world).add(new T.Vector3(0, .025, .18));
    this.flash.intensity = this.bangPower * 3.7;
    if (this.active?.uniforms.fHit) {
      this.active.uniforms.fHit.value.copy(hit.local);
      this.active.uniforms.fPulse.value = Math.min(1.3, this.bangPower);
    }
    const color = new T.Color(broken ? '#ff634b' : event.type === 'scar' ? '#c37449' : high ? '#b6e9ff' : '#ffb465');
    const count = broken ? 46 : high ? 38 : event.type === 'scar' ? 14 : 19;
    this.emit(hit.world, color, this.reduceMotion ? Math.ceil(count / 2) : count, high || broken, event.type === 'scar');
    if (broken) this.split(hit.local);
  }

  reveal() {
    if (!this.mesh) return;
    const center = this.content.position.clone();
    center.z = .5;
    this.emit(center, new T.Color('#8d8476'), this.reduceMotion ? 5 : 12, false, true);
    if (this.inspectedOre?.grade === 2) this.emit(center, this.oreUniforms.oreTint.value.clone(), this.reduceMotion ? 3 : 8, false);
  }

  emit(point, tint, count, long, grit = false) {
    const particles = this.sparks.particles;
    for (let i = 0; i < count; i++) {
      const speed = (grit ? 1.18 : long ? 2.8 : 2.1) * (.30 + Math.random());
      const angle = Math.random() * Math.PI * 1.6 + Math.PI * .06;
      particles.push({
        point: point.clone(),
        speed: new T.Vector3(Math.cos(angle) * speed, Math.abs(Math.sin(angle)) * speed * .88, (Math.random() - .34) * speed),
        tint: tint.clone().lerp(new T.Color('#fff1cb'), Math.random() * .64),
        age: 0, life: (long ? .39 : .18) + Math.random() * .33,
      });
    }
    if (particles.length > this.sparks.max) particles.splice(0, particles.length - this.sparks.max);
  }

  split(local) {
    if (!this.mesh?.visible || this.pieces) return;
    const box = this.mesh.geometry.boundingBox;
    const x = clamp(local.x, lerp(box.min.x, box.max.x, .42), lerp(box.min.x, box.max.x, .91));
    const active = this.active;
    this.pieces = [-1, 1].map(direction => {
      const piece = this.mesh.clone();
      const plane = new T.Plane();
      piece.material = makeBladeMaterial(this.mesh.material, active.uniforms, this.shown === 'blank');
      piece.material.clippingPlanes = [plane];
      this.content.add(piece);
      return { piece, plane, direction, x };
    });
    this.splitAt = performance.now();
    this.mesh.visible = false;
  }

  clearPieces() {
    if (!this.pieces) return;
    for (const { piece } of this.pieces) {
      this.content.remove(piece);
      piece.material.dispose();
    }
    this.pieces = null;
    if (this.mesh) this.mesh.visible = true;
  }

  animatePieces(now) {
    if (!this.pieces) return;
    const life = clamp((now - this.splitAt - 47) / 550, 0, 1);
    const eased = 1 - (1 - life) ** 2;
    for (const { piece, plane, direction, x } of this.pieces) {
      piece.position.set(direction * eased * .26, -.23 * life * life, direction * .09 * eased);
      piece.rotation.z = -direction * eased * .16;
      piece.updateWorldMatrix(true, false);
      plane.setFromNormalAndCoplanarPoint(
        new T.Vector3(direction, 0, 0).transformDirection(piece.matrixWorld),
        piece.localToWorld(new T.Vector3(x, 0, 0)),
      );
    }
  }

  animateSparks(dt) {
    const { geometry, particles, positions, color, view } = this.sparks;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
    particles.forEach((p, i) => {
      p.speed.y -= dt * 4.8;
      p.point.addScaledVector(p.speed, dt).toArray(positions, i * 3);
      const fade = (1 - p.age / p.life) ** 1.5 * 1.23;
      color[i * 3] = p.tint.r * fade;
      color[i * 3 + 1] = p.tint.g * fade;
      color[i * 3 + 2] = p.tint.b * fade;
    });
    view.visible = particles.length > 0;
    geometry.setDrawRange(0, particles.length);
    if (view.visible) {
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    }
  }

  frame = (now) => {
    this.frameId = requestAnimationFrame(this.frame);
    const delta = now - (this.previousFrame || now);
    const dt = Math.min(.035, delta / 1000);
    this.previousFrame = now;
    if (document.hidden) return;
    const t = now / 1000;
    const mode = this.mode;
    const gallery = this.gallery && mode === 'appraise';
    const elapsed = now - this.entered;
    const inspect = ['fit', 'appraise'].includes(mode);
    const stone = isOreModel(this.shown);
    const melt = this.shown === 'molten';
    const failedRefining = mode === 'broken' && this.run?.last?.type === 'refine-fail';
    const working = mode === 'forge' || mode === 'broken' || mode === 'refine';
    const strikeAge = now - (this.bangedAt ?? -5000);
    const viewMoving = this.view.advance(delta, this.reduceMotion);
    const view = this.view.current;
    const transition = (mode === 'reveal' && elapsed < 1500) || (!gallery && mode === 'appraise' && elapsed < 1850 && !this.reduceMotion) ||
      (this.pieces && now - this.splitAt < 2200) || now - this.swapAt < 350;
    const continuous = viewMoving || (mode === 'refine' && this.refiningRunning) || this.blow || transition ||
      now < this.dirtyUntil || strikeAge < 750 || this.sparks.particles.length > 0;
    const animatedIdle = !this.reduceMotion && (melt && !failedRefining ||
      mode !== 'broken' && (this.active?.uniforms.fCodes?.value.w ?? 0) > 0);
    const renderDue = this.onScreen && (continuous || animatedIdle && now - (this.lastRender || 0) >= 1000 / 30);
    if (!renderDue && !continuous) return;
    if (renderDue && continuous) {
      const ratio = this.budget.sample(delta, now);
      if (ratio != null) { this.renderer.setPixelRatio(ratio); this.resize(); }
    }
    const impulse = Math.exp(-strikeAge / 116) * (this.bangPower || 0);
    const shake = this.reduceMotion ? 0 : impulse * (this.lastImpact?.zone === 'tip' ? .045 : .021) * Math.sin(strikeAge / 21);
    const compression = this.reduceMotion ? 0 : impulse * .035 * (1 - clamp(strikeAge / 105, 0, 1));
    const narrow = this.aspect < 1.3;
    const upright = Boolean(this.active?.coords);
    const startTurn = !gallery && mode === 'appraise' && !this.reduceMotion ? .34 * (1 - clamp(elapsed / 1480, 0, 1)) ** 2 : 0;
    const stoneTurn = mode === 'reveal' ? 0 : .28;
    const tap = !this.reduceMotion ? Math.sin((now-(this.tappedAt ?? -5000))*.08)*Math.exp(-(now-(this.tappedAt ?? -5000))/85)*.016 : 0;
    if (upright) {
      // Roll the model upright, then spin around the world's vertical axis.
      this.content.rotation.set(0, (gallery ? Math.PI - .26 : -.24) + view.yaw + startTurn, Math.PI / 2 + shake, 'YXZ');
    } else {
      this.content.rotation.set(.18 + view.pitch + tap, stoneTurn + view.yaw, -.18 + shake, 'XYZ');
    }
    this.content.position.set(stone || melt || gallery ? 0 : -.03, (stone || melt ? .04 : working ? .30 : gallery ? .27 : .21) - compression, .10);
    if (this.displayStand) this.displayStand.visible = Boolean(gallery && upright && this.content.visible);
    if (melt) {
      this.meltUniforms.meltClock.value = this.reduceMotion || failedRefining ? 0 : t;
      const reveal = 1 - .20 * Math.exp(-(now - this.swapAt) / 155);
      const breathe = this.reduceMotion || failedRefining ? 1 : 1 + Math.sin(t * 4) * .018;
      this.mesh.scale.set(1.45 * reveal / breathe, 1.45 * reveal * breathe, 1.45 * reveal);
    }
    this.oreUniforms.oreReveal.value = mode === 'reveal' ? clamp((elapsed - 130) / 590, 0, 1) : 0;
    if (this.active?.uniforms.fClock) {
      const { min, max } = this.mesh.geometry.boundingBox;
      const vertical = this.verticalSpan ?? 3.85;
      const fullLength = vertical * (working ? .56 : gallery ? .78 : .74) / (max.x - min.x);
      const scale = gallery ? Math.min(fullLength, vertical * this.aspect * .52 / (max.y - min.y)) : fullLength;
      this.mesh.scale.setScalar(scale);
      this.mesh.position.y = gallery ? -this.active.coords.pommel.y * scale : 0;
      if (gallery) {
        this.displayStand.scale.setScalar(Math.min(1, (this.verticalSpan ?? 3.85) / 5.65));
        const bottom = this.content.position.y + this.active.coords.pommel.x * fullLength;
        this.content.position.y = bottom - this.active.coords.pommel.x * scale;
        this.displayStand.position.set(this.content.position.x, bottom, this.content.position.z);
      }
      const { uniforms } = this.active;
      uniforms.fClock.value = this.reduceMotion ? 0 : t;
      uniforms.fHeat.value = mode === 'refine' ? this.heat : mode === 'forge' && this.shown === 'blank' ? .15 : 0;
      uniforms.fPulse.value = Math.min(1.3, impulse);
      uniforms.fWave.value = this.lastImpact?.wave ? 1 - clamp(strikeAge / 270, 0, 1) : 0;
      if (uniforms.fWave.value > 0) uniforms.fFinishChange.value.fromArray(this.lastImpact.finish);
      if (uniforms.fDent) {
        const dentAge = now - this.dentAt;
        if (!this.reduceMotion && dentAge < 470) {
          const dent = this.dentPower * .026 * Math.exp(-dentAge / 105) * Math.cos(dentAge / 36);
          uniforms.fDent.value.set(this.dentLocal.x, this.dentLocal.y, 0, dent);
        } else if (uniforms.fDent.value.w !== 0) {
          uniforms.fDent.value.w = 0;
        }
      }
    }
    this.anvil.visible = working && mode !== 'refine' && !failedRefining;
    this.crucible.visible = mode === 'refine' || failedRefining;
    this.crucible.position.set(0, narrow ? -.83 : -.73, -.12);
    this.anvil.position.set(.10, -.28 * (this.verticalSpan ?? 3.85) - .34 - compression * .35, -.42);
    this.anvil.rotation.z = .03;
    /* 工坊只在锻打/断裂出现：选矿、开石、精炼、鉴定都是“检视台”，保持干净背景。 */
    const shop = (mode === 'forge' || mode === 'broken') && !failedRefining;
    const anvilY = -.28 * (this.verticalSpan ?? 3.85) - .34;
    const floorY = anvilY - .13 - compression * .35;
    this.ground.visible = shop;
    this.workshop.visible = shop;
    if (shop) {
      this.ground.position.y = floorY;
      this.workshop.position.set(0, floorY, -.05);
      const flicker = this.reduceMotion ? 1 : .82 + Math.sin(t * 7.1) * .11 + Math.sin(t * 13.7) * .07;
      this.ember.intensity = (mode === 'forge' ? 8.5 : 11) * flicker;
      this.animateSmoke(dt, mode === 'forge');
    } else {
      this.ember.intensity = 0;
    }
    this.hammer.visible = mode === 'forge' || !!this.blow;
    const revealFlash = mode === 'reveal' && !this.reduceMotion ? Math.exp(-Math.pow((elapsed - 630) / 185, 2)) : 0;
    this.cutFill.intensity = mode === 'reveal' ? 2.5 + revealFlash * .25 : 0;
    const lampCheck=mode==='ore' && this.inspection==='lamp';
    this.oreUniforms.oreLamp.value=lampCheck ? 1 : 0;
    this.scene.environmentIntensity=lampCheck ? .40 : gallery ? 1.27 : 1;
    this.ambient.intensity=lampCheck ? .34 : gallery ? 1.20 : .93;
    this.rimLight.intensity=lampCheck ? .40 : gallery ? .38 : 1.1;
    this.lampLight.intensity=lampCheck ? 34 : 0;
    this.flash.intensity = mode === 'reveal' ? revealFlash * 3.1 : impulse * (strikeAge < 33 ? 3.7 : 1.15);
    if (mode === 'reveal') this.flash.position.set(0, .1, .8);
    const cameraShake = !this.reduceMotion && this.lastImpact?.large ? Math.sin(strikeAge / 19) * impulse * .035 : 0;
    // 每个工序一个机位：锻打压低看砧面，精炼略低看炉球，检视回到正面。
    const frameTarget = gallery ? CAMERA_FRAMES.gallery : failedRefining ? CAMERA_FRAMES.stage : (CAMERA_FRAMES[mode] || CAMERA_FRAMES.stage);
    const camEase = gallery || this.reduceMotion ? 1 : Math.min(1, dt * 6);
    this.camHeight += (frameTarget.height - this.camHeight) * camEase;
    this.camAim += (frameTarget.aim - this.camAim) * camEase;
    this.camDepth += (frameTarget.depth - this.camDepth) * camEase;
    this.camera.position.set(cameraShake, this.camHeight, this.camDepth);
    this.camera.lookAt(0, this.camAim, 0);
    this.camera.updateMatrixWorld();
    if (view.grip && this.active?.coords) {
      const target = this.mesh.localToWorld(this.gripTarget.copy(this.active.coords.gripCenter));
      this.camera.worldToLocal(target);
      this.camera.translateX(target.x * view.grip);
      this.camera.translateY(target.y * view.grip);
    }
    this.camera.translateX(view.x * this.camera.right);
    this.camera.translateY(view.y * this.camera.top);
    this.camera.updateMatrixWorld();
    const zoom = 1 / view.inverseZoom;
    if (this.camera.zoom !== zoom) {
      this.camera.zoom = zoom;
      this.camera.updateProjectionMatrix();
    }
    this.sweep.intensity = gallery ? 0 : mode === 'reveal' ? revealFlash * 2.1 : inspect ? (mode === 'appraise' ? .50 + .62 * Math.exp(-elapsed / 520) : .61) : 0;
    this.sweep.position.x = mode === 'appraise' ? lerp(-2.8, 2.6, clamp(elapsed / 1500, 0, 1)) : .8;
    this.key.color.set(gallery ? 0xfffcf7 : stone && mode !== 'refine' ? 0xe8efff : inspect ? 0xffead8 : 0xffcfad);
    this.key.intensity = gallery ? 1.03 : mode === 'ore' ? (this.inspection==='lamp' ? .42 : 2.65) : mode === 'refine' ? 2.25 : mode === 'appraise' ? 2.65 : mode === 'reveal' ? 2.45 + revealFlash * .65 : 2.9;
    const blow = this.blow;
    this.trail.visible = false;
    if (blow) {
      const age = now - blow.start;
      const reach = blow.reach;
      if (age < blow.contact) {
        const p = age / blow.contact;
        const wind = .28;
        if (p < wind) {
          // 先抬高蓄力，再落下：没有这一下，快速点击会像“闪烁”。
          const q = p / wind;
          this.hammer.position.lerpVectors(this.hammerHome, blow.lift, Math.sin(q * Math.PI * .5));
          this.hammer.rotation.set(.10, -.27, lerp(-.68, -.88, q));
        } else {
          const q = (p - wind) / (1 - wind);
          this.hammer.position.lerpVectors(blow.lift, reach, q * q * (2.15 - 1.15 * q));
          this.hammer.rotation.set(.10, -.27, lerp(-.88, -.16, q));
        }
        if (p > .66 && !this.reduceMotion) {
          const line = this.trail.geometry.attributes.position;
          const head = this.hammer.position;
          line.setXYZ(0, head.x - .08, head.y + .005, head.z);
          line.setXYZ(1, head.x + (this.hammerHome.x - head.x) * .18, head.y + .19, head.z);
          line.needsUpdate = true;
          this.trail.material.opacity = (p - .66) * 1.6;
          this.trail.visible = true;
        }
      } else {
        if (!blow.landed) { blow.landed = true; blow.onImpact(); }
        const p = clamp((age - blow.contact - blow.stop) / (blow.end - blow.contact - blow.stop), 0, 1);
        this.hammer.position.lerpVectors(reach, this.hammerHome, 1 - (1 - p) ** 2.3);
        this.hammer.rotation.set(.10, -.27, lerp(-.16, -.68, p));
        if (age >= blow.end) { this.blow = null; blow.onReady(); }
      }
    } else {
      this.hammer.position.copy(this.hammerHome);
      this.hammer.rotation.set(.10, -.27, -.68);
    }
    this.animatePieces(now);
    this.animateOreCut(elapsed);
    this.animateSparks(dt);
    if (renderDue) {
      this.renderer.render(this.scene, this.camera);
      this.lastRender = now;
      this.observeFrame?.(performance.now(), continuous ? delta : 0, mode, blow);
    }
  };
}
