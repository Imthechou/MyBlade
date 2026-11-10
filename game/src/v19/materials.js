import { MARK_WIDTH, MARK_HEIGHT, mineralHeritage, lookVariant } from './forge.js';
import { bladeLooksGLSL, lookCodes } from './blade-looks.js';

const T = globalThis.THREE;
const layoutUniforms = { metal: 'fMetalLayout', pattern: 'fPatternLayout', film: 'fFilmLayout', fx: 'fFxLayout' };
const layoutAnchors = [.27, .5, .73];

export function surfaceUniforms() {
  const marks = new T.DataTexture(new Uint8Array(MARK_WIDTH * MARK_HEIGHT * 4), MARK_WIDTH, MARK_HEIGHT);
  marks.magFilter = marks.minFilter = T.LinearFilter;
  marks.needsUpdate = true;
  return {
    fCodes: { value: new T.Vector4() },
    fLevels: { value: new T.Vector4() },
    fMetalLayout: { value: new T.Vector4(.5, 0, 1, .5) },
    fPatternLayout: { value: new T.Vector4(.5, 0, 1, .5) },
    fFilmLayout: { value: new T.Vector4(.5, 0, 1, .5) },
    fFxLayout: { value: new T.Vector4(.5, 0, 1, .5) },
    fBladeRoot: { value: 0 },
    fFinishChange: { value: new T.Vector4() },
    fGrind: { value: new T.Vector3() },
    fClock: { value: 0 },
    fSeed: { value: 0 },
    fHeat: { value: 0 },
    fMarks: { value: marks },
    fPurity: { value: .65 },
    fRefine: { value: .5 },
    fWear: { value: .25 },
    fOreTone: { value: new T.Color('#879cab') },
    fOreCore: { value: new T.Color('#a9bfc7') },
    fOreTrace: { value: .5 },
    fOreStyle: { value: 0 },
    fOreFamily: { value: 0 },
    fOreSeed: { value: .5 },
    fOreClarity: { value: .5 },
    fPulse: { value: 0 },
    fWave: { value: 0 },
    fHit: { value: new T.Vector3() },
    fGrip: { value: new T.Color('#44413d') },
    fGuard: { value: new T.Color('#83828b') },
    fGripStyle: { value: 0 },
    fRaw: { value: 0 },
  };
}

export function setSurface(uniforms, run, fit) {
  const { skin } = run;
  uniforms.fCodes.value.set(lookCodes.metal[skin.metal] ?? 0, lookCodes.pattern[skin.pattern] ?? 0,
    lookCodes.film[skin.film] ?? 0, lookCodes.fx[skin.fx] ?? 0);
  uniforms.fLevels.value.set(skin.levels.metal ?? 1, skin.levels.pattern ?? 0, skin.levels.film ?? 0, skin.levels.fx ?? 0);
  for (const [slot, uniform] of Object.entries(layoutUniforms)) {
    if (!lookCodes[slot][skin[slot]]) continue;
    const { layout, seed } = lookVariant(skin, slot);
    const slope = seed * 13.81 % 1;
    const scale = seed * 27.11 % 1;
    uniforms[uniform].value.set((layoutAnchors[layout] ?? .5) + (seed - .5) * .095,
      (slope - .5) * .52, .85 + scale * .30, seed);
  }
  uniforms.fSeed.value = skin.seed ?? .5;
  uniforms.fPurity.value = (run.purity || run.ore?.purity || 65) / 100;
  uniforms.fRefine.value = (run.refinement?.quality ?? 50) / 100;
  uniforms.fWear.value = Math.min(.85, .15 + Math.max(0, (run.hits ?? 0) - 6) * .018 + (1 - uniforms.fPurity.value) * .24);
  const heritage = mineralHeritage(run.ore);
  uniforms.fOreTone.value.set(heritage.tone);
  uniforms.fOreCore.value.set(heritage.core);
  uniforms.fOreTrace.value = heritage.trace;
  uniforms.fOreStyle.value = heritage.style;
  uniforms.fOreFamily.value = heritage.family;
  uniforms.fOreSeed.value = heritage.seed;
  uniforms.fOreClarity.value = heritage.clarity;
  uniforms.fGrip.value.set(fit?.color || '#393f42');
  uniforms.fGuard.value.set(fit?.accent || '#858992');
  uniforms.fGripStyle.value = fit?.grip || 0;
  const texture = uniforms.fMarks.value;
  if (texture.userData.marks !== run.marks || texture.userData.hit !== run.hits) {
    const pixels = texture.image.data;
    pixels.fill(0);
    for (const [index, mark] of Object.entries(run.marks || {})) {
      const i = Number(index) * 4;
      pixels[i] = (mark & 15) * 17;
      pixels[i + 1] = ((mark >> 4) & 15) * 17;
      pixels[i + 2] = ((mark >> 8) & 15) * 17;
    }
    texture.userData.marks = run.marks;
    texture.userData.hit = run.hits;
    texture.needsUpdate = true;
  }
}

