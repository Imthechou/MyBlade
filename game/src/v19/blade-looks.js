import { LOOKS } from './forge.js';

export const lookCodes = Object.fromEntries(Object.entries(LOOKS).map(([slot, names]) =>
  [slot, Object.fromEntries(Object.keys(names).map((id, index) => [id, index]))]));

const { metal, pattern, film, fx } = lookCodes;

// The shader uses length and local width along the blade, so a layout wraps
// around each knife model without changing its seed when the model changes.
export const bladeLooksGLSL = `
uniform vec4 fMetalLayout, fPatternLayout, fFilmLayout, fFxLayout;
uniform vec3 fOreCore;
uniform float fBladeRoot;
const float forgeTurn = 6.2831853;

vec2 lookPoint(vec2 uv, vec4 variant) {
  float x = uv.x - variant.x;
  float drift = (variant.w - .5) * .16;
  return vec2(x * variant.z, uv.y - .5 + x * variant.y + drift);
}

float lookLine(float distance, float width) {
  float soft = max(fwidth(distance) * .66, .002 + (1. - fRefine) * .009);
  return 1. - smoothstep(width, width + soft, abs(distance));
}

vec3 mineralAccent(vec3 color, float amount) {
  float peak = max(fOreCore.r, max(fOreCore.g, fOreCore.b));
  vec3 tint = fOreCore / max(.29, peak);
  return mix(color, tint, amount * (.76 + .24 * fOreClarity));
}

vec3 lookSteel(int style, float tier, vec2 uv, float edge, float coarse, inout float rough) {
  vec2 p = lookPoint(uv, fMetalLayout);
  float mid = step(1.5, tier), high = step(2.5, tier);
  float glint = .5 + .5 * sin(p.x * 7.5 + fMetalLayout.w * forgeTurn);
  if (style == ${metal.silver}) {
    float polish = 1.-smoothstep(.12,.48,abs(p.y));
    float sheen = lookLine(p.y + .11*sin(p.x*9.),.094);
    rough = .230 - mid*.044 - high*(edge*.032+sheen*.034) + (1.-polish)*.034;
    return vec3(.60,.65,.71) * (.93+glint*(.075+mid*.064)+high*(edge*.14+sheen*.13));
  }
  if (style == ${metal.pearl}) {
    float satin = smoothstep(.04, .51, abs(p.y));
    float bead = smoothstep(.22,.78,coarse+.16*forgeBand(uv.y*35.+p.x*2.,.084));
    rough = .375+.102*satin+.043*bead-mid*.040-high*edge*.080;
    return mix(vec3(.39,.53,.62),vec3(.73,.80,.83),(1.-satin)*.63+high*edge*.26) * (.90+.16*bead);
  }
  if (style == ${metal.gunmetal}) {
    float silk = forgeBand(uv.y*22. + p.x*1.6 + fMetalLayout.w, .14);
    float bevel = forgeBand((uv.y-p.x*.61)*32.,.095)*max(edge,.62*smoothstep(.65,.93,uv.y));
    rough = .325+(silk-.45)*(.073+.052*mid)-bevel*.093*high;
    return mix(vec3(.15,.22,.31),vec3(.34,.44,.54),silk*(.24+.32*mid)+bevel*.28*high);
  }
  if (style == ${metal.obsidian}) {
    float rim = max(edge,smoothstep(.77,.99,uv.y));
    float glass = lookLine(p.y+p.x*.25+.09*sin(p.x*8.),.07);
    rough = .199-glint*.022-mid*.030-high*rim*.034+glass*.049;
    return mix(vec3(.061,.051,.091),vec3(.40,.37,.51),rim*(.18+.38*high)+glass*.19*mid);
  }
  if (style == ${metal.copper}) {
    float dents = smoothstep(.27,.73,forgeNoise(vec2(p.x*26.,p.y*12.)+fMetalLayout.w*19.));
    float burnish = 1.-smoothstep(.07,.29,abs(p.y-p.x*.27+.06));
    float hammer = forgeBand(p.x*17.+p.y*2.8+dents*.94,.125);
    rough = .304+dents*.071+hammer*.037-mid*.047-high*burnish*.089;
    return mix(vec3(.43,.185,.080),vec3(.84,.493,.21),dents*(.33+.12*mid)+burnish*high*.29)*(.94+.10*hammer);
  }
  rough = .32;
  return vec3(.35,.38,.40) * (.95+.10*coarse);
}

#ifdef BLADE_DECORATION
vec2 lookWeb(vec2 p) {
  float angle = atan(p.y, p.x + .00001);
  float distance = length(p);
  float rings = forgeBand(distance*9. + abs(sin(angle*3.5))*.17, .06);
  float spokes = lookLine(sin(angle*3.5)*distance,.010);
  return vec2(max(rings,spokes),distance);
}

vec2 lookHex(vec2 p) {
  const vec2 lattice = vec2(1.,1.73205);
  vec2 a = mod(p,lattice)-lattice*.5;
  vec2 b = mod(p-lattice*.5,lattice)-lattice*.5;
  vec2 local = dot(a,a)<dot(b,b) ? a : b;
  float rim = max(abs(local.x),dot(abs(local),vec2(.5,.866025)));
  return vec2(rim,forgeHash(floor((p-local)*2. + .25)));
}

vec2 lookDot(vec2 p, float seed, float radius) {
  vec2 cell = floor(p);
  float hash = forgeHash(cell+seed*23.);
  vec2 center = vec2(hash,forgeHash(cell+vec2(seed*11.,13.)));
  float d = length(fract(p)-mix(vec2(.27),vec2(.73),center));
  return vec2(lookLine(d,radius),hash);
}

vec2 lookPattern(int style, float tier, vec2 uv, float coarse, inout vec3 steel, inout float rough, out float seam) {
  vec2 p = lookPoint(uv, fPatternLayout);
  float phase = fPatternLayout.w * forgeTurn;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float ink = 0., foil = 0.;
  vec3 dark = steel*.22, bright = mineralAccent(vec3(.67,.73,.79),.18);
  seam = 0.;

  if (style == ${pattern.damascus}) {
    float bend = sin(p.x*7.+phase)*.68+sin(p.x*16.-phase)*.27;
    float flow = p.y*(4.45+.67*fPatternLayout.w)+bend+(coarse-.5)*.19;
    float crossFlow = p.y*7.1 - sin(p.x*6.+phase)*.80 + p.x*2.9;
    float whirl = length(p*vec2(1.,.56))*11. + atan(p.y*.56,p.x+.00001)*.52;
    flow = mix(flow,whirl,high*(1.-smoothstep(.09,.22,length(p*vec2(1.,.64)))));
    ink = max(smoothstep(.13,.67,cos(flow*forgeTurn))*.82,forgeBand(crossFlow,.075)*mid*.69);
    float folded = max(forgeBand(flow-.31,.090),forgeBand(flow+.19,.052)*.60);
    foil = max(folded,forgeBand(crossFlow-.27,.069)*mid*.79);
    dark = steel*.18;
  } else if (style == ${pattern.crystal}) {
    vec2 cell = vec2(p.x*6.3+p.y*2.1,p.x*2.2-p.y*4.6)+coarse*.24;
    float shard = forgeHash(floor(cell));
    float strip = mid*(1.-smoothstep(.14,.25,abs(p.y+.65*p.x-.06)));
    float bevel = forgeBand(cell.x+cell.y+shard*.66,.058);
    float cut = max(forgeBand(cell.x+.5,.032),forgeBand(cell.y+.5,.033));
    float splinter = max(forgeBand(cell.x*2.9+.5,.043),forgeBand(cell.y*2.1+.5,.040));
    ink = mix(.22+.69*shard, .28+.53*forgeHash(floor(cell*2.8)), strip*.73);
    foil = max(cut*.85+bevel*.26,splinter*strip*.80) + (1.-smoothstep(.21,.55,shard))*.54 + high*forgeBand(cell.y+.38,.065)*.66;
    dark = mix(steel*.20,mineralAccent(vec3(.06,.13,.22),.27),.58);
    bright = mineralAccent(vec3(.48,.72,.88),.23);
  } else if (style == ${pattern.ember}) {
    float channel = p.y + sin(p.x*10.+phase)*.18 + sin(p.x*23.-phase)*.067;
    float fork = channel + p.x*.49 + .11*sin(p.x*17.+phase);
    seam = max(lookLine(channel,.049),lookLine(fork,.028)*smoothstep(-.37,.09,p.x));
    seam = max(seam,mid*lookLine(p.y-.26*sin(p.x*13.+phase),.033)*smoothstep(.16,.47,coarse));
    foil = max(seam,high*lookLine(channel-.109,.032)*.74);
    ink = max(.34+.43*smoothstep(.22,.73,coarse),lookLine(channel,.107)*.95);
    foil = max(foil,lookLine(abs(channel)-.084,.021)*(.25+.32*mid));
    dark = mix(steel*.24,vec3(.092,.052,.049),.54);
    bright = mineralAccent(vec3(.78,.195,.063),.14);
  } else if (style == ${pattern.nebula}) {
    float ribbon = p.y-p.x*.67-.16*sin(p.x*8.+phase);
    float cloud = 1.-smoothstep(.22,.41,abs(ribbon));
    vec2 sand = lookDot(vec2(uv.x*34.,uv.y*12.),fPatternLayout.w,.22);
    float core = 1.-smoothstep(.07,.28,abs(ribbon-.04));
    ink = cloud*(.66+.17*coarse+core*mid*.15);
    foil = sand.x*step(.51-mid*.12,sand.y)*cloud*(.53+.47*core);
    foil = max(foil, high*lookLine(ribbon+.18+.10*sin(p.x*15.),.024)*.82);
    dark = mineralAccent(vec3(.08,.074,.19),.30)*.55;
    bright = mineralAccent(vec3(.67,.57,.89),.27);
  } else if (style == ${pattern.feather}) {
    float axis = p.y + .05*sin(p.x*8.+phase);
    float feather = p.x*9.5 - abs(axis)*(3.4 + mid*smoothstep(-.06,.17,axis)*2.9) + axis*axis*2.4;
    ink = smoothstep(.22,.88,cos(feather*forgeTurn))*.90;
    foil = max(forgeBand(feather-.29,.112),lookLine(axis,.029)*(.38+.57*high));
    foil = max(foil,high*forgeBand(feather*2.14+.17,.078)*smoothstep(.20,.62,ink)*.72);
    bright = mineralAccent(vec3(.73,.80,.72),.21);
  } else if (style == ${pattern.scales}) {
    float count = 1. + mid*smoothstep(.48,.93,uv.x)*.50;
    vec2 cell = vec2(p.x*7.2,uv.y*3.45)*count;
    cell.x += mod(floor(cell.y),2.)*.5;
    vec2 scale = fract(cell)-vec2(.5,-.08);
    float rim = length(scale*vec2(1.,.60))-.44;
    ink = (1.-smoothstep(-.19,.015,rim))*(.62+.28*scale.y);
    foil = max(lookLine(rim,.048),high*lookLine(rim+.111,.039)*.79);
    bright = mineralAccent(vec3(.53,.76,.77),.22);
  } else if (style == ${pattern.fan}) {
    vec2 origin = p+vec2(.13,.65);
    float ray = atan(origin.x,origin.y)*(4.3+fPatternLayout.w*1.52);
    float fan = smoothstep(.14,.85,cos(ray*forgeTurn));
    float twinRay = atan(p.x-.28, .68-p.y)*6.4;
    float twin = forgeBand(twinRay,.126)*smoothstep(-.16,.27,p.x)*mid;
    ink = max(fan*.76,twin*.86);
    foil = max(forgeBand(ray-.24,.098),twin*.65);
    float crest = abs(p.x-.18)*1.7+abs(p.y+.09)*.85;
    ink = max(ink,high*(1.-smoothstep(.10,.19,crest))*.83);
    foil = max(foil,high*lookLine(crest-.167,.044));
    foil = max(foil,mid*forgeBand(ray*2.0-.21,.045)*fan*.43);
    bright = mineralAccent(vec3(.78,.65,.42),.20);
  } else if (style == ${pattern.web}) {
    vec2 lattice = lookWeb(p*vec2(1.,.60));
    vec2 second = lookWeb((p-vec2(p.x<0.?-.38:.38,.29))*vec2(1.,.64));
    ink = max(lattice.x*(1.-smoothstep(.36,.67,lattice.y)),mid*second.x*.74);
    foil = lattice.x*.43+mid*second.x*.26+high*max(lattice.x*second.x,lookLine(lattice.y-.27,.032)*lattice.x);
    dark = mix(steel*.16,vec3(.10,.06,.11),.28);
    bright = mineralAccent(vec3(.61,.55,.74),.16);
  } else if (style == ${pattern.rings}) {
    float r = length((p+vec2(.10,-.04))*vec2(1.2,.68))*9.1 + coarse*.37;
    float knot = length((p-vec2(.34,.19))*vec2(1.37,.74));
    r = mix(r,knot*12.3+coarse*.15,mid*(1.-smoothstep(.19,.30,knot)));
    ink = smoothstep(.16,.86,cos(r*forgeTurn))*.82;
    foil = max(forgeBand(r+.24,.102),high*forgeBand(r*2.03+.28,.071)*.67);
    dark = mix(steel*.34,mineralAccent(vec3(.15,.094,.064),.31)*.64,.44);
    bright = mineralAccent(vec3(.66,.48,.29),.25);
  } else if (style == ${pattern.braid}) {
    float wave = sin(p.x*17.2+phase)*.215;
    float strandA = lookLine(p.y-wave,.126), strandB = lookLine(p.y+wave,.126);
    float overlap = min(strandA,strandB);
    float crossing = smoothstep(-.24,.24,cos(p.x*17.2+phase));
    ink = .76*(1.-max(strandA,strandB))+overlap*.46;
    float left = lookLine(p.y-wave-.047,.063)*(1.-overlap*crossing*.79);
    float right = lookLine(p.y+wave+.047,.059)*(1.-overlap*(1.-crossing)*.79);
    foil = max(left,right);
    foil = max(foil,mid*lookLine(p.y+.045*sin(p.x*34.+phase),.023)*.60);
    foil = max(foil,high*lookLine(abs(p.y)-.34-.041*sin(p.x*38.),.036)*.85);
  } else if (style == ${pattern.strata}) {
    float slab = p.x*5.3 + p.y*.69 + floor((p.y+.55)*3.)*.39 + coarse*.18;
    float cut = forgeBand(slab,.069);
    float facet = forgeHash(vec2(floor(slab+.5),floor(p.y*3.+1.5)));
    ink = max(cut,facet*.65);
    foil = (1.-smoothstep(.23,.62,facet))*.36 + mid*forgeBand(slab-.148,.057)+high*smoothstep(.50,.77,facet)*.70;
    dark = mix(steel*.24,vec3(.10,.125,.16),.46);
    bright = mineralAccent(vec3(.71,.65,.59),.24);
  } else if (style == ${pattern.honeycomb}) {
    vec2 hex = lookHex(vec2(p.x*10.,p.y*4.3)*(1.+mid*(1.-smoothstep(.07,.42,uv.y))*.68));
    float inset = 1.-smoothstep(.42,.56,abs(p.y+p.x*.66));
    ink = inset*max(smoothstep(.37,.49,hex.x)*.91,hex.y*.41);
    foil = inset*(lookLine(hex.x-.334,.041)*.84+high*step(.57,hex.y)*(1.-smoothstep(.23,.37,hex.x))*.79);
    bright = mineralAccent(vec3(.72,.67,.49),.18);
  }

  ink = clamp(ink,0.,1.);
  foil = min(1.,foil);
  steel = mix(steel,dark,ink*(.76+.12*fRefine));
  steel = mix(steel,bright,foil*(.62+.10*fRefine));
  rough += ink*.142 - foil*.097;
  return vec2(ink,foil);
}

void lookFilm(int style, float tier, vec2 uv, float view, float edge, vec2 relief, float focus, float wear, inout vec3 steel, inout float rough) {
  vec2 p = lookPoint(uv, fFilmLayout);
  float phase = fFilmLayout.w * forgeTurn;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float cover = 1., gloss = .19, inherit = .16;
  vec3 coat = steel;

  if (style == ${film.oxide}) {
    float temper = abs(p.x + sin(p.y*7.+phase)*.13)-.21;
    if (fFilmLayout.x < .39) temper = uv.y-.40+.11*sin(uv.x*10.+phase);
    if (fFilmLayout.x > .62) temper = .53-uv.x+.12*sin(p.y*8.+phase);
    temper += .025*cos(p.x*24.-p.y*16.);
    float blue = 1.-smoothstep(-.063,.048,temper);
    float island = mid*lookLine(temper-.15+.035*sin(p.y*22.),.042);
    coat = mix(vec3(.52,.259,.090),vec3(.046,.214,.61),blue);
    float violet = lookLine(temper-.015-view*.06,.035);
    coat = mix(coat,vec3(.34,.105,.51),violet*(.47+.42*high));
    coat = mix(coat,vec3(.82,.53,.22),island*.71);
    cover = .61+.39*max(blue,island);
    gloss = mix(.37,.174,blue) - violet*.047;
  } else if (style == ${film.doppler}) {
    float tide = sin(p.x*9.2 + sin(p.y*4.5+phase)*1.46 + p.y*.9 + .20*cos(p.x*21.+p.y*9.));
    float phaseTone = smoothstep(.12,.87,fFilmLayout.w);
    vec3 jewel = mix(vec3(.48,.073,.28),vec3(.13,.255,.63),phaseTone);
    coat = mix(vec3(.029,.045,.140),jewel,smoothstep(-.48,.60,tide));
    float current = lookLine(tide-.19-view*.17,.20);
    float island = (1.-smoothstep(.18,.66,abs(tide+view*1.15-.60)))*(.48+.52*smoothstep(.03,.32,view+.09*uv.y));
    vec3 flare = mix(vec3(.54,.21,.54),vec3(.065,.54,.60),phaseTone);
    coat = mix(coat,flare,max(current*(.16+.42*mid),high*island*.87));
    gloss = .168-current*.036-high*island*.031;
  } else if (style == ${film.rainbow}) {
    float center = p.y - sin(p.x*6.+phase)*.19;
    float prism = uv.x*5.5 + uv.y*2.3 + view*5.5 + phase*.47;
    prism += mid*smoothstep(-.09,.13,p.x)*1.30 + high*smoothstep(.02,.22,p.y)*(1.75+view*4.);
    float ribbon = 1.-smoothstep(.16,.43,abs(center));
    coat = vec3(.31) + (.19+.09*ribbon)*cos(prism+vec3(0.,2.094,4.188));
    cover = .24+.70*ribbon;
    gloss = mix(.34,.143,ribbon);
  } else if (style == ${film.gold}) {
    float sunset = uv.x + (.5-fFilmLayout.x)*.52 + .034*sin(phase) + p.y*(.12+.39*mid);
    coat = mix(vec3(.21,.061,.27),vec3(.65,.128,.079),smoothstep(.02,.54,sunset));
    coat = mix(coat,vec3(.86,.51,.126),smoothstep(.37,.94,sunset));
    float lightline = lookLine(sunset-.63-view*.27,.074);
    coat += vec3(.22,.17,.062)*lightline*(.24+.76*high);
    cover = .83+.17*smoothstep(.21,.72,sunset);
    gloss = .218-lightline*.066;
  } else if (style == ${film.silverline}) {
    float track = p.y+p.x*.22 - sin(p.x*7.+phase)*.082 - (view-.12)*.39;
    float mirror = lookLine(track,.066);
    mirror = max(mirror,mid*lookLine(track+.26,.052)*.84);
    mirror = max(mirror,high*lookLine(track+(uv.x-.62)*.96,.062)*smoothstep(.44,.75,uv.x));
    float hairline = lookLine(track-.088,.014);
    coat = mix(vec3(.115,.17,.25),vec3(.75,.85,.92),max(mirror,hairline*.71));
    cover = .27+.73*max(mirror,hairline*.79);
    gloss = mix(.39,.114,mirror);
    inherit = .10;
  } else if (style == ${film.nacre}) {
    float ribbon = p.y-.19*sin(p.x*5.+phase)+(view-.13)*.27;
    float pearl = 1.-smoothstep(.09,.42,abs(ribbon));
    float rim = lookLine(abs(ribbon)-.22,.080);
    vec3 pearlTint = mix(vec3(.76,.47,.62),vec3(.40,.71,.69),smoothstep(.07,.42,view+.10*p.x));
    coat = mix(vec3(.32,.44,.47),vec3(.70,.66,.62),pearl);
    coat = mix(coat,pearlTint,rim*(.38+.24*mid));
    float innerPearl = lookLine(ribbon-.084+view*.30,.12)*high;
    coat = mix(coat,mineralAccent(vec3(.70,.52,.64),.38),innerPearl*(.50+.42*smoothstep(.04,.39,view)));
    cover = .38+.62*max(pearl,rim);
    gloss = .360-.096*pearl-.035*rim;
  } else if (style == ${film.peacock}) {
    float tilt = uv.y*.62 + view*(1.32+mid*.65) + p.x*.27;
    tilt += mid*sin(p.x*10.+phase)*.12;
    tilt += high*(smoothstep(.10,.28,uv.y)-.5)*(.46-view*.63);
    float flip = smoothstep(.36,.62,tilt);
    float iridescence = lookLine(tilt-.49,.073);
    coat = mix(vec3(.68,.405,.082),vec3(.037,.354,.294),flip);
    coat = mix(coat,vec3(.092,.51,.54),iridescence*(.26+.43*high));
    gloss = mix(.218,.164,flip)+iridescence*.037;
    cover = .93;
  } else if (style == ${film.smoke}) {
    float band = p.y-p.x*.36+(view-.16)*.56;
    float window = mid*lookLine(band,.096);
    float silver = max(edge*.83,high*lookLine(band-.16,.076)*.89);
    float smoky = 1.-smoothstep(.08,.44,abs(band+.073));
    coat = mix(vec3(.039,.043,.065),vec3(.25,.33,.44),max(window*.67,silver));
    coat += smoky*vec3(.036,.022,.070);
    cover = .71+.15*(1.-smoothstep(.23,.51,abs(band)))+.14*silver;
    gloss = .169 - silver*.048 + smoky*.057;
  } else if (style == ${film.verdigris}) {
    vec2 cell = vec2(p.x*8.9,p.y*3.6)+phase;
    float patina = forgeNoise(cell)*.78 + forgeNoise(cell*3.1)*.22;
    float island = smoothstep(.42,.59,patina);
    float rim = lookLine(patina-.53,.060);
    coat = mix(vec3(.058,.33,.226),vec3(.58,.267,.091),island);
    coat = mix(coat,vec3(.16,.47,.31),rim*mid*.59);
    coat += vec3(.31,.151,.047)*rim*high*(.36+.64*smoothstep(.08,.55,view+.12));
    gloss = mix(.49,.196,island);
    cover = .81+.13*island;
  } else if (style == ${film.ceramic}) {
    float boundary = p.y + p.x*.28 + .19 + .032*sin(p.x*19.+phase);
    float porcelain = smoothstep(-.043,.030,boundary);
    cover = porcelain*(.84 + high*.13*smoothstep(.06,.35,boundary));
    cover -= mid*lookLine(boundary-.017,.042)*.27*porcelain;
    coat = mix(vec3(.40,.55,.65),vec3(.73,.75,.73),smoothstep(.035,.26,boundary));
    gloss = .45 - .131*lookLine(boundary-.038,.037);
    inherit = .09;
  } else if (style == ${film.satin}) {
    float bevel = max(edge,1.-smoothstep(.17,.29,uv.y + p.x*.082));
    float spine = mid*smoothstep(.75,.95,uv.y);
    float shine = max(bevel,spine*.64);
    float silk = forgeBand(uv.y*27.+p.x*.71,.119);
    coat = mix(vec3(.16,.24,.32)*(1.+silk*.15),vec3(.70,.75,.79),shine);
    float seam = lookLine(uv.y-.34-p.x*.13 + view*.28,.070);
    coat += high*vec3(.24,.23,.20)*max(seam*.91,mix(view,1.-view,bevel)*.46);
    cover = .63 + .37*shine;
    gloss = mix(.47-silk*.05,.119,shine);
  } else if (style == ${film.halo}) {
    float outer = length(p*vec2(1.,.57));
    float inner = length((p-vec2(.29,-.13))*vec2(1.,.64));
    float ring = max(lookLine(outer-.234,.052),lookLine(outer-.131,.037)*.72);
    float companion = mid*lookLine(inner-.169,.044);
    float hue = outer*23.+phase+view*(4.1+high*5.);
    coat = vec3(.36)+.26*cos(hue+vec3(0.,2.094,4.188)+high*companion*1.6);
    cover = .11 + .87*max(ring,companion);
    gloss = .278-.103*ring;
  }

  coat = mineralAccent(coat, inherit) * (1. - relief.x*.56);
  // The color film thins over both bright engraving and dark cut grooves.
  float etching = max(relief.y,relief.x*.57);
  float blend = clamp(cover*(.65+.07*mid+.052*high)*(1.-focus*.27)*(1.-etching*.52)*(1.-wear*.75),0.,.77);
  steel = mix(steel,coat,blend);
  rough = mix(rough,gloss+relief.x*.084-relief.y*.041,blend);
}

vec4 lookEffect(int style, float tier, vec2 uv, float edge, float coarse, float seam) {
  vec2 p = lookPoint(uv, fFxLayout);
  float phase = fFxLayout.w*forgeTurn;
  float time = fClock*(.78+.24*fFxLayout.z)+fFxLayout.w;
  float mid = step(1.5,tier), high = step(2.5,tier);
  float motif = 0., motion = 0., accent = 0., inherit = .33;
  vec3 light = vec3(.20,.69,1.);
  float sweep = .5+.5*cos((uv.x-time*.58)*forgeTurn + phase);
  float wash = smoothstep(.32,.96,sweep);
  float runner = smoothstep(.71,.99,sweep);

  if (style == ${fx.edge}) {
    float span = smoothstep(.07,.21,uv.x)*(1.-smoothstep(.81,.99,uv.x));
    float edgeLight = edge*edge;
    motif = edgeLight*mix(span,1.,mid);
    motion = edgeLight*(wash*.37 + runner*.54) + mid*lookLine(uv.y-.16,.023)*runner*.32;
    accent = high*lookLine(uv.y-.20-.040*sin(uv.x*8.+phase),.021)*(1.-wash)*span;
    light = vec3(.22,.81,1.);
  } else if (style == ${fx.ember}) {
    float fissure = p.y+.21*sin(p.x*10.4+phase)+.062*sin(p.x*26.);
    float fire = max(seam,lookLine(fissure,.028));
    motif = max(fire*.77,mid*lookLine(fissure-p.x*.60-.095,.027)*.68);
    motion = motif*(.19+.52*wash+.24*runner);
    vec2 mote = lookDot(uv*vec2(31.,10.),fFxLayout.w,.18);
    float spark = mote.x*step(.57,mote.y)*lookLine(fissure,.14)*smoothstep(.18,.98,.5+.5*cos(time*3.7+mote.y*21.));
    accent = max(spark*(.36+.62*high),high*lookLine(fissure-.059,.020)*runner);
    light = mix(vec3(1.,.142,.035),vec3(1.,.53,.12),.48*runner+.22*spark);
    inherit = .14;
  } else if (style == ${fx.aurora}) {
    float path = p.y + sin(p.x*8.+phase)*.21;
    float stream = lookLine(path,.068+.031*mid);
    float tail = fract(time*.41+fFxLayout.w-uv.x);
    float head = min(tail,1.-tail);
    motif = stream * (.45+.55*(1.-smoothstep(.32,.65,abs(p.x))));
    motion = (stream*.44 + lookLine(path,.025)*.62)*exp(-head*(12.-4.*mid));
    float taper = 1.-smoothstep(.21,.52,abs(p.x));
    float ribbon = lookLine(path-.153-.061*sin(p.x*9.+phase),.052)*taper;
    accent = high*ribbon*(.38+.62*exp(-head*5.));
    light = mix(vec3(.115,.78,.88),vec3(.75,.23,.92),smoothstep(.14,.92,uv.x+high*ribbon*.24+head*.24));
    inherit = .42;
  } else if (style == ${fx.tip}) {
    vec2 q = (uv-vec2(.909+p.x*.035,.51+p.y*.065))*vec2(1.,.45);
    float ray = atan(q.y,q.x+.00001)+.11*sin(time*1.6);
    float lengthToTip = length(q);
    float star = lookLine(sin(ray*2.)*lengthToTip,.013);
    star = max(star,mid*lookLine(sin(ray*4.)*lengthToTip,.008)*.67);
    float burst = .38+.62*wash;
    float reach = .100+mid*.034+high*.042*burst;
    motif = star*(1.-smoothstep(.046,reach,lengthToTip))*.97;
    motion = motif*(.32+.68*wash);
    float rays = lookLine(abs(q.y)-abs(q.x)*.24,.009)*(1.-smoothstep(.061,.153,lengthToTip));
    float spark = 1.-smoothstep(.012,.048,lengthToTip);
    accent = high*max(spark,rays*.90)*burst;
    light = mix(vec3(.91,.49,.22),vec3(1.,.84,.55),spark*.53+burst*.38);
    inherit = .26;
  } else if (style == ${fx.flame}) {
    float tongue = (.5+.5*sin(p.x*24.-time*4.+phase))*(.54+.46*sin(p.x*13.+time*2.));
    float tongueBase = .77 - .15*tongue - mid*.061;
    float wisps = smoothstep(tongueBase-.038,tongueBase+.073,uv.y)*(1.-smoothstep(.85,.99,uv.y));
    float filament = lookLine(uv.y-tongueBase-.035,.026);
    motif = wisps*.49;
    motion = wisps*(.18+.52*smoothstep(.35,.93,tongue)) + filament*runner*.23;
    accent = high*lookLine(uv.y-tongueBase+.040,.024)*(1.-wash);
    light = mix(vec3(.085,.39,.95),vec3(.37,.85,1.),smoothstep(.59,.91,uv.y)*.74);
  } else if (style == ${fx.vein}) {
    float root = p.y+sin(p.x*12.+phase)*.13;
    float fork = root - max(0.,p.x+.21)*(.51+.30*sin(p.x*7.));
    float twig = root + max(0.,p.x-.05)*.76;
    motif = max(lookLine(root,.036),lookLine(fork,.022)*.78);
    motif = max(motif,mid*lookLine(twig,.026)*.80);
    float current = smoothstep(.34,.96,.5+.5*cos(uv.x*13.3-time*3.3));
    motion = motif*(.27+.69*current);
    accent = high*max(lookLine(twig+.08*sin(uv.x*20.),.020)*smoothstep(.02,.32,p.x),lookLine(fork,.011)*runner*.85)*(1.-wash*.56);
    light = mix(vec3(.10,.58,.48),vec3(.49,1.,.81),current*.83);
  } else if (style == ${fx.arc}) {
    float zig = abs(fract(p.x*8.2+fFxLayout.w+.07*sin(p.x*19.))-.5)*.55;
    float arc = p.y+zig-.11-.103*sin(p.x*11.+phase);
    float fork = arc + p.x*.67+.095;
    motif = max(lookLine(arc,.034),lookLine(fork,.021)*(.47+.38*mid)*smoothstep(-.23,.36,p.x));
    motion = motif*smoothstep(.25,.94,.5+.5*cos(p.x*21.-time*7.6));
    accent = high*lookLine(fork+.102,.020)*smoothstep(.40,.96,.5+.5*sin(time*8.+uv.x*21.));
    light = mix(vec3(.39,.24,.94),vec3(.33,.71,1.),motion*.91);
  } else if (style == ${fx.wave}) {
    float d = length(p*vec2(1.,.49));
    float radius = fract(time*.57)*(.40+.14*mid)+.049;
    float brokenRing = .46+.54*smoothstep(-.68,.68,sin(p.y*11.+p.x*15.+phase));
    motif = lookLine(d-.196,.013)*.46*brokenRing;
    motion = (lookLine(d-radius,.016)*.82+lookLine(d-radius,.050)*.22)*brokenRing*(1.-smoothstep(.39,.59,radius));
    float echo = fract(time*.57-.22)*(.40+.14*mid)+.049;
    accent = high*lookLine(d-echo,.018)*brokenRing*(1.-smoothstep(.30,.54,echo));
    light = mix(vec3(.11,.56,.74),vec3(.38,.91,.87),1.-smoothstep(.07,.39,d));
  } else if (style == ${fx.vortex}) {
    vec2 q = p*vec2(1.,.51);
    float r = length(q);
    float rotation = atan(q.y,q.x+.00001)/forgeTurn;
    float spiral = rotation+r*4.4-time*.27;
    float disk = 1.-smoothstep(.17+.04*mid,.27+.047*mid,r);
    motif = forgeBand(spiral,.061)*disk*(.58+.36*wash);
    motion = max(motif*wash,mid*forgeBand(spiral+.48,.045)*disk*.66);
    accent = high*forgeBand(rotation-r*7.+time*.38,.085)*(1.-smoothstep(.062,.161,r));
    light = mix(vec3(.54,.23,.86),vec3(.32,.69,.99),1.-smoothstep(.03,.26,r));
  } else if (style == ${fx.stardust}) {
    vec2 dotA = lookDot(uv*vec2(20.,8.),fFxLayout.w,.19);
    vec2 dotB = lookDot(uv*vec2(34.,12.),fFxLayout.w+.37,.15);
    float belt = 1.-smoothstep(.20,.44,abs(p.y+p.x*.42));
    motif = belt*dotA.x*step(.57,dotA.y);
    motion = motif*(.21+.79*pow(.5+.5*sin(time*3.8+dotA.y*46.),3.));
    motion = max(motion,mid*dotB.x*step(.68,dotB.y)*belt*(.39+.31*wash));
    accent = high*motif*max(runner,lookLine(p.y+p.x*.42,.14)*.58);
    light = mix(vec3(.44,.60,.99),vec3(.86,.80,1.),dotA.y*.80);
  } else if (style == ${fx.frost}) {
    vec2 cells = uv*vec2(14.,6.)+fFxLayout.w;
    float frozen = forgeHash(floor(cells));
    vec2 local = fract(cells)-vec2(.38+frozen*.24,.39+fract(frozen*7.9)*.22);
    float flake = abs(local.x+local.y*.29)+abs(local.y)*(.56+frozen*.39);
    float spread = smoothstep(.47-.21*mid,.81,uv.y+.19*sin(p.x*7.+phase));
    float fork = lookLine(local.x+local.y*.63,.032)*(1.-smoothstep(.09,.25,abs(local.y)));
    motif = max(lookLine(flake-.21,.028),fork*.62)*spread*step(.35,frozen)*(.50+.49*frozen);
    motion = motif*smoothstep(.10,.84,.5+.5*cos(frozen*11.-time*2.7));
    accent = high*lookLine(flake,.17)*spread*smoothstep(.57,.94,.5+.5*sin(time*2.7-uv.x*5.));
    light = mix(vec3(.38,.74,.95),vec3(.79,.91,1.),spread*.68);
  } else if (style == ${fx.shards}) {
    vec2 cell = vec2(p.x*6.5+p.y*2.4+coarse*.47,p.x*1.9-p.y*4.1+coarse*.27) + fFxLayout.w;
    float facet = forgeHash(floor(cell));
    float ridge = max(forgeBand(cell.x+.5,.030),forgeBand(cell.y+.5,.030));
    float inset = smoothstep(.47-.11*mid,.86,facet)*(1.-ridge);
    float plane = .20+.80*smoothstep(.11,.80,fract(cell.x)+fract(cell.y)*(.28+.34*facet));
    motif = inset*.46*plane;
    motion = inset*plane*pow(.5+.5*cos(time*3.3+facet*17.),3.);
    accent = high*ridge*smoothstep(.46,.84,facet)*(.34+.66*wash);
    light = mix(vec3(.39,.56,.74),vec3(.85,.82,.98),plane*.73);
  }

  float clarity = mix(.54+.33*smoothstep(.20,.68,coarse),1.,fRefine);
  float strength = min(.62, motif*.25 + motion*.36*clarity + accent*.30) * (.66+.34*smoothstep(.01,.085,uv.x));
  vec3 glow = mineralAccent(light,inherit);
  glow = mix(glow,vec3(.91,.92,1.),min(.28,accent*.35));
  return vec4(glow*strength,clamp(strength*1.55,0.,1.));
}
#endif
`;
