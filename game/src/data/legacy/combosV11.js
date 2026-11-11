/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/combosV11.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const COMBOS = [
   {
    "id": "CB01",
    "name": "雾中虹彩",
    "rarity": "稀有",
    "conditions": "FLOW 出现在至少 3 个不同阶段；S5 或 S9 有 SPECTRAL；峰值风险≥30 且最终当前风险≤45",
    "reward": "解锁 TR218「潮痕回相」；设+3、灵+4；虹彩沿已有纹理分区呈现",
    "discover": "虹彩不再覆盖整把刀，而在雾纹和纹理节点之间往复移动。",
    "targetRate": "约 2%–8% 的定向构筑；需模拟验证",
    "conditionSpec": {
     "all": [
      {
       "tagStageCountMin": {
        "flow": 3
       }
      },
      {
       "any": [
        {
         "stageTagAny": {
          "stage": "S5",
          "tags": [
           "spectral"
          ]
         }
        },
        {
         "stageTagAny": {
          "stage": "S9",
          "tags": [
           "spectral"
          ]
         }
        }
       ]
      },
      {
       "riskPeakMin": 30
      },
      {
       "riskCurrentMax": 45
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR218",
     "statDelta": {
      "design": 3,
      "spirit": 4
     },
     "riskDeltaPoints": 0,
     "visualEffect": "虹彩沿已有纹理分区呈现"
    }
   },
   {
    "id": "CB02",
    "name": "层叠秘纹",
    "rarity": "稀有",
    "conditions": "LAYER 出现在至少 2 个不同阶段且包含 S3；HETERO/OXIDE 在不同阶段出现；最终当前风险≤50",
    "reward": "解锁 TR215「叠层回声」；工+4、韧+3；强化层界对比",
    "discover": "隐藏层纹被压入底层，转动刀身时才逐层显现。",
    "targetRate": "一般路线约 8%–18%；标签协同路线可达 20%–30%",
    "conditionSpec": {
     "all": [
      {
       "tagStageCountMin": {
        "layer": 2
       }
      },
      {
       "stageTagAny": {
        "stage": "S3",
        "tags": [
         "layer"
        ]
       }
      },
      {
       "differentStageTagPair": {
        "leftTags": [
         "layer"
        ],
        "rightTags": [
         "hetero",
         "oxide"
        ],
        "mustBeDifferentStages": true
       }
      },
      {
       "riskCurrentMax": 50
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR215",
     "statDelta": {
      "toughness": 3,
      "craft": 4
     },
     "riskDeltaPoints": 0,
     "visualEffect": "强化层界对比"
    }
   },
   {
    "id": "CB03",
    "name": "临界共振",
    "rarity": "史诗",
    "conditions": "至少 2 张卡的风险增加≥8；峰值风险≥45；最终当前风险≤55，且峰值比当前风险至少高 8 点",
    "reward": "解锁 TR213「临界回声」；强+3、灵+4；风险不额外增加",
    "discover": "极限工艺的余波被稳定结构接住，留下受控的金属脉冲。",
    "targetRate": "低频签名组合；整池目标约 1%–3%，需要高峰值后主动止损",
    "conditionSpec": {
     "all": [
      {
       "highRiskCardCountMin": 2
      },
      {
       "riskPeakMin": 45
      },
      {
       "riskCurrentMax": 55
      },
      {
       "peakMinusCurrentMin": 8
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR213",
     "statDelta": {
      "strength": 3,
      "spirit": 4
     },
     "riskDeltaPoints": 0,
     "visualEffect": "受控金属脉冲；不增加风险"
    }
   },
   {
    "id": "CB04",
    "name": "战痕成相",
    "rarity": "普通/稀有变体",
    "conditions": "WEATHER≥2，且 S9 选择保留磨损/战痕类卡",
    "reward": "解锁 TR115「旧痕铭印」；设+3；磨损变成有方向的痕迹",
    "discover": "磨损沿实际受力区域汇成独特纹路。",
    "targetRate": "约 5%–15%",
    "conditionSpec": {
     "all": [
      {
       "tagCountMin": {
        "weather": 2
       }
      },
      {
       "stageTagAny": {
        "stage": "S9",
        "tags": [
         "weather"
        ]
       }
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR115",
     "statDelta": {
      "design": 3
     },
     "riskDeltaPoints": 0,
     "visualEffect": "磨损沿受力方向形成痕迹"
    }
   },
   {
    "id": "CB05",
    "name": "灵性回路",
    "rarity": "稀有",
    "conditions": "RESONANCE 出现在至少 3 个不同阶段；工艺≥65；最终当前风险≤50",
    "reward": "解锁 TR214「星屑回路」；工+3、灵+4；星屑沿工艺节点出现",
    "discover": "星屑连接关键加工节点，不再随机散布。",
    "targetRate": "约 8%–18% 的共鸣定向构筑",
    "conditionSpec": {
     "all": [
      {
       "tagStageCountMin": {
        "resonance": 3
       }
      },
      {
       "statMin": {
        "craft": 65
       }
      },
      {
       "riskCurrentMax": 50
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR214",
     "statDelta": {
      "craft": 3,
      "spirit": 4
     },
     "riskDeltaPoints": 0,
     "visualEffect": "星屑沿工艺节点出现"
    }
   },
   {
    "id": "CB06",
    "name": "异质共生",
    "rarity": "稀有",
    "conditions": "HETERO≥2，且后续选择 CLEAN 或 STABLE 类处理卡完成稳定",
    "reward": "解锁 TR116「异相封层」；韧+3、设+3；保留材质分界并降低局部粗糙度",
    "discover": "异质分界没有被抹平，而是被稳定地封存在金属内部。",
    "targetRate": "约 8%–16%",
    "conditionSpec": {
     "all": [
      {
       "tagCountMin": {
        "hetero": 2
       }
      },
      {
       "tagAfterTag": {
        "firstTags": [
         "hetero"
        ],
        "laterTags": [
         "clean",
         "stable"
        ]
       }
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR116",
     "statDelta": {
      "toughness": 3,
      "design": 3
     },
     "riskDeltaPoints": 0,
     "visualEffect": "保留异质边界并降低局部噪声"
    }
   },
   {
    "id": "CB07",
    "name": "精工归零",
    "rarity": "史诗",
    "conditions": "PRECISION 出现在至少 4 个不同阶段；工艺≥70；最终当前风险≤15",
    "reward": "解锁 TR120「冷镜定标」；工+5；局部镜面精度提高",
    "discover": "所有工艺误差向同一条冷光边界收束。",
    "targetRate": "低频精密签名组合；优先在精密构筑策略下验证可达性与触发率",
    "conditionSpec": {
     "all": [
      {
       "tagStageCountMin": {
        "precision": 4
       }
      },
      {
       "statMin": {
        "craft": 70
       }
      },
      {
       "riskCurrentMax": 15
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR120",
     "statDelta": {
      "craft": 5
     },
     "riskDeltaPoints": 0,
     "visualEffect": "提高局部镜面精度"
    }
   },
   {
    "id": "CB08",
    "name": "逆热残响",
    "rarity": "史诗",
    "conditions": "S5 选择 HEAT 热处理；S6 选择 STABLE/REPAIR 回火；峰值风险≥30 且最终当前风险≤40",
    "reward": "解锁 TR217「余焰封存」；强+3、灵+4；热色收束为内部余辉并降低动态幅度",
    "discover": "余热被封进金属内部，色带仍在，但不再失控扩散。",
    "targetRate": "先承受热处理压力，再主动稳定的组合；目标频率需真实运行校准",
    "conditionSpec": {
     "all": [
      {
       "stageTagAny": {
        "stage": "S5",
        "tags": [
         "heat"
        ]
       }
      },
      {
       "stageTagAny": {
        "stage": "S6",
        "tags": [
         "repair",
         "stable"
        ]
       }
      },
      {
       "riskPeakMin": 30
      },
      {
       "riskCurrentMax": 40
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR217",
     "statDelta": {
      "strength": 3,
      "spirit": 4
     },
     "riskDeltaPoints": 0,
     "visualEffect": "将热色收束为内部余辉"
    }
   },
   {
    "id": "CB09",
    "name": "握柄同调",
    "rarity": "普通/稀有变体",
    "conditions": "S3 有层叠或异质纹理；S5 有偏相表面；S8 握柄具有镜面或偏相表现",
    "reward": "解锁 TR121「同调握域」；韧+3、工+2；柄部反射与刀身分离",
    "discover": "握柄不再像附加零件，而成为整把刀的第二视觉重心。",
    "targetRate": "约 6%–14%",
    "conditionSpec": {
     "all": [
      {
       "stageTagAny": {
        "stage": "S3",
        "tags": [
         "layer",
         "hetero"
        ]
       }
      },
      {
       "stageTagAny": {
        "stage": "S5",
        "tags": [
         "spectral"
        ]
       }
      },
      {
       "stageTagAny": {
        "stage": "S8",
        "tags": [
         "mirror",
         "spectral"
        ]
       }
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR121",
     "statDelta": {
      "toughness": 3,
      "craft": 2
     },
     "riskDeltaPoints": 0,
     "visualEffect": "柄部反射与刀身分离"
    }
   },
   {
    "id": "CB10",
    "name": "暗域显线",
    "rarity": "稀有",
    "conditions": "S1/S4/S5 至少一处暗域标签；S7 有刃线标签；PRECISION 出现在至少 3 个阶段且最终当前风险≤45",
    "reward": "解锁 TR103「暗域锋线」；锋+3、灵+2；边缘反射可在暗面中读取",
    "discover": "暗面保留吞光质感，锋线只在正确角度短暂出现。",
    "targetRate": "约 8%–18% 的共鸣定向构筑",
    "conditionSpec": {
     "all": [
      {
       "stageTagAnyIn": {
        "stages": [
         "S1",
         "S4",
         "S5"
        ],
        "tags": [
         "void"
        ]
       }
      },
      {
       "stageTagAny": {
        "stage": "S7",
        "tags": [
         "edge"
        ]
       }
      },
      {
       "tagStageCountMin": {
        "precision": 3
       }
      },
      {
       "riskCurrentMax": 45
      }
     ]
    },
    "rewardSpec": {
     "traitId": "TR103",
     "statDelta": {
      "sharpness": 3,
      "spirit": 2
     },
     "riskDeltaPoints": 0,
     "visualEffect": "暗面中显露刃线反射"
    }
   }
  ];

  const BY_ID = {};
  for (const c of COMBOS) BY_ID[c.id] = c;

  K3D.combosV11 = {
    COMBOS, BY_ID,
    get: (id) => BY_ID[id] || null,
  };

export const combosV11 = __reg.proxy.combosV11;
