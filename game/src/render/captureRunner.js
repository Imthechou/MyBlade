/**
 * 固定 render target 离屏出图（审计 #5 / #24 的离线那一半）
 *
 * 为什么需要（实测，`tools/probe-arch-benefit.mjs`）：
 *   收藏页缩略图走 `viewer.snapshot(136,164)`，而 snapshot 是**把可见画布**
 *   `setSize(136,164)` 再 `setSize` 回来。12 张一批实测：
 *     · 总耗时 168.7–193.6 ms
 *     · 其中"纯 resize 往返"占 **50.6 ms（24%）** —— drawing buffer 被重分配 24 次
 *     · `setSize` 实际被调用 **48 次**（每张 4 次：snapshot 两次 + 尺寸观察者级联两次）
 *   出图这件事根本不需要动可见画布：换成一个固定尺寸的 render target 就行。
 *
 * 为什么是**两趟**（这地方连着踩了三个坑，都写在这里）：
 *   ① `renderer.setViewport(0,0,w,h)` **不能调**：three 的 setViewport 会再乘一次
 *      pixelRatio（`state.viewport(_viewport × _pixelRatio)`），而 RT 的视口本来就是真实像素。
 *      在 PR=1.5 的会话里那样写会把 136×164 放大成 204×246 —— 表现为"刀被放大并推到右边"。
 *      `setRenderTarget()` 已经按 target 尺寸设好视口，只需要把残留的 scissor 关掉。
 *   ② 可见画布是 `antialias:true`（默认帧缓冲有 MSAA），普通 RT 没有 →
 *      缩略图边缘会出现孤立硬边像素（max 差 167–255）。RT 要显式 `samples: 4`。
 *   ③ **最要命的一条**：three 在渲染到 render target 时把 `toneMapping` 强制成
 *      `NoToneMapping`（`getParameters`：`toneMapping: currentRenderTarget === null ? ... : NoToneMapping`）。
 *      本站用 ACESFilmic + exposure 0.9，少了这一步暗部会整体抬亮 ——
 *      实测 MAT01（深色矿石）平均亮度 62.2 → 77.6，S8 中调钢则几乎不变，很容易被当成"没问题"。
 *      所以这里走两趟：场景 → 线性 RT（RGBA16F） → 手写 ACES 全屏 pass → sRGB RT。
 *      验证方法很直接：把 `renderer.toneMapping` 临时切成 NoToneMapping，
 *      旧路 68.20 / 新路 68.71 —— 证明差异**只**来自色调映射这一环。
 *
 * 边界：
 *   · 只实现本站实际使用的 ACESFilmic；NoToneMapping 走直通；其它模式直通并 warn 一次。
 *   · RT 按 `w×h` 缓存复用；上下文丢失后调 `invalidateCaptureTargets()`。
 *   · 失败返回 null，调用方自己兜底（门面会退回 `viewer.snapshot`）。
 */

const TM_NONE = 0;
const TM_ACES = 1;

let cache = null;        // Map<WebGLRenderer, Map<size, pipeline>>; GPU contexts never share RTs
let canvas2d = null;
let warnedMode = null;

const TONEMAP_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

/* 与 three 的 `ACESFilmicToneMapping` 逐字一致（含 /0.6 的曝光归一） */
const TONEMAP_FRAG = `
uniform sampler2D uSrc;
uniform float uExposure;
uniform int uMode;
varying vec2 vUv;

vec3 RRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}

void main() {
  vec4 texel = texture2D( uSrc, vUv );
  vec3 color = texel.rgb;
  if ( uMode == ${TM_ACES} ) {
    const mat3 ACESInputMat = mat3(
      vec3( 0.59719, 0.07600, 0.02840 ),
      vec3( 0.35458, 0.90834, 0.13383 ),
      vec3( 0.04823, 0.01566, 0.83777 )
    );
    const mat3 ACESOutputMat = mat3(
      vec3(  1.60475, -0.10208, -0.00327 ),
      vec3( -0.53108,  1.10813, -0.07276 ),
      vec3( -0.07367, -0.00605,  1.07602 )
    );
    color *= uExposure / 0.6;
    color = ACESInputMat * color;
    color = RRTAndODTFit( color );
    color = ACESOutputMat * color;
    color = clamp( color, 0.0, 1.0 );
  }
  gl_FragColor = vec4( color, texel.a );
}`;

function modeOf(THREE, renderer) {
  const tm = renderer.toneMapping;
  if (tm === THREE.NoToneMapping || tm === undefined || tm === null) return TM_NONE;
  if (tm === THREE.ACESFilmicToneMapping) return TM_ACES;
  if (warnedMode !== tm && globalThis.console) {
    warnedMode = tm;
    console.warn('[capture] 离屏出图只实现了 ACES / 无色调映射，当前 toneMapping=' + tm + ' 按直通处理');
  }
  return TM_NONE;
}

