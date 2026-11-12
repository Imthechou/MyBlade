const wave = (pattern, project, targets, extra = {}) => ({ pattern, project, targets, ...extra });
const row = (...targets) => wave('row', 'cutting', targets);
const diagonal = (...targets) => wave('diagonal', 'cutting', targets);
const cross = (...targets) => wave('cross', 'cutting', targets);
const anvil = (target, project = 'strength') => wave('anvil', project, [target], { armor: target });
const mark = (...targets) => wave('mark', 'precision', targets, { marks: ['gel', 'ice'] });
const relay = (...fruit) => wave('relay', 'precision', ['ice', ...fruit]);
const mix = (armor, ...light) => wave('mixed', 'durability', [...light, armor], { armor });

const ARCADE = [
  row('card', 'rope', 'card'), row('gel', 'pineapple', 'rope'),
  diagonal('rope', 'card', 'gel'), row('pineapple', 'rope', 'card', 'gel'),
  cross('card', 'pineapple', 'rope', 'gel'), anvil('wood'),
  diagonal('ice', 'gel', 'pineapple'), cross('bamboo', 'card', 'rope'),
  row('card', 'rope', 'pineapple', 'gel'), anvil('steel', 'durability'),
  cross('gel', 'bamboo', 'pineapple', 'rope'), diagonal('rope', 'ice', 'card', 'gel'),
  row('gel', 'pineapple', 'rope', 'card', 'gel'),
];

const SLOTS = [0, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22, 24, 26, 27.6];

const goal = (id, label, thresholds, unit = '') => ({ id, label, thresholds, unit });

export const SCHOOLS = {
  press: {
    name: '锻压', focus: '反复劈砍，击破重靶', project: 'strength',
    goals: [goal('armor', '重靶击破', [2, 3, 4, 4, 5])],
    waves: [
      row('card', 'bamboo', 'rope'), anvil('wood'), row('rope', 'gel', 'pineapple'), anvil('ice'),
      diagonal('bamboo', 'rope', 'card'), anvil('wood'), row('gel', 'card', 'bamboo'), anvil('steel'),
      cross('ice', 'bamboo', 'gel'), anvil('ice'), row('rope', 'bamboo', 'pineapple'), anvil('shield'), row('card', 'gel', 'bamboo'),
    ],
  },
  edge: {
    name: '锋刃', focus: '一刀斩断三靶，累计连斩', project: 'cutting',
    goals: [goal('multi', '三斩成组', [2, 3, 4, 5, 6])],
    waves: [
      row('card', 'rope', 'card'), row('rope', 'pineapple', 'gel'), row('gel', 'bamboo', 'rope'), diagonal('card', 'gel', 'rope'),
      row('pineapple', 'card', 'bamboo', 'rope'), diagonal('rope', 'gel', 'pineapple'), row('bamboo', 'gel', 'card', 'rope'), cross('card', 'pineapple', 'gel', 'rope'),
      diagonal('gel', 'pineapple', 'rope', 'card'), row('rope', 'bamboo', 'gel', 'card'), cross('pineapple', 'rope', 'card', 'gel'), row('card', 'bamboo', 'pineapple', 'card'), row('gel', 'pineapple', 'rope', 'card', 'gel'),
    ],
  },
  precise: {
    name: '精密', focus: '划过靶身上的亮环', project: 'precision',
    goals: [goal('precision', '命中靶心', [3, 4, 5, 6, 8])],
    waves: [
      mark('gel'), row('card', 'rope', 'pineapple'), mark('gel', 'ice'), mark('gel', 'card'),
      mark('gel', 'pineapple'), diagonal('rope', 'card', 'bamboo'), mark('ice', 'gel'), mark('gel', 'card', 'ice'),
      row('rope', 'gel', 'card'), mark('gel', 'ice'), mark('ice', 'gel', 'rope'), mark('ice', 'pineapple', 'gel'), mark('gel', 'card', 'ice'),
    ],
  },
  quench: {
    name: '淬彩', focus: '先破冰，再斩同组菠萝', project: 'precision',
    goals: [goal('relay', '破冰接斩', [2, 3, 4, 5, 6])],
    waves: [
      relay('pineapple'), row('pineapple', 'card', 'gel'), relay('pineapple', 'rope'), row('gel', 'pineapple', 'rope'),
      relay('pineapple'), diagonal('gel', 'rope', 'card'), relay('pineapple', 'pineapple'), cross('card', 'gel', 'pineapple'),
      relay('pineapple', 'card'), row('pineapple', 'gel', 'pineapple'), relay('pineapple', 'gel'), cross('pineapple', 'rope', 'gel'), relay('pineapple', 'pineapple'),
    ],
  },
  composite: {
    name: '复合', focus: '同组轻靶与硬靶都要斩断', project: 'durability',
    goals: [goal('mixed', '软硬同破', [2, 2, 3, 4, 5])],
    waves: [
      mix('bamboo', 'card', 'rope'), row('gel', 'pineapple', 'card'), mix('wood', 'rope', 'gel'), diagonal('rope', 'bamboo', 'card'),
      mix('wood', 'pineapple', 'card'), cross('gel', 'pineapple', 'rope'), mix('ice', 'rope', 'card'), row('rope', 'bamboo', 'gel'),
      mix('wood', 'gel', 'card'), cross('card', 'rope', 'pineapple'), mix('steel', 'rope', 'card'), row('gel', 'bamboo', 'pineapple'), mix('bamboo', 'card', 'gel'),
    ],
  },
  overload: {
    name: '过载', focus: '高速斩靶，保住刀刃耐久', project: 'extreme',
    goals: [goal('cut', '斩断靶具', [10, 12, 14, 16, 18]), goal('durability', '剩余耐久', [25, 28, 30, 32, 35], '%')],
    waves: [
      diagonal('rope', 'card', 'gel'), cross('card', 'pineapple', 'bamboo'), row('gel', 'ice', 'card', 'rope'), mix('wood', 'rope', 'card'),
      cross('bamboo', 'gel', 'pineapple', 'rope'), anvil('steel', 'extreme'), diagonal('gel', 'pineapple', 'card', 'bamboo'), cross('rope', 'ice', 'card', 'gel'),
      row('card', 'gel', 'pineapple', 'rope'), cross('bamboo', 'rope', 'card', 'gel'), anvil('shield', 'extreme'), diagonal('ice', 'rope', 'pineapple', 'card'), row('gel', 'bamboo', 'card', 'rope', 'gel'),
    ],
  },
};