const vertexHead = `
attribute vec4 forgeCoord;
varying vec4 vForge;
varying vec3 vForgePos;
varying vec3 vForgeNormal;
`;
const vertexBody = `
vForge = forgeCoord;
vForgePos = position;
vForgeNormal = normalize(normalMatrix * normal);
`;

const fragmentHead = `
uniform vec4 fCodes, fLevels, fFinishChange;
uniform float fClock, fSeed, fHeat, fPurity, fRefine, fWear, fPulse, fWave, fGripStyle, fRaw, fOreTrace, fOreStyle, fOreFamily, fOreSeed, fOreClarity;
uniform sampler2D fMarks;
uniform vec3 fGrip, fGuard, fHit, fOreTone, fGrind;
varying vec4 vForge;
varying vec3 vForgePos;
varying vec3 vForgeNormal;

float forgeHash(vec2 p) {
  vec3 q = fract(p.xyx * vec3(.1031,.11369,.13787));
  q += dot(q, q.yzx + 19.19);
  return fract((q.x + q.y) * q.z);
}
float forgeNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.-2.*f);
  return mix(mix(forgeHash(i),forgeHash(i+vec2(1.,0.)),f.x),
    mix(forgeHash(i+vec2(0.,1.)),forgeHash(i+vec2(1.,1.)),f.x),f.y);
}
float forgeBand(float x, float width) {
  float aa = max(.015, fwidth(x) * .65);
  return 1. - smoothstep(width, width+aa, abs(fract(x)-.5));
}
`;

// Shared object-space geology: shell windows and both cut faces sample exactly
// the same deposit. The blade stretches this field along its own length.
const geology = `
float mineralHash3(vec3 p) {
  p=fract(p*.1031);p+=dot(p,p.yzx+31.32);return fract((p.x+p.y)*p.z);
}
float mineralNoise3(vec3 p) {
  vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(mineralHash3(i),mineralHash3(i+vec3(1,0,0)),f.x),
    mix(mineralHash3(i+vec3(0,1,0)),mineralHash3(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(mineralHash3(i+vec3(0,0,1)),mineralHash3(i+vec3(1,0,1)),f.x),
    mix(mineralHash3(i+vec3(0,1,1)),mineralHash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
vec3 mineralCells(vec2 q, float seed) {
  vec2 cell=floor(q),f=fract(q);
  float near=9.,second=9.,shade=0.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
    vec2 b=vec2(float(x),float(y));
    vec2 jitter=vec2(forgeHash(cell+b+seed),forgeHash(cell+b+seed+19.3));
    vec2 d=b+jitter-f;float dist=dot(d,d);
    if(dist<near){second=near;near=dist;shade=forgeHash(cell+b+seed+8.7);}
    else second=min(second,dist);
  }
  return vec3(sqrt(near),sqrt(second)-sqrt(near),shade);
}
vec4 mineralField(vec3 p, float family, float style, float seed) {
  vec3 v=p+vec3(seed*7.,seed*3.,style*.29);
  float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
  float fine=mineralNoise3(v*49.);
  float warp=mineralNoise3(v*3.1);
  vec2 q=p.yz;
  float seam=0.,facets=n;
  if(family < .5){
    float layers=q.x*(4.7+mod(style,3.)*.9)+q.y*.65+warp*1.45;
    seam=forgeBand(layers,.14)*smoothstep(.30,.60,n);
    facets=.30+.70*warp;
  }else if(family < 1.5){
    vec3 cell=mineralCells(q*(6.3+style*.4)+vec2(warp*.31,n*.19),seed*17.);
    facets=cell.z;
    seam=smoothstep(.015,.09,cell.y)*(.23+.77*cell.z);
  }else if(family < 2.5){
    seam=(1.-smoothstep(.025,.10,abs(n-.51)))*smoothstep(.28,.56,warp);
    facets=mineralNoise3(v*15.);
  }else if(family < 3.5){
    float a=forgeBand(q.x*8.+q.y*3.5+warp*.27,.10)*smoothstep(.35,.58,n);
    float b=forgeBand(q.x*4.-q.y*6.2+seed*2.,.07)*smoothstep(.53,.74,warp);
    seam=max(a,b*.62);facets=mineralNoise3(v*21.);
  }else{
    float layers=q.x*(5.2+mod(style,3.)*.65)+q.y*.55+warp*1.18;
    seam=forgeBand(layers,.21)*(.30+.70*n);
    facets=.3+.7*mineralNoise3(v*8.);
  }
  // Sparse irregular fracture edges, with gaps. Avoid a periodic dotted network.
  float fracture=(1.-smoothstep(.012,.034,abs(warp-.49)))*smoothstep(.45,.65,n);
  return vec4(seam,facets,fine,fracture);
}
vec3 rockBump(vec3 n, float height, vec3 viewP) {
  vec3 dx=dFdx(-viewP), dy=dFdy(-viewP);
  vec3 rx=cross(dy,n), ry=cross(n,dx);
  float det=dot(dx,rx);
  if(abs(det)<.00000001)return n;
  return normalize(abs(det)*n-sign(det)*(dFdx(height)*rx+dFdy(height)*ry));
}
`;

