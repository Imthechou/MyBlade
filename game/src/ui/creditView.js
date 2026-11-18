import { walletView } from '../core/v19Progress.js';
import { el, sheet } from './dom.js';

const PAGE_SIZE = 15;
const signed = value => (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value) + ' CR';

export function creditHistory(blade = null) {
  const view = walletView(blade);
  const total = view.receipts.reduce((sum, item) => sum + item.amount, 0);
  const list = el('div', { class: 'credit-ledger-rows' });
  let page = 0;
  const pageCount = Math.max(1, Math.ceil(view.receipts.length / PAGE_SIZE));
  const previous = el('button', { class: 'chip', type: 'button', text: '上一页',
    onclick: () => { page--; render(); } });
  const next = el('button', { class: 'chip', type: 'button', text: '下一页',
    onclick: () => { page++; render(); } });
  const position = el('small', { class: 'muted' });

  function render() {
    list.replaceChildren(...view.receipts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(item =>
      el('div', { class: 'report-line' }, [
        el('span', { text: item.label }),
        el('b', { class: item.amount > 0 ? 'credit-gain' : 'credit-cost', text: signed(item.amount) }),
      ])));
    previous.disabled = page === 0;
    next.disabled = page + 1 === pageCount;
    position.textContent = `${page + 1} / ${pageCount}`;
  }
  render();
  return el('section', { class: 'credit-ledger', 'aria-label': blade ? '作品账单' : '信用点流水' }, [
    el('div', { class: 'credit-ledger-head' }, [
      el('b', { text: blade ? '作品账单' : '信用点余额' }),
      el('strong', { text: blade ? (view.receipts.length ? signed(total) : '未记录') : view.balance + ' CR' }),
    ]),
    !blade && Number.isFinite(view.opening) ? el('small', {
      class: 'muted', text: (view.migrated ? '迁移期初余额' : '工坊起始预算') + ' · ' + view.opening + ' CR',
    }) : null,
    view.receipts.length ? list : el('p', { class: 'muted', text: blade ? '这把刀暂无可追溯的收支。' : '还没有交易记录。' }),
    pageCount > 1 ? el('nav', { class: 'credit-pages', 'aria-label': '流水分页' }, [previous, position, next]) : null,
  ]);
}

export function openWallet() {
  return sheet({ title: '工坊钱包', body: creditHistory() });
}
