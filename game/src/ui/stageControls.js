/**
 * 3D 舞台默认允许旋转与缩放。右下角只负责一键复位，
 * S4 锻打 / S7 开刃阶段暂时让手势交给小游戏。
 */
import { el } from './dom.js';
import { getStage } from '../render/index.js';

function resetIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.8',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  })) svg.setAttribute(key, value);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20 11a8 8 0 1 0-2.35 5.66M20 4v7h-7');
  svg.appendChild(path);
  return svg;
}

export function createStageInspect({ canDrag = () => true } = {}) {
  let blocked = false;

  const button = el('button', {
    class: 'stage-icon stage-inspect-reset', type: 'button',
    'aria-label': '复位3D刀具视角',
    title: '一键复位刀具视角',
    onclick: () => { if (!blocked) getStage()?.resetView?.(); },
  }, [resetIcon()]);
  const bar = el('div', {
    class: 'stage-inspect', role: 'group', 'aria-label': '3D视角控制',
  }, [button]);

  function apply() {
    button.disabled = blocked;
    button.setAttribute('aria-disabled', String(blocked));
    // 挂载切页、render、换阶段后都强制和当前页面手势规则保持一致。
    getStage()?.setInteractive?.(!blocked && canDrag());
  }

  function setBlocked(value) { blocked = !!value; apply(); }
  function syncFromStage() { apply(); }
  // 兼容现有组件调用：控制功能已改为复位，不再暴露切换按钮。
  function setMode(on) { getStage()?.setInteractive?.(!!on && !blocked && canDrag()); }

  return {
    bar, setBlocked, syncFromStage, sync: apply, setMode,
    isOn: () => !!getStage()?.isInteractive?.(),
  };
}

export default { createStageInspect };
