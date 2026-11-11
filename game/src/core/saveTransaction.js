/** 主档事务：计算草稿、写盘、再发布；失败时原对象及嵌套状态均保持原样。 */
import * as Storage from '../platform/storage.js';

export function commitSave(original, action) {
  const draft = JSON.parse(JSON.stringify(original));
  const result = action(draft);
  if (result?.ok === false || result?.error || result?.duplicate) return result;
  if (!Storage.save(draft)) {
    return { ok: false, code: 'PERSIST_FAILED', reason: '保存失败，本次操作未生效，请重试', error: '保存失败，请重试' };
  }
  Object.assign(original, draft);
  return result;
}
