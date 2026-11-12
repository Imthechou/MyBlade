function randomFor(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return hash / 4294967296;
  };
}

function arrangeWaves(waves, random) {
  const arranged = [...waves];
  // Keep the first throw, heavy punctuation and final five-target throw in place.
  // Rotation changes the order of the other formations inside their own act.
  for (const [start, end] of [[1, 4], [4, 8], [8, waves.length - 1]]) {
    const slots = arranged.slice(start, end).map((_, i) => start + i)
      .filter(i => arranged[i].pattern !== 'anvil');
    const offset = Math.floor(random() * slots.length);
    slots.forEach((slot, i) => {
      const original = waves[slots[(i + offset) % slots.length]];
      arranged[slot] = { ...original, at: waves[slot].at, speed: waves[slot].speed };
    });
  }
  return arranged;
}

export function flightSchedule(course) {
  const random = randomFor(course.seed);
  const waves = course.rotate ? arrangeWaves(course.waves, random) : course.waves;
  return waves.map((wave, index) => {
    const count = wave.targets.length;
    const { at, pattern, speed } = wave;
    const mirrored = random() < .5 ? -1 : 1;
    const lift = (random() - .5) * .035;
    const launches = wave.targets.map((key, i) => {
      const middle = i - (count - 1) / 2;
      const lane = .5 + mirrored * middle * Math.min(.29, .77 / count);
      const side = i % 2 ? -mirrored : mirrored;
      const delay = pattern === 'relay' && i > 0 ? .46 + (i - 1) * .10 :
        pattern === 'mark' ? i * (.09 + speed * .25) : 0;
      let apex = .53 + lift;
      let drift = mirrored * .19;
      if (pattern === 'diagonal') apex += middle * .073;
      if (pattern === 'cross') {
        apex += side * .064;
        drift = side * (.65 + speed * .42);
      }
      if (pattern === 'relay') apex += i === 0 ? -.045 : .036;
      if (pattern === 'mixed' && key === wave.armor) apex += .042;
      const anchored = pattern === 'anvil';
      const begins = at + delay;
      const duration = Math.min(course.limit - begins, anchored ? 2.8 : 2.77 - speed * 1.5);
      const spin = side * (.18 + random() * .16);
      random(); // Preserve the seeded sequence from the flight rules with first-hit criticals.
      return {
        key, begins, duration, anchored, lane, drift, apex,
        armored: key === wave.armor, marked: wave.marks?.includes(key) ?? false,
        reinforced: key === wave.reinforced, spin, variation: random(),
      };
    });
    return { ...wave, index, launches };
  });
}

// Positions and velocities use fractions of the active field per second.
// They are sampled from the match clock, so refresh rate and visual hit pauses
// cannot change a throw or the daily course.
export function flightAt(launch, elapsed) {
  const age = elapsed - launch.begins;
  if (age < 0 || age >= launch.duration) return null;
  const p = age / launch.duration;
  if (launch.anchored) {
    const rise = Math.min(1, age / .38);
    const sink = Math.max(0, 1 - (launch.duration - age) / .30);
    return {
      x: .5, y: .55 + .53 * ((1 - rise) ** 3 + sink ** 2),
      angle: 0, vx: 0, vy: 0,
    };
  }
  const height = 1.08 - launch.apex;
  return {
    x: launch.lane + launch.drift * (p - .5),
    y: 1.08 - 4 * height * p * (1 - p),
    angle: launch.spin * (p - .5) * 2,
    vx: launch.drift / launch.duration,
    vy: -4 * height * (1 - 2 * p) / launch.duration,
  };
}
