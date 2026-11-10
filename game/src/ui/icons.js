/** Shared, lightweight toolbar symbols. Labels belong on their controls. */
const paths = {
  back: ['M15 5l-7 7 7 7'],
  next: ['M9 5l7 7-7 7'],
  close: ['M6 6l12 12M18 6 6 18'],
  more: ['M5 12h.01M12 12h.01M19 12h.01'],
  refresh: ['M20 8a8 8 0 1 0 0 8', 'M20 3v5h-5'],
  pause: ['M8 5v14M16 5v14'],
  play: ['M8 5l11 7-11 7Z'],
  help: ['M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4', 'M12 17h.01', 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  check: ['M5 12l4 4L19 6'],
  spark: ['m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z'],
  plus: ['M5 12h14M12 5v14'],
  minus: ['M5 12h14'],
  settings: ['M9 4 10 2h4l1 2 3 2 2 1v4l-2 1-1 3v3l-3 2-2-1-3-1-3 1-2-3 1-2-1-3-2-2 2-3 3 0Z', 'M16 11a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':name === 'more' ? '3' : '1.75','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'ui-icon'})) svg.setAttribute(key,value);
  for (const d of paths[name] || paths.more) {
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d',d); svg.appendChild(path);
  }
  return svg;
}
