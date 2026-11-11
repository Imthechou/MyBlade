/**
 * Apex 团队赛的唯一默认规则配置；团队赛不会改变原有单刀赛事规则。
 * UI 可读取 roundCount 展示所需轮数，但策略覆盖仍由 core 做严格校验。
 */
export const TEAM_POLICY = Object.freeze({
  provisional: true,
  rosterSize: 3,
  roundCount: 3,
});

export default TEAM_POLICY;