export function schoolCourse(school, grade) {
  const speed = [0, .07, .15, .23, .30][grade];
  const waves = school.waves.map((item, i) => ({
    ...item,
    pattern: grade <= 1 && item.pattern === 'cross' && school !== SCHOOLS.overload ? 'diagonal' : item.pattern,
    at: SLOTS[i] - (i % 2) * speed * 1.25,
    speed,
  }));
  return {
    waves, goals: school.goals.map(({ thresholds, ...item }) => ({ ...item, target: thresholds[grade] })),
    focus: school.focus, specialty: school.project,
    armorScale: [1, 1.04, 1.08, 1.12, 1.16][grade],
    wearScale: school === SCHOOLS.overload ? [.85, .92, 1, 1.07, 1.14][grade] : 0,
  };
}

export function arcadeCourse() {
  return {
    waves: ARCADE.map((item, i) => ({
      ...item, at: SLOTS[i], speed: i < 4 ? 0 : i < 8 ? .13 : .21,
    })),
    armorScale: 1, wearScale: 0, goals: [], rotate: true,
  };
}

const light = ['card', 'rope', 'bamboo', 'pineapple', 'gel'];
export function practiceCourse({ style, material }) {
  const mix = [ARCADE[0], ARCADE[1], ARCADE[4], anvil('wood'), ARCADE[3]];
  const heavy = [anvil('wood'), anvil('ice'), anvil('steel'), anvil('shield', 'extreme')];
  const drill = material && (light.includes(material) ? row(material) : anvil(material));
  const sequence = drill ? Array(light.includes(material) ? 5 : 4).fill(drill) :
    style === 'row' ? [ARCADE[0], ARCADE[1], ARCADE[2], ARCADE[3], ARCADE.at(-1)] :
      style === 'heavy' ? heavy : mix;
  return {
    waves: sequence.map((item, i) => ({ ...item, at: i * (sequence.length === 4 ? 3 : 2.4), speed: 0 })),
    armorScale: .9, wearScale: 0, goals: [],
  };
}

export function courseGoals(course, metrics) {
  return course.goals.map(item => {
    const value = item.id === 'durability' ? Math.floor(metrics.durability) : metrics[item.id] ?? 0;
    return { ...item, value, met: value >= item.target };
  });
}

export const goalText = item => item.label + ' ' + item.target + item.unit;
