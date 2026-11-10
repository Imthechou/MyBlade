/** V3 正式赛定义。全赛事以 45 秒真实切割分结算，材料本体不随赛级变化。 */
import { ARENA_V3, TEST_PROJECTS } from '../balance.js';
export const FORMAL_RULES_VERSION = 'formal-v4.1';
export const BRANCH_FORMATS = Object.freeze({
  press:{id:'press',name:'锻压',focus:'连续破甲、硬靶终结',brief:'硬靶比例较高，破甲与终结获得额外奖励。'},
  edge:{id:'edge',name:'锋刃',focus:'一划多断、跨划连斩',brief:'成排软靶与密集补位，奖励连续速切。'},
  precise:{id:'precise',name:'精密',focus:'可见弱点、精准入刀',brief:'瞄准亮点并沿虚线入刀，精准终结加分。'},
  quench:{id:'quench',name:'淬彩',focus:'冰裂交叉切割、裂纹传播',brief:'冰块、塑板较多，奖励交叉刀路与特殊破坏。'},
  composite:{id:'composite',name:'复合',focus:'六种材料、综合切割',brief:'轮换材料与阵型，奖励材料多样性。'},
  overload:{id:'overload',name:'过载',focus:'高密度硬靶、刀况管理',brief:'更密的高价值目标，低刀况下得分提高。'},
});
export const BRANCH_FORMAT_LIST=Object.freeze(Object.values(BRANCH_FORMATS));
export const branchFormat=id=>BRANCH_FORMATS[id] || null;
export const GRADIENT_RULES=Object.freeze(['学徒','能手','专家','大师','传奇'].map((name,tier)=>({
  tier,name,targetBase:[750,780,810,850,900][tier],targetStep:0,hardness:1,window:1-tier*.04,
  recommend:[40,60,85,110,140][tier],
  require:'切断主连接，达到本段公开成绩门槛；无六维均值准入限制。',
})));
export const gradientRule=tier=>GRADIENT_RULES[Math.max(0,Math.min(4,tier|0))];
// 旧项目仅供已进行中的历史赛程使用；新赛一律采用 cutting。
export const PROJECT_RULES=Object.freeze({
  cutting:{kind:'sweep',seconds:70,materials:['foam','rope','wood','plastic','ice','metal'],label:'拆解承重点，持续切痕与结构终结',measureLabel:'结构切割分'},
  precision:{kind:'trace',seconds:20,tolerance:.3,label:'历史精度测试'},
  strength:{kind:'sustain',seconds:18,loadSteps:4,label:'历史强度测试'},
  durability:{kind:'hold',seconds:24,decay:.06,label:'历史耐久测试'},
  extreme:{kind:'overload',seconds:15,warningAt:.6,label:'历史极限测试'},
});
export const projectRule=id=>PROJECT_RULES[id] || null;
export function buildFormalDefinition({branchId,gradient=0,seed=null}={}) {
  const branch=branchFormat(branchId);
  if(!branch)return {ok:false,reason:'未知流派'};
  const g=gradientRule(gradient);
  return {
    ok:true,version:FORMAL_RULES_VERSION,branchId,branchName:branch.name,focus:branch.focus,brief:branch.brief,
    gradient:g.tier,gradientName:g.name,require:g.require,seed,
    tests:['cutting'],weights:{cutting:1},targetScore:g.targetBase,hardness:1,window:g.window,
    rules:[{projectId:'cutting',name:TEST_PROJECTS.cutting.name,...PROJECT_RULES.cutting,weight:1,stats:[...TEST_PROJECTS.cutting.stats]}],
    fingerprint:`arena-v4.1:${branchId}:${g.tier}`,
  };
}
export const allBranchDefinitions=(gradient=0)=>BRANCH_FORMAT_LIST.map(b=>buildFormalDefinition({branchId:b.id,gradient}));
export default {FORMAL_RULES_VERSION,BRANCH_FORMATS,BRANCH_FORMAT_LIST,GRADIENT_RULES,PROJECT_RULES,branchFormat,gradientRule,projectRule,buildFormalDefinition,allBranchDefinitions};