const fittings = `
// Shape-specific grind. The first two channels are satin and polished areas;
// the third is a signed relief used by the PBR normal.
vec3 bladeGrind(vec2 uv, float coarse) {
  float lengthMask = smoothstep(.04,.17,uv.x)*(1.-smoothstep(.76,.98,uv.x));
  float across = uv.y-fGrind.y;
  float width = fGrind.z;
  float offset = abs(across);
  if (fGrind.x == 1.) {
    float fuller = 1.-smoothstep(width*.67,width,offset);
    float shoulder = lookLine(offset-width,.015);
    return vec3(fuller,shoulder,shoulder-fuller*.87)*lengthMask;
  }
  if (fGrind.x == 2.) {
    float ridge = 1.-smoothstep(.012,width,offset);
    return vec3(.27*(1.-ridge),ridge,ridge*.85)*lengthMask;
  }
  if (fGrind.x == 3.) {
    float temper = across+sin(uv.x*23.)*.023+(coarse-.5)*.057;
    float bright = lookLine(temper,width*.31);
    return vec3(smoothstep(-.03,.07,temper)*.28,bright,bright*.16)*lengthMask;
  }
  if (fGrind.x == 4.) {
    float spine = smoothstep(0.,width,across);
    float rim = lookLine(across,.017);
    return vec3(spine*.76,rim,rim*.48-spine*.25)*lengthMask;
  }
  return vec3(0.);
}

vec3 gripFinish(vec2 uv, vec3 base, vec3 atlas, out float rough, out float metal, out float height) {
  float source = dot(base,vec3(.213,.715,.072));
  float coarse = forgeNoise(uv*vec2(6.,11.)+fSeed*7.);
  float detail = .82+.30*smoothstep(.02,.43,source);
  float grain = 0., figure = 1.;
  vec3 tint = fGrip;
  metal = .07 + .10*atlas.b;
  if (fGripStyle == 1.) {
    float ring = uv.y*11.+uv.x*1.4+coarse*.89+.36*sin(uv.x*14.);
    grain = forgeBand(ring,.12);
    figure = .92+.15*sin(ring*forgeTurn)-.16*grain;
    rough = .41+.083*grain;
  } else if (fGripStyle == 2.) {
    vec2 weave = vec2(uv.x*24.+uv.y*9.,uv.y*13.-uv.x*14.);
    float warp = sin(weave.x*forgeTurn), weft = sin(weave.y*forgeTurn);
    float row = step(1.,mod(floor(weave.x)+floor(weave.y),2.));
    grain = mix(warp,weft,row)*(1.-smoothstep(.46,1.2,max(fwidth(weave.x),fwidth(weave.y))));
    figure = 1.07+grain*.36;
    rough = .36-grain*.087;
    metal = .19;
  } else if (fGripStyle == 3.) {
    float growth = forgeBand(uv.y*7.4+coarse*.87+uv.x*1.22,.09);
    float fleck = smoothstep(.71,.95,forgeNoise(uv*vec2(68.,41.)));
    grain = growth*.46+fleck;
    figure = 1.08-.18*grain;
    rough = .43+.14*fleck;
  } else if (fGripStyle == 4.) {
    float seam = abs(uv.y-.5)-.29;
    float spacing = uv.x*20.+uv.y*.73;
    float stitches = lookLine(seam+.086*(fract(spacing)-.5),.010)*forgeBand(spacing,.19);
    float hide = forgeNoise(uv*vec2(52.,35.));
    grain = stitches - hide*.37;
    tint = mix(fGrip,fGuard,stitches*.45);
    figure = .88+.21*hide-.11*lookLine(seam,.021);
    rough = .63-.13*stitches;
  } else if (fGripStyle == 5.) {
    float winding = uv.x*12.6 + uv.y*(1.22 + .53*sin(uv.x*10.));
    float braid = forgeBand(winding,.14);
    float strands = .5+.5*sin((winding*3.0+uv.y*13.)*forgeTurn);
    grain = .26*strands-braid;
    figure = .98+.17*strands-.34*braid;
    rough = .53+.12*braid;
  } else {
    float vein = lookLine(uv.y-.50+coarse*.49-.11*sin(uv.x*19.),.016);
    float vein2 = lookLine(uv.y-.33+coarse*.39+.12*sin(uv.x*14.),.011);
    grain = max(vein,vein2*.55);
    tint = mix(fGrip,fGuard,grain*.31+coarse*.18);
    figure = .88+coarse*.24;
    rough = .31+.061*grain;
  }

  float fitting = max(1.-smoothstep(.068,.137,uv.x),smoothstep(.845,.963,uv.x));
  float scored = max(lookLine(uv.x-.102,.012),lookLine(uv.x-.894,.013));
  vec3 collar = fGuard * (.59+.40*smoothstep(.025,.42,source)+.31*scored);
  height = grain*.00045 + scored*.00035;
  rough = mix(rough + (atlas.g-.53)*.19,.32-.105*scored,fitting);
  metal = mix(metal,.81,fitting);
  return mix(tint*detail*figure,collar,fitting)*mix(.77,1.,atlas.r);
}
`;