function ensurePipeline(THREE, renderer, w, h) {
  if (!cache) cache = new Map();
  let contexts = cache.get(renderer);
  if (!contexts) { contexts = new Map(); cache.set(renderer, contexts); }
  const key = w + 'x' + h;
  const hit = contexts.get(key);
  if (hit) return hit;

  const isGL2 = renderer.capabilities ? renderer.capabilities.isWebGL2 !== false : true;
  const linear = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: isGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
    samples: 4,                       // ② 与画布的 antialias 对齐
  });
  if ('colorSpace' in linear.texture && THREE.NoColorSpace !== undefined) {
    linear.texture.colorSpace = THREE.NoColorSpace;   // 线性，色调映射要在这一步之后做
  }

  const out = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  /* 输出 target 声明成 sRGB：three 对"非默认目标的输出色空间"一律按线性写 shader，
     由 GPU 的 SRGB8_ALPHA8 完成编码 —— 与画布那条路的最终像素一致。 */
  if ('colorSpace' in out.texture && THREE.SRGBColorSpace !== undefined) {
    out.texture.colorSpace = THREE.SRGBColorSpace;
  } else if ('encoding' in out.texture && THREE.sRGBEncoding !== undefined) {
    out.texture.encoding = THREE.sRGBEncoding;
  }

  const uniforms = { uSrc: { value: linear.texture }, uExposure: { value: 1 }, uMode: { value: TM_NONE } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TONEMAP_VERT,
    fragmentShader: TONEMAP_FRAG,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  scene.add(quad);

  const entry = { linear, out, uniforms, scene, camera, material, geometry };
  contexts.set(key, entry);
  return entry;
}

/**
 * 把当前场景拍到一张固定尺寸离屏 target 并编码成 dataURL。
 * @param {object} viewer legacy viewer（需要 .renderer / .scene / .camera / ._matGen）
 * @param {number} w
 * @param {number} h
 * @param {object} [opts] { type='image/webp', quality=0.8 }
 * @returns {string|null}
 */
export function captureToDataURL(viewer, w, h, opts = {}) {
  const THREE = globalThis.THREE;
  if (!THREE || !viewer || !viewer.renderer || !viewer.scene || !viewer.camera) return null;
  const r = viewer.renderer;
  try {
    const gl = r.getContext();
    if (gl && gl.isContextLost && gl.isContextLost()) return null;
  } catch (_) { return null; }

  /* 程序就绪闸门：与 snapshot 同一语义（材质代数变了先同步 compile 一次） */
  const K3D = globalThis.K3D || {};
  if (K3D.material && K3D.material.materialGen) {
    const gen = K3D.material.materialGen();
    if (gen !== viewer._matGen) {
      try { r.compile(viewer.scene, viewer.camera); } catch (_) { /* 与 snapshot 一致 */ }
      viewer._matGen = gen;
    }
  }

  const camera = viewer.camera;
  const oldAspect = camera.aspect;
  const prevTarget = r.getRenderTarget();
  try {
    const p = ensurePipeline(THREE, r, w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    /* 趟 1：场景 → 线性 */
    r.setRenderTarget(p.linear);
    if (r.getScissorTest && r.getScissorTest()) r.setScissorTest(false);   // ① 不碰 viewport
    r.render(viewer.scene, camera);

    /* 趟 2：线性 → ACES → sRGB */
    p.uniforms.uMode.value = modeOf(THREE, r);
    p.uniforms.uExposure.value = Number(r.toneMappingExposure) || 1;
    r.setRenderTarget(p.out);
    r.render(p.scene, p.camera);

    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(p.out, 0, 0, w, h, buf);

    if (!canvas2d) canvas2d = document.createElement('canvas');
    if (canvas2d.width !== w || canvas2d.height !== h) { canvas2d.width = w; canvas2d.height = h; }
    const g = canvas2d.getContext('2d');
    const img = g.createImageData(w, h);
    /* GL 的行 0 在下、ImageData 的行 0 在上 → 翻行 */
    const stride = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * stride;
      img.data.set(buf.subarray(src, src + stride), y * stride);
    }
    g.putImageData(img, 0, 0);
    return canvas2d.toDataURL(opts.type || 'image/webp', opts.quality != null ? opts.quality : 0.8);
  } catch (e) {
    if (globalThis.console) console.warn('[capture] 离屏出图失败:', e && e.message);
    return null;
  } finally {
    try { r.setRenderTarget(prevTarget); } catch (_) { /* ignore */ }
    camera.aspect = oldAspect;
    camera.updateProjectionMatrix();
    if (viewer) viewer.needsRender = true;
  }
}

/** Release only the owning renderer's GPU render targets on dispose/context loss. */
export function invalidateCaptureTargets(renderer = null) {
  if (!cache) return;
  const targets = renderer ? [[renderer, cache.get(renderer)]] : [...cache.entries()];
  for (const [owner, contexts] of targets) {
    if (!contexts) continue;
    for (const entry of contexts.values()) {
      for (const resource of [entry.linear, entry.out, entry.material, entry.geometry]) {
        try { resource?.dispose(); } catch (_) { /* renderer may have lost context */ }
      }
    }
    cache.delete(owner);
  }
}

/** Diagnostic cache summary, optionally scoped to one WebGL renderer. */
export function captureStats(renderer = null) {
  const contexts = renderer ? cache?.get(renderer) : cache?.values().next().value;
  const entry = contexts?.values().next().value;
  const THREE = globalThis.THREE;
  return {
    sizes: contexts ? [...contexts.keys()] : [],
    contexts: cache?.size || 0,
    mode: entry && THREE ? (entry.uniforms.uMode.value === TM_ACES ? 'aces' : 'none') : null,
    canvas: canvas2d ? [canvas2d.width, canvas2d.height] : null,
  };
}

export default { captureToDataURL, invalidateCaptureTargets, captureStats };
