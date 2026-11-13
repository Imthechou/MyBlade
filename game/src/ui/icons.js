/** Shared, lightweight toolbar symbols. Labels belong on their controls. */
const paths = {
  back: ['M15 5l-7 7 7 7'],
  next: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12M18 6 6 18'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  refresh: ['M20 8a8 8 0 1 0 0 8', 'M20 3v5h-5'],
  pause: ['M8 5v14M16 5v14'],
  hammer: ['m14.2 3.1 6.7 6.7-3.7 3.7-6.7-6.7 3.7-3.7Z', 'm12.1 8.4-9 9a1.9 1.9 0 0 0 2.7 2.7l9-9M17.9 3.9l2.2 2.2'],
  play: ['M8 5l11 7-11 7Z'],
  help: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4', 'M12 17h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  check: ['M5 12l4 4L19 6'],
  spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
  plus: ['M5 12h14M12 5v14'],
  minus: ['M5 12h14'],
  // 六齿齿轮：齿顶收窄 + 齿间加深，20px 下仍能看出齿形；旧路径六段不等边，缩小后歪成多边形。
  settings: ['M8.5 5.94L10.54 2.21L13.46 2.21L15.5 5.94L19.75 5.84L21.21 8.37L19 12L21.21 15.63L19.75 18.16L15.5 18.06L13.46 21.79L10.54 21.79L8.5 18.06L4.25 18.16L2.79 15.63L5 12L2.79 8.37L4.25 5.84Z', 'M9 12a3 3 0 0 1 6 0a3 3 0 0 1-6 0'],
};

/** 个别图形线条密度不同，需要单独微调线宽才不糊成一团。 */
const strokes = { more: 3, settings: 1.65 };

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':strokes[name] ?? 1.75,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'ui-icon'})) svg.setAttribute(key,value);
  for (const d of paths[name] || paths.more) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d',d); svg.appendChild(path);
  }
  return svg;
}