const body = `
vec2 fp = vec2(vForgePos.x, vForgePos.y + abs(vForgePos.z)*.26);
vec2 st = vForge.xy;
float grip = step(.5,fGripStyle)*smoothstep(.15,.88,vForge.z);
float edge = vForge.w;
// Keep the forged surface in whole-knife coordinates, even after a fitting
// hides the handle. The grind uses the blade section's own coordinates.
vec2 uv = st;
float view = 1.-clamp(abs(dot(normalize(vForgeNormal),normalize(vViewPosition))),0.,1.);
float grazing = pow(view,2.7);
float bend = fSeed*6.28318;
float coarse = forgeNoise(fp*vec2(8.,24.)+vec2(bend,-bend));
vec3 mark = texture2D(fMarks,st).rgb;
float brush = sin(fp.y*1950. + sin(fp.x*21.)*1.5) * (1.-smoothstep(.2,2.8,fwidth(fp.y*1950.)));
float forgeRough = .32;
float forgeMetal = .92;
float track = 0., spread = 1.;
vec4 ranks = fLevels, visibility = vec4(1.);
int fxStyle = int(fCodes.w);
if (fWave > 0.) {
  track = length((vForgePos.xy-fHit.xy)*vec2(1.,1.7));
  spread = smoothstep(track-.105,track+.12,(1.-fWave)*1.34);
  int slot = int(fFinishChange.x)-1;
  if (slot >= 0) {
    if (fFinishChange.y == 2.) ranks[slot] -= 1.-spread;
    else if (fFinishChange.y == 3.) {
      fxStyle = int(fFinishChange.z);
      ranks.w = mix(fFinishChange.w,fLevels.w,spread);
      if (fCodes.w == 0.) visibility.w = 1.-spread;
    } else visibility[slot] = spread;
  }
}
int metalStyle = int(fCodes.x);
vec3 steel = lookSteel(metalStyle,ranks.x,uv,edge,coarse,forgeRough);
steel = mix(vec3(.35,.38,.40),steel,visibility.x);
forgeRough = mix(.32,forgeRough,visibility.x);
steel *= .92 + brush*.038 + coarse*.13;
forgeRough += brush*.022 + (coarse-.5)*.079;
float slag = smoothstep(.43+fRefine*.36,.94,forgeNoise(fp*vec2(49.,91.)+bend));
float inclusions = slag * (1.-fPurity);
steel *= 1.-inclusions*(.38+.40*(1.-fRefine));
// A durable mineral fingerprint remains underneath every forged finish.
vec4 sourceField = mineralField(vec3(0.,st.y*.84-.42,st.x*1.42-.71),fOreFamily,fOreStyle,fOreSeed);
float inheritedGrain = sourceField.x * (.45+.55*fOreTrace);
vec3 sourceBase = fOreTone*(.72+coarse*.18);
steel = mix(steel,sourceBase,metalStyle == 0 ? .72 : .49);
vec3 sourceLight = mix(vec3(.59,.64,.67),fOreTone,.66);
if(fOreFamily < .5) steel = mix(steel,steel*.34,inheritedGrain*.80);
else if(fOreFamily < 1.5) steel = mix(steel,sourceLight*(.36+sourceField.y*.70),.46+inheritedGrain*.18);
else if(fOreFamily < 2.5) steel = mix(steel*.69,fOreTone*(.92+.18*sourceField.z),inheritedGrain*.84);
else if(fOreFamily < 3.5) steel = mix(steel*.74,sourceLight,inheritedGrain*.72);
else steel = mix(steel*.84,sourceLight,inheritedGrain*.61);
float sourceHaze=(1.-fOreClarity)*smoothstep(.30,.74,sourceField.z);
steel=mix(steel,mix(steel*.83,vec3(.40,.43,.45),.18),sourceHaze*.30);
forgeRough += inheritedGrain*.10 + (sourceField.z-.5)*.025 + (1.-fOreClarity)*.085 - fOreClarity*.028;

vec2 relief = vec2(0.);
vec4 special = vec4(0.);
vec3 grind = vec3(0.);
#ifdef BLADE_DECORATION
float rub = smoothstep(.57,.83,coarse + .13*forgeBand(uv.y*40.+uv.x*.72+bend,.063));
float wear = clamp(fWear*rub*(.21+edge*.79) + mark.r*.29 + mark.b*.15,0.,.78);
float seam = 0.;
if (fCodes.y > .5) {
  vec3 base = steel;
  float baseRough = forgeRough;
  relief = lookPattern(int(fCodes.y),ranks.y,uv,coarse,steel,forgeRough,seam)*visibility.y;
  steel = mix(base,steel,visibility.y);
  forgeRough = mix(baseRough,forgeRough,visibility.y);
  seam *= visibility.y;
}
if (fxStyle > 0) {
  float outline = (1.-smoothstep(.024,.18,min(st.y,1.-st.y)))*vForge.z*.78;
  special = lookEffect(fxStyle,ranks.w,uv,max(edge,outline),coarse,seam)*visibility.w;
}
if (fCodes.z > .5) {
  vec3 base = steel;
  float baseRough = forgeRough;
  lookFilm(int(fCodes.z),ranks.z,uv,view,edge,relief,special.a,wear,steel,forgeRough);
  steel = mix(base,steel,visibility.z);
  forgeRough = mix(baseRough,forgeRough,visibility.z);
}
vec2 bladeUv = vec2((st.x-fBladeRoot)/max(.34,1.-fBladeRoot),st.y);
grind = bladeGrind(bladeUv,coarse);
steel *= 1.-grind.x*.18;
steel = mix(steel, steel*.71+vec3(.29,.30,.31), grind.y*(.28+.19*grazing));
forgeRough += grind.x*.077 - grind.y*.039 + wear*.025;
#endif
steel = mix(steel,vec3(.64,.68,.71)*(1.-.22*grazing),edge*(.22+.14*fRefine));
forgeRough = mix(forgeRough, .14+forgeRough*.36, edge*.54);
float pulse = fPulse * exp(-abs(vForgePos.x-fHit.x)*9. - abs(vForgePos.y-fHit.y)*20.);
vec3 aura = mineralAccent(vec3(.28,.67,.86),.27);
vec3 forgeGlow = special.rgb * (1.-.26*max(relief.y,relief.x*.48));
float grain = forgeBand(st.y*31. + st.x*(3.+mark.g*7.) + coarse*.3,.11);
steel *= 1. + mark.r * (.11 + (grain-.36)*.16);
forgeRough -= mark.r*.108;
float crack = forgeBand(st.x*48. + st.y*3.7 + coarse*.44,.065) * mark.b;
steel *= 1.-crack*.73;
forgeRough += mark.b*.22;
vec3 tapHeat = vec3(1.,.24,.047);
forgeGlow += (pulse*.52+fHeat*fHeat*mix(.08,.52,coarse))*tapHeat;
float shock = max(0.,fWave);
if (shock > 0.) forgeGlow += aura * exp(-abs(track-(1.-shock)*1.02)*31.) * shock * .25;
if (fRaw > .5) {
  steel *= .68 + coarse*.50;
  forgeRough += .125 * (1.-fHeat);
}
// Apply the metallurgical result to the completed blade stack so that a
// coat cannot erase it. High quality converges to each finish's own response.
forgeRough = mix(clamp(forgeRough,.118,.73), .78, (1.-fRefine)*.32);
forgeRough += inclusions*(.057+.12*(1.-fRefine));
float forgeHeight = .00047*(grind.z + relief.y*.72 - relief.x*.46) - inclusions*.00058;
float hiltRough = .55, hiltMetal = .13, hiltHeight = 0.;
vec3 hilt = diffuseColor.rgb;
if (fGripStyle > .5) {
#ifdef USE_ROUGHNESSMAP
  vec3 atlas = texture2D(roughnessMap, vRoughnessMapUv).rgb;
#else
  vec3 atlas = vec3(1.,.56,.14);
#endif
  if (grip > .001) hilt = gripFinish(vec2(st.x/max(.17,fBladeRoot),st.y),hilt,atlas,hiltRough,hiltMetal,hiltHeight);
}
diffuseColor.rgb = mix(steel,hilt,grip);
forgeRough = clamp(mix(forgeRough,hiltRough,grip),.118,.81);
forgeMetal = mix(forgeMetal,hiltMetal,grip);
forgeHeight = mix(forgeHeight,hiltHeight,grip);
forgeGlow *= 1.-grip;
`;

