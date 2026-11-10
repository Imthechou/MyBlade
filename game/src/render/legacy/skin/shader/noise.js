/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/skin/shader/noise.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../_registry.js';
const K3D = __reg.proxy;

  const common = `
// ══════════════════════════════════════════════════════════════════
// BladeSkin · GLSL 基础库（hash / noise / warp / voronoi / color）
// ══════════════════════════════════════════════════════════════════
float k3dSaturate( float x ) { return clamp( x, 0.0, 1.0 ); }
vec3  k3dSaturate3( vec3 x ) { return clamp( x, vec3( 0.0 ), vec3( 1.0 ) ); }

// ── hash（Wang hash 风格，无纹理、无 sin 精度问题）────────────────
float k3dHash11( float p ) {
  p = fract( p * 0.1031 );
  p *= p + 33.33;
  p *= p + p;
  return fract( p );
}
float k3dHash21( vec2 p ) {
  vec3 p3 = fract( vec3( p.x, p.y, p.x ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float k3dHash31( vec3 p ) {
  p = fract( p * 0.1031 );
  p += dot( p, p.yzx + 33.33 );
  return fract( ( p.x + p.y ) * p.z );
}
vec3 k3dHash33( vec3 p ) {
  return fract( sin( vec3(
    dot( p, vec3( 127.1, 311.7, 74.7 ) ),
    dot( p, vec3( 269.5, 183.3, 246.1 ) ),
    dot( p, vec3( 113.5, 271.9, 124.6 ) ) ) ) * 43758.5453 );
}

// ── value noise ───────────────────────────────────────────────────
float k3dNoise2( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = k3dHash21( i );
  float b = k3dHash21( i + vec2( 1.0, 0.0 ) );
  float c = k3dHash21( i + vec2( 0.0, 1.0 ) );
  float d = k3dHash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
float k3dNoise3( vec3 p ) {
  vec3 i = floor( p ), f = fract( p );
  vec3 u = f * f * ( 3.0 - 2.0 * f );
  float n000 = k3dHash31( i );
  float n100 = k3dHash31( i + vec3( 1.0, 0.0, 0.0 ) );
  float n010 = k3dHash31( i + vec3( 0.0, 1.0, 0.0 ) );
  float n110 = k3dHash31( i + vec3( 1.0, 1.0, 0.0 ) );
  float n001 = k3dHash31( i + vec3( 0.0, 0.0, 1.0 ) );
  float n101 = k3dHash31( i + vec3( 1.0, 0.0, 1.0 ) );
  float n011 = k3dHash31( i + vec3( 0.0, 1.0, 1.0 ) );
  float n111 = k3dHash31( i + vec3( 1.0, 1.0, 1.0 ) );
  return mix(
    mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ),
    mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ), u.z );
}

// ── fbm / ridge（固定 4 阶，常量循环边界兼容 GLSL ES 1.0）─────────
float k3dFbm2( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i++ ) { s += a * k3dNoise2( p ); p *= 2.02; a *= 0.5; }
  return s / 0.9375;
}
float k3dFbm3( vec3 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i++ ) { s += a * k3dNoise3( p ); p *= 2.03; a *= 0.5; }
  return s / 0.9375;
}
/** 脊状噪声：1 - |2n-1| 的叠加，做"硬边"（锻打面/碎片/锤痕） */
float k3dRidge2( vec2 p ) {
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i++ ) { s += a * ( 1.0 - abs( k3dNoise2( p ) * 2.0 - 1.0 ) ); p *= 2.07; a *= 0.5; }
  return s / 0.9375;
}

// ── domain warp（域扭曲：规则噪声 → 流动的雾/流纹）───────────────
vec2 k3dWarp2( vec2 p, float strength, float seed ) {
  vec2 q = vec2( k3dFbm2( p + seed * 7.13 ), k3dFbm2( p + vec2( 5.2, 1.3 ) - seed * 3.71 ) );
  return p + ( q - 0.5 ) * 2.0 * strength;
}
vec3 k3dWarp3( vec3 p, float strength, float seed ) {
  vec3 q = vec3(
    k3dFbm3( p + seed * 7.13 ),
    k3dFbm3( p + vec3( 5.2, 1.3, 2.7 ) - seed * 3.71 ),
    k3dFbm3( p + vec3( 1.7, 9.2, 4.3 ) + seed * 1.93 ) );
  return p + ( q - 0.5 ) * 2.0 * strength;
}

// ── Voronoi（大理石 / 碎片 / 几何块面）───────────────────────────
/** 返回 F1 距离；cellId 给块面上色用 */
float k3dVoronoi2( vec2 p, out float cellId ) {
  vec2 n = floor( p ), f = fract( p );
  float f1 = 8.0;
  cellId = 0.0;
  for ( int j = -1; j <= 1; j++ ) {
    for ( int i = -1; i <= 1; i++ ) {
      vec2 g = vec2( float( i ), float( j ) );
      vec2 o = k3dHash33( vec3( n + g, 1.0 ) ).xy;
      vec2 r = g + o - f;
      float d = dot( r, r );
      if ( d < f1 ) { f1 = d; cellId = k3dHash21( n + g ); }
    }
  }
  return sqrt( f1 );
}

// ── 变换 ─────────────────────────────────────────────────────────
mat2 k3dRot2( float a ) { float s = sin( a ), c = cos( a ); return mat2( c, -s, s, c ); }
/** 采样域映射：先按 scale 缩放，再在刀身平面内旋转，最后偏移（对应 §6 的 scale/rotation/offset） */
vec3 k3dTexDomain( vec3 local, vec4 prm ) {
  vec3 q = local * prm.x;
  q.xy = k3dRot2( prm.y ) * q.xy;
  q.x += prm.z;
  q.y += prm.w;
  return q;
}

// ── 色彩工具 ─────────────────────────────────────────────────────
vec3 k3dRgb2Hsv( vec3 c ) {
  vec4 K = vec4( 0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0 );
  vec4 p = mix( vec4( c.bg, K.wz ), vec4( c.gb, K.xy ), step( c.b, c.g ) );
  vec4 q = mix( vec4( p.xyw, c.r ), vec4( c.r, p.yzx ), step( p.x, c.r ) );
  float d = q.x - min( q.w, q.y );
  float e = 1.0e-10;
  return vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + e ) ), d / ( q.x + e ), q.x );
}
vec3 k3dHsv2Rgb( vec3 c ) {
  vec4 K = vec4( 1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0 );
  vec3 p = abs( fract( vec3( c.x ) + K.xyz ) * 6.0 - K.www );
  return c.z * mix( vec3( K.x ), clamp( p - K.xxx, 0.0, 1.0 ), c.y );
}
vec3 k3dHueShift( vec3 c, float shift ) {
  vec3 hsv = k3dRgb2Hsv( c );
  hsv.x = fract( hsv.x + shift );
  return k3dHsv2Rgb( hsv );
}
vec3 k3dSatVal( vec3 c, float satMul, float valMul ) {
  vec3 hsv = k3dRgb2Hsv( c );
  hsv.y = k3dSaturate( hsv.y * satMul );
  hsv.z = k3dSaturate( hsv.z * valMul );
  return k3dHsv2Rgb( hsv );
}
/** 4 段调色板：0~0.34 → c0→c1，0.34~0.67 → c1→c2，0.67~1 → c2→c3 */
vec3 k3dPalette4( vec3 c0, vec3 c1, vec3 c2, vec3 c3, float t ) {
  t = k3dSaturate( t );
  if ( t < 0.34 ) return mix( c0, c1, t / 0.34 );
  if ( t < 0.67 ) return mix( c1, c2, ( t - 0.34 ) / 0.33 );
  return mix( c2, c3, ( t - 0.67 ) / 0.33 );
}
/** 对比调制：contrast=0 不动，=1 走 smoothstep（压中段、拉开黑白） */
float k3dApplyContrast( float v, float contrast ) {
  return k3dSaturate( mix( v, smoothstep( 0.18, 0.82, v ), contrast ) );
}
`;

  K3D.shaderNoise = { common };

export const shaderNoise = __reg.proxy.shaderNoise;
