/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/traitsV11.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  /** 50 条 Forge Trait */
  const TRAITS = [
   {
    "id": "TR101",
    "name": "霜纹稳相",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3
    },
    "visualEffect": "粗糙度微降",
    "trigger": "stable 与 cold 标签总数≥2",
    "reward": "韧+3；粗糙度微降",
    "triggerSpec": {
     "tagCountSumMin": {
      "tags": [
       "stable",
       "cold"
      ],
      "min": 2
     }
    }
   },
   {
    "id": "TR102",
    "name": "赤锋回线",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "sharpness": 3
    },
    "visualEffect": "刃线出现低饱和赤铜反射",
    "trigger": "HEAT≥1 且 EDGE≥1",
    "reward": "锋+3；刃线出现低饱和赤铜反射",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "heat": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR103",
    "name": "暗域锋线",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "sharpness": 2,
     "spirit": 2
    },
    "visualEffect": "暗面中的刃线可读",
    "trigger": "VOID≥1 且 EDGE≥2",
    "reward": "锋+2、灵+2；暗面中的刃线可读",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "void": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR104",
    "name": "青芒定刃",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "sharpness": 3
    },
    "visualEffect": "冷色刃缘更稳定",
    "trigger": "cold≥1 且 precision≥1、edge≥1",
    "reward": "锋+3；冷色刃缘更稳定",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "cold": 1
       }
      },
      {
       "tagCountMin": {
        "precision": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR105",
    "name": "玄纹封层",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "暗膜出现有层次的纹理",
    "trigger": "OXIDE≥2",
    "reward": "设+3；暗膜出现有层次的纹理",
    "triggerSpec": {
     "tagCountMin": {
      "oxide": 2
     }
    }
   },
   {
    "id": "TR106",
    "name": "哑光归面",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "craft": 3
    },
    "visualEffect": "降低表面反射",
    "trigger": "CLEAN≥2 且无强镜面处理",
    "reward": "工+3；降低表面反射",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "clean": 2
       }
      },
      {
       "tagCountMax": {
        "mirror": 0
       }
      }
     ]
    }
   },
   {
    "id": "TR107",
    "name": "轻钢回弹",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 2,
     "sharpness": 2
    },
    "visualEffect": "刃身高光更轻",
    "trigger": "S1 轻质底材（LIGHT）后，在后续阶段采用 FLEX 回弹处理",
    "reward": "韧+2、锋+2；刃身高光更轻",
    "triggerSpec": {
     "tagAfterTag": {
      "firstTags": [
       "light"
      ],
      "laterTags": [
       "flex"
      ]
     }
    }
   },
   {
    "id": "TR108",
    "name": "沉钢定骨",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3
    },
    "visualEffect": "刀背暗面更厚重",
    "trigger": "RIGID≥2 且 STABLE≥1",
    "reward": "韧+3；刀背暗面更厚重",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "rigid": 2
       }
      },
      {
       "tagCountMin": {
        "stable": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR109",
    "name": "蛇纹交缠",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 2,
     "craft": 3
    },
    "visualEffect": "层纹尺度更清楚",
    "trigger": "LAYER≥2",
    "reward": "韧+2、工+3；层纹尺度更清楚",
    "triggerSpec": {
     "tagCountMin": {
      "layer": 2
     }
    }
   },
   {
    "id": "TR110",
    "name": "矩阵刻度",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "格纹边界更齐整",
    "trigger": "precision≥2 且 S3 选择 S3_08 或 S3_13",
    "reward": "设+3；格纹边界更齐整",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "precision": 2
       }
      },
      {
       "stageCardIdAny": {
        "stage": "S3",
        "ids": [
         "S3_08",
         "S3_13"
        ]
       }
      }
     ]
    }
   },
   {
    "id": "TR111",
    "name": "鳞片回响",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3
    },
    "visualEffect": "纹理出现重复节奏",
    "trigger": "LAYER≥1 且 FLOW≥1",
    "reward": "韧+3；纹理出现重复节奏",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "layer": 1
       }
      },
      {
       "tagCountMin": {
        "flow": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR112",
    "name": "乱序美学",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "局部不规则纹路被保留",
    "trigger": "HETERO≥1 且 WEATHER/SPECTRAL≥1",
    "reward": "设+3；局部不规则纹路被保留",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "hetero": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "weather": 1
         }
        },
        {
         "tagCountMin": {
          "spectral": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR113",
    "name": "细丝定向",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "craft": 3
    },
    "visualEffect": "高光沿主轴排列",
    "trigger": "precision≥2 且 S3 选择 S3_03/S3_07/S3_11/S3_17 之一",
    "reward": "工+3；高光沿主轴排列",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "precision": 2
       }
      },
      {
       "stageCardIdAny": {
        "stage": "S3",
        "ids": [
         "S3_03",
         "S3_07",
         "S3_11",
         "S3_17"
        ]
       }
      }
     ]
    }
   },
   {
    "id": "TR114",
    "name": "粗痕余温",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 2
    },
    "visualEffect": "锤痕对比加强",
    "trigger": "WEATHER≥1 且 LAYER≥1",
    "reward": "韧+2；锤痕对比加强",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "weather": 1
       }
      },
      {
       "tagCountMin": {
        "layer": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR115",
    "name": "旧痕铭印",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "磨损沿受力方向分布",
    "trigger": "WEATHER≥2",
    "reward": "设+3；磨损沿受力方向分布",
    "triggerSpec": {
     "tagCountMin": {
      "weather": 2
     }
    }
   },
   {
    "id": "TR116",
    "name": "异相封层",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3,
     "design": 3
    },
    "visualEffect": "异质边界保留",
    "trigger": "HETERO≥2 且后续被稳定处理",
    "reward": "韧+3、设+3；异质边界保留",
    "triggerSpec": {
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
    }
   },
   {
    "id": "TR117",
    "name": "金衣薄界",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "形成镜面与暗膜分区",
    "trigger": "MIRROR≥1 且 OXIDE≥1",
    "reward": "设+3；形成镜面与暗膜分区",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "mirror": 1
       }
      },
      {
       "tagCountMin": {
        "oxide": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR118",
    "name": "虹膜相位",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 2,
     "spirit": 2
    },
    "visualEffect": "角度相关偏色",
    "trigger": "SPECTRAL 标签至少出现 2 次，且至少 1 张带 SPECTRAL 的所选卡拥有有效视觉配方/视觉槽",
    "reward": "设+2、灵+2；角度相关偏色",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "spectral": 2
       }
      },
      {
       "taggedVisualSlotCountMin": {
        "tags": [
         "spectral"
        ],
        "min": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR119",
    "name": "哑火凝定",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "craft": 3
    },
    "visualEffect": "动态光效收敛",
    "trigger": "存在 riskDeltaPoints≥8 的卡；之后有 riskDeltaPoints<0 的止损卡；peakRisk-currentRisk≥8",
    "reward": "工+3；动态光效收敛",
    "triggerSpec": {
     "all": [
      {
       "highRiskCardCountMin": 1
      },
      {
       "repairAfterHighRisk": true
      },
      {
       "peakMinusCurrentMin": 8
      }
     ]
    }
   },
   {
    "id": "TR120",
    "name": "冷镜定标",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "sharpness": 2,
     "craft": 3
    },
    "visualEffect": "镜面边界干净",
    "trigger": "MIRROR≥2 且 PRECISION≥2",
    "reward": "锋+2、工+3；镜面边界干净",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "mirror": 2
       }
      },
      {
       "tagCountMin": {
        "precision": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR121",
    "name": "同调握域",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3,
     "craft": 2
    },
    "visualEffect": "握柄反射独立",
    "trigger": "S8 握柄槽有效，且 S1/S2/S3/S5/S7 至少 1 张带 MIRROR/SPECTRAL/FLOW/VOID 标签的卡声明了合法视觉配方/视觉槽",
    "reward": "韧+3、工+2；握柄反射独立",
    "triggerSpec": {
     "all": [
      {
       "stageTagAny": {
        "stage": "S8",
        "tags": [
         "grip"
        ]
       }
      },
      {
       "taggedVisualSlotCountMin": {
        "tags": [
         "mirror",
         "spectral",
         "flow",
         "void"
        ],
        "stages": [
         "S1",
         "S2",
         "S3",
         "S5",
         "S7"
        ],
        "min": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR122",
    "name": "止滑脉络",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3
    },
    "visualEffect": "握面颗粒更清楚",
    "trigger": "GRIP≥1 且 WEATHER/UTILITY≥1",
    "reward": "韧+3；握面颗粒更清楚",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "grip": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "weather": 1
         }
        },
        {
         "tagCountMin": {
          "utility": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR123",
    "name": "轻构外壳",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "sharpness": 2,
     "craft": 2
    },
    "visualEffect": "装配线更干净",
    "trigger": "GRIP≥1 且 LIGHT/PRECISION≥1",
    "reward": "锋+2、工+2；装配线更干净",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "grip": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "light": 1
         }
        },
        {
         "tagCountMin": {
          "precision": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR124",
    "name": "沉柄冷轴",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 2,
     "craft": 2
    },
    "visualEffect": "柄部轴向反射",
    "trigger": "GRIP≥1 且 MIRROR/VOID≥1",
    "reward": "韧+2、工+2；柄部轴向反射",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "grip": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "mirror": 1
         }
        },
        {
         "tagCountMin": {
          "void": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR125",
    "name": "玉握雾芯",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "design": 3
    },
    "visualEffect": "半透握柄内部出现雾脉",
    "trigger": "GRIP≥1 且 SPECTRAL/RESONANCE≥1",
    "reward": "设+3；半透握柄内部出现雾脉",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "grip": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "spectral": 1
         }
        },
        {
         "tagCountMin": {
          "resonance": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR126",
    "name": "缠柄回路",
    "tier": "normal",
    "tierCn": "普通",
    "rarityBonus": 3,
    "statDelta": {
     "toughness": 3
    },
    "visualEffect": "握柄缠绕层边界清楚",
    "trigger": "GRIP≥1 且 LAYER≥1",
    "reward": "韧+3；握柄缠绕层边界清楚",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "grip": 1
       }
      },
      {
       "tagCountMin": {
        "layer": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR201",
    "name": "弧刃回锋",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "sharpness": 4
    },
    "visualEffect": "弧形刃线得到强调",
    "trigger": "CURVE≥1 且 EDGE≥2",
    "reward": "锋+4；弧形刃线得到强调",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "curve": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR202",
    "name": "内弧冷映",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "sharpness": 3,
     "design": 2
    },
    "visualEffect": "内弧局部反射",
    "trigger": "knifeType∈{karambit,kris,saber} 且 void≥1、edge≥1",
    "reward": "锋+3、设+2；内弧局部反射",
    "triggerSpec": {
     "all": [
      {
       "stageAssetRefAny": {
        "stage": "S4",
        "values": [
         "karambit",
         "kris",
         "saber"
        ]
       }
      },
      {
       "tagCountMin": {
        "void": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR203",
    "name": "直脊定轴",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "strength": 3,
     "toughness": 2
    },
    "visualEffect": "主轴反射更直",
    "trigger": "RIGID≥2 且 PRECISION≥1",
    "reward": "强+3、韧+2；主轴反射更直",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "rigid": 2
       }
      },
      {
       "tagCountMin": {
        "precision": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR204",
    "name": "刺脊贯线",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "sharpness": 4
    },
    "visualEffect": "前端刃线聚焦",
    "trigger": "knifeType=bayonet 且 edge≥2",
    "reward": "锋+4；前端刃线聚焦",
    "triggerSpec": {
     "all": [
      {
       "stageAssetRefAny": {
        "stage": "S4",
        "values": [
         "bayonet"
        ]
       }
      },
      {
       "tagCountMin": {
        "edge": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR205",
    "name": "长刃贯纹",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "design": 3,
     "spirit": 2
    },
    "visualEffect": "长线纹理贯通",
    "trigger": "knifeType∈{tangdao,straight,saber} 且 flow≥1",
    "reward": "设+3、灵+2；长线纹理贯通",
    "triggerSpec": {
     "all": [
      {
       "stageAssetRefAny": {
        "stage": "S4",
        "values": [
         "tangdao",
         "straight",
         "saber"
        ]
       }
      },
      {
       "tagCountMin": {
        "flow": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR206",
    "name": "双翼偏相",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "design": 4
    },
    "visualEffect": "双翼出现偏振反射",
    "trigger": "FOLD≥1 且 SPECTRAL≥1",
    "reward": "设+4；双翼出现偏振反射",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "fold": 1
       }
      },
      {
       "tagCountMin": {
        "spectral": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR207",
    "name": "重心压势",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "strength": 4,
     "sharpness": 2
    },
    "visualEffect": "刀头高光更重",
    "trigger": "impact≥1 且 strength≥20",
    "reward": "强+4、锋+2；刀头高光更重",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "impact": 1
       }
      },
      {
       "statMin": {
        "strength": 20
       }
      }
     ]
    }
   },
   {
    "id": "TR208",
    "name": "粗纹野境",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "toughness": 3,
     "craft": 2
    },
    "visualEffect": "磨损与握柄同调",
    "trigger": "WEATHER≥1 且 GRIP/UTILITY≥1",
    "reward": "韧+3、工+2；磨损与握柄同调",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "weather": 1
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "grip": 1
         }
        },
        {
         "tagCountMin": {
          "utility": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR209",
    "name": "岩层切面",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "toughness": 3,
     "craft": 2
    },
    "visualEffect": "岩层切面更明显",
    "trigger": "RIGID≥1 且 LAYER≥1",
    "reward": "韧+3、工+2；岩层切面更明显",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "rigid": 1
       }
      },
      {
       "tagCountMin": {
        "layer": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR210",
    "name": "波刃流相",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "design": 2,
     "spirit": 3
    },
    "visualEffect": "偏色随流线移动",
    "trigger": "CURVE/FLOW≥2 且 SPECTRAL≥1",
    "reward": "设+2、灵+3；偏色随流线移动",
    "triggerSpec": {
     "all": [
      {
       "tagCountSumMin": {
        "tags": [
         "curve",
         "flow"
        ],
        "min": 2
       }
      },
      {
       "tagCountMin": {
        "spectral": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR211",
    "name": "骨架暗腔",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "design": 3,
     "spirit": 2
    },
    "visualEffect": "暗腔边界清楚",
    "trigger": "knifeType∈{skull,balisong,karambit} 且 void≥1",
    "reward": "设+3、灵+2；暗腔边界清楚",
    "triggerSpec": {
     "all": [
      {
       "stageAssetRefAny": {
        "stage": "S4",
        "values": [
         "skull",
         "balisong",
         "karambit"
        ]
       }
      },
      {
       "tagCountMin": {
        "void": 1
       }
      }
     ]
    }
   },
   {
    "id": "TR212",
    "name": "机关回扣",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "toughness": 2,
     "craft": 4
    },
    "visualEffect": "结构连接更精密",
    "trigger": "fold≥1、precision≥1 且已完成 S9",
    "reward": "韧+2、工+4；结构连接更精密",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "fold": 1
       }
      },
      {
       "tagCountMin": {
        "precision": 1
       }
      },
      {
       "stageCompleted": "S9"
      }
     ]
    }
   },
   {
    "id": "TR213",
    "name": "临界回声",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "strength": 2,
     "spirit": 4
    },
    "visualEffect": "脉冲光效被封存",
    "trigger": "CB03 已触发；或 peakRisk≥45、highRiskCardCount≥2、peakRisk-currentRisk≥8",
    "reward": "强+2、灵+4；脉冲光效被封存",
    "triggerSpec": {
     "any": [
      {
       "comboActive": "CB03"
      },
      {
       "all": [
        {
         "riskPeakMin": 45
        },
        {
         "highRiskCardCountMin": 2
        },
        {
         "peakMinusCurrentMin": 8
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR214",
    "name": "星屑回路",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "craft": 3,
     "spirit": 3
    },
    "visualEffect": "节点间出现细微星点",
    "trigger": "CB05 已触发；或 resonance 出现在≥3个阶段且 craft≥65",
    "reward": "工+3、灵+3；节点间出现细微星点",
    "triggerSpec": {
     "any": [
      {
       "comboActive": "CB05"
      },
      {
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
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR215",
    "name": "叠层回声",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "toughness": 3,
     "craft": 3
    },
    "visualEffect": "多层暗纹分层显现",
    "trigger": "CB02 或 LAYER≥3",
    "reward": "韧+3、工+3；多层暗纹分层显现",
    "triggerSpec": {
     "any": [
      {
       "comboActive": "CB02"
      },
      {
       "tagCountMin": {
        "layer": 3
       }
      }
     ]
    }
   },
   {
    "id": "TR216",
    "name": "霜刃缓冲",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "toughness": 2,
     "sharpness": 3
    },
    "visualEffect": "冷刃边界更稳定",
    "trigger": "edge≥1 且 S6/S9 存在 stable 或 repair 标签",
    "reward": "韧+2、锋+3；冷刃边界更稳定",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "edge": 1
       }
      },
      {
       "stageTagAnyIn": {
        "stages": [
         "S6",
         "S9"
        ],
        "tags": [
         "stable",
         "repair"
        ]
       }
      }
     ]
    }
   },
   {
    "id": "TR217",
    "name": "余焰封存",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "strength": 2,
     "spirit": 3
    },
    "visualEffect": "余热变成内部微光",
    "trigger": "CB08 已触发；或 heat≥2 且 stable/repair≥1",
    "reward": "强+2、灵+3；余热变成内部微光",
    "triggerSpec": {
     "any": [
      {
       "comboActive": "CB08"
      },
      {
       "all": [
        {
         "tagCountMin": {
          "heat": 2
         }
        },
        {
         "any": [
          {
           "tagCountMin": {
            "stable": 1
           }
          },
          {
           "tagCountMin": {
            "repair": 1
           }
          }
         ]
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR218",
    "name": "潮痕回相",
    "tier": "rare",
    "tierCn": "稀有",
    "rarityBonus": 5,
    "statDelta": {
     "design": 3,
     "spirit": 3
    },
    "visualEffect": "虹彩顺着纹理回流",
    "trigger": "CB01 或 FLOW≥2 且 SPECTRAL≥1",
    "reward": "设+3、灵+3；虹彩顺着纹理回流",
    "triggerSpec": {
     "any": [
      {
       "comboActive": "CB01"
      },
      {
       "all": [
        {
         "tagCountMin": {
          "flow": 2
         }
        },
        {
         "tagCountMin": {
          "spectral": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR301",
    "name": "天工一体",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "craft": 4,
     "spirit": 4
    },
    "visualEffect": "整刀反射统一",
    "trigger": "resonance 出现在≥3个阶段且 peakRisk≥35、currentRisk≤55",
    "reward": "工+4、灵+4；整刀反射统一",
    "triggerSpec": {
     "all": [
      {
       "tagStageCountMin": {
        "resonance": 3
       }
      },
      {
       "riskPeakMin": 35
      },
      {
       "riskCurrentMax": 55
      }
     ]
    }
   },
   {
    "id": "TR302",
    "name": "神纹天章",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "design": 5,
     "spirit": 3
    },
    "visualEffect": "签名层纹生成",
    "trigger": "layer≥3 且至少触发 1 条 Combo",
    "reward": "设+5、灵+3；签名层纹生成",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "layer": 3
       }
      },
      {
       "comboCountMin": 1
      }
     ]
    }
   },
   {
    "id": "TR303",
    "name": "无相隐界",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "spirit": 5
    },
    "visualEffect": "暗面只留下可辨结构",
    "trigger": "void≥2 且 edge 或 mirror≥1",
    "reward": "灵+5；暗面只留下可辨结构",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "void": 2
       }
      },
      {
       "any": [
        {
         "tagCountMin": {
          "edge": 1
         }
        },
        {
         "tagCountMin": {
          "mirror": 1
         }
        }
       ]
      }
     ]
    }
   },
   {
    "id": "TR304",
    "name": "虹渊深相",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "design": 4,
     "spirit": 4
    },
    "visualEffect": "深层虹彩分区",
    "trigger": "spectral≥3 且出现在≥2个阶段的视觉槽",
    "reward": "设+4、灵+4；深层虹彩分区",
    "triggerSpec": {
     "all": [
      {
       "tagCountMin": {
        "spectral": 3
       }
      },
      {
       "tagStageCountMin": {
        "spectral": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR305",
    "name": "陨铁共生",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "strength": 4,
     "spirit": 4
    },
    "visualEffect": "陨铁脉络与纹理联动",
    "trigger": "材料卡为 MAT22–MAT25 且 hetero/resonance 标签总数≥2",
    "reward": "强+4、灵+4；陨铁脉络与纹理联动",
    "triggerSpec": {
     "all": [
      {
       "stageAssetRefAny": {
        "stage": "S1",
        "values": [
         "M22",
         "M23",
         "M24",
         "M25"
        ]
       }
      },
      {
       "tagCountSumMin": {
        "tags": [
         "hetero",
         "resonance"
        ],
        "min": 2
       }
      }
     ]
    }
   },
   {
    "id": "TR306",
    "name": "裂空极锋",
    "tier": "high",
    "tierCn": "高阶",
    "rarityBonus": 8,
    "statDelta": {
     "toughness": 2,
     "sharpness": 5
    },
    "visualEffect": "刃线极窄高亮",
    "trigger": "sharpness≥55、precision≥1、edge≥1 且 currentRisk≤45",
    "reward": "韧+2、锋+5；刃线极窄高亮",
    "triggerSpec": {
     "all": [
      {
       "statMin": {
        "sharpness": 55
       }
      },
      {
       "tagCountMin": {
        "precision": 1
       }
      },
      {
       "tagCountMin": {
        "edge": 1
       }
      },
      {
       "riskCurrentMax": 45
      }
     ]
    }
   }
  ];

  const BY_ID = {};
  for (const t of TRAITS) BY_ID[t.id] = t;

  /** 高阶特性名额上限（每局最多 1 条） */
  const HIGH_TIER_LIMIT = 1;

  K3D.traitsV11 = {
    TRAITS, BY_ID, HIGH_TIER_LIMIT,
    get: (id) => BY_ID[id] || null,
    tierOf: (id) => { const t = BY_ID[id]; return t ? t.tier : null; },
    isHigh: (id) => { const t = BY_ID[id]; return !!t && t.tier === 'high'; },
  };

export const traitsV11 = __reg.proxy.traitsV11;