export function makeBladeMaterial(original, uniforms, raw) {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    map: raw ? null : original?.map || null,
    normalMap: raw ? null : original?.normalMap || null,
    roughnessMap: raw ? null : original?.roughnessMap || null,
    roughness: .32,
    metalness: .9,
    envMapIntensity: 1.22,
  });
  material.userData.forge = uniforms;
  if (!raw) material.defines = { ...material.defines, BLADE_DECORATION: 1 };
  material.customProgramCacheKey = () => raw ? 'blade-lab-billet-17' : 'blade-lab-looks-17';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = vertexHead + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vertexBody);
    shader.fragmentShader = fragmentHead + geology + bladeLooksGLSL + fittings + shader.fragmentShader
      .replace('#include <map_fragment>', 'if (fGripStyle > .5) {\n#include <map_fragment>\n}')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + body)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = forgeRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = forgeMetal;')
      .replace('#include <normal_fragment_maps>', `
        vec3 meshNormal = normal;
        #include <normal_fragment_maps>
        normal = normalize(mix(meshNormal,normal,mix(.13,.84,grip)));
        normal = rockBump(normal,forgeHeight,vViewPosition);
      `)
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += forgeGlow;');
  };
  uniforms.fRaw.value = raw ? 1 : 0;
  return material;
}

