/**
 * 平台服务层 · 网络（占位）
 *
 * 设定文档 §29 明确「不引入需要联网才能参与的核心玩法」。
 * 因此本模块**默认全离线**：所有接口返回 null / false，不产生任何请求。
 * 保留它只为将来做排行榜 / 每日挑战成绩同步时有一个明确的落点，
 * 避免到时候又有人往业务代码里散落 fetch。
 */

const NOOP_RESULT = { ok: false, offline: true };

export function isOnline() {
  try {
    return globalThis.navigator ? globalThis.navigator.onLine !== false : false;
  } catch (_) { return false; }
}

export async function get(_url) { return null; }
export async function post(_url, _body) { return { ...NOOP_RESULT }; }
export async function upload(_file) { return null; }

export default { isOnline, get, post, upload };
