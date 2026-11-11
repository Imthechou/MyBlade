/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/shader/handleLook.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  K3D.handleLookGLSL = `
float k3dHHash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float k3dHNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = k3dHHash(i + vec3(0.0,0.0,0.0));
  float n100 = k3dHHash(i + vec3(1.0,0.0,0.0));
  float n010 = k3dHHash(i + vec3(0.0,1.0,0.0));
  float n110 = k3dHHash(i + vec3(1.0,1.0,0.0));
  float n001 = k3dHHash(i + vec3(0.0,0.0,1.0));
  float n101 = k3dHHash(i + vec3(1.0,0.0,1.0));
  float n011 = k3dHHash(i + vec3(0.0,1.0,1.0));
  float n111 = k3dHHash(i + vec3(1.0,1.0,1.0));
  return mix(mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),
             mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y),f.z);
}
float k3dHFbm(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * k3dHNoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
vec2 k3dHVoro(vec2 p) {
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = vec2(k3dHHash(vec3(ip + g, 1.7)), k3dHHash(vec3(ip + g, 4.3)));
      float d = length(g + o - fp);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec2(d1, d2 - d1);
}
float k3dHBand(float x, float f, float width) {
  float d = abs(fract(x * f) - 0.5);
  return 1.0 - smoothstep(width, width + 0.035, d);
}
vec4 k3dHandleLook(int kind, vec3 local) {
  // x = along grip; y/z = normalized handle cross-section.
  vec3 p = clamp(local, 0.0, 1.0);
  float x = p.x, u = p.y, v = p.z;
  vec2 q = vec2(x, u + v * 0.37);
  vec3 alb = vec3(1.0);
  float dr = 0.0;
  float n = k3dHNoise(p * vec3(92.0, 68.0, 54.0));
  float cloud = k3dHFbm(p * 4.0);

  if (kind == 0) { // 温木柄：暖胡桃木，顺纹、火焰纹、细导管
    float warp = (k3dHFbm(p * vec3(3.0, 5.0, 4.0)) - 0.5) * 0.24;
    float grain = 0.5 + 0.5 * sin((u * 31.0 + v * 5.0 + warp * 11.0) * 6.28318);
    float flame = 0.5 + 0.5 * sin((u * 8.0 + warp * 3.0 + cloud * 0.22) * 6.28318);
    float pore = smoothstep(0.80, 0.98, n);
    float w = 0.78 + grain * 0.27 + flame * 0.08 - pore * 0.15;
    alb = vec3(w, w * (0.89 + grain * 0.05), w * (0.75 + flame * 0.08));
    dr = 0.025 + (1.0 - grain) * 0.065 + pore * 0.045;

  } else if (kind == 1) { // 握皮纹：鞍革粒面，细胞起伏与压暗毛孔
    vec2 vo = k3dHVoro(vec2(x * 24.0 + v * 1.7, u * 34.0 + v * 0.8));
    float cell = smoothstep(0.025, 0.16, vo.y);
    float pore = smoothstep(0.88, 0.99, k3dHNoise(p * vec3(132.0, 118.0, 100.0)));
    float w = 0.70 + cell * 0.35 + (cloud - 0.5) * 0.11 - pore * 0.12;
    alb = vec3(w, w * 0.94, w * 0.89);
    dr = 0.055 + cell * 0.07 + pore * 0.04;

  } else if (kind == 2) { // 止滑胶：微砂黑胶、斜向交叉止滑齿
    float a = abs(fract((u + v * 0.72 + x * 0.08) * 13.0) - 0.5);
    float b = abs(fract((u - v * 0.72 - x * 0.08) * 13.0) - 0.5);
    float ridge = 1.0 - smoothstep(0.20, 0.38, min(a, b));
    float fleck = k3dHNoise(p * vec3(180.0, 145.0, 120.0));
    float w = 0.78 + ridge * 0.19 + (fleck - 0.5) * 0.10;
    alb = vec3(w * 0.98, w, w * 1.03);
    dr = 0.055 + (1.0 - ridge) * 0.035;

  } else if (kind == 3) { // 轻量化：石墨聚合物，长槽与分段减重口
    float channel = k3dHBand(u * 0.78 + v * 0.42, 8.0, 0.22);
    float segment = k3dHBand(x, 7.0, 0.035);
    float bead = smoothstep(0.78, 0.98, n);
    float w = 0.91 - channel * 0.25 - segment * 0.08 + bead * 0.035;
    alb = vec3(w * 0.94, w * 0.98, w * 1.04);
    dr = 0.025 + channel * 0.055 + segment * 0.025;

  } else if (kind == 4) { // 竹节柄：蜜金竹纤维、自然节环
    float fiber = 0.5 + 0.5 * sin((u * 29.0 + v * 4.0 + (cloud - 0.5) * 1.5) * 6.28318);
    float node = k3dHBand(x, 4.5, 0.045);
    float nodeShade = node * (0.20 + 0.08 * k3dHFbm(p * 6.0));
    float w = 0.89 + fiber * 0.18 - nodeShade + (n - 0.5) * 0.035;
    alb = vec3(w * 1.02, w, w * (0.82 + fiber * 0.08));
    dr = 0.035 + (1.0 - fiber) * 0.05 + node * 0.025;

  } else if (kind == 5) { // 战术柄：军绿 G10 层压板，交织玻纤层
    float layer = 0.5 + 0.5 * sin((u * 52.0 + v * 15.0 + (cloud - 0.5) * 2.4) * 6.28318);
    float weave = 0.5 + 0.5 * sin((x * 34.0 + u * 21.0) * 6.28318) * sin((x * 34.0 - u * 21.0) * 6.28318);
    float w = 0.70 + layer * 0.29 + weave * 0.07;
    alb = vec3(w * 0.82, w * 0.93, w * 0.72);
    dr = 0.015 + (1.0 - layer) * 0.045;

  } else if (kind == 6) { // 拉丝柄：冷银钛，极细纵向拉丝
    float scratch = 0.5 + 0.5 * sin((u * 245.0 + v * 21.0 + (cloud - 0.5) * 3.2) * 6.28318);
    float broad = k3dHFbm(vec3(x * 3.0, u * 7.0, v * 5.0));
    float w = 0.94 + (scratch - 0.5) * 0.14 + (broad - 0.5) * 0.035;
    alb = vec3(w * 0.97, w, w * 1.035);
    dr = -0.035 + (1.0 - scratch) * 0.035;

  } else if (kind == 7) { // 机加柄：数控环车纹、同心细槽与精密哑光
    vec2 c = vec2(u - 0.5, v - 0.5);
    float r = length(c * vec2(1.0, 1.25));
    float rings = 0.5 + 0.5 * sin((r * 145.0 + x * 2.0) * 6.28318);
    float fine = k3dHNoise(p * vec3(125.0, 96.0, 82.0));
    float w = 0.91 + (rings - 0.5) * 0.12 + (fine - 0.5) * 0.035;
    alb = vec3(w * 0.94, w * 0.98, w * 1.02);
    dr = -0.01 + (rings - 0.5) * 0.065;

  } else if (kind == 8) { // 碳纤柄：黑蓝 2x2 斜纹编织，纤维交叠
    vec2 z = vec2(x * 34.0 + u * 2.0, u * 28.0 + v * 18.0);
    vec2 f = fract(z);
    float over = mod(floor(z.x) + floor(z.y), 2.0);
    float strand = mix(0.5 + 0.5 * sin(f.x * 6.28318), 0.5 + 0.5 * sin(f.y * 6.28318), over);
    float edge = smoothstep(0.0, 0.16, min(min(f.x, 1.0-f.x), min(f.y, 1.0-f.y)));
    float w = 0.55 + strand * 0.46 * edge + edge * 0.13;
    alb = vec3(w * 0.80, w * 0.90, w * 1.18);
    dr = -0.025 - strand * 0.035 + (1.0-edge) * 0.045;

  } else if (kind == 9) { // 白瓷柄：温白釉面，细密冰裂纹
    vec2 vo = k3dHVoro(vec2(x * 13.0 + v * 1.5, u * 15.0 + v * 5.0));
    float crack = 1.0 - smoothstep(0.012, 0.043, vo.y);
    float cloudWhite = k3dHFbm(p * 2.0);
    float w = 0.98 + (cloudWhite - 0.5) * 0.07 - crack * 0.30;
    alb = vec3(w, w * 0.995, w * 0.965);
    dr = -0.045 + crack * 0.14;

  } else if (kind == 10) { // 云脉石柄：灰白云石，大尺度自然矿脉
    float warp = k3dHFbm(p * 2.4) * 1.8;
    float veinWave = abs(sin((u * 7.5 + v * 3.6 + x * 1.2 + warp) * 3.14159));
    float veins = 1.0 - smoothstep(0.055, 0.24, veinWave);
    float cloudStone = k3dHFbm(p * 3.6);
    float w = 0.92 + (cloudStone - 0.5) * 0.22 - veins * 0.34;
    alb = mix(vec3(w * 0.94, w * 0.95, w * 0.98), vec3(w * 0.48, w * 0.53, w * 0.62), veins * 0.84);
    dr = 0.02 + veins * 0.09;

  } else if (kind == 11) { // 旧木柄：烟熏深木、裂丝与磨蚀边
    float warp = (k3dHFbm(p * vec3(2.5, 4.0, 3.0)) - 0.5) * 0.34;
    float grain = 0.5 + 0.5 * sin((u * 23.0 + v * 6.0 + warp * 10.0) * 6.28318);
    float crack = smoothstep(0.72, 0.91, k3dHFbm(vec3(x * 4.0, u * 9.0, v * 7.0)));
    float wear = smoothstep(0.78, 0.98, k3dHNoise(p * vec3(35.0, 21.0, 25.0)));
    float w = 0.65 + grain * 0.27 + (cloud - 0.5) * 0.08 - crack * 0.18 + wear * 0.06;
    alb = vec3(w, w * 0.87, w * 0.72);
    dr = 0.06 + (1.0 - grain) * 0.04 + crack * 0.08;

  } else if (kind == 12) { // 缠光皮柄：斜缠皮带、压边缝线与细粒面
    float wrap = fract(x * 7.0 + u * 0.84 + v * 0.34);
    float seam = 1.0 - smoothstep(0.025, 0.085, min(wrap, 1.0 - wrap));
    float overlap = smoothstep(0.10, 0.20, wrap) * (1.0 - smoothstep(0.80, 0.94, wrap));
    float grain = k3dHNoise(p * vec3(142.0, 112.0, 94.0));
    float w = 0.82 + overlap * 0.15 + (grain - 0.5) * 0.12 - seam * 0.27;
    alb = vec3(w, w * 0.94, w * 0.86);
    dr = 0.015 + seam * 0.095 + (grain - 0.5) * 0.035;

  } else if (kind == 13) { // 雾透玉柄：青白玉、柔雾和内部丝絮
    float cloudJade = k3dHFbm(p * 2.1);
    float wisp = k3dHFbm(p * 6.0 + vec3(2.3, 1.7, 4.1));
    float thread = pow(0.5 + 0.5 * sin((x * 4.0 + u * 4.5 + cloudJade * 1.6) * 6.28318), 4.0);
    float fogBand = smoothstep(0.38, 0.78, cloudJade);
    float w = 0.82 + (cloudJade - 0.5) * 0.38 + (wisp - 0.5) * 0.18 + thread * 0.13;
    alb = mix(vec3(w * 0.62, w * 0.90, w * 0.84), vec3(w * 0.84, w * 1.05, w * 0.96), fogBand);
    dr = -0.025 + (cloudJade - 0.5) * 0.055;

  } else if (kind == 14) { // 模块军绿：分体护片、深缝、精密紧固点
    float seamX = 1.0 - smoothstep(0.012, 0.043, abs(fract(x * 6.0) - 0.5));
    float seamU = 1.0 - smoothstep(0.012, 0.038, abs(fract((u + v * 0.22) * 3.0) - 0.5));
    float seam = max(seamX, seamU * 0.55);
    vec2 screwP = fract(vec2(x * 6.0, u * 3.0) + 0.5) - 0.5;
    float screw = 1.0 - smoothstep(0.035, 0.07, length(screwP));
    float w = 0.80 + (cloud - 0.5) * 0.06 - seam * 0.35 + screw * 0.12;
    alb = vec3(w * 0.78, w * 0.90, w * 0.70);
    dr = 0.025 + seam * 0.07 - screw * 0.025;

  } else if (kind == 15) { // 冷镜钢柄：浅蓝镜面钢，只有细到近乎发丝的车纹
    float line = 0.5 + 0.5 * sin((u * 290.0 + v * 37.0 + x * 8.0) * 6.28318);
    float soft = k3dHFbm(p * vec3(1.7, 10.0, 8.0));
    float w = 0.985 + (line - 0.5) * 0.045 + (soft - 0.5) * 0.018;
    alb = vec3(w * 0.94, w * 0.98, w * 1.05);
    dr = -0.085 + (1.0 - line) * 0.02;

  } else if (kind == 16) { // 深织亮碳：深海蓝高光碳纤，密集 2x2 斜纹
    vec2 z = vec2(x * 56.0 + u * 3.0, u * 47.0 + v * 24.0);
    vec2 f = fract(z);
    float over = mod(floor(z.x) + floor(z.y), 2.0);
    float thread = mix(0.5 + 0.5 * sin((f.x * 0.88 + f.y * 0.12) * 6.28318),
                       0.5 + 0.5 * sin((f.y * 0.88 + f.x * 0.12) * 6.28318), over);
    float selvedge = smoothstep(0.02, 0.18, min(min(f.x,1.0-f.x),min(f.y,1.0-f.y)));
    float glint = pow(thread, 3.0) * selvedge;
    float w = 0.47 + glint * 0.74 + selvedge * 0.08;
    alb = vec3(w * 0.72, w * 0.86, w * 1.18);
    dr = -0.075 * glint + (1.0 - selvedge) * 0.055;

  } else if (kind == 17) { // 断光玉芯：深青玉底、断裂冰脉与玉石芯线
    vec2 vo = k3dHVoro(vec2(x * 8.5 + cloud * 0.5, u * 10.0 + v * 2.5));
    float fracture = 1.0 - smoothstep(0.012, 0.052, vo.y);
    float mist = k3dHFbm(p * 3.1);
    float core = smoothstep(0.58, 0.92, k3dHFbm(p * 1.8 + vec3(4.0,1.0,2.0)));
    float w = 0.57 + mist * 0.17 + fracture * 0.47 + core * 0.10;
    alb = vec3(w * 0.63, w * (0.94 + fracture * 0.13), w * (0.88 + fracture * 0.12));
    dr = -0.035 + fracture * 0.105;

  } else if (kind == 18) { // 白昼镜瓷：暖白珍珠釉、极细开片与柔和珠光
    vec2 vo = k3dHVoro(vec2(x * 19.0 + v * 1.2, u * 22.0 + v * 5.0));
    float crack = 1.0 - smoothstep(0.010, 0.030, vo.y);
    float pearl = 0.5 + 0.5 * sin((x * 1.8 + u * 0.45 + k3dHFbm(p * 2.0) * 0.18) * 6.28318);
    vec3 pearlColor = vec3(0.98 + pearl * 0.035, 0.96 + pearl * 0.025, 0.91 + (1.0-pearl) * 0.065);
    alb = pearlColor * (1.0 - crack * 0.20);
    dr = -0.075 + crack * 0.10;

  } else if (kind == 19) { // 偏振幻彩：钛合金虹彩膜，冷蓝—紫—玫瑰—青
    float phase = x * 2.6 + u * 0.62 + v * 0.16 + (k3dHFbm(p * 2.2) - 0.5) * 0.32;
    vec3 spectral = 0.93 + 0.27 * cos(6.28318 * (phase + vec3(0.00, 0.33, 0.67)));
    float brushed = 0.5 + 0.5 * sin((u * 75.0 + phase * 2.0) * 6.28318);
    alb = mix(vec3(0.83, 0.91, 1.04), spectral, 0.72) * (0.97 + brushed * 0.045);
    dr = -0.06 + (1.0 - brushed) * 0.025;

  } else if (kind == 20) { // 共鸣神玉：翡翠绿玉、鲜明的脉络与内芯高光
    vec2 vo = k3dHVoro(vec2(x * 7.0 + cloud * 0.45, u * 8.5 + v * 2.0));
    float vein = 1.0 - smoothstep(0.012, 0.050, vo.y);
    float cloudGreen = k3dHFbm(p * 2.4);
    float core = smoothstep(0.48, 0.91, k3dHFbm(p * 1.25 + vec3(2.0,5.0,1.0)));
    float w = 0.56 + cloudGreen * 0.30 + vein * 0.70 + core * 0.15;
    alb = vec3(w * (0.48 + vein * 0.08), w * (0.90 + vein * 0.20), w * (0.72 + vein * 0.20));
    dr = -0.045 + vein * 0.12;

  } else if (kind == 21) { // 星屑玄铁：陨铁深灰、锻打坑点与稀疏冷金星屑
    vec2 vo = k3dHVoro(vec2(x * 21.0 + v * 1.4, u * 24.0 + v * 7.0));
    float pit = 1.0 - smoothstep(0.035, 0.17, vo.x);
    float speck = smoothstep(0.89, 0.985, k3dHHash(floor(p * vec3(21.0, 27.0, 24.0))));
    float burn = k3dHFbm(p * 5.5);
    float w = 0.60 + (burn - 0.5) * 0.25 - pit * 0.24;
    vec3 iron = vec3(w * 0.82, w * 0.89, w * 0.98);
    // Warm, sparse metal grains are mixed as their own colour so they remain visible on dark iron.
    alb = mix(iron, vec3(1.42, 1.18, 0.78), speck * 0.92);
    dr = 0.035 + pit * 0.12 - speck * 0.15;

  } else if (kind == 22) { // 冷星釉瓷：午夜蓝釉，稀疏冷星点与环形釉光
    float starN = k3dHHash(floor(p * vec3(18.0, 24.0, 21.0)));
    float star = smoothstep(0.94, 0.992, starN);
    float haloN = k3dHNoise(p * vec3(24.0, 31.0, 28.0));
    float halo = smoothstep(0.86, 0.97, haloN) * 0.16;
    float glaze = k3dHFbm(p * 2.0);
    float w = 0.68 + (glaze - 0.5) * 0.22 + halo;
    vec3 midnight = vec3(w * 0.72, w * 0.88, w * 1.15);
    // Cool pinprick stars are a separate glaze layer, not merely a brightness multiply.
    alb = mix(midnight, vec3(1.35, 1.48, 1.72), star);
    dr = -0.065 + star * 0.11;

  } else if (kind == 23) { // 天工构壳：珠母外壳、六边分片、虹彩边缘与精细嵌线
    vec2 vo = k3dHVoro(vec2(x * 8.0 + v * 0.8, u * 9.0 + v * 4.0));
    float rim = 1.0 - smoothstep(0.018, 0.075, vo.y);
    float face = smoothstep(0.055, 0.20, vo.y);
    float phase = x * 1.7 + u * 0.8 + k3dHFbm(p * 2.4) * 0.23;
    vec3 nacre = 0.96 + 0.18 * cos(6.28318 * (phase + vec3(0.0,0.31,0.64)));
    float pin = smoothstep(0.96, 0.995, k3dHNoise(p * vec3(26.0, 34.0, 31.0)));
    alb = mix(vec3(0.55,0.65,0.78), nacre * (0.88 + face * 0.17), 0.78);
    alb = mix(alb, vec3(1.22,0.86,0.58), rim * 0.38);
    alb += vec3(0.18,0.26,0.35) * pin;
    dr = -0.055 + rim * 0.09 - face * 0.015;
  }
  return vec4(clamp(alb, vec3(0.28), vec3(1.55)), clamp(dr, -0.16, 0.16));
}
`;

export const handleLookGLSL = __reg.proxy.handleLookGLSL;