const oreUniformHead = `
uniform float oreSeed, oreReveal, oreGrade, oreHeat, oreFamily, oreMaterial;
uniform float oreVein, oreFlaw, oreLuster, oreDensity, oreCrust, oreRoughness, oreMetalness;
uniform float orePurity, oreWindow, oreLamp, oreExposure, oreClarity, oreTransmission;
uniform vec3 oreTint, oreBaseColor, oreVeinColor, oreCoreColor, oreHostVein;
`;

export function makeOreMaterial(original, uniforms, family = 'river') {
  const material = new T.MeshStandardMaterial({
    color: 0xffffff, roughness: .86, metalness: .13, envMapIntensity: .8,
  });
  material.customProgramCacheKey = () => 'bladelab-mineral-flashlight-shell-10';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vOre; varying vec3 vOreView;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvOre = position; vOreView=(modelViewMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + geology + oreUniformHead +
      'varying vec3 vOre; varying vec3 vOreView;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vOre;
      vec3 v=p+vec3(oreSeed*7.,oreSeed*3.,oreMaterial*.29);
      float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
      float grain=mineralNoise3(v*52.);
      float micro=mineralNoise3(v*138.);
      float weather=mineralNoise3(v*3.1);
      float pore=smoothstep(.67,.86,grain)*(1.-oreDensity*.68);
      float crack=(1.-smoothstep(.010,.031,abs(weather-.49)))*smoothstep(.46,.66,n)*oreFlaw;
      // Mineral appears only in a few broken windows through the weathered host.
      float glancing=pow(1.-abs(dot(normalize(vNormal),normalize(vViewPosition))),1.7);
      float revealAngle=oreExposure<.4 ? mix(.17,1.35,glancing) : 1.;
      float exposurePatch=smoothstep(.53,.71,n)*(1.-oreCrust*.59)*oreExposure*revealAngle;
      float exposed=exposurePatch*(.18+.62*oreVein);
      float glint=smoothstep(.80,.96,grain)*oreLuster*exposed;
      vec3 stone=oreBaseColor*(.61+n*.60+(grain-.5)*.22+(micro-.5)*.08);
      if(oreFamily < .5) stone=mix(stone,oreBaseColor*.57,smoothstep(.61,.77,weather)*.25);
      else if(oreFamily < 1.5) stone=mix(stone,oreVeinColor*(.64+grain*.32),smoothstep(.53,.75,grain)*exposurePatch*.70);
      else if(oreFamily < 2.5) stone=mix(stone,oreHostVein*.57,smoothstep(.55,.72,weather)*.29);
      else if(oreFamily < 3.5) stone*=.77+grain*.28;
      else stone=mix(stone,oreHostVein*.51,smoothstep(.49,.76,weather)*.30);
      vec3 outcrop=mix(oreCoreColor*(.67+grain*.32),oreVeinColor,.22*(1.-oreClarity));
      stone=mix(stone,outcrop,clamp(exposed*1.6,0.,.92));
      stone*=1.-crack*.51-pore*.17;
      float window=(1.-smoothstep(.17,.235,length((p.xy-vec2(.12,.08))*vec2(1.,1.15))))*smoothstep(.15,.35,p.z)*oreWindow;
      float presence=smoothstep(.74-orePurity*.50,.91-orePurity*.45,n);
      // The extra field is evaluated only for an actual scraped window.
      vec4 deposit=vec4(0.,n,grain,0.);
      if(oreWindow>.5)deposit=mineralField(p,oreFamily,oreMaterial,oreSeed);
      vec3 polished=mix(oreBaseColor*.63,oreCoreColor*(.60+.46*deposit.y),presence);
      polished=mix(polished,oreVeinColor*.88,deposit.x*.37);
      float windowMilk=(1.-oreClarity)*smoothstep(.28,.77,weather);
      polished=mix(polished,mix(oreCoreColor,vec3(.55),.45),windowMilk*.56);
      stone=mix(stone,polished,window);
      float lampDistance=length((vOreView.xy-vec2(.16,.09))*vec2(1.,1.08));
      float lampBeam=1.-smoothstep(.35,.66,lampDistance);
      float lampCore=exp(-pow(lampDistance/.22,2.));
      float lampHalo=exp(-pow((lampDistance-.30)/.20,2.));
      float scatter=oreTransmission*(.55+.45*weather);
      stone=mix(stone,oreCoreColor*(.65+.35*n),oreLamp*lampBeam*scatter*.32);
      diffuseColor.rgb=stone;
      float oreM=mix(clamp(oreMetalness+exposed*.33+glint*.20,.06,.65),mix(.19,.12,oreClarity),window);
      float oreR=mix(clamp(oreRoughness+pore*.07-exposed*.28-glint*.18,.35,.98),mix(.47,.12,oreClarity),window);
      oreR=clamp(oreR-oreLamp*lampBeam*.12,.18,.98);
      float rockHeight=((micro-.5)*.00045+(grain-.5)*.004-crack*.005-pore*.003)*(1.-window*.92);
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = oreR;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = oreM;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = rockBump(normal,rockHeight,vViewPosition);')
      .replace('#include <emissivemap_fragment>', `
        totalEmissiveRadiance += oreCoreColor*oreLamp*scatter*(lampBeam*.52+lampHalo*.34)
          + vec3(1.,.94,.76)*oreLamp*lampCore*.46
          + vec3(.91,.15,.022)*oreHeat*oreHeat*(.08+crack*.27);
      `);
  };
  return material;
}

