/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/cardsV11.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 六维规范键序 */
  const STAT_KEYS = ["strength","toughness","sharpness","craft","design","spirit"];

  /** 稀有度：中文显示名 */
  const RARITY_CN = {
    "common": "普通",
    "fine": "精良",
    "rare": "稀有",
    "epic": "史诗",
    "legend": "传说",
    "mythic": "神话"
  };

  /** 受控工艺标签字典（27 个，只允许使用这里的 id） */
  const TAGS = [
    {
      "id": "stable",
      "name": "稳态"
    },
    {
      "id": "cold",
      "name": "冷相"
    },
    {
      "id": "balanced",
      "name": "均衡"
    },
    {
      "id": "flex",
      "name": "回弹"
    },
    {
      "id": "light",
      "name": "轻质"
    },
    {
      "id": "impact",
      "name": "冲击"
    },
    {
      "id": "clean",
      "name": "净面"
    },
    {
      "id": "hetero",
      "name": "异质"
    },
    {
      "id": "layer",
      "name": "层叠"
    },
    {
      "id": "flow",
      "name": "流动"
    },
    {
      "id": "heat",
      "name": "热相"
    },
    {
      "id": "oxide",
      "name": "氧化"
    },
    {
      "id": "mirror",
      "name": "镜面"
    },
    {
      "id": "edge",
      "name": "刃线"
    },
    {
      "id": "precision",
      "name": "精密"
    },
    {
      "id": "weather",
      "name": "战痕"
    },
    {
      "id": "resonance",
      "name": "共鸣"
    },
    {
      "id": "unstable",
      "name": "失稳"
    },
    {
      "id": "repair",
      "name": "修复"
    },
    {
      "id": "grip",
      "name": "握持"
    },
    {
      "id": "curve",
      "name": "弧线"
    },
    {
      "id": "fold",
      "name": "折叠"
    },
    {
      "id": "rigid",
      "name": "刚性"
    },
    {
      "id": "spectral",
      "name": "偏相"
    },
    {
      "id": "void",
      "name": "暗域"
    },
    {
      "id": "utility",
      "name": "实用"
    },
    {
      "id": "signature",
      "name": "签名"
    }
  ];

  /** 218 张决策卡（V1.1 规范字段） */
  const CARDS = [
   {
    "id": "MAT01",
    "stage": "S1",
    "name": "暗沉铁",
    "oldName": "生铁",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "stable",
     "oxide"
    ],
    "copy": "断面里的杂质明显可见，韧性够用，就是不太好看。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat01",
     "targetDescription": "原料｜粗颗粒与低反射暗面",
     "sourceWrite": "materialId=M08",
     "assetRef": "M08"
    },
    "assetRef": "M08",
    "sourceWrite": "materialId=M08",
    "traitGrant": null
   },
   {
    "id": "MAT02",
    "stage": "S1",
    "name": "素面钢",
    "oldName": "碳钢",
    "rarity": "common",
    "role": "稳健",
    "focus": "strength+tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "toughness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "balanced",
     "stable"
    ],
    "copy": "没什么纹路，强度韧性各占一半，没什么突出的地方。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat02",
     "targetDescription": "原料｜中性钢灰，保留真实金属反射",
     "sourceWrite": "materialId=M01",
     "assetRef": "M01"
    },
    "assetRef": "M01",
    "sourceWrite": "materialId=M01",
    "traitGrant": null
   },
   {
    "id": "MAT03",
    "stage": "S1",
    "name": "柔韧钢",
    "oldName": "低碳钢",
    "rarity": "common",
    "role": "取舍",
    "focus": "tough>sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "sharpness": -5
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "flex"
    ],
    "copy": "先留了些韧性，锋利度后面再磨出来。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat03",
     "targetDescription": "原料｜细腻低对比钢纹",
     "sourceWrite": "materialId=M03",
     "assetRef": "M03"
    },
    "assetRef": "M03",
    "sourceWrite": "materialId=M03",
    "traitGrant": null
   },
   {
    "id": "MAT04",
    "stage": "S1",
    "name": "精构钢",
    "oldName": "工具钢",
    "rarity": "common",
    "role": "专精",
    "focus": "strength+craft",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "precision",
     "clean"
    ],
    "copy": "纹路很干净，后续好接着加工修整。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat04",
     "targetDescription": "原料｜清晰硬质高光",
     "sourceWrite": "materialId=M02",
     "assetRef": "M02"
    },
    "assetRef": "M02",
    "sourceWrite": "materialId=M02",
    "traitGrant": null
   },
   {
    "id": "MAT05",
    "stage": "S1",
    "name": "回震钢",
    "oldName": "锰钢",
    "rarity": "fine",
    "role": "专精",
    "focus": "strength+tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "toughness": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "stable",
     "impact"
    ],
    "copy": "能扛得住冲击，但内部残余应力要注意。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat05",
     "targetDescription": "原料｜深灰金属，硬朗颗粒",
     "sourceWrite": "materialId=M05",
     "assetRef": "M05"
    },
    "assetRef": "M05",
    "sourceWrite": "materialId=M05",
    "traitGrant": null
   },
   {
    "id": "MAT06",
    "stage": "S1",
    "name": "弹韧钢",
    "oldName": "弹簧钢",
    "rarity": "fine",
    "role": "取舍",
    "focus": "tough>craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "craft": -5
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "flex",
     "stable"
    ],
    "copy": "弹性足，但精修的时候需要慢一点。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat06",
     "targetDescription": "原料｜细长流向纹理",
     "sourceWrite": "materialId=M07",
     "assetRef": "M07"
    },
    "assetRef": "M07",
    "sourceWrite": "materialId=M07",
    "traitGrant": null
   },
   {
    "id": "MAT07",
    "stage": "S1",
    "name": "黑脆铁",
    "oldName": "铸铁",
    "rarity": "fine",
    "role": "冒险",
    "focus": "strength>tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 17,
     "toughness": -5
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "unstable",
     "oxide"
    ],
    "copy": "硬度高，但很脆。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat07",
     "targetDescription": "原料｜黑灰哑面与局部脆亮点",
     "sourceWrite": "materialId=M06",
     "assetRef": "M06"
    },
    "assetRef": "M06",
    "sourceWrite": "materialId=M06",
    "traitGrant": null
   },
   {
    "id": "MAT08",
    "stage": "S1",
    "name": "冷镜钢",
    "oldName": "铬镜钢",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "mirror",
     "stable",
     "cold"
    ],
    "copy": "底子冷净，很适合做镜面。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat08",
     "targetDescription": "原料｜冷银反射，边缘清晰",
     "sourceWrite": "materialId=M04",
     "assetRef": "M04"
    },
    "assetRef": "M04",
    "sourceWrite": "materialId=M04",
    "traitGrant": null
   },
   {
    "id": "MAT09",
    "stage": "S1",
    "name": "零温钛",
    "oldName": "冷锻钛",
    "rarity": "fine",
    "role": "专精",
    "focus": "strength+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "craft": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "precision",
     "light",
     "cold"
    ],
    "copy": "轻，又精致，但瑕疵藏不住。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat09",
     "targetDescription": "原料｜冷银底色与轻量高光",
     "sourceWrite": "materialId=M09",
     "assetRef": "M09"
    },
    "assetRef": "M09",
    "sourceWrite": "materialId=M09",
    "traitGrant": null
   },
   {
    "id": "MAT10",
    "stage": "S1",
    "name": "静压钛",
    "oldName": "深海钛",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "stable",
     "flow"
    ],
    "copy": "把波动压平，往内收的风格。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat10",
     "targetDescription": "原料｜深蓝灰暗部渐变",
     "sourceWrite": "materialId=M10",
     "assetRef": "M10"
    },
    "assetRef": "M10",
    "sourceWrite": "materialId=M10",
    "traitGrant": null
   },
   {
    "id": "MAT11",
    "stage": "S1",
    "name": "偏相钛",
    "oldName": "紫晶钛",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "spectral",
     "resonance"
    ],
    "copy": "晶相偏在一个方向上，容易留出异色。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat11",
     "targetDescription": "原料｜紫色偏相反射，不使用大面积发光",
     "sourceWrite": "materialId=M12",
     "assetRef": "M12"
    },
    "assetRef": "M12",
    "sourceWrite": "materialId=M12",
    "traitGrant": null
   },
   {
    "id": "MAT12",
    "stage": "S1",
    "name": "赤焰灼钛",
    "oldName": "赤焰钛",
    "rarity": "rare",
    "role": "冒险",
    "focus": "strength+sharp",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "sharpness": 14
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "heat",
     "edge",
     "unstable"
    ],
    "copy": "热量容易烧到锋线上，再烧就险。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat12",
     "targetDescription": "原料｜低饱和赤铜边缘反光",
     "sourceWrite": "materialId=M13",
     "assetRef": "M13"
    },
    "assetRef": "M13",
    "sourceWrite": "materialId=M13",
    "traitGrant": null
   },
   {
    "id": "MAT13",
    "stage": "S1",
    "name": "曙金合金",
    "oldName": "黄金合金",
    "rarity": "rare",
    "role": "专精",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "mirror",
     "spectral"
    ],
    "copy": "金色埋在反光里，不细看发现不了。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat13",
     "targetDescription": "原料｜克制的浅金属色与细颗粒",
     "sourceWrite": "materialId=M14",
     "assetRef": "M14"
    },
    "assetRef": "M14",
    "sourceWrite": "materialId=M14",
    "traitGrant": null
   },
   {
    "id": "MAT14",
    "stage": "S1",
    "name": "流光极钛",
    "oldName": "极光钛",
    "rarity": "rare",
    "role": "构筑",
    "focus": "craft+design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 14,
     "design": 9,
     "spirit": 7
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "flow",
     "spectral"
    ],
    "copy": "反光只往一个方向走。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat14",
     "targetDescription": "原料｜冷色方向性反射",
     "sourceWrite": "materialId=M11",
     "assetRef": "M11"
    },
    "assetRef": "M11",
    "sourceWrite": "materialId=M11",
    "traitGrant": null
   },
   {
    "id": "MAT15",
    "stage": "S1",
    "name": "深蓝晶脉",
    "oldName": "蓝晶石",
    "rarity": "rare",
    "role": "构筑",
    "focus": "craft+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "craft": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "resonance",
     "spectral"
    ],
    "copy": "蓝色纹路只在强光下才浮出来。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat15",
     "targetDescription": "原料｜蓝晶内纹，金属主体保持清晰",
     "sourceWrite": "materialId=M15",
     "assetRef": "M15"
    },
    "assetRef": "M15",
    "sourceWrite": "materialId=M15",
    "traitGrant": null
   },
   {
    "id": "MAT16",
    "stage": "S1",
    "name": "错相紫晶",
    "oldName": "紫晶石",
    "rarity": "rare",
    "role": "冒险",
    "focus": "design>tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": -9,
     "design": 29
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "unstable"
    ],
    "copy": "颜色偏差到极限，晶体也最不稳。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat16",
     "targetDescription": "原料｜紫黑分区与局部色散",
     "sourceWrite": "materialId=M16",
     "assetRef": "M16"
    },
    "assetRef": "M16",
    "sourceWrite": "materialId=M16",
    "traitGrant": null
   },
   {
    "id": "MAT17",
    "stage": "S1",
    "name": "温玉翡翠",
    "oldName": "翡翠玉",
    "rarity": "epic",
    "role": "稳健",
    "focus": "tough+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "stable",
     "resonance"
    ],
    "copy": "温润好上手，有着通透的材质感。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat17",
     "targetDescription": "原料｜青玉半透感，金属边缘不透明",
     "sourceWrite": "materialId=M17",
     "assetRef": "M17"
    },
    "assetRef": "M17",
    "sourceWrite": "materialId=M17",
    "traitGrant": null
   },
   {
    "id": "MAT18",
    "stage": "S1",
    "name": "旧日琥珀",
    "oldName": "琥珀金",
    "rarity": "epic",
    "role": "构筑",
    "focus": "strength+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "oxide",
     "resonance"
    ],
    "copy": "像封住了一块老热，配战痕刚好。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat18",
     "targetDescription": "原料｜琥珀金沉积纹和暗部层次",
     "sourceWrite": "materialId=M18",
     "assetRef": "M18"
    },
    "assetRef": "M18",
    "sourceWrite": "materialId=M18",
    "traitGrant": null
   },
   {
    "id": "MAT19",
    "stage": "S1",
    "name": "白昼珠光",
    "oldName": "铂珍珠光",
    "rarity": "epic",
    "role": "签名",
    "focus": "craft+design",
    "pool": "探索Ⅲ",
    "statDelta": {
     "craft": 25,
     "design": 21
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "mirror",
     "spectral",
     "signature"
    ],
    "copy": "一层安静的光，费工。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat19",
     "targetDescription": "原料｜白银珠光，反射随视角轻微迁移",
     "sourceWrite": "materialId=M19",
     "assetRef": "M19"
    },
    "assetRef": "M19",
    "sourceWrite": "materialId=M19",
    "traitGrant": null
   },
   {
    "id": "MAT20",
    "stage": "S1",
    "name": "镜流液银",
    "oldName": "液态银",
    "rarity": "epic",
    "role": "冒险",
    "focus": "sharp+craft",
    "pool": "探索Ⅲ",
    "statDelta": {
     "sharpness": 25,
     "craft": 21
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "mirror",
     "flow",
     "unstable"
    ],
    "copy": "镜面会流动，锋线不好收。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat20",
     "targetDescription": "原料｜液态银流向，高光边界可见",
     "sourceWrite": "materialId=M20",
     "assetRef": "M20"
    },
    "assetRef": "M20",
    "sourceWrite": "materialId=M20",
    "traitGrant": null
   },
   {
    "id": "MAT21",
    "stage": "S1",
    "name": "噬光液黑",
    "oldName": "液态黑",
    "rarity": "legend",
    "role": "构筑",
    "focus": "tough+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "toughness": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "void",
     "oxide",
     "resonance"
    ],
    "copy": "大部分反光都被吃掉，只剩亮边。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat21",
     "targetDescription": "原料｜吸光黑面与局部金属边缘",
     "sourceWrite": "materialId=M21",
     "assetRef": "M21"
    },
    "assetRef": "M21",
    "sourceWrite": "materialId=M21",
    "traitGrant": null
   },
   {
    "id": "MAT22",
    "stage": "S1",
    "name": "星落陨铁",
    "oldName": "星陨铁",
    "rarity": "legend",
    "role": "签名",
    "focus": "strength+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "strength": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "星屑嵌进底材，表面似乎有星光轮流。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat22",
     "targetDescription": "原料｜暗钢底下的稀疏星屑",
     "sourceWrite": "materialId=M22",
     "assetRef": "M22"
    },
    "assetRef": "M22",
    "sourceWrite": "materialId=M22",
    "traitGrant": null
   },
   {
    "id": "MAT23",
    "stage": "S1",
    "name": "暗月蚀晶",
    "oldName": "月蚀晶",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "craft": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "void",
     "resonance",
     "signature"
    ],
    "copy": "暗环围着晶体，隐纹的窗口很窄。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat23",
     "targetDescription": "原料｜月蚀环状暗纹与低亮冷边",
     "sourceWrite": "materialId=M23",
     "assetRef": "M23"
    },
    "assetRef": "M23",
    "sourceWrite": "materialId=M23",
    "traitGrant": null
   },
   {
    "id": "MAT24",
    "stage": "S1",
    "name": "零相极光",
    "oldName": "极光银",
    "rarity": "mythic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow",
     "signature"
    ],
    "copy": "每一个角度都有独特光感的炫彩刀材。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat24",
     "targetDescription": "原料｜极光偏色沿边缘缓慢漂移",
     "sourceWrite": "materialId=M24",
     "assetRef": "M24"
    },
    "assetRef": "M24",
    "sourceWrite": "materialId=M24",
    "traitGrant": null
   },
   {
    "id": "MAT25",
    "stage": "S1",
    "name": "天坠陨铁",
    "oldName": "天降陨铁",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+craft+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "craft": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 16,
    "riskLabel": "极高",
    "tags": [
     "flow",
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "结构不驯服，越做越险。",
    "visualSpec": {
     "slots": [
      "material"
     ],
     "recipeKey": "forge_s1_mat25",
     "targetDescription": "原料｜陨铁黑银底色，局部出现不规则光脉",
     "sourceWrite": "materialId=M25",
     "assetRef": "M25"
    },
    "assetRef": "M25",
    "sourceWrite": "materialId=M25",
    "traitGrant": null
   },
   {
    "id": "S2_01",
    "stage": "S2",
    "name": "静域熔",
    "oldName": "慢火纯熔",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "clean"
    ],
    "copy": "熔得够静，杂质沉到底部。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_01",
     "targetDescription": "熔炼｜粗糙度降低，杂质对比收束",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_02",
    "stage": "S2",
    "name": "逆流熔",
    "oldName": "激流熔淬",
    "rarity": "fine",
    "role": "取舍",
    "focus": "strength>craft",
    "pool": "基础池",
    "statDelta": {
     "strength": 17,
     "craft": -5
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "hetero",
     "flow"
    ],
    "copy": "两股流不合并，难做但出来的东西强。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_02",
     "targetDescription": "熔炼｜熔流反向拉伸，留下细微分界",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_03",
    "stage": "S2",
    "name": "双腔熔",
    "oldName": "双膛熔炼",
    "rarity": "fine",
    "role": "专精",
    "focus": "strength+tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "toughness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "layer",
     "stable"
    ],
    "copy": "两个温腔对撞，材质更紧。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_03",
     "targetDescription": "熔炼｜双层密度渐变，不额外发光",
     "sourceWrite": "variants.melt(contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_04",
    "stage": "S2",
    "name": "冷核熔",
    "oldName": "冷锻淬心",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "clean",
     "cold"
    ],
    "copy": "波动压回核心。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_04",
     "targetDescription": "熔炼｜中心纹理收敛，边缘保留冷相",
     "sourceWrite": "variants.melt(warp/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(warp/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S2_05",
    "stage": "S2",
    "name": "均质池",
    "oldName": "均匀熔池",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "clean",
     "precision"
    ],
    "copy": "材质匀，走中间那条路。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_05",
     "targetDescription": "熔炼｜纹理密度均匀，镜面不夸张",
     "sourceWrite": "variants.melt(contrast/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S2_06",
    "stage": "S2",
    "name": "杂矿炉",
    "oldName": "杂矿入炉",
    "rarity": "fine",
    "role": "冒险",
    "focus": "tough>craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "craft": -5
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "hetero",
     "oxide",
     "unstable"
    ],
    "copy": "留着斑驳，但也留着应力。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_06",
     "targetDescription": "熔炼｜斑驳颗粒与不规则暗点",
     "sourceWrite": "variants.melt(roughnessStrength/contrast/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast/warp)",
    "traitGrant": null
   },
   {
    "id": "S2_07",
    "stage": "S2",
    "name": "恒温炉",
    "oldName": "中温常熔",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "balanced"
    ],
    "copy": "火候卡在窗口里，稳当。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_07",
     "targetDescription": "熔炼｜平缓对比与中性金属反射",
     "sourceWrite": "variants.melt(contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_08",
    "stage": "S2",
    "name": "快线熔",
    "oldName": "快速熔透",
    "rarity": "fine",
    "role": "冒险",
    "focus": "strength+sharp",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "flow",
     "unstable"
    ],
    "copy": "熔体快穿，锋力来了，应力也来。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_08",
     "targetDescription": "熔炼｜流线拉长，边缘高光更锐",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_09",
    "stage": "S2",
    "name": "真空净",
    "oldName": "真空熔炼",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "clean",
     "mirror",
     "precision"
    ],
    "copy": "杂质抽空，干净，但也淡了。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_09",
     "targetDescription": "熔炼｜杂质点消退，冷镜面更干净",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_10",
    "stage": "S2",
    "name": "脱氧炼",
    "oldName": "脱氧精炼",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "clean",
     "stable"
    ],
    "copy": "去掉多余的氧化。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_10",
     "targetDescription": "熔炼｜氧化斑减少，金属底色统一",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_11",
    "stage": "S2",
    "name": "细晶流",
    "oldName": "硅锰细化",
    "rarity": "fine",
    "role": "构筑",
    "focus": "strength+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "craft": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "precision",
     "flow"
    ],
    "copy": "晶粒顺着回路排，好接后面的精修。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_11",
     "targetDescription": "熔炼｜晶粒细化，出现可追踪的细流方向",
     "sourceWrite": "variants.melt(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_12",
    "stage": "S2",
    "name": "微量异合",
    "oldName": "微合金钢",
    "rarity": "rare",
    "role": "构筑",
    "focus": "strength+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "hetero",
     "resonance"
    ],
    "copy": "把一点异质压进合金里。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_12",
     "targetDescription": "熔炼｜细小异色夹层，色彩克制",
     "sourceWrite": "variants.melt(contrast/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S2_13",
    "stage": "S2",
    "name": "深冷回炼",
    "oldName": "深冷回溶",
    "rarity": "rare",
    "role": "稳健",
    "focus": "tough+sharp",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "sharpness": 14
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "clean",
     "cold"
    ],
    "copy": "重走一遍不稳区，韧劲回来。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_13",
     "targetDescription": "熔炼｜冷相边界清楚，表面收敛",
     "sourceWrite": "variants.melt(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_14",
    "stage": "S2",
    "name": "天铁入炉",
    "oldName": "天铁入炉",
    "rarity": "rare",
    "role": "冒险",
    "focus": "strength+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "hetero",
     "resonance",
     "unstable"
    ],
    "copy": "天外铁下炉，特性可能会醒。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_14",
     "targetDescription": "熔炼｜陨铁纹理被拉入主金属",
     "sourceWrite": "variants.melt(contrast/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/warp)",
    "traitGrant": null
   },
   {
    "id": "S2_15",
    "stage": "S2",
    "name": "双金熔界",
    "oldName": "双金熔接",
    "rarity": "rare",
    "role": "构筑",
    "focus": "strength+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "craft": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "hetero",
     "layer"
    ],
    "copy": "不求混匀，各自留着身份。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_15",
     "targetDescription": "熔炼｜两种金属形成清晰层界",
     "sourceWrite": "variants.melt(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_16",
    "stage": "S2",
    "name": "共晶切面",
    "oldName": "共晶熔炼",
    "rarity": "rare",
    "role": "专精",
    "focus": "strength+design",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "design": 17
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "precision",
     "layer"
    ],
    "copy": "凝成几何切面，用韧性换结构。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_16",
     "targetDescription": "熔炼｜块面边界更硬朗，形成晶格感",
     "sourceWrite": "variants.melt(shardScale/shardContrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(shardScale/shardContrast)",
    "traitGrant": null
   },
   {
    "id": "S2_17",
    "stage": "S2",
    "name": "纳米匀晶",
    "oldName": "纳米晶熔",
    "rarity": "epic",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": 21,
     "craft": 17
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "clean",
     "precision"
    ],
    "copy": "晶粒细密，后面工序好走。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_17",
     "targetDescription": "熔炼｜细密微晶，低噪点金属表面",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_18",
    "stage": "S2",
    "name": "神铁共鸣",
    "oldName": "神铁共鸣",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 22,
     "craft": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "hetero",
     "signature"
    ],
    "copy": "陨铁跟主材起了共鸣，收不住。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_18",
     "targetDescription": "熔炼｜材料脉冲沿内部层界闪现",
     "sourceWrite": "variants.melt(contrast/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/warp)",
    "traitGrant": null
   },
   {
    "id": "S2_19",
    "stage": "S2",
    "name": "星屑悬熔",
    "oldName": "星屑熔合",
    "rarity": "epic",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "resonance",
     "flow"
    ],
    "copy": "星屑悬在熔层中间，不沉下来。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_19",
     "targetDescription": "熔炼｜微雾与星屑在材质深处漂移",
     "sourceWrite": "variants.melt(mistLarge/mistSmall/softness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(mistLarge/mistSmall/softness)",
    "traitGrant": null
   },
   {
    "id": "S2_20",
    "stage": "S2",
    "name": "熔核越界",
    "oldName": "熔核聚变",
    "rarity": "epic",
    "role": "冒险",
    "focus": "strength>tough",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 30,
     "toughness": -11
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "unstable"
    ],
    "copy": "熔核越了线，强度跟灵性一起涨。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_20",
     "targetDescription": "熔炼｜熔核局部鼓起，边界产生热形变",
     "sourceWrite": "variants.melt(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_21",
    "stage": "S2",
    "name": "神熔凝晶",
    "oldName": "神熔凝晶",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "craft": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "mirror",
     "precision",
     "signature"
    ],
    "copy": "液态反光凝成晶面，能当标记用。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_21",
     "targetDescription": "熔炼｜液态镜面凝成几何晶边",
     "sourceWrite": "variants.melt(roughnessStrength/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(roughnessStrength/contrast)",
    "traitGrant": null
   },
   {
    "id": "S2_22",
    "stage": "S2",
    "name": "天髓秘纹",
    "oldName": "天髓熔炼",
    "rarity": "legend",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 16,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "layer",
     "signature"
    ],
    "copy": "秘纹不露出来，留着后面再提。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_22",
     "targetDescription": "熔炼｜暗层内出现细微秘纹",
     "sourceWrite": "variants.melt(contrast/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/warp)",
    "traitGrant": null
   },
   {
    "id": "S2_23",
    "stage": "S2",
    "name": "玄火斜流",
    "oldName": "玄火熔心",
    "rarity": "legend",
    "role": "冒险",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "flow",
     "unstable"
    ],
    "copy": "热流留下方向，再追就险。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_23",
     "targetDescription": "熔炼｜热流沿斜向爬行，局部偏色",
     "sourceWrite": "variants.melt(flowDir/stretch)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(flowDir/stretch)",
    "traitGrant": null
   },
   {
    "id": "S2_24",
    "stage": "S2",
    "name": "熔界天工",
    "oldName": "神熔天工",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+craft+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "craft": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 20,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "hetero",
     "unstable",
     "signature"
    ],
    "copy": "熔核还没定型，每锤下去都可能变。",
    "visualSpec": {
     "slots": [
      "melt"
     ],
     "recipeKey": "forge_s2_s2_24",
     "targetDescription": "熔炼｜材质的流向与反射由种子生成独特组合",
     "sourceWrite": "variants.melt(contrast/warp/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.melt(contrast/warp/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S3_01",
    "stage": "S3",
    "name": "素面锻",
    "oldName": "素面锻",
    "rarity": "common",
    "role": "稳健",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "clean",
     "precision"
    ],
    "copy": "把多余纹路压平，留白。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_01",
     "targetDescription": "纹理｜干净素面，低对比细哑光",
     "sourceWrite": "textureId=T01 + variants.texture(contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T01 + variants.texture(contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_02",
    "stage": "S3",
    "name": "缓波纹",
    "oldName": "水波锻",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+design",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "flow",
     "clean"
    ],
    "copy": "波纹匀开，不压材质本来的味道。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_02",
     "targetDescription": "纹理｜低频水波，间距清楚",
     "sourceWrite": "textureId=T05 + variants.texture(frequency/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T05 + variants.texture(frequency/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_03",
    "stage": "S3",
    "name": "定向丝",
    "oldName": "拉丝锻",
    "rarity": "common",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "precision",
     "flow"
    ],
    "copy": "锤痕收成同一个方向。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_03",
     "targetDescription": "纹理｜方向性拉丝，高光沿轴线移动",
     "sourceWrite": "textureId=T02 + variants.texture(density/anisotropy)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T02 + variants.texture(density/anisotropy)",
    "traitGrant": null
   },
   {
    "id": "S3_04",
    "stage": "S3",
    "name": "粗锤痕",
    "oldName": "粗面锻",
    "rarity": "common",
    "role": "取舍",
    "focus": "tough>craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "craft": -5
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "weather",
     "layer"
    ],
    "copy": "锤痕不磨平，留着糙感。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_04",
     "targetDescription": "纹理｜稀疏锤点与粗颗粒阴影",
     "sourceWrite": "textureId=T03 + variants.texture(roughnessStrength/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T03 + variants.texture(roughnessStrength/warp)",
    "traitGrant": null
   },
   {
    "id": "S3_05",
    "stage": "S3",
    "name": "微密纹",
    "oldName": "素面密纹",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "clean",
     "precision"
    ],
    "copy": "远看干净，转起来才见密纹。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_05",
     "targetDescription": "纹理｜近距离才显现的微密纹",
     "sourceWrite": "textureId=T01 + variants.texture(contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T01 + variants.texture(contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_06",
    "stage": "S3",
    "name": "宽波纹",
    "oldName": "缓波锻纹",
    "rarity": "fine",
    "role": "稳健",
    "focus": "design+craft",
    "pool": "基础池",
    "statDelta": {
     "craft": 10,
     "design": 12
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "flow"
    ],
    "copy": "波纹拉宽，远处能认出来。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_06",
     "targetDescription": "纹理｜宽波峰、低频流向",
     "sourceWrite": "textureId=T05 + variants.texture(frequency/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T05 + variants.texture(frequency/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_07",
    "stage": "S3",
    "name": "纵丝纹",
    "oldName": "纵向拉丝",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "precision",
     "flow"
    ],
    "copy": "纹路顺着刀身走，刃线利落。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_07",
     "targetDescription": "纹理｜细直线丝沿刀身延展",
     "sourceWrite": "textureId=T02 + variants.texture(direction/density)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T02 + variants.texture(direction/density)",
    "traitGrant": null
   },
   {
    "id": "S3_08",
    "stage": "S3",
    "name": "六边格",
    "oldName": "网格刻纹",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "precision",
     "layer"
    ],
    "copy": "规则的格纹压进表面。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_08",
     "targetDescription": "纹理｜低起伏六边格，规则边界可见",
     "sourceWrite": "textureId=T07 + variants.texture(tile/gridScale)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T07 + variants.texture(tile/gridScale)",
    "traitGrant": null
   },
   {
    "id": "S3_09",
    "stage": "S3",
    "name": "密层纹",
    "oldName": "密织锻纹",
    "rarity": "fine",
    "role": "构筑",
    "focus": "strength+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "craft": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "layer",
     "precision"
    ],
    "copy": "锤点压成暗层，适合配异质。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_09",
     "targetDescription": "纹理｜密集短锤点叠成暗层",
     "sourceWrite": "textureId=T03 + variants.texture(roughnessStrength/warp)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T03 + variants.texture(roughnessStrength/warp)",
    "traitGrant": null
   },
   {
    "id": "S3_10",
    "stage": "S3",
    "name": "碎晶分形",
    "oldName": "碎晶锻纹",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "hetero",
     "layer"
    ],
    "copy": "晶格自己裂开。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_10",
     "targetDescription": "纹理｜不规则晶格，边界有轻微断续",
     "sourceWrite": "textureId=T06 + variants.texture(cellScale/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T06 + variants.texture(cellScale/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_11",
    "stage": "S3",
    "name": "浅刻线",
    "oldName": "浅蚀刻纹",
    "rarity": "fine",
    "role": "稳健",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "precision",
     "clean"
    ],
    "copy": "浅刻理面，好覆盖其他纹路。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_11",
     "targetDescription": "纹理｜浅细刻线，哑光与高光分层",
     "sourceWrite": "textureId=T11 + variants.texture(lineDensity/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T11 + variants.texture(lineDensity/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S3_12",
    "stage": "S3",
    "name": "矿屑锋面",
    "oldName": "细碎矿纹",
    "rarity": "rare",
    "role": "取舍",
    "focus": "sharp>tough",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": -7,
     "sharpness": 23
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "hetero",
     "layer"
    ],
    "copy": "碎屑留在表层，用来换锋口。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_12",
     "targetDescription": "纹理｜碎矿片状纹理，局部锋利反光",
     "sourceWrite": "textureId=T12 + variants.texture(shardScale/shardContrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T12 + variants.texture(shardScale/shardContrast)",
    "traitGrant": null
   },
   {
    "id": "S3_13",
    "stage": "S3",
    "name": "深格纹",
    "oldName": "六边锻纹",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "precision",
     "layer"
    ],
    "copy": "几何边界加深，成了结构。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_13",
     "targetDescription": "纹理｜深格几何，边界清楚但不发光",
     "sourceWrite": "textureId=T07 + variants.texture(tile/gridScale)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T07 + variants.texture(tile/gridScale)",
    "traitGrant": null
   },
   {
    "id": "S3_14",
    "stage": "S3",
    "name": "交脊叠纹",
    "oldName": "叠纹锻打",
    "rarity": "rare",
    "role": "构筑",
    "focus": "strength+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "craft": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "layer",
     "hetero"
    ],
    "copy": "两套锻纹交错压合，成了层。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_14",
     "targetDescription": "纹理｜双向层纹交叉，形成明显明暗脊线",
     "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_15",
    "stage": "S3",
    "name": "单向熔纹",
    "oldName": "火焰锻",
    "rarity": "rare",
    "role": "冒险",
    "focus": "strength+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "flow",
     "heat",
     "unstable"
    ],
    "copy": "锤痕拉成熔流，难稳。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_15",
     "targetDescription": "纹理｜熔流状纹理朝单一方向拉长",
     "sourceWrite": "textureId=T08 + variants.texture(flowDir/stretch)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T08 + variants.texture(flowDir/stretch)",
    "traitGrant": null
   },
   {
    "id": "S3_16",
    "stage": "S3",
    "name": "阔晶错层",
    "oldName": "阔晶锻纹",
    "rarity": "rare",
    "role": "专精",
    "focus": "strength+design",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "design": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "layer",
     "hetero"
    ],
    "copy": "晶格放大，粗犷，好认。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_16",
     "targetDescription": "纹理｜宽晶块与空隙交替，远景清晰",
     "sourceWrite": "textureId=T06 + variants.texture(cellScale/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T06 + variants.texture(cellScale/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_17",
    "stage": "S3",
    "name": "深刻聚刃",
    "oldName": "深刻蚀纹",
    "rarity": "epic",
    "role": "构筑",
    "focus": "craft+sharp",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 17,
     "craft": 21
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "precision",
     "edge"
    ],
    "copy": "刻线收向刃口，接着开刃。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_17",
     "targetDescription": "纹理｜刻线深入，刃线高光更聚焦",
     "sourceWrite": "textureId=T11 + variants.texture(lineDensity/lineWidth/roughnessStrength)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T11 + variants.texture(lineDensity/lineWidth/roughnessStrength)",
    "traitGrant": null
   },
   {
    "id": "S3_18",
    "stage": "S3",
    "name": "雾界分流",
    "oldName": "雾状幻彩",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "flow",
     "spectral",
     "resonance"
    ],
    "copy": "雾纹在层间漂浮，虹彩有位子。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_18",
     "targetDescription": "纹理｜软雾分层，边缘不完全规则",
     "sourceWrite": "textureId=T09 + variants.texture(mistLarge/mistSmall/softness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T09 + variants.texture(mistLarge/mistSmall/softness)",
    "traitGrant": null
   },
   {
    "id": "S3_19",
    "stage": "S3",
    "name": "云彩偏光",
    "oldName": "彩色云纹",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow"
    ],
    "copy": "彩色顺着锻纹折，不铺满。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_19",
     "targetDescription": "纹理｜云状偏色，色彩只沿纹理出现",
     "sourceWrite": "textureId=T10 + variants.texture(softness/colorSpread)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T10 + variants.texture(softness/colorSpread)",
    "traitGrant": null
   },
   {
    "id": "S3_20",
    "stage": "S3",
    "name": "秘锻窄脊",
    "oldName": "深叠锻纹",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 22,
     "craft": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "layer",
     "oxide",
     "resonance",
     "signature"
    ],
    "copy": "纹理压进深处，留着后头提。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_20",
     "targetDescription": "纹理｜深色大马士革式层纹与窄亮脊",
     "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_21",
    "stage": "S3",
    "name": "留白雾境",
    "oldName": "雾团锻纹",
    "rarity": "legend",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "flow",
     "spectral"
    ],
    "copy": "雾纹做主角，边界留给后处理。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_21",
     "targetDescription": "纹理｜大块软雾团，留出金属负空间",
     "sourceWrite": "textureId=T09 + variants.texture(mistLarge/mistSmall/softness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T09 + variants.texture(mistLarge/mistSmall/softness)",
    "traitGrant": null
   },
   {
    "id": "S3_22",
    "stage": "S3",
    "name": "残彩错片",
    "oldName": "残色锻纹",
    "rarity": "legend",
    "role": "冒险",
    "focus": "design>tough",
    "pool": "签名工艺",
    "statDelta": {
     "toughness": -13,
     "design": 30
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "hetero",
     "oxide",
     "unstable"
    ],
    "copy": "色块错位，要稳性就稳，要稀有就稀。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_22",
     "targetDescription": "纹理｜残色碎片、错位块面",
     "sourceWrite": "textureId=T12 + variants.texture(shardScale/shardContrast/plateThickness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T12 + variants.texture(shardScale/shardContrast/plateThickness)",
    "traitGrant": null
   },
   {
    "id": "S3_23",
    "stage": "S3",
    "name": "暗脊回廊",
    "oldName": "暗纹神锻",
    "rarity": "legend",
    "role": "构筑",
    "focus": "craft+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "craft": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "layer",
     "void",
     "resonance"
    ],
    "copy": "转角度才看得见秘纹，不正面露。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_23",
     "targetDescription": "纹理｜低亮层纹在暗面里间歇出现",
     "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "S3_24",
    "stage": "S3",
    "name": "异轨天纹",
    "oldName": "神纹天锻",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+craft+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "craft": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 18,
    "riskLabel": "极高",
    "tags": [
     "layer",
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "纹理不守模板，留着这一局自己的痕迹。",
    "visualSpec": {
     "slots": [
      "texture"
     ],
     "recipeKey": "forge_s3_s3_24",
     "targetDescription": "纹理｜根据种子生成独特层纹走向与节点",
     "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "textureId=T04 + variants.texture(warp/contrast)",
    "traitGrant": null
   },
   {
    "id": "K01",
    "stage": "S4",
    "name": "蝴蝶刀",
    "oldName": "蝴蝶刀",
    "rarity": "fine",
    "role": "稳健",
    "focus": "design+craft",
    "pool": "基础池",
    "statDelta": {
     "craft": 10,
     "design": 12
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "fold",
     "precision"
    ],
    "copy": "双柄翻合，收在指尖。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k01",
     "targetDescription": "刀型｜保留蝴蝶刀轮廓，铰链高光更明确",
     "sourceWrite": "knifeType=balisong",
     "assetRef": "balisong"
    },
    "assetRef": "balisong",
    "sourceWrite": "knifeType=balisong",
    "traitGrant": null
   },
   {
    "id": "K02",
    "stage": "S4",
    "name": "刺刀",
    "oldName": "刺刀",
    "rarity": "common",
    "role": "专精",
    "focus": "strength+sharp",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "rigid"
    ],
    "copy": "直线压到底，锋芒全在尖上。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k02",
     "targetDescription": "刀型｜直刺轮廓，刃脊更明确",
     "sourceWrite": "knifeType=bayonet",
     "assetRef": "bayonet"
    },
    "assetRef": "bayonet",
    "sourceWrite": "knifeType=bayonet",
    "traitGrant": null
   },
   {
    "id": "K03",
    "stage": "S4",
    "name": "折叠刀",
    "oldName": "折叠刀",
    "rarity": "common",
    "role": "稳健",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "fold",
     "precision"
    ],
    "copy": "结构收进简洁的轮廓里。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k03",
     "targetDescription": "刀型｜折叠关节和轮廓折线清晰",
     "sourceWrite": "knifeType=folding",
     "assetRef": "folding"
    },
    "assetRef": "folding",
    "sourceWrite": "knifeType=folding",
    "traitGrant": null
   },
   {
    "id": "K04",
    "stage": "S4",
    "name": "罗马短剑",
    "oldName": "罗马短剑",
    "rarity": "common",
    "role": "专精",
    "focus": "strength+sharp",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "rigid",
     "impact"
    ],
    "copy": "短宽身，力量直接，轻巧就往后放。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k04",
     "targetDescription": "刀型｜短宽刀身，前端重心明显",
     "sourceWrite": "knifeType=gladius",
     "assetRef": "gladius"
    },
    "assetRef": "gladius",
    "sourceWrite": "knifeType=gladius",
    "traitGrant": null
   },
   {
    "id": "K05",
    "stage": "S4",
    "name": "爪子刀",
    "oldName": "爪子刀",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+spirit",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "curve",
     "edge"
    ],
    "copy": "弧刃回勾，近身最狠。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k05",
     "targetDescription": "刀型｜弧刃钩线增强，内侧高光更锐",
     "sourceWrite": "knifeType=karambit",
     "assetRef": "karambit"
    },
    "assetRef": "karambit",
    "sourceWrite": "knifeType=karambit",
    "traitGrant": null
   },
   {
    "id": "K06",
    "stage": "S4",
    "name": "马来剑",
    "oldName": "马来剑",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "基础池",
    "statDelta": {
     "design": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "curve",
     "flow"
    ],
    "copy": "波峰错开，流纹好接着做。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k06",
     "targetDescription": "刀型｜波浪刃节奏清晰，避免发光描边",
     "sourceWrite": "knifeType=kris",
     "assetRef": "kris"
    },
    "assetRef": "kris",
    "sourceWrite": "knifeType=kris",
    "traitGrant": null
   },
   {
    "id": "K07",
    "stage": "S4",
    "name": "开山刀",
    "oldName": "砍刀",
    "rarity": "fine",
    "role": "专精",
    "focus": "strength+tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "toughness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "impact",
     "rigid"
    ],
    "copy": "重心压在刀头，走厚重路线。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k07",
     "targetDescription": "刀型｜宽刃与前端体量更突出",
     "sourceWrite": "knifeType=machete",
     "assetRef": "machete"
    },
    "assetRef": "machete",
    "sourceWrite": "knifeType=machete",
    "traitGrant": null
   },
   {
    "id": "K08",
    "stage": "S4",
    "name": "弯刀",
    "oldName": "弯刀",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+design",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "curve",
     "edge"
    ],
    "copy": "弧线从柄连到刃尖。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k08",
     "targetDescription": "刀型｜长弧刀背和刃线连贯",
     "sourceWrite": "knifeType=saber",
     "assetRef": "saber"
    },
    "assetRef": "saber",
    "sourceWrite": "knifeType=saber",
    "traitGrant": null
   },
   {
    "id": "K09",
    "stage": "S4",
    "name": "骷髅匕首",
    "oldName": "骷髅匕首",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "precision",
     "void"
    ],
    "copy": "用负空间成形，结构清楚。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k09",
     "targetDescription": "刀型｜战术轮廓与骨架式负空间",
     "sourceWrite": "knifeType=skull",
     "assetRef": "skull"
    },
    "assetRef": "skull",
    "sourceWrite": "knifeType=skull",
    "traitGrant": null
   },
   {
    "id": "K10",
    "stage": "S4",
    "name": "直刀",
    "oldName": "直刀",
    "rarity": "common",
    "role": "稳健",
    "focus": "strength+tough",
    "pool": "基础池",
    "statDelta": {
     "strength": 12,
     "toughness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "rigid",
     "stable"
    ],
    "copy": "不靠造型，靠轴线和比例。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k10",
     "targetDescription": "刀型｜直线刀身，轮廓干净稳定",
     "sourceWrite": "knifeType=straight",
     "assetRef": "straight"
    },
    "assetRef": "straight",
    "sourceWrite": "knifeType=straight",
    "traitGrant": null
   },
   {
    "id": "K11",
    "stage": "S4",
    "name": "生存刀",
    "oldName": "生存刀",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "stable",
     "utility"
    ],
    "copy": "分区清楚，好接着加战痕。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k11",
     "targetDescription": "刀型｜刀背功能结构明确，厚薄关系可见",
     "sourceWrite": "knifeType=survival",
     "assetRef": "survival"
    },
    "assetRef": "survival",
    "sourceWrite": "knifeType=survival",
    "traitGrant": null
   },
   {
    "id": "K12",
    "stage": "S4",
    "name": "唐刀",
    "oldName": "唐刀",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "基础池",
    "statDelta": {
     "design": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "flow",
     "signature"
    ],
    "copy": "长线留白，好上纹理。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k12",
     "targetDescription": "刀型｜修长轮廓，长刃留白明显",
     "sourceWrite": "knifeType=tangdao",
     "assetRef": "tangdao"
    },
    "assetRef": "tangdao",
    "sourceWrite": "knifeType=tangdao",
    "traitGrant": null
   },
   {
    "id": "K13",
    "stage": "S4",
    "name": "辉光唐刀",
    "oldName": "流光唐刀 / 全息唐刀",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+design",
    "pool": "探索Ⅲ",
    "statDelta": {
     "craft": 25,
     "design": 21
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "precision",
     "flow",
     "signature"
    ],
    "copy": "长身留白，辉晕顺着刀线走。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k13",
     "targetDescription": "唐刀｜流光（trail4+glow）",
     "sourceWrite": "knifeType=tangdao + variants.effect(glow)",
     "assetRef": "tangdao"
    },
    "assetRef": "tangdao",
    "sourceWrite": "knifeType=tangdao + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K14",
    "stage": "S4",
    "name": "流光直刀",
    "oldName": "星尘直刀 / 溶解直刀",
    "rarity": "epic",
    "role": "构筑",
    "focus": "strength+tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "toughness": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "layer",
     "rigid"
    ],
    "copy": "一道直线光，从头走到尾。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k14",
     "targetDescription": "直刀｜星尘（trail2+dust）",
     "sourceWrite": "knifeType=straight + variants.effect(glow)",
     "assetRef": "straight"
    },
    "assetRef": "straight",
    "sourceWrite": "knifeType=straight + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K15",
    "stage": "S4",
    "name": "微光刺刀",
    "oldName": "星辉刺刀 / 脉冲刺刀",
    "rarity": "rare",
    "role": "冒险",
    "focus": "strength+sharp",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 16,
     "sharpness": 14
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "edge",
     "heat",
     "unstable"
    ],
    "copy": "锋线薄而亮，够用。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k15",
     "targetDescription": "刺刀｜星辉（trail4+dust+glow）",
     "sourceWrite": "knifeType=bayonet + variants.effect(glow)",
     "assetRef": "bayonet"
    },
    "assetRef": "bayonet",
    "sourceWrite": "knifeType=bayonet + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K16",
    "stage": "S4",
    "name": "微光折刀",
    "oldName": "双环折刀 / 全息折刀",
    "rarity": "rare",
    "role": "构筑",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "fold",
     "precision"
    ],
    "copy": "折起来也带一层薄光。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k16",
     "targetDescription": "折叠刀｜双环（trail2+glow）",
     "sourceWrite": "knifeType=folding + variants.effect(glow)",
     "assetRef": "folding"
    },
    "assetRef": "folding",
    "sourceWrite": "knifeType=folding + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K17",
    "stage": "S4",
    "name": "辉光开山刀",
    "oldName": "流光开山刀 / 溶解开山刀",
    "rarity": "legend",
    "role": "冒险",
    "focus": "strength+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "impact",
     "unstable"
    ],
    "copy": "重刃压住场面，辉光裹到刀尾。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k17",
     "targetDescription": "开山刀｜流光（trail4+glow）",
     "sourceWrite": "knifeType=machete + variants.effect(glow)",
     "assetRef": "machete"
    },
    "assetRef": "machete",
    "sourceWrite": "knifeType=machete + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K18",
    "stage": "S4",
    "name": "微光生存刀",
    "oldName": "星尘生存刀 / 脉冲生存刀",
    "rarity": "rare",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "oxide",
     "weather",
     "stable"
    ],
    "copy": "糙面带微光，耐造。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k18",
     "targetDescription": "生存刀｜星尘（trail2+dust）",
     "sourceWrite": "knifeType=survival + variants.effect(glow)",
     "assetRef": "survival"
    },
    "assetRef": "survival",
    "sourceWrite": "knifeType=survival + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K19",
    "stage": "S4",
    "name": "流光蝴蝶刀",
    "oldName": "星辉蝴蝶刀 / 星云蝴蝶刀",
    "rarity": "epic",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "spectral",
     "fold"
    ],
    "copy": "双柄甩开，流光顺着刃口走。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k19",
     "targetDescription": "蝴蝶刀｜星辉（trail4+dust+glow）",
     "sourceWrite": "knifeType=balisong + variants.effect(glow)",
     "assetRef": "balisong"
    },
    "assetRef": "balisong",
    "sourceWrite": "knifeType=balisong + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K20",
    "stage": "S4",
    "name": "微光短剑",
    "oldName": "双环短剑 / 全息短剑",
    "rarity": "rare",
    "role": "专精",
    "focus": "strength+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "craft": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "layer",
     "rigid"
    ],
    "copy": "短刃薄光，压住重心。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k20",
     "targetDescription": "罗马短剑｜双环（trail2+glow）",
     "sourceWrite": "knifeType=gladius + variants.effect(glow)",
     "assetRef": "gladius"
    },
    "assetRef": "gladius",
    "sourceWrite": "knifeType=gladius + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K21",
    "stage": "S4",
    "name": "流光爪刀",
    "oldName": "星辉爪刀 / 星云爪刀",
    "rarity": "epic",
    "role": "构筑",
    "focus": "sharp+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "curve",
     "edge",
     "void"
    ],
    "copy": "弧口带光，近身时最亮。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k21",
     "targetDescription": "爪子刀｜星辉（trail4+dust+glow）",
     "sourceWrite": "knifeType=karambit + variants.effect(glow)",
     "assetRef": "karambit"
    },
    "assetRef": "karambit",
    "sourceWrite": "knifeType=karambit + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K22",
    "stage": "S4",
    "name": "辉光马来剑",
    "oldName": "流光马来剑 / 脉冲马来剑",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "craft": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "flow",
     "resonance",
     "signature"
    ],
    "copy": "波刃带辉，曲折处最亮。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k22",
     "targetDescription": "马来剑｜流光（trail4+glow）",
     "sourceWrite": "knifeType=kris + variants.effect(glow)",
     "assetRef": "kris"
    },
    "assetRef": "kris",
    "sourceWrite": "knifeType=kris + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K23",
    "stage": "S4",
    "name": "流光弯刀",
    "oldName": "星尘弯刀 / 星云弯刀",
    "rarity": "epic",
    "role": "构筑",
    "focus": "sharp+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "design": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "curve",
     "flow",
     "edge"
    ],
    "copy": "弧线一路拖着光，不断。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k23",
     "targetDescription": "弯刀｜星尘（trail2+dust）",
     "sourceWrite": "knifeType=saber + variants.effect(glow)",
     "assetRef": "saber"
    },
    "assetRef": "saber",
    "sourceWrite": "knifeType=saber + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "K24",
    "stage": "S4",
    "name": "辉光骷髅",
    "oldName": "双环骷髅 / 溶解骷髅",
    "rarity": "mythic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "void",
     "resonance",
     "signature"
    ],
    "copy": "暗腔吞掉大部分光，只有外缘亮。",
    "visualSpec": {
     "slots": [
      "form"
     ],
     "recipeKey": "forge_s4_k24",
     "targetDescription": "骷髅匕首｜双环（trail2+glow）",
     "sourceWrite": "knifeType=skull + variants.effect(glow)",
     "assetRef": "skull"
    },
    "assetRef": "skull",
    "sourceWrite": "knifeType=skull + variants.effect(glow)",
    "traitGrant": null
   },
   {
    "id": "S5_25",
    "stage": "S5",
    "name": "静镜留底",
    "oldName": "精抛",
    "rarity": "common",
    "role": "稳健",
    "focus": "craft+sharp",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 10,
     "craft": 12
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "mirror",
     "clean"
    ],
    "copy": "表面澄净，不盖住底纹。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_25",
     "targetDescription": "淬火｜清亮镜面，保留底层纹理",
     "sourceWrite": "finishId=F01 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F01 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_01",
    "stage": "S5",
    "name": "冷蓝幕层",
    "oldName": "油淬",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "oxide",
     "stable"
    ],
    "copy": "一层克制的蓝，不往外扩。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_01",
     "targetDescription": "淬火｜深蓝薄膜，色彩集中在反射角",
     "sourceWrite": "finishId=F05 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F05 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_02",
    "stage": "S5",
    "name": "急冷锁锋",
    "oldName": "水淬",
    "rarity": "fine",
    "role": "冒险",
    "focus": "sharp>tough",
    "pool": "基础池",
    "statDelta": {
     "toughness": -5,
     "sharpness": 17
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "edge",
     "unstable"
    ],
    "copy": "冷得急，硬度锁进刃口。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_02",
     "targetDescription": "淬火｜刃侧出现冷硬色带",
     "sourceWrite": "finishId=F11 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F11 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_03",
    "stage": "S5",
    "name": "冷灰哑面",
    "oldName": "冷淬",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "oxide",
     "cold"
    ],
    "copy": "冷灰压住波动。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_03",
     "targetDescription": "淬火｜低饱和冷灰，粗糙度轻微增加",
     "sourceWrite": "finishId=F02 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F02 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_04",
    "stage": "S5",
    "name": "斜向冷纹",
    "oldName": "风淬",
    "rarity": "fine",
    "role": "构筑",
    "focus": "sharp+design",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "design": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "flow",
     "edge"
    ],
    "copy": "冷风把色带吹斜。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_04",
     "targetDescription": "淬火｜沿气流方向生成细斜纹",
     "sourceWrite": "finishId=F03 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F03 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_05",
    "stage": "S5",
    "name": "盐浴定色",
    "oldName": "盐浴淬",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "heat",
     "spectral"
    ],
    "copy": "盐浴定色，停在这条线。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_05",
     "targetDescription": "淬火｜黄紫窄色带，沿边缘而非全刀铺开",
     "sourceWrite": "finishId=F07 + variants.finish(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F07 + variants.finish(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S5_06",
    "stage": "S5",
    "name": "暗灰吸光",
    "oldName": "灰淬",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "oxide",
     "void",
     "stable"
    ],
    "copy": "暗膜吃掉反光，整体降一个调子。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_06",
     "targetDescription": "淬火｜石墨灰氧化面，反光被压低",
     "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
    "traitGrant": null
   },
   {
    "id": "S5_07",
    "stage": "S5",
    "name": "渐染色层",
    "oldName": "碱淬",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "spectral",
     "flow"
    ],
    "copy": "颜色从刃根走到刀尖。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_07",
     "targetDescription": "淬火｜柔和色相渐变，边界平滑",
     "sourceWrite": "finishId=F05 + variants.finish(amount/gradient)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F05 + variants.finish(amount/gradient)",
    "traitGrant": null
   },
   {
    "id": "S5_08",
    "stage": "S5",
    "name": "细砂压光",
    "oldName": "砂淬",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "clean",
     "edge",
     "stable"
    ],
    "copy": "反射压低，纹理都清楚。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_08",
     "targetDescription": "淬火｜细哑砂面与窄刃线形成低反射分区",
     "sourceWrite": "finishId=F11 + variants.finish(amount/coat)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F11 + variants.finish(amount/coat)",
    "traitGrant": null
   },
   {
    "id": "S5_09",
    "stage": "S5",
    "name": "真空净镜",
    "oldName": "真空淬",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "mirror",
     "precision",
     "cold"
    ],
    "copy": "噪点去掉，各归各位。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_09",
     "targetDescription": "淬火｜冷白反射，细节清晰",
     "sourceWrite": "finishId=F02 + variants.finish(amount)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F02 + variants.finish(amount)",
    "traitGrant": null
   },
   {
    "id": "S5_10",
    "stage": "S5",
    "name": "氮化枪灰",
    "oldName": "氮淬",
    "rarity": "rare",
    "role": "取舍",
    "focus": "sharp>design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 23,
     "design": -7
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "oxide",
     "edge"
    ],
    "copy": "刃口更硬，颜色收窄。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_10",
     "targetDescription": "淬火｜薄硬质镀层，偏冷枪灰",
     "sourceWrite": "finishId=F09 + variants.finish(coat/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F09 + variants.finish(coat/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S5_11",
    "stage": "S5",
    "name": "窄温控窗",
    "oldName": "控温淬",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "precision"
    ],
    "copy": "火候卡在窄窗，稳。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_11",
     "targetDescription": "淬火｜色带窄而均匀，表面不出现随机斑点",
     "sourceWrite": "finishId=F07 + variants.finish(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F07 + variants.finish(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S5_12",
    "stage": "S5",
    "name": "深硬暗纹",
    "oldName": "深淬",
    "rarity": "rare",
    "role": "稳健",
    "focus": "tough+strength",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 14,
     "toughness": 16
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "rigid",
     "cold"
    ],
    "copy": "强化压在深层。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_12",
     "targetDescription": "淬火｜外层变化轻，内部硬化以暗纹表现",
     "sourceWrite": "finishId=F11 + variants.finish(amount/coat)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F11 + variants.finish(amount/coat)",
    "traitGrant": null
   },
   {
    "id": "S5_13",
    "stage": "S5",
    "name": "转角虹膜",
    "oldName": "彩膜淬",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "spectral",
     "resonance"
    ],
    "copy": "彩膜随角度变化。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_13",
     "targetDescription": "淬火｜薄虹彩只在转角出现",
     "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S5_14",
    "stage": "S5",
    "name": "液氮断彩",
    "oldName": "液氮急淬",
    "rarity": "rare",
    "role": "冒险",
    "focus": "sharp+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "spectral",
     "unstable"
    ],
    "copy": "液氮一瞬锁色，鲜明但也险。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_14",
     "targetDescription": "淬火｜色相快速分区，边界锐利",
     "sourceWrite": "finishId=F10 + variants.finish(strength/colorPhase/paletteShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F10 + variants.finish(strength/colorPhase/paletteShift)",
    "traitGrant": null
   },
   {
    "id": "S5_15",
    "stage": "S5",
    "name": "阳极纹彩",
    "oldName": "阳极氧化",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "craft": 17,
     "design": 21
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "spectral",
     "precision"
    ],
    "copy": "虹彩顺着纹理走，不乱铺。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_15",
     "targetDescription": "淬火｜可控虹彩沿表面微观纹理分布",
     "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S5_16",
    "stage": "S5",
    "name": "赤金临界",
    "oldName": "热色淬火",
    "rarity": "epic",
    "role": "冒险",
    "focus": "strength+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "strength": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "unstable"
    ],
    "copy": "热色推到临界，脆也重。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_16",
     "targetDescription": "淬火｜赤金热色带在钢灰间断续浮现",
     "sourceWrite": "finishId=F06 + variants.finish(amount/heatSpread)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F06 + variants.finish(amount/heatSpread)",
    "traitGrant": null
   },
   {
    "id": "S5_17",
    "stage": "S5",
    "name": "磷化暗甲",
    "oldName": "磷化淬",
    "rarity": "epic",
    "role": "取舍",
    "focus": "tough>design",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": 29,
     "design": -9
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "oxide",
     "weather"
    ],
    "copy": "耐看的暗面，艳色压得少。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_17",
     "targetDescription": "淬火｜深灰磷化层与局部磨砂反射",
     "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
    "traitGrant": null
   },
   {
    "id": "S5_18",
    "stage": "S5",
    "name": "横贯热带",
    "oldName": "宽域热色",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "flow",
     "signature"
    ],
    "copy": "热色横穿整片刀身，不停。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_18",
     "targetDescription": "淬火｜宽幅热色带横跨刀身，保留底纹可见",
     "sourceWrite": "finishId=F06 + variants.finish(amount/heatSpread/phase)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F06 + variants.finish(amount/heatSpread/phase)",
    "traitGrant": null
   },
   {
    "id": "S5_19",
    "stage": "S5",
    "name": "幻彩氧层",
    "oldName": "幻彩氧化",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "oxide",
     "spectral",
     "signature"
    ],
    "copy": "虹彩跟氧化层较劲，多一层色。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_19",
     "targetDescription": "淬火｜彩色氧化沿不同粗糙度分区变化",
     "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S5_20",
    "stage": "S5",
    "name": "蓝紫流界",
    "oldName": "多普勒淬",
    "rarity": "legend",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow",
     "resonance",
     "signature"
    ],
    "copy": "颜色跟着角度走，不固定。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_20",
     "targetDescription": "淬火｜视角相关的蓝紫流色，保留金属底反射",
     "sourceWrite": "finishId=F10 + variants.finish(strength/colorPhase/fresnelIntensity/paletteShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F10 + variants.finish(strength/colorPhase/fresnelIntensity/paletteShift)",
    "traitGrant": null
   },
   {
    "id": "S5_21",
    "stage": "S5",
    "name": "神淬虹纹",
    "oldName": "神淬虹彩",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "craft": 26,
     "design": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 16,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "resonance",
     "signature"
    ],
    "copy": "彩膜锁在纹节点上，认得出。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_21",
     "targetDescription": "淬火｜高阶虹彩只在局部纹理上显现",
     "sourceWrite": "finishId=F10 + variants.finish(strength/preserveRatio/colorPhase/paletteShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F10 + variants.finish(strength/preserveRatio/colorPhase/paletteShift)",
    "traitGrant": null
   },
   {
    "id": "S5_22",
    "stage": "S5",
    "name": "玄蚀紫界",
    "oldName": "玄色淬",
    "rarity": "legend",
    "role": "冒险",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "void",
     "oxide",
     "unstable"
    ],
    "copy": "反光压到极低，只留暗边。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_22",
     "targetDescription": "淬火｜暗化表层带细微紫黑边界",
     "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F04 + variants.finish(amount/darkness)",
    "traitGrant": null
   },
   {
    "id": "S5_23",
    "stage": "S5",
    "name": "冷热虹界",
    "oldName": "虹彩淬",
    "rarity": "mythic",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow"
    ],
    "copy": "颜色挤在分界线上，很窄。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_23",
     "targetDescription": "淬火｜虹彩沿冷热交界形成清晰轮廓",
     "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F08 + variants.finish(amount/hueShift/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S5_24",
    "stage": "S5",
    "name": "冷蓝天幕",
    "oldName": "神淬天淬",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+craft+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "craft": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 20,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow",
     "unstable",
     "signature"
    ],
    "copy": "配色不定，看前面几道工序。",
    "visualSpec": {
     "slots": [
      "finish"
     ],
     "recipeKey": "forge_s5_s5_24",
     "targetDescription": "淬火｜由本局标签决定的独特色相与流动方向",
     "sourceWrite": "finishId=F12 + variants.finish(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "finishId=F12 + variants.finish(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S6_01",
    "stage": "S6",
    "name": "冷边回稳",
    "oldName": "低温回火",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough>sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "sharpness": -5
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "repair",
     "cold"
    ],
    "copy": "收回刃口的躁动，韧涨但锋芒让了一些。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_01",
     "targetDescription": "回火｜冷黄细边，降低表面躁动",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_02",
    "stage": "S6",
    "name": "释放应力",
    "oldName": "中温回火",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "repair"
    ],
    "copy": "应力散开，工艺收回手里。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_02",
     "targetDescription": "回火｜蓝紫色温柔过渡，纹理变得连贯",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_03",
    "stage": "S6",
    "name": "韧性回补",
    "oldName": "高温回火",
    "rarity": "common",
    "role": "止损",
    "focus": "tough>design",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "design": -5
    },
    "riskDeltaPoints": -5,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair",
     "oxide"
    ],
    "copy": "脆性压住，颜色让了位。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_03",
     "targetDescription": "回火｜高温蓝色氧化细节，亮色减弱",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_04",
    "stage": "S6",
    "name": "微火修稳",
    "oldName": "微回火",
    "rarity": "fine",
    "role": "取舍",
    "focus": "tough+sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "edge"
    ],
    "copy": "小火修稳，不动刃口。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_04",
     "targetDescription": "回火｜只在刃线附近留微弱色差",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_05",
    "stage": "S6",
    "name": "匀光回中",
    "oldName": "常回火",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "precision"
    ],
    "copy": "状态拉回中位。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_05",
     "targetDescription": "回火｜整体反射均匀，色相不偏移",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_06",
    "stage": "S6",
    "name": "缓温释压",
    "oldName": "缓回火",
    "rarity": "fine",
    "role": "止损",
    "focus": "tough+design",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "design": 10
    },
    "riskDeltaPoints": -4,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair",
     "flow",
     "flex"
    ],
    "copy": "缓温释压，边界也柔了。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_06",
     "targetDescription": "回火｜色带柔化，明暗过渡变长",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_07",
    "stage": "S6",
    "name": "亮刃保锋",
    "oldName": "短回火",
    "rarity": "fine",
    "role": "取舍",
    "focus": "sharp>tough",
    "pool": "基础池",
    "statDelta": {
     "toughness": -5,
     "sharpness": 17
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "edge",
     "unstable"
    ],
    "copy": "应力不除干净，保锋利，担点险。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_07",
     "targetDescription": "回火｜刃口亮度保留，刀身暗部更稳定",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_08",
    "stage": "S6",
    "name": "双温分区",
    "oldName": "双段回火",
    "rarity": "fine",
    "role": "构筑",
    "focus": "tough+craft+design",
    "pool": "基础池",
    "statDelta": {
     "toughness": 11,
     "craft": 7,
     "design": 4
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "layer"
    ],
    "copy": "两段温区各自留着痕迹。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_08",
     "targetDescription": "回火｜两段色温形成双层细带",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_09",
    "stage": "S6",
    "name": "精细回火",
    "oldName": "精确回火",
    "rarity": "fine",
    "role": "专精",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -4,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "precision"
    ],
    "copy": "火候掐得准。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_09",
     "targetDescription": "回火｜细致温控让反射边界更齐整",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_10",
    "stage": "S6",
    "name": "深蓝收压",
    "oldName": "深温回火",
    "rarity": "rare",
    "role": "止损",
    "focus": "tough+strength",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 14,
     "toughness": 16
    },
    "riskDeltaPoints": -5,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair"
    ],
    "copy": "深层应力先放，不加光。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_10",
     "targetDescription": "回火｜深蓝暗层逐步收敛",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_11",
    "stage": "S6",
    "name": "控色定调",
    "oldName": "中温控彩",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "precision",
     "spectral"
    ],
    "copy": "只校颜色，不添层。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_11",
     "targetDescription": "回火｜紫色偏移集中在已有色带",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_12",
    "stage": "S6",
    "name": "蓝黑韧化",
    "oldName": "高温强韧",
    "rarity": "fine",
    "role": "止损",
    "focus": "tough+strength",
    "pool": "探索Ⅰ",
    "statDelta": {
     "strength": 14,
     "toughness": 16
    },
    "riskDeltaPoints": -4,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair"
    ],
    "copy": "用高温换可靠，极端光被压下去。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_12",
     "targetDescription": "回火｜宽幅蓝黑反光，边界清晰",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_13",
    "stage": "S6",
    "name": "彩调微移",
    "oldName": "彩调回火",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "spectral",
     "resonance"
    ],
    "copy": "彩色接着走，相位偏了。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_13",
     "targetDescription": "回火｜偏色产生细微相位位移",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_14",
    "stage": "S6",
    "name": "裂相冷刃",
    "oldName": "过火脆化",
    "rarity": "rare",
    "role": "冒险",
    "focus": "sharp>tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": -9,
     "sharpness": 29
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "unstable",
     "heat"
    ],
    "copy": "主动留点脆化，把锋利往上顶。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_14",
     "targetDescription": "回火｜冷蓝刃线与细微裂相纹",
     "sourceWrite": "variants.temper(amount/temperature)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature)",
    "traitGrant": null
   },
   {
    "id": "S6_15",
    "stage": "S6",
    "name": "深紫留纹",
    "oldName": "深回火",
    "rarity": "rare",
    "role": "止损",
    "focus": "tough+design",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": 21,
     "design": 17
    },
    "riskDeltaPoints": -4,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair"
    ],
    "copy": "韧性回进深层，纹路保住。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_15",
     "targetDescription": "回火｜厚重蓝紫暗层，表面细节不消失",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_16",
    "stage": "S6",
    "name": "冷相明刃",
    "oldName": "冷回火",
    "rarity": "rare",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 21,
     "craft": 17
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "precision",
     "cold"
    ],
    "copy": "色温稳住，精度更明。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_16",
     "targetDescription": "回火｜冷色金属反射，刃线更清楚",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_17",
    "stage": "S6",
    "name": "虹彩分段",
    "oldName": "幻彩回火",
    "rarity": "epic",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "spectral",
     "flow"
    ],
    "copy": "彩膜重新分成了几段。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_17",
     "targetDescription": "回火｜现有虹彩被重新分段而非整体加亮",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_18",
    "stage": "S6",
    "name": "灵纹显热",
    "oldName": "神回火",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+tough+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 22,
     "toughness": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "layer",
     "signature"
    ],
    "copy": "深层结构应到外层纹路，越完整越亮。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_18",
     "targetDescription": "回火｜内部灵纹沿外层纹理逐步显现",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_19",
    "stage": "S6",
    "name": "流光顺纹",
    "oldName": "灵回火",
    "rarity": "epic",
    "role": "签名",
    "focus": "craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "craft": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "flow",
     "signature"
    ],
    "copy": "灵性绑在工艺上，光不脱刀。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_19",
     "targetDescription": "回火｜微光沿加工方向流动",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_20",
    "stage": "S6",
    "name": "错相分彩",
    "oldName": "变色回火",
    "rarity": "epic",
    "role": "冒险",
    "focus": "design>tough",
    "pool": "探索Ⅲ",
    "statDelta": {
     "toughness": -11,
     "design": 30
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "unstable"
    ],
    "copy": "色相错位，这一层最跳。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_20",
     "targetDescription": "回火｜多色相分区发生轻微错位",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_21",
    "stage": "S6",
    "name": "玄纹浮影",
    "oldName": "玄回火",
    "rarity": "legend",
    "role": "构筑",
    "focus": "strength+tough+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "strength": 26,
     "toughness": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "void",
     "resonance",
     "signature"
    ],
    "copy": "秘纹靠温差浮出来，不一直露着。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_21",
     "targetDescription": "回火｜暗面秘纹缓慢浮现",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_22",
    "stage": "S6",
    "name": "余辉沿线",
    "oldName": "天回火",
    "rarity": "legend",
    "role": "签名",
    "focus": "tough+craft+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "toughness": 26,
     "craft": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "resonance",
     "signature"
    ],
    "copy": "余热封进结构线里，收住。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_22",
     "targetDescription": "回火｜高温余辉沿结构线残留",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_23",
    "stage": "S6",
    "name": "液彩幻界",
    "oldName": "幻回火",
    "rarity": "legend",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "flow",
     "signature"
    ],
    "copy": "虹彩像液边那样慢慢走。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_23",
     "targetDescription": "回火｜流动虹彩变成局部液态边界",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S6_24",
    "stage": "S6",
    "name": "余焰封纹",
    "oldName": "神回天焰",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+tough+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "toughness": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 18,
    "riskLabel": "极高",
    "tags": [
     "heat",
     "flow",
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "余焰顺着前面几道工序走。",
    "visualSpec": {
     "slots": [
      "temper"
     ],
     "recipeKey": "forge_s6_s6_24",
     "targetDescription": "回火｜根据前序热/层/流标签生成定制余辉",
     "sourceWrite": "variants.temper(amount/temperature/hueShift)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.temper(amount/temperature/hueShift)",
    "traitGrant": null
   },
   {
    "id": "S7_01",
    "stage": "S7",
    "name": "细石磨",
    "oldName": "细石开刃",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "precision"
    ],
    "copy": "一次磨到底，不返修。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_01",
     "targetDescription": "开刃｜窄而连续的刃口高光",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_02",
    "stage": "S7",
    "name": "粗砂磨",
    "oldName": "粗石开刃",
    "rarity": "common",
    "role": "取舍",
    "focus": "tough>sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 17,
     "sharpness": -5
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "edge",
     "weather"
    ],
    "copy": "刃线亮而细。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_02",
     "targetDescription": "开刃｜粗磨细节与微锯齿反射",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_03",
    "stage": "S7",
    "name": "通体磨",
    "oldName": "精石开刃",
    "rarity": "common",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "precision"
    ],
    "copy": "常规刃角，不追极限。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_03",
     "targetDescription": "开刃｜均匀刃线，边缘反射稳定",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_04",
    "stage": "S7",
    "name": "曲线磨",
    "oldName": "细磨开刃",
    "rarity": "fine",
    "role": "稳健",
    "focus": "sharp+design",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "clean"
    ],
    "copy": "刃线细一分，补偿也小。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_04",
     "targetDescription": "开刃｜纤细亮线贴合刀刃曲线",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_05",
    "stage": "S7",
    "name": "常规刃",
    "oldName": "常磨开刃",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "edge",
     "stable"
    ],
    "copy": "两段刃坡，边利边撑。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_05",
     "targetDescription": "开刃｜中等强度刃光，稳定不闪烁",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_06",
    "stage": "S7",
    "name": "收口刃",
    "oldName": "定刃",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "edge",
     "precision"
    ],
    "copy": "刃角收窄，锐到边缘。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_06",
     "targetDescription": "开刃｜刃线闭合，断点减少",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_07",
    "stage": "S7",
    "name": "柔光刃",
    "oldName": "修刃",
    "rarity": "fine",
    "role": "止损",
    "focus": "tough+sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "edge",
     "repair"
    ],
    "copy": "刃口留厚，粗用不崩。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_07",
     "targetDescription": "开刃｜去除毛刺，刃光变柔和",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_08",
    "stage": "S7",
    "name": "快线刃",
    "oldName": "快刃",
    "rarity": "fine",
    "role": "冒险",
    "focus": "sharp>tough",
    "pool": "基础池",
    "statDelta": {
     "toughness": -5,
     "sharpness": 17
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "edge",
     "flow",
     "unstable"
    ],
    "copy": "刃口往前推，利涨但韧降。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_08",
     "targetDescription": "开刃｜高速拖出长刃光",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_09",
    "stage": "S7",
    "name": "钻切刃",
    "oldName": "钻石开刃",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "craft": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "edge",
     "precision"
    ],
    "copy": "刃线冷净，细辨才见。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_09",
     "targetDescription": "开刃｜硬质白光与微切面",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_10",
    "stage": "S7",
    "name": "刃线尺",
    "oldName": "精密开刃",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "craft": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "edge",
     "precision"
    ],
    "copy": "锋利留得住，极限缓一点。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_10",
     "targetDescription": "开刃｜刃线均匀，反射宽度一致",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_11",
    "stage": "S7",
    "name": "冷锋覆线",
    "oldName": "冷锋开刃",
    "rarity": "rare",
    "role": "构筑",
    "focus": "sharp+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "design": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "edge",
     "spectral",
     "cold"
    ],
    "copy": "磨到镜面，锋线会跳。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_11",
     "targetDescription": "开刃｜冷色细线沿刃口浮现",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_12",
    "stage": "S7",
    "name": "平衡刃",
    "oldName": "锐修开刃",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+sharp",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "sharpness": 14
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "edge",
     "stable",
     "repair"
    ],
    "copy": "宽刃强削，耗材。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_12",
     "targetDescription": "开刃｜亮线略宽，刃口更稳定",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_13",
    "stage": "S7",
    "name": "灵线开刃",
    "oldName": "灵刃开刃",
    "rarity": "rare",
    "role": "构筑",
    "focus": "sharp+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "edge",
     "resonance"
    ],
    "copy": "刃线换用深色磨料。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_13",
     "targetDescription": "开刃｜刃光微动，亮度随角度改变",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_14",
    "stage": "S7",
    "name": "高速刃流",
    "oldName": "高速开刃",
    "rarity": "rare",
    "role": "冒险",
    "focus": "sharp>tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": -9,
     "sharpness": 29
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "flow",
     "unstable"
    ],
    "copy": "凸磨刃角撑住强度。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_14",
     "targetDescription": "开刃｜长刃光带短暂拖尾",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_15",
    "stage": "S7",
    "name": "寒刃压相",
    "oldName": "寒刃开刃",
    "rarity": "rare",
    "role": "构筑",
    "focus": "sharp+craft+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 18,
     "craft": 12,
     "spirit": 8
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "edge",
     "spectral",
     "cold"
    ],
    "copy": "晶体排到刃上，细而脆。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_15",
     "targetDescription": "开刃｜寒蓝刃缘与冷镜底面呼应",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_16",
    "stage": "S7",
    "name": "电浆窄缘",
    "oldName": "电浆开刃",
    "rarity": "rare",
    "role": "冒险",
    "focus": "sharp+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "resonance",
     "unstable"
    ],
    "copy": "磨角一收，反光拉成一条线。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_16",
     "targetDescription": "开刃｜刃缘出现受控的窄脉冲光",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_17",
    "stage": "S7",
    "name": "星屑刃线",
    "oldName": "星刃开刃",
    "rarity": "epic",
    "role": "构筑",
    "focus": "sharp+craft+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 18,
     "craft": 12,
     "spirit": 8
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "edge",
     "resonance"
    ],
    "copy": "刃口开得活，会回应工艺。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_17",
     "targetDescription": "开刃｜星屑只分布在刃脊和刃尖",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_18",
    "stage": "S7",
    "name": "流光长刃",
    "oldName": "流光开刃",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+sharp+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 22,
     "sharpness": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "flow",
     "signature"
    ],
    "copy": "薄到极处，反光也薄脆。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_18",
     "targetDescription": "开刃｜连续流光沿刃线前进",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_19",
    "stage": "S7",
    "name": "幻刃折光",
    "oldName": "幻刃开刃",
    "rarity": "epic",
    "role": "签名",
    "focus": "sharp+design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "sharpness": 22,
     "design": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "spectral",
     "signature"
    ],
    "copy": "刃口收成一道密雾线，收得紧。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_19",
     "targetDescription": "开刃｜刃缘色相发生角度相关的折射",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_20",
    "stage": "S7",
    "name": "灵光绕刃",
    "oldName": "灵光开刃",
    "rarity": "epic",
    "role": "构筑",
    "focus": "sharp+craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "sharpness": 22,
     "craft": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "resonance"
    ],
    "copy": "镜面反射，擦痕都露出来。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_20",
     "targetDescription": "开刃｜微光围绕刃线节点出现",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_21",
    "stage": "S7",
    "name": "金辉终刃",
    "oldName": "金辉神刃",
    "rarity": "legend",
    "role": "签名",
    "focus": "strength+sharp+design",
    "pool": "签名工艺",
    "statDelta": {
     "strength": 26,
     "sharpness": 17,
     "design": 11
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "mirror",
     "signature"
    ],
    "copy": "晶体压在刃下，光才亮。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_21",
     "targetDescription": "开刃｜低饱和金辉贴合锋线",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_22",
    "stage": "S7",
    "name": "紫电刃弧",
    "oldName": "紫电神刃",
    "rarity": "legend",
    "role": "冒险",
    "focus": "sharp+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "sharpness": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "resonance",
     "unstable"
    ],
    "copy": "刃口高强度，磨修空间小。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_22",
     "targetDescription": "开刃｜紫色脉冲沿刃线短距离跳跃",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_23",
    "stage": "S7",
    "name": "冰蓝定锋",
    "oldName": "冰蓝神刃",
    "rarity": "legend",
    "role": "专精",
    "focus": "sharp+tough+craft",
    "pool": "签名工艺",
    "statDelta": {
     "toughness": 17,
     "sharpness": 26,
     "craft": 11
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "edge",
     "stable",
     "spectral",
     "cold"
    ],
    "copy": "磨痕方向一致，光才出得来。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_23",
     "targetDescription": "开刃｜冰蓝刃线，反射稳定而不拖尾",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S7_24",
    "stage": "S7",
    "name": "冷脉天锋",
    "oldName": "神刃天锋",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+sharp+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 29,
     "sharpness": 19,
     "spirit": 12
    },
    "riskDeltaPoints": 20,
    "riskLabel": "极高",
    "tags": [
     "edge",
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "磨到最深，刃口的灵气一并出来。",
    "visualSpec": {
     "slots": [
      "edge"
     ],
     "recipeKey": "forge_s7_s7_24",
     "targetDescription": "开刃｜刃线效果响应整局的热/冷/流/层标签",
     "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "variants.edge(amount/fresnelPower/flowSpeed/tintHex)",
    "traitGrant": null
   },
   {
    "id": "S8_01",
    "stage": "S8",
    "name": "温木柄",
    "oldName": "木质柄",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+design",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "stable"
    ],
    "copy": "护手跟手柄同色，稳住。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_01",
     "targetDescription": "装配｜木纹方向清楚，低光泽手感",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_02",
    "stage": "S8",
    "name": "握皮纹",
    "oldName": "皮革柄",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+sharp",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "sharpness": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "weather"
    ],
    "copy": "缠紧凑，握着不打滑。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_02",
     "targetDescription": "装配｜皮革颗粒与压纹可辨",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_03",
    "stage": "S8",
    "name": "止滑胶",
    "oldName": "橡胶柄",
    "rarity": "common",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "grip",
     "stable"
    ],
    "copy": "深色柄，视觉稳住。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_03",
     "targetDescription": "装配｜橡胶微纹与哑面反射",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_04",
    "stage": "S8",
    "name": "轻量化",
    "oldName": "聚合物柄",
    "rarity": "common",
    "role": "专精",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "precision"
    ],
    "copy": "皮包柄，握着踏实。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_04",
     "targetDescription": "装配｜轻质聚合物分区，边界整齐",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_05",
    "stage": "S8",
    "name": "竹节柄",
    "oldName": "竹质柄",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "layer"
    ],
    "copy": "握柄双色对拼。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_05",
     "targetDescription": "装配｜竹节层次与自然纤维方向",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_06",
    "stage": "S8",
    "name": "战术柄",
    "oldName": "战术柄",
    "rarity": "fine",
    "role": "专精",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "grip",
     "precision"
    ],
    "copy": "冷配色，刃身换稳。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_06",
     "targetDescription": "装配｜军绿分区和低反射防滑面",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_07",
    "stage": "S8",
    "name": "拉丝柄",
    "oldName": "拉丝柄",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "基础池",
    "statDelta": {
     "craft": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "mirror",
     "precision"
    ],
    "copy": "木纹柄，有老手艺感。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_07",
     "targetDescription": "装配｜轴向拉丝，金属反射方向统一",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_08",
    "stage": "S8",
    "name": "机加柄",
    "oldName": "机加工柄",
    "rarity": "fine",
    "role": "专精",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "grip",
     "precision"
    ],
    "copy": "菱形防滑格，前段也好握。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_08",
     "targetDescription": "装配｜规则加工纹与硬边切面",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_09",
    "stage": "S8",
    "name": "碳纤柄",
    "oldName": "碳纤维柄",
    "rarity": "fine",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "grip",
     "layer",
     "precision"
    ],
    "copy": "骨白柄，前段有点气质。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_09",
     "targetDescription": "装配｜碳纤维编织纹，角度变化时可读",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_10",
    "stage": "S8",
    "name": "白瓷柄",
    "oldName": "陶瓷柄",
    "rarity": "fine",
    "role": "专精",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "grip",
     "mirror"
    ],
    "copy": "两色调缠，柄上有节奏。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_10",
     "targetDescription": "装配｜白陶釉面与清晰边缘反射",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_11",
    "stage": "S8",
    "name": "云脉石柄",
    "oldName": "大理石柄",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "grip",
     "resonance"
    ],
    "copy": "颜色让开，只讲握感。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_11",
     "targetDescription": "装配｜石纹云脉在握柄内缓慢展开",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_12",
    "stage": "S8",
    "name": "旧木柄",
    "oldName": "深木柄",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "grip",
     "weather",
     "stable"
    ],
    "copy": "缠绕精密，出手不累。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_12",
     "targetDescription": "装配｜深木色与轻度使用痕迹",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_13",
    "stage": "S8",
    "name": "缠光皮柄",
    "oldName": "亮皮柄",
    "rarity": "rare",
    "role": "构筑",
    "focus": "tough+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "design": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "grip",
     "layer"
    ],
    "copy": "颜色统一，视觉集中。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_13",
     "targetDescription": "装配｜皮革高光与交错缠绕纹",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_14",
    "stage": "S8",
    "name": "雾透玉柄",
    "oldName": "玉质柄",
    "rarity": "rare",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "grip",
     "resonance",
     "spectral",
     "signature"
    ],
    "copy": "重心钉在掌心。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_14",
     "targetDescription": "装配｜青玉半透，内部雾脉缓慢可见",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_15",
    "stage": "S8",
    "name": "模块军绿",
    "oldName": "军绿柄",
    "rarity": "rare",
    "role": "构筑",
    "focus": "craft+design",
    "pool": "探索Ⅱ",
    "statDelta": {
     "craft": 21,
     "design": 17
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "grip",
     "precision",
     "layer"
    ],
    "copy": "深色骨架柄，把气质往上提。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_15",
     "targetDescription": "装配｜军绿模块与可见机械连接",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_16",
    "stage": "S8",
    "name": "冷镜钢柄",
    "oldName": "镜面钢柄",
    "rarity": "rare",
    "role": "专精",
    "focus": "craft+sharp",
    "pool": "探索Ⅱ",
    "statDelta": {
     "sharpness": 17,
     "craft": 21
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "grip",
     "mirror",
     "precision"
    ],
    "copy": "蓝色柄，前段很清醒。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_16",
     "targetDescription": "装配｜镜钢握柄，反射与刀身分层",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_17",
    "stage": "S8",
    "name": "深织亮碳",
    "oldName": "高亮碳柄",
    "rarity": "epic",
    "role": "冒险",
    "focus": "craft>tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": -9,
     "craft": 29
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "layer",
     "unstable"
    ],
    "copy": "随身动，柄上颜色渐变。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_17",
     "targetDescription": "装配｜高亮碳纤维与深织纹交替",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_18",
    "stage": "S8",
    "name": "断光玉芯",
    "oldName": "高透玉柄",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "flow",
     "resonance",
     "signature"
    ],
    "copy": "星点沉在柄里，不动。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_18",
     "targetDescription": "装配｜半透玉材中的流光被结构切断",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_19",
    "stage": "S8",
    "name": "白昼镜瓷",
    "oldName": "镜面瓷柄",
    "rarity": "epic",
    "role": "签名",
    "focus": "craft+design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "craft": 22,
     "design": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "mirror",
     "precision",
     "signature"
    ],
    "copy": "暗晶柄，手上沉一下，压得住。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_19",
     "targetDescription": "装配｜瓷面形成高亮边界，内部保留微细纹",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_20",
    "stage": "S8",
    "name": "偏振幻彩",
    "oldName": "幻彩碳柄",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "spectral",
     "layer",
     "signature"
    ],
    "copy": "柄包住重心，前段集中。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_20",
     "targetDescription": "装配｜碳纤编织产生角度相关的低幅虹彩",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection",
    "traitGrant": null
   },
   {
    "id": "S8_21",
    "stage": "S8",
    "name": "共鸣神玉",
    "oldName": "神玉柄",
    "rarity": "legend",
    "role": "签名",
    "focus": "tough+design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "toughness": 26,
     "design": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "resonance",
     "signature"
    ],
    "copy": "秘纹收在柄上，不外露。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_21",
     "targetDescription": "装配｜玉材内层纹与外层高光同步变化",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_22",
    "stage": "S8",
    "name": "星屑玄铁",
    "oldName": "玄铁柄",
    "rarity": "legend",
    "role": "构筑",
    "focus": "strength+craft+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "strength": 26,
     "craft": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "void",
     "precision",
     "resonance"
    ],
    "copy": "柄把刀型收住，极端处没了扶手。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_22",
     "targetDescription": "装配｜黑铁机纹内点缀少量星屑反射",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/metalness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_23",
    "stage": "S8",
    "name": "冷星釉瓷",
    "oldName": "星辰瓷柄",
    "rarity": "legend",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 12,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "spectral",
     "resonance",
     "signature"
    ],
    "copy": "陨铁配柄，压手也添灵性。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_23",
     "targetDescription": "装配｜白瓷釉面内有稀疏冷星光点",
     "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/tintHex/roughness/reflection/patternKind",
    "traitGrant": null
   },
   {
    "id": "S8_24",
    "stage": "S8",
    "name": "天工构壳",
    "oldName": "神装天工",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "strength+craft+design+spirit",
    "pool": "神话发现",
    "statDelta": {
     "strength": 22,
     "craft": 17,
     "design": 12,
     "spirit": 9
    },
    "riskDeltaPoints": 18,
    "riskLabel": "极高",
    "tags": [
     "grip",
     "precision",
     "resonance",
     "unstable",
     "signature"
    ],
    "copy": "柄是最后一道工序，定住整把刀。",
    "visualSpec": {
     "slots": [
      "handle"
     ],
     "recipeKey": "forge_s8_s8_24",
     "targetDescription": "装配｜材质分区由前序纹理与淬火标签共同决定",
     "sourceWrite": "handle.metalId/gain/desat/metalness/roughness/reflection/tintHex",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "handle.metalId/gain/desat/metalness/roughness/reflection/tintHex",
    "traitGrant": null
   },
   {
    "id": "S9_01",
    "stage": "S9",
    "name": "原样封存",
    "oldName": "崭新出厂",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "clean",
     "stable"
    ],
    "copy": "五项拉齐，不偏。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_01",
     "targetDescription": "调校｜磨损最低，镜面与底纹保持原样",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_02",
    "stage": "S9",
    "name": "边缘存痕",
    "oldName": "轻度调校",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+design",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "design": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "weather"
    ],
    "copy": "整体拉平。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_02",
     "targetDescription": "调校｜仅在边缘出现细微使用痕迹",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_03",
    "stage": "S9",
    "name": "细节校准",
    "oldName": "标准调校",
    "rarity": "common",
    "role": "稳健",
    "focus": "sharp+craft",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "precision"
    ],
    "copy": "先保不崩，个性往后放。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_03",
     "targetDescription": "调校｜整体反射回到均衡状态",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_04",
    "stage": "S9",
    "name": "受力落痕",
    "oldName": "中度调校",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "基础池",
    "statDelta": {
     "design": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "weather",
     "layer"
    ],
    "copy": "锋利优先，耐性让。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_04",
     "targetDescription": "调校｜磨损沿受力区域出现，不随机铺满",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_05",
    "stage": "S9",
    "name": "岁月剥纹",
    "oldName": "使用痕",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "基础池",
    "statDelta": {
     "design": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "weather",
     "oxide"
    ],
    "copy": "强度先稳住，锋利缓一点。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_05",
     "targetDescription": "调校｜局部磨损显露底层纹理",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_06",
    "stage": "S9",
    "name": "定向拖痕",
    "oldName": "老练成器",
    "rarity": "fine",
    "role": "构筑",
    "focus": "sharp+spirit",
    "pool": "基础池",
    "statDelta": {
     "sharpness": 12,
     "spirit": 10
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "weather",
     "signature"
    ],
    "copy": "外观留了起伏，光感顺一点。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_06",
     "targetDescription": "调校｜刃根与握柄附近出现有方向的旧痕",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_07",
    "stage": "S9",
    "name": "乱线叠痕",
    "oldName": "战旧",
    "rarity": "fine",
    "role": "冒险",
    "focus": "design>craft",
    "pool": "基础池",
    "statDelta": {
     "craft": -5,
     "design": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "weather",
     "unstable"
    ],
    "copy": "调得深，赌上限。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_07",
     "targetDescription": "调校｜深浅战痕形成不规则线条",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_08",
    "stage": "S9",
    "name": "公差收束",
    "oldName": "精微调校",
    "rarity": "common",
    "role": "止损",
    "focus": "tough+craft",
    "pool": "基础池",
    "statDelta": {
     "toughness": 12,
     "craft": 10
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "precision",
     "repair",
     "stable"
    ],
    "copy": "不留余地，锋芒上顶。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_08",
     "targetDescription": "调校｜细节对齐、反射边界更干净",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_09",
    "stage": "S9",
    "name": "结构复位",
    "oldName": "精细调校",
    "rarity": "fine",
    "role": "稳健",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -2,
    "riskLabel": "稳",
    "tags": [
     "precision",
     "repair"
    ],
    "copy": "韧与纹理一起抬，冲击降。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_09",
     "targetDescription": "调校｜微细反射误差减少",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_10",
    "stage": "S9",
    "name": "复明抛光",
    "oldName": "抛光调校",
    "rarity": "rare",
    "role": "取舍",
    "focus": "sharp>design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "sharpness": 23,
     "design": -7
    },
    "riskDeltaPoints": 0,
    "riskLabel": "低",
    "tags": [
     "mirror",
     "clean"
    ],
    "copy": "零件咬合更顺。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_10",
     "targetDescription": "调校｜镜面区域恢复，磨损对比降低",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_11",
    "stage": "S9",
    "name": "战损留影",
    "oldName": "战损调校",
    "rarity": "fine",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅰ",
    "statDelta": {
     "design": 16,
     "spirit": 14
    },
    "riskDeltaPoints": 2,
    "riskLabel": "中",
    "tags": [
     "weather",
     "oxide"
    ],
    "copy": "锋利和顺畅一起走。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_11",
     "targetDescription": "调校｜战痕边缘出现低亮金属反射",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_12",
    "stage": "S9",
    "name": "冷色对齐",
    "oldName": "冷色调校",
    "rarity": "fine",
    "role": "稳健",
    "focus": "craft+design",
    "pool": "探索Ⅰ",
    "statDelta": {
     "craft": 16,
     "design": 14
    },
    "riskDeltaPoints": -1,
    "riskLabel": "稳",
    "tags": [
     "precision",
     "spectral",
     "cold"
    ],
    "copy": "守住了再出锋。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_12",
     "targetDescription": "调校｜色相偏移收束到冷色区间",
     "sourceWrite": "wear + variants.tune(colorPhase)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase)",
    "traitGrant": null
   },
   {
    "id": "S9_13",
    "stage": "S9",
    "name": "稳态收束",
    "oldName": "稳定调校",
    "rarity": "rare",
    "role": "止损",
    "focus": "tough+craft",
    "pool": "探索Ⅰ",
    "statDelta": {
     "toughness": 16,
     "craft": 14
    },
    "riskDeltaPoints": -4,
    "riskLabel": "降险",
    "tags": [
     "stable",
     "repair"
    ],
    "copy": "韧性和光感分得开。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_13",
     "targetDescription": "调校｜动态光效速度降低，形体更清晰",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_14",
    "stage": "S9",
    "name": "磨痕成图",
    "oldName": "高磨调校",
    "rarity": "rare",
    "role": "冒险",
    "focus": "design>tough",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": -9,
     "design": 29
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "weather",
     "unstable"
    ],
    "copy": "动作顺，辨识度降。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_14",
     "targetDescription": "调校｜磨损区域组成可辨识的抽象图形",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_15",
    "stage": "S9",
    "name": "残边高显",
    "oldName": "残美调校",
    "rarity": "rare",
    "role": "构筑",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "weather",
     "oxide"
    ],
    "copy": "光泽温下来，线条更清。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_15",
     "targetDescription": "调校｜残缺边缘形成高对比轮廓",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_16",
    "stage": "S9",
    "name": "精稳封痕",
    "oldName": "精稳调校",
    "rarity": "rare",
    "role": "止损",
    "focus": "tough+craft",
    "pool": "探索Ⅱ",
    "statDelta": {
     "toughness": 21,
     "craft": 17
    },
    "riskDeltaPoints": -3,
    "riskLabel": "稳",
    "tags": [
     "stable",
     "precision",
     "repair"
    ],
    "copy": "骨架锁紧。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_16",
     "targetDescription": "调校｜磨损受控，细节统一",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_17",
    "stage": "S9",
    "name": "虹层幻调",
    "oldName": "幻调流彩",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅱ",
    "statDelta": {
     "design": 21,
     "spirit": 17
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "spectral",
     "flow"
    ],
    "copy": "灵性上限往上抬了一截。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_17",
     "targetDescription": "调校｜色相只在原有虹彩层内偏移",
     "sourceWrite": "wear + variants.tune(colorPhase)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase)",
    "traitGrant": null
   },
   {
    "id": "S9_18",
    "stage": "S9",
    "name": "神稳精校",
    "oldName": "神稳调校",
    "rarity": "epic",
    "role": "签名",
    "focus": "tough+craft+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "toughness": 22,
     "craft": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "precision",
     "resonance",
     "signature"
    ],
    "copy": "整体收住，看不出痕迹。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_18",
     "targetDescription": "调校｜高完成度表面，保留细微工艺差异",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_19",
    "stage": "S9",
    "name": "战痕点睛",
    "oldName": "战痕点缀",
    "rarity": "epic",
    "role": "签名",
    "focus": "strength+design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "strength": 22,
     "design": 14,
     "spirit": 10
    },
    "riskDeltaPoints": 6,
    "riskLabel": "高",
    "tags": [
     "weather",
     "resonance",
     "signature"
    ],
    "copy": "五项一起抬，抬到顶，留不住。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_19",
     "targetDescription": "调校｜少量战痕被选择性强调",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_20",
    "stage": "S9",
    "name": "灵纹回响",
    "oldName": "灵调幻彩",
    "rarity": "epic",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "探索Ⅲ",
    "statDelta": {
     "design": 25,
     "spirit": 21
    },
    "riskDeltaPoints": 4,
    "riskLabel": "中",
    "tags": [
     "resonance",
     "spectral",
     "signature"
    ],
    "copy": "全项顶到上限，没有退路。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_20",
     "targetDescription": "调校｜微光随表面纹理而动",
     "sourceWrite": "wear + variants.tune(colorPhase/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S9_21",
    "stage": "S9",
    "name": "玄线显影",
    "oldName": "玄调秘隐",
    "rarity": "legend",
    "role": "构筑",
    "focus": "tough+design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "toughness": 26,
     "design": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 8,
    "riskLabel": "极高",
    "tags": [
     "void",
     "resonance",
     "unstable"
    ],
    "copy": "封样前最后一次调校，收手。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_21",
     "targetDescription": "调校｜暗纹在特定视角短暂显现",
     "sourceWrite": "wear",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear",
    "traitGrant": null
   },
   {
    "id": "S9_22",
    "stage": "S9",
    "name": "星尘沿纹",
    "oldName": "天调星尘",
    "rarity": "legend",
    "role": "签名",
    "focus": "craft+design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "craft": 26,
     "design": 17,
     "spirit": 11
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "spectral",
     "signature"
    ],
    "copy": "破一次平衡，赌的是终局。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_22",
     "targetDescription": "调校｜星尘沿现有纹理节点稀疏分布",
     "sourceWrite": "wear + variants.tune(colorPhase)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase)",
    "traitGrant": null
   },
   {
    "id": "S9_23",
    "stage": "S9",
    "name": "虹痕交映",
    "oldName": "幻彩调校",
    "rarity": "legend",
    "role": "签名",
    "focus": "design+spirit",
    "pool": "签名工艺",
    "statDelta": {
     "design": 30,
     "spirit": 24
    },
    "riskDeltaPoints": 10,
    "riskLabel": "极高",
    "tags": [
     "spectral",
     "weather",
     "signature"
    ],
    "copy": "收得干净，每把都稳当。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_23",
     "targetDescription": "调校｜虹彩与磨损相互显影",
     "sourceWrite": "wear + variants.tune(colorPhase/iridescence)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase/iridescence)",
    "traitGrant": null
   },
   {
    "id": "S9_24",
    "stage": "S9",
    "name": "终调天成",
    "oldName": "神调天成",
    "rarity": "mythic",
    "role": "规则改变",
    "focus": "tough+craft+design+spirit",
    "pool": "神话发现",
    "statDelta": {
     "toughness": 22,
     "craft": 17,
     "design": 12,
     "spirit": 9
    },
    "riskDeltaPoints": 14,
    "riskLabel": "极高",
    "tags": [
     "resonance",
     "signature",
     "unstable"
    ],
    "copy": "终态收满，没有余量。",
    "visualSpec": {
     "slots": [
      "tune",
      "wear"
     ],
     "recipeKey": "forge_s9_s9_24",
     "targetDescription": "调校｜依据整局视觉配方生成最终签名映射",
     "sourceWrite": "wear + variants.tune(colorPhase)",
     "assetRef": null
    },
    "assetRef": null,
    "sourceWrite": "wear + variants.tune(colorPhase)",
    "traitGrant": null
   }
  ];

  const BY_ID = {};
  const BY_STAGE = {};
  for (const c of CARDS) { BY_ID[c.id] = c; (BY_STAGE[c.stage] = BY_STAGE[c.stage] || []).push(c); }

  const STAGE_ORDER = ["S1","S2","S3","S4","S5","S6","S7","S8","S9"];
  const TAG_IDS = TAGS.map((t) => t.id);

  K3D.cardsV11 = {
    CARDS, BY_ID, BY_STAGE, STAGE_ORDER, TAGS, TAG_IDS, STAT_KEYS, RARITY_CN,
    DESIGN_VERSION: "1.1",
    CONDITION_LANGUAGE_VERSION: "1.1",
    byId: (id) => BY_ID[id] || null,
    byStage: (stage) => (BY_STAGE[stage] || []).slice(),
    hasTag: (id) => TAG_IDS.indexOf(id) >= 0,
  };

export const cardsV11 = __reg.proxy.cardsV11;
