/**
 * 3D 舞台默认允许旋转与缩放。右下角只负责一键复位，
 * S4 锻打 / S7 开刃阶段暂时让手势交给小游戏。
 */
import { el } from './dom.js';
import { getStage } from '../render/index.js';
import { createViewReset } from './viewReset.js';

export function createStageInspect({ canDrag = () => true } = {}) {
  let blocked = false;

  const button = createViewReset(() => { if (!blocked) getStage()?.resetView?.(); });
  button.classList.add('stage-inspect-reset');
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