export function makeMeltMaterial(uniforms) {
  const material = new T.MeshStandardMaterial({ color: 0xff7730, roughness: .3, metalness: .62, envMapIntensity: .85 });
  material.customProgramCacheKey = () => 'blade-lab-molten-failure-3';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec3 vMelt;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMelt = position;');
    shader.fragmentShader = `uniform float meltClock, meltHeat, meltClean, meltFailed, meltSeed;
      uniform vec3 meltTint;
      varying vec3 vMelt;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p = vMelt;
      float flow = sin(p.y*18.+meltSeed*7.+sin(p.x*13.+meltClock*2.)*1.55+sin(p.z*21.-meltClock*1.7)*1.18);
      float currents = sin(p.x*31.+sin(p.z*12.+p.y*7.)*2.4+meltClock*.65) * .32 + flow*.68;
      float dross = smoothstep(.04,.77,currents) * (1.-meltClean*.92);
      float crust = smoothstep(.56,.94,sin(p.x*53.+p.y*29.)*sin(p.z*41.-p.y*37.));
      vec3 heat = mix(vec3(.23,.018,.005),vec3(.92,.29,.044),meltHeat);
      diffuseColor.rgb = mix(heat*(1.-dross*.91),meltTint,.09)*(1.-crust*dross*.47);
      vec3 deadSlag = mix(vec3(.065,.073,.077),vec3(.19,.18,.16),smoothstep(-.8,.8,currents))*(.86+crust*.14);
      diffuseColor.rgb = mix(diffuseColor.rgb,deadSlag,meltFailed);
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.3,.93,meltFailed);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = mix(.62,.14,meltFailed);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vec3(1.,.18,.018) * meltHeat * (.19 + .98*(1.-dross)) * (1.-meltFailed);');
  };
  return material;
}

export function makeCutMaterial(uniforms) {
  const material = new T.MeshPhysicalMaterial({
    color: 0xffffff, roughness: .37, metalness: .25, envMapIntensity: 1.05, side: T.DoubleSide,
    clearcoat:.9, clearcoatRoughness:.12, ior:1.47,
  });
  material.customProgramCacheKey = () => 'bladelab-mineral-optical-section-8';
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = fragmentHead.slice(fragmentHead.indexOf('float forgeHash')) + geology + oreUniformHead + `
      varying vec3 vSection;
      varying float vCutRim;
    ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 p=vSection;
      vec4 deposit=mineralField(p,oreFamily,oreMaterial,oreSeed);
      vec3 v=p+vec3(oreSeed*7.,oreSeed*3.,oreMaterial*.29);
      float quality=clamp(oreGrade*.5,0.,1.);
      float n=mineralNoise3(v*4.7)*.72+mineralNoise3(v*11.3)*.28;
      float cloud=mineralNoise3(v*3.1);
      float presence=smoothstep(.73-orePurity*.47,.89-orePurity*.43,n);
      presence=clamp(.20+presence*(.40+quality*.46)+deposit.x*(.14+quality*.14),0.,1.);
      vec3 matrixRock=oreBaseColor*(.48+.39*n+.12*deposit.z);
      vec3 mineral=oreCoreColor*(.59+.43*deposit.y);
      if(oreFamily < .5) mineral=mix(mineral*.69,oreVeinColor,deposit.x*.66);
      else if(oreFamily < 1.5) mineral=mix(oreCoreColor*.44,oreVeinColor,.12+deposit.y*.78);
      else if(oreFamily < 2.5) mineral=mix(oreCoreColor*.43,oreCoreColor*1.10,deposit.x*.81+cloud*.14);
      else if(oreFamily < 3.5) mineral=mix(mineral*.67,oreVeinColor*.95,deposit.x*.79);
      else mineral=mix(oreCoreColor*.58,oreVeinColor,deposit.x*.58);
      // Clear deposits have a saturated inner layer beneath the polished face;
      // cloudy deposits contain soft, opaque inclusions. Optical clarity is not grade.
      vec2 viewShift=normalize(vViewPosition).xy*oreClarity*.095;
      float innerGrain=mineralNoise3(v*7.8+vec3(viewShift,oreClarity*.34));
      vec3 deepMineral=oreCoreColor*(.38+.68*innerGrain);
      mineral=mix(mineral,deepMineral,oreClarity*.45);
      float milk=(1.-oreClarity)*smoothstep(.24,.73,cloud*.65+deposit.z*.35);
      mineral=mix(mineral,mix(oreCoreColor*.85,vec3(.56,.58,.57),.42),milk*.75);
      vec3 core=mix(matrixRock,mineral,presence);
      float saw=sin(p.z*780.+p.y*.8)*(1.-smoothstep(.8,3.0,fwidth(p.z*780.)));
      core*=.985+saw*.009;
      float flaws=deposit.w*oreFlaw*(1.-orePurity)*.45;
      core*=1.-flaws;
      float rim=smoothstep(.06,.96,vCutRim);
      core=mix(core,oreBaseColor*(.40+.19*n),rim);
      diffuseColor.rgb=core;
      float cutMetal=mix(.13+presence*(.32-oreClarity*.19)+deposit.x*.07,.08,rim);
      float cutRough=mix(.70-presence*(.22+oreClarity*.28)-quality*.03+flaws*.2,.91,rim);
      float cutHeight=(deposit.z-.5)*.0004+flaws*.001+rim*.001;
    `).replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cutRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cutMetal;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = rockBump(normal,cutHeight,vViewPosition);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\nmaterial.clearcoat=oreClarity*presence*(1.-rim)*.9; material.clearcoatRoughness=mix(.35,.06,oreClarity);');
    shader.vertexShader = 'varying vec3 vSection;\nattribute float cutRim;\nvarying float vCutRim;\n' +
      shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvSection = position; vCutRim = cutRim;');
  };
  return material;
}
