/**
 * 表现层 · DOM 工具
 *
 * 只做"怎么把数据变成节点"，不含任何玩法规则。
 * 所有页面模块统一用它建 DOM，避免各处散落 innerHTML 拼接。
 */

import { motion } from '../platform/index.js';
import { icon } from './icons.js';

/**
 * 建节点。
 * ★ children 允许是**数组或嵌套数组**，内部会摊平 —— 与 `mount()` 同一套约定。
 *
 * ⚠ 2026-10-14（B5 补）：原来这里不摊平，只 `[].concat(children)` 摊**一层**，
 *   于是 `el('div', {}, [foot])` 里 foot 本身是数组时（`foot: [btnA, btnB]`），
 *   摊一层的结果仍是"一个数组"，`appendChild` 直接抛
 *   `parameter 1 is not of type 'Node'` —— 整个赛事页白屏。
 *   两个同族工具（el / mount）行为不一致本身就是 bug 源，这里统一成会摊平。
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || (v === false && !k.startsWith('aria-'))) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, k.startsWith('aria-') ? String(v) : (v === true ? '' : String(v)));
  }
  for (const c of [].concat(children).flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/**
 * 挂载子节点并清空旧内容。
 * ★ children 允许是**数组或嵌套数组**（页面经常直接 .map() 出一组节点），
 *   这里统一摊平 —— 否则 appendChild 会收到 Array 而抛
 *   "parameter 1 is not of type 'Node'"。
 */
export function mount(node, ...children) {
  clear(node);
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return node;
}

export const on = (node, evt, fn, opts) => {
  if (node) node.addEventListener(evt, fn, opts);
  return () => node && node.removeEventListener(evt, fn, opts);
};

/** 数字滚动动画（鉴定揭晓用；尊重减弱动效 —— 单一真源见 platform/motion.js） */
export function countUp(node, from, to, ms = 700) {
  if (!node) return;
  const reduce = motion.reduced();
  if (reduce || ms <= 0) { node.textContent = String(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 轻提示 */
let toastHost = null;
export function toast(message, tone = 'info', ms = 2200) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  // 移动端锻造页底部就是主要操作区；新提示替换旧提示，避免连续操作时
  // 多条长 toast 堆叠并盖住卡片与确认按钮。
  toastHost.replaceChildren();
  const node = el('div', { class: `toast toast--${tone}`, text: message });
  toastHost.appendChild(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 260);
  }, ms);
  return node;
}

/** 居中玻璃弹窗：焦点约束、Esc 关闭与返回触发器。 */
export function sheet({ title, body, onClose }) {
  const trigger = document.activeElement;
  const cross = icon('close');
  cross.classList.add('sheet-x-icon');
  const mask = el('div', { class: 'sheet-mask' });
  const panel = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '详情' }, [
    el('div', { class: 'sheet-head' }, [
      el('div', { class: 'sheet-title', text: title || '' }),
      el('button', { class: 'sheet-x', 'aria-label': '关闭', title:'关闭', onclick: () => close() }, [cross]),
    ]),
    el('div', { class: 'sheet-body' }, [body]),
  ]);
  let closed = false;
  const topmost = () => [...document.querySelectorAll('.sheet-mask')].at(-1) === mask;
  const keys = event => {
    if (closed || !topmost()) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const items = [...panel.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(node => !node.disabled && node.offsetParent !== null);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  };
  mask.appendChild(panel);
  document.body.appendChild(mask);
  const app = document.getElementById('app');
  if (app) app.inert = true;
  for (const other of document.querySelectorAll('.sheet-mask')) if (other !== mask) other.inert = true;
  document.addEventListener('keydown', keys);
  requestAnimationFrame(() => { if (!closed) { mask.classList.add('is-in'); panel.querySelector('.sheet-x')?.focus({ preventScroll: true }); } });
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', keys);
    mask.classList.remove('is-in');
    setTimeout(() => {
      mask.remove();
      const remaining = [...document.querySelectorAll('.sheet-mask')].at(-1);
      if (remaining) remaining.inert = false;
      else if (app) app.inert = false;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    }, 220);
    if (onClose) onClose();
  }
  mask.addEventListener('click', event => { if (event.target === mask) close(); });
  return { close, panel };
}
export default { el, $, $$, clear, mount, on, countUp, toast, sheet };
