const LABELS = {
  forge: '旧版鉴定', 'cut:v19': '旧版赛事结算',
  'daily:forge': '每日锻造', 'daily:craft': '每日工艺', 'daily:match': '每日赛事',
};

export const makeWallet = (balance, migrated = false) => ({
  version: 1, opening: balance, accounted: balance, migrated, serial: 0, receipts: {},
});

export function normalizeWallet(raw, balance) {
  if (!raw || raw.version !== 1 || !Number.isFinite(raw.opening) ||
      !raw.receipts || typeof raw.receipts !== 'object' || Array.isArray(raw.receipts)) {
    return makeWallet(balance, true);
  }
  const receipts = Object.fromEntries(Object.entries(raw.receipts).filter(([, item]) =>
    Number.isFinite(item?.amount) && typeof item.label === 'string'));
  const wallet = { ...raw, receipts, serial: Number.isSafeInteger(raw.serial) ? raw.serial : 0,
    accounted: raw.opening + Object.values(receipts).reduce((sum, item) => sum + item.amount, 0) };
  reconcileWallet({ wallet, cr: balance });
  return wallet;
}

/** Use stable ids for business events. Generic legacy adjustments get an ordered receipt. */
export function noteCredit(save, amount, label, { id, bladeId = null, furnace = null } = {}) {
  const wallet = save.wallet;
  if (!wallet || !Number.isFinite(amount) || !amount) return;
  const key = id || 'transaction:' + ++wallet.serial;
  if (Object.hasOwn(wallet.receipts, key)) return;
  const receipt = { id: key, label, amount, bladeId, furnace, at: Date.now() };
  wallet.receipts[key] = receipt;
  wallet.accounted += amount;
  return receipt;
}

export function reconcileWallet(save) {
  if (!save.wallet) return;
  noteCredit(save, save.cr - save.wallet.accounted, '其他工坊流水');
}

export function namedCredit(save, amount, label, context = {}) {
  if (!Number.isSafeInteger(amount) || !amount || save.cr + amount < 0) return null;
  if (context.id && Object.hasOwn(save.wallet?.receipts || {}, context.id)) return null;
  save.cr += amount;
  return noteCredit(save, amount, label, context);
}

export function noteLegacyCredit(save, amount, reason, context) {
  if (!amount) return;
  const label = LABELS[reason] || (reason.startsWith('achievement:') ? '成就奖励' : '工坊奖励');
  return noteCredit(save, amount, label, context);
}

export function receiptsFor(save, blade) {
  const items = Object.values(save.wallet?.receipts || {});
  if (!blade) return items.reverse();
  return items.filter(item => item.bladeId === blade.id ||
    (item.furnace !== null && blade.v19Visual && item.furnace === blade.seed)).reverse();
}
