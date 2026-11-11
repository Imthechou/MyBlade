// Ordered triangle/plane intersection, including shallow concavities. A convex
// hull would bridge dents and leave a false mineral disk outside the shell.
export function sectionContour(positions, indices, cut = .015) {
  const nodes = new Map(), edges = new Set();
  const point = i => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  const key = p => p.map(v => Math.round(v * 100000)).join(':');
  const count = indices?.length ?? positions.length / 3;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map(j => point(indices ? indices[i + j] : i + j));
    const hits = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3];
      if ((a[0] < cut) === (b[0] < cut)) continue;
      const t = (cut - a[0]) / (b[0] - a[0]);
      hits.push([a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
    if (hits.length !== 2) continue;
    const [a, b] = hits.map(key);
    if (a === b) continue;
    const edge = [a, b].sort().join('|');
    if (edges.has(edge)) continue;
    edges.add(edge);
    for (let j = 0; j < 2; j++) {
      const k = j ? b : a;
      if (!nodes.has(k)) nodes.set(k, { point: hits[j], next: [] });
      nodes.get(k).next.push(j ? a : b);
    }
  }
  const first = nodes.keys().next().value;
  if (!first) return [];
  const contour = [], seen = new Set();
  let current = first, previous;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.get(current);
    contour.push(node.point);
    const next = node.next.find(k => k !== previous);
    previous = current; current = next;
  }
  return current === first && contour.length >= 3 ? contour : [];
}
