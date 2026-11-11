/**
 * 表现层 · 设置面板（V2.1 §29）
 *
 * 顶栏 ⚙ 打开。只放"必要的体验选项"，与文档逐条对齐：
 *   音效开关与音量 / 震动反馈开关 / 减少动态效果 / 新手说明重看。
 * （"音频、视觉反馈偏好"由前三项共同覆盖，不再另设抽象选项。）
 *
 * ★ 所有改动都经 app/settings.js —— 那一层负责"入档 + 立即生效 + 持久化"，
 *   本文件只负责收集意图与回显状态。
 */

import { el, mount, sheet } from './dom.js';
import { icon } from './icons.js';
import { env, motion } from '../platform/index.js';
import { LEGACY_MODE } from '../platform/env.js';
import * as Settings from '../app/settings.js';
import * as Tutorial from './tutorial.js';

const MOTION_OPTS = [
  { id: 'auto', name: '跟随系统', note: '由系统的「减少动态效果」设置决定' },
  { id: 'reduced', name: '减少', note: '跳过揭晓逐段播放与数字滚动，直接给出结果' },
  { id: 'full', name: '完整', note: '始终播放动画，忽略系统设置' },
];

function switchRow({ label, hint, on, disabled = false, onToggle }) {
  const sw = el('button', {
    class: 'switch' + (on ? ' is-on' : ''),
    role: 'switch',
    'aria-checked': String(on), 'aria-label': label, 'data-setting': label,
    disabled: disabled || false,
    onclick: () => { if (!disabled) onToggle(!on); },
  });
  return el('div', { class: 'set-row' + (disabled ? ' is-off' : '') }, [
    el('div', { class: 'set-head' }, [
      el('div', { class: 'set-main' }, [
        el('div', { class: 'set-label', text: label }),
        hint ? el('div', { class: 'set-hint', text: hint }) : null,
      ]),
      sw,
    ]),
  ]);
}

export function open() {
  const body = el('div', { class: 'settings' });
  const api = sheet({ title: '设置', body });

  const draw = () => {
    const focusKey = body.contains(document.activeElement) ? document.activeElement.dataset.setting : null;
    const s = Settings.get();
    const rows = [];

    // ① 音效开关
    rows.push(switchRow({
      label: '音效',
      hint: '锻造、锤击、鉴定与赛事的全部反馈音',
      on: s.sound !== false,
      onToggle: (v) => { Settings.update({ sound: v }); draw(); },
    }));

    // ② 音量（音效关闭时置灰，但仍可调）
    const vol = Math.round((s.volume ?? 0.6) * 100);
    rows.push(el('div', { class: 'set-row' + (s.sound === false ? ' is-off' : '') }, [
      el('div', { class: 'set-head' }, [
        el('div', { class: 'set-label', text: '音量' }),
        el('b', { class: 'mono', text: `${vol}%` }),
      ]),
      el('input', {
        class: 'range', 'aria-label': '音量', 'data-setting': 'volume',
        type: 'range',
        min: '0',
        max: '100',
        step: '1',
        value: String(vol),
        oninput: (e) => {
          // 拖动中只预览、不落盘；松手才 update（见 app/settings.js preview 注释）
          Settings.preview({ volume: Number(e.target.value) / 100 });
          const label = e.target.parentNode.querySelector('.set-head b');
          if (label) label.textContent = `${e.target.value}%`;
        },
        onchange: (e) => { Settings.update({ volume: Number(e.target.value) / 100 }); draw(); },
      }),
    ]));

    // ③ 震动反馈（宿主无震动能力时明确置灰，不让玩家以为开关坏了）
    rows.push(switchRow({
      label: '震动反馈',
      hint: env.hasVibration ? '锤击、断裂与胜负时的机身反馈' : '当前设备不支持震动，此项不可用',
      on: s.haptics !== false,
      disabled: !env.hasVibration,
      onToggle: (v) => { Settings.update({ haptics: v }); draw(); },
    }));

    // ④ 减少动态效果（三态；单一真源 platform/motion.js）
    const cur = MOTION_OPTS.find((o) => o.id === s.motion) || MOTION_OPTS[0];
    rows.push(el('div', { class: 'set-row' }, [
      el('div', { class: 'set-head' }, [
        el('div', { class: 'set-main' }, [
          el('div', { class: 'set-label', text: '减少动态效果' }),
          el('div', { class: 'set-hint', text: cur.note }),
        ]),
        el('span', { class: 'chip', text: motion.reduced() ? '生效：减少' : '生效：完整' }),
      ]),
      el('div', { class: 'seg', role: 'group', 'aria-label': '动态效果' }, MOTION_OPTS.map((o) => el('button', {
        class: 'seg-btn' + (o.id === s.motion ? ' is-on' : ''),
        text: o.name, 'aria-pressed': String(o.id === s.motion), 'data-setting': o.id,
        onclick: () => { Settings.update({ motion: o.id }); draw(); },
      }))),
    ]));

    // ⑤ 新手说明重看（§27：允许随时从设置中重看）
    rows.push(el('div', { class: 'set-row' }, [
      el('div', { class: 'set-head' }, [
        el('div', { class: 'set-main' }, [
          el('div', { class: 'set-label', text: '新手说明' }),
          el('div', { class: 'set-hint', text: LEGACY_MODE ? '重看选卡构筑、自由锻打和鉴定说明' : '重看选料、控温、锻打和切割说明' }),
        ]),
        el('button', {
          class: 'btn btn--icon', 'aria-label':'重看', title:'重看新手说明',
          onclick: () => Tutorial.helpSheet(),
        }, [icon('help')]),
      ]),
    ]));

    /* ★ rework T14：玩家可见文案不出现内部规范号（原为「V2.1 §29：…」）。
       保留原意，但改成人话。 */
    rows.push(el('div', { class: 'muted tiny', text: '没有账号等级、每日体力、商城货币，也不强制联网。' }));

    mount(body, rows);
    if (focusKey) [...body.querySelectorAll('[data-setting]')].find(node => node.dataset.setting === focusKey)?.focus({preventScroll:true});
  };

  draw();
  return api;
}

export default { open };
