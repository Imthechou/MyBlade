/**
 * 由 tools/convert-legacy.mjs 机械转换（源文件：锻刀大赛/js/data/cardWrites.js）。
 *
 * ⚠ 本文件属于「已验证视觉内核」：函数体与原始实现逐字一致，
 *   只改了模块包装。新逻辑不要写在这里，请写在 src/render/index.js 门面之上。
 */
import { K3D_REGISTRY as __reg } from '../../render/legacy/_registry.js';
__reg.install();
const global = globalThis;

  'use strict';
  const K3D = (global.K3D = global.K3D || {});

  const WRITES = {
   "MAT01": {
    "materialId": "M08"
   },
   "MAT02": {
    "materialId": "M01"
   },
   "MAT03": {
    "materialId": "M03"
   },
   "MAT04": {
    "materialId": "M02"
   },
   "MAT05": {
    "materialId": "M05"
   },
   "MAT06": {
    "materialId": "M07"
   },
   "MAT07": {
    "materialId": "M06"
   },
   "MAT08": {
    "materialId": "M04"
   },
   "MAT09": {
    "materialId": "M09"
   },
   "MAT10": {
    "materialId": "M10"
   },
   "MAT11": {
    "materialId": "M12"
   },
   "MAT12": {
    "materialId": "M13"
   },
   "MAT13": {
    "materialId": "M14"
   },
   "MAT14": {
    "materialId": "M11"
   },
   "MAT15": {
    "materialId": "M15"
   },
   "MAT16": {
    "materialId": "M16"
   },
   "MAT17": {
    "materialId": "M17"
   },
   "MAT18": {
    "materialId": "M18"
   },
   "MAT19": {
    "materialId": "M19"
   },
   "MAT20": {
    "materialId": "M20"
   },
   "MAT21": {
    "materialId": "M21"
   },
   "MAT22": {
    "materialId": "M22"
   },
   "MAT23": {
    "materialId": "M23"
   },
   "MAT24": {
    "materialId": "M24"
   },
   "MAT25": {
    "materialId": "M25"
   },
   "S2_01": {
    "variants": {
     "melt": {
      "purity": 0.2,
      "roughnessStrength": 0.62,
      "contrast": 0.5
     }
    }
   },
   "S2_02": {
    "variants": {
     "melt": {
      "purity": 0.34,
      "roughnessStrength": 0.6,
      "stretch": 2.5,
      "flowDir": 0.15
     }
    }
   },
   "S2_03": {
    "variants": {
     "melt": {
      "purity": 0.42,
      "contrast": 0.6,
      "warp": 0.18
     }
    }
   },
   "S2_04": {
    "variants": {
     "melt": {
      "purity": 0.14,
      "warp": 0.2,
      "scale": 0.9
     }
    }
   },
   "S2_05": {
    "variants": {
     "melt": {
      "purity": 0.17,
      "roughnessStrength": 0.55,
      "contrast": 0.55
     }
    }
   },
   "S2_06": {
    "variants": {
     "melt": {
      "purity": 0.28,
      "roughnessStrength": 0.9,
      "contrast": 0.65,
      "warp": 0.4
     }
    }
   },
   "S2_07": {
    "variants": {
     "melt": {
      "purity": 0.1,
      "contrast": 0.42,
      "scale": 0.95
     }
    }
   },
   "S2_08": {
    "variants": {
     "melt": {
      "purity": 0.4,
      "roughnessStrength": 0.45,
      "stretch": 1.6,
      "flowDir": 0.2
     }
    }
   },
   "S2_09": {
    "variants": {
     "melt": {
      "purity": 0.5,
      "roughnessStrength": 0.2,
      "contrast": 0.35
     }
    }
   },
   "S2_10": {
    "variants": {
     "melt": {
      "purity": 0.44,
      "roughnessStrength": 0.4,
      "contrast": 0.5,
      "scale": 1.1
     }
    }
   },
   "S2_11": {
    "variants": {
     "melt": {
      "purity": 0.38,
      "warp": 0.3,
      "contrast": 0.55,
      "scale": 0.85
     }
    }
   },
   "S2_12": {
    "variants": {
     "melt": {
      "purity": 0.58,
      "contrast": 0.5,
      "scale": 1.15
     }
    }
   },
   "S2_13": {
    "variants": {
     "melt": {
      "purity": 0.64,
      "warp": 0.45,
      "roughnessStrength": 0.3
     }
    }
   },
   "S2_14": {
    "variants": {
     "melt": {
      "purity": 0.6,
      "contrast": 0.62,
      "warp": 0.35,
      "stretch": 2,
      "scale": 1.2
     }
    }
   },
   "S2_15": {
    "variants": {
     "melt": {
      "purity": 0.68,
      "warp": 0.55,
      "contrast": 0.6
     }
    }
   },
   "S2_16": {
    "variants": {
     "melt": {
      "purity": 0.7,
      "shardScale": 4,
      "shardContrast": 0.5,
      "scale": 1.3
     }
    }
   },
   "S2_17": {
    "variants": {
     "melt": {
      "purity": 0.84,
      "scale": 0.78,
      "roughnessStrength": 0.15
     }
    }
   },
   "S2_18": {
    "variants": {
     "melt": {
      "purity": 0.78,
      "contrast": 0.6,
      "warp": 0.42
     }
    }
   },
   "S2_19": {
    "variants": {
     "melt": {
      "purity": 0.8,
      "mistLarge": 0.5,
      "mistSmall": 0.35,
      "softness": 0.5
     }
    }
   },
   "S2_20": {
    "variants": {
     "melt": {
      "purity": 0.76,
      "warp": 0.8,
      "contrast": 0.7
     }
    }
   },
   "S2_21": {
    "variants": {
     "melt": {
      "purity": 0.95,
      "shardScale": 3.2,
      "scale": 1.2
     }
    }
   },
   "S2_22": {
    "variants": {
     "melt": {
      "purity": 0.9,
      "warp": 0.5,
      "scale": 0.85
     }
    }
   },
   "S2_23": {
    "variants": {
     "melt": {
      "purity": 0.92,
      "flowDir": 0.5,
      "stretch": 3.2,
      "warp": 0.3
     }
    }
   },
   "S2_24": {
    "variants": {
     "melt": {
      "purity": 1,
      "warp": 0.6,
      "stretch": 2.4,
      "flowDir": 0.35,
      "scale": 1.15
     }
    }
   },
   "S3_01": {
    "textureId": "T01",
    "variants": {
     "texture": {
      "scale": 1,
      "warp": 0.3,
      "contrast": 0.45,
      "roughnessStrength": 0.5
     }
    }
   },
   "S3_02": {
    "textureId": "T23",
    "variants": {
     "texture": {
      "density": 150,
      "direction": 0,
      "anisotropy": 0.6,
      "contrast": 0.4,
      "roughnessStrength": 0.5
     }
    }
   },
   "S3_03": {
    "textureId": "T02",
    "variants": {
     "texture": {
      "scale": 1,
      "contrast": 0.15,
      "roughnessStrength": 0.2
     }
    }
   },
   "S3_04": {
    "textureId": "T04",
    "variants": {
     "texture": {
      "frequency": 7,
      "amplitude": 0.45,
      "warp": 0.2,
      "contrast": 0.45,
      "roughnessStrength": 0.45
     }
    }
   },
   "S3_05": {
    "textureId": "T22",
    "variants": {
     "texture": {
      "rotation": 90,
      "density": 260,
      "direction": 90,
      "anisotropy": 0.8,
      "contrast": 0.5,
      "roughnessStrength": 0.55,
      "tintA": "#6f86a8",
      "tintB": "#dfe8f5",
      "tintMix": 0.12
     }
    }
   },
   "S3_06": {
    "textureId": "T05",
    "variants": {
     "texture": {
      "tile": 1,
      "gridScale": 9,
      "grooveWidth": 0.08,
      "contrast": 0.55,
      "roughnessStrength": 0.5
     }
    }
   },
   "S3_07": {
    "textureId": "T20",
    "variants": {
     "texture": {
      "rotation": 12,
      "scale": 0.92,
      "warp": 0.42,
      "contrast": 0.55,
      "roughnessStrength": 0.6,
      "tintA": "#8a6a4a",
      "tintB": "#e8d8c0",
      "tintMix": 0.12
     }
    }
   },
   "S3_08": {
    "textureId": "T07",
    "variants": {
     "texture": {
      "lineDensity": 55,
      "lineWidth": 0.05,
      "depth": 0.6,
      "contrast": 0.5,
      "roughnessStrength": 0.6
     }
    }
   },
   "S3_09": {
    "textureId": "T15",
    "variants": {
     "texture": {
      "rotation": -15,
      "frequency": 12,
      "amplitude": 0.6,
      "warp": 0.3,
      "contrast": 0.55,
      "roughnessStrength": 0.45
     }
    }
   },
   "S3_10": {
    "textureId": "T16",
    "variants": {
     "texture": {
      "shardScale": 6,
      "shardContrast": 0.6,
      "plateThickness": 0.2,
      "roughnessStrength": 0.55,
      "tintA": "#4a5a7a",
      "tintB": "#c8d4e6",
      "tintMix": 0.12
     }
    }
   },
   "S3_11": {
    "textureId": "T03",
    "variants": {
     "texture": {
      "scale": 1.05,
      "warp": 0.5,
      "contrast": 0.7,
      "roughnessStrength": 0.5,
      "tintA": "#7d93b8",
      "tintB": "#e6eef8",
      "tintMix": 0.3
     }
    }
   },
   "S3_12": {
    "textureId": "T17",
    "variants": {
     "texture": {
      "cellScale": 2.8,
      "veinWidth": 0.09,
      "warp": 0.6,
      "contrast": 0.7,
      "roughnessStrength": 0.4,
      "tintA": "#4fbf9e",
      "tintB": "#f2ead8",
      "tintMix": 0.3
     }
    }
   },
  "S3_13": {
    "textureId": "T06",
    "variants": {
     "texture": {
      "flowDir": 0.2,
      "stretch": 2.2,
      "warp": 0.55,
      "scale": 2.6,
      "contrast": 0.58,
      "roughnessStrength": 0.6,
      "tintA": "#e08a2a",
      "tintB": "#ffd98a",
      "tintMix": 0.32
     }
    }
   },
  "S3_14": {
    "textureId": "T14",
    "variants": {
     "texture": {
      "gridScale": 11,
      "grooveWidth": 0.09,
      "warp": 0.35,
      "cross": 1,
      "scale": 2.0,
      "contrast": 0.84,
      "roughnessStrength": 0.8,
      "tintA": "#8e1f2a",
      "tintB": "#d9b25a",
      "tintMix": 0.34
     }
    }
   },
   "S3_15": {
    "textureId": "T08",
    "variants": {
     "texture": {
      "mistLarge": 0.7,
      "mistSmall": 0.3,
      "softness": 0.5,
      "warp": 0.5,
      "contrast": 0.6,
      "roughnessStrength": 0.35,
      "tintA": "#5f8fd0",
      "tintB": "#b98fe0",
      "tintMix": 0.3
     }
    }
   },
   "S3_16": {
    "textureId": "T09",
    "variants": {
     "texture": {
      "rotation": 90,
      "scale": 1.12,
      "warp": 0.62,
      "contrast": 0.76,
      "roughnessStrength": 0.5,
      "tintA": "#26436e",
      "tintB": "#e6eef8",
      "tintMix": 0.42
     }
    }
   },
   "S3_17": {
    "textureId": "T12",
    "variants": {
     "texture": {
      "rotation": 30,
      "cellScale": 4.2,
      "veinWidth": 0.07,
      "warp": 0.55,
      "contrast": 0.72,
      "roughnessStrength": 0.38,
      "tintA": "#2f9e6a",
      "tintB": "#eaf6ee",
      "tintMix": 0.42
     }
    }
   },
   "S3_18": {
    "textureId": "T19",
    "variants": {
     "texture": {
      "density": 6,
      "direction": 0,
      "warp": 0.45,
      "contrast": 0.7,
      "roughnessStrength": 0.4,
      "tintA": "#8b5cf6",
      "tintB": "#3fc7d6",
      "tintMix": 0.46
     }
    }
   },
   "S3_19": {
    "textureId": "T13",
    "variants": {
     "texture": {
      "rotation": 60,
      "lineDensity": 85,
      "lineWidth": 0.035,
      "depth": 0.7,
      "contrast": 0.6,
      "roughnessStrength": 0.7,
      "tintA": "#b08a3a",
      "tintB": "#f0e2c0",
      "tintMix": 0.42
     }
    }
   },
   "S3_20": {
    "textureId": "T21",
    "variants": {
     "texture": {
      "cellScale": 3.2,
      "softness": 0.4,
      "warp": 0.8,
      "contrast": 0.75,
      "roughnessStrength": 0.35,
      "tintA": "#b0265f",
      "tintB": "#2f6fd0",
      "tintMix": 0.52
     }
    }
   },
   "S3_21": {
    "textureId": "T10",
    "variants": {
     "texture": {
      "rotation": -30,
      "mistLarge": 0.85,
      "mistSmall": 0.45,
      "softness": 0.38,
      "warp": 0.62,
      "contrast": 0.72,
      "roughnessStrength": 0.35,
      "tintA": "#2f5fd0",
      "tintB": "#8b4fd0",
      "tintMix": 0.52
     }
    }
   },
   "S3_22": {
    "textureId": "T18",
    "variants": {
     "texture": {
      "rotation": 20,
      "shardScale": 3.2,
      "shardContrast": 0.85,
      "plateThickness": 0.3,
      "contrast": 0.8,
      "roughnessStrength": 0.6,
      "tintA": "#c07a2a",
      "tintB": "#243b6e",
      "tintMix": 0.52
     }
    }
   },
   "S3_23": {
    "textureId": "T11",
    "variants": {
     "texture": {
      "rotation": 75,
      "cellScale": 5.2,
      "veinWidth": 0.05,
      "warp": 0.72,
      "contrast": 0.82,
      "roughnessStrength": 0.4,
      "tintA": "#6a2fb0",
      "tintB": "#e0b44a",
      "tintMix": 0.58
     }
    }
   },
   "S3_24": {
    "textureId": "T24",
    "variants": {
     "texture": {
      "rotation": 135,
      "scale": 1.28,
      "warp": 0.92,
      "contrast": 0.92,
      "roughnessStrength": 0.52,
      "tintA": "#8fd8f0",
      "tintB": "#a06fe0",
      "tintMix": 0.6
     }
    }
   },
   "K01": {
    "knifeType": "balisong"
   },
   "K02": {
    "knifeType": "bayonet"
   },
   "K03": {
    "knifeType": "folding"
   },
   "K04": {
    "knifeType": "gladius"
   },
   "K05": {
    "knifeType": "karambit"
   },
   "K06": {
    "knifeType": "kris"
   },
   "K07": {
    "knifeType": "machete"
   },
   "K08": {
    "knifeType": "saber"
   },
   "K09": {
    "knifeType": "skull"
   },
   "K10": {
    "knifeType": "straight"
   },
   "K11": {
    "knifeType": "survival"
   },
   "K12": {
    "knifeType": "tangdao"
   },
   "K13": {
    "knifeType": "tangdao"
   },
   "K14": {
    "knifeType": "straight"
   },
   "K15": {
    "knifeType": "bayonet"
   },
   "K16": {
    "knifeType": "folding"
   },
   "K17": {
    "knifeType": "machete"
   },
   "K18": {
    "knifeType": "survival"
   },
   "K19": {
    "knifeType": "balisong"
   },
   "K20": {
    "knifeType": "gladius"
   },
   "K21": {
    "knifeType": "karambit"
   },
   "K22": {
    "knifeType": "kris"
   },
   "K23": {
    "knifeType": "saber"
   },
   "K24": {
    "knifeType": "skull"
   },
   "S5_25": {
    "finishId": "F01",
    "variants": {
     "finish": {
      "amount": 0.55
     }
    }
   },
   "S5_01": {
    "finishId": "F05",
    "variants": {
     "finish": {
      "amount": 0.5
     }
    }
   },
   "S5_02": {
    "finishId": "F11",
    "variants": {
     "finish": {
      "amount": 0.5
     }
    }
   },
   "S5_03": {
    "finishId": "F02",
    "variants": {
     "finish": {
      "amount": 0.6
     }
    }
   },
   "S5_04": {
    "finishId": "F03",
    "variants": {
     "finish": {
      "amount": 0.5
     }
    }
   },
   "S5_05": {
    "finishId": "F07",
    "variants": {
     "finish": {
      "amount": 0.7,
      "temperature": 0.45
     }
    }
   },
   "S5_06": {
    "finishId": "F04",
    "variants": {
     "finish": {
      "amount": 0.5,
      "darkness": 0.5
     }
    }
   },
   "S5_07": {
    "finishId": "F05",
    "variants": {
     "finish": {
      "amount": 0.85,
      "gradient": 0.12
     }
    }
   },
   "S5_08": {
    "finishId": "F11",
    "variants": {
     "finish": {
      "amount": 0.65,
      "coat": 0.45
     }
    }
   },
   "S5_09": {
    "finishId": "F02",
    "variants": {
     "finish": {
      "amount": 0.85
     }
    }
   },
   "S5_10": {
    "finishId": "F09",
    "variants": {
     "finish": {
      "coat": 0.5,
      "tintHex": "#8a93a6"
     }
    }
   },
   "S5_11": {
    "finishId": "F07",
    "variants": {
     "finish": {
      "amount": 0.75,
      "temperature": 0.35
     }
    }
   },
   "S5_12": {
    "finishId": "F11",
    "variants": {
     "finish": {
      "amount": 0.9,
      "coat": 0.9
     }
    }
   },
   "S5_13": {
    "finishId": "F08",
    "variants": {
     "finish": {
      "amount": 0.7,
      "hueShift": 0.1,
      "iridescence": 0.4
     }
    }
   },
   "S5_14": {
    "finishId": "F10",
    "variants": {
     "finish": {
      "strength": 0.6,
      "colorPhase": 0.3,
      "paletteShift": 0
     }
    }
   },
   "S5_15": {
    "finishId": "F08",
    "variants": {
     "finish": {
      "amount": 0.7,
      "hueShift": 0.35,
      "iridescence": 0.5
     }
    }
   },
   "S5_16": {
    "finishId": "F06",
    "variants": {
     "finish": {
      "amount": 0.75,
      "heatSpread": 0.7
     }
    }
   },
   "S5_17": {
    "finishId": "F04",
    "variants": {
     "finish": {
      "amount": 0.6,
      "darkness": 0.65
     }
    }
   },
   "S5_18": {
    "finishId": "F06",
    "variants": {
     "finish": {
      "amount": 0.85,
      "heatSpread": 0.9,
      "phase": 0.3
     }
    }
   },
   "S5_19": {
    "finishId": "F08",
    "variants": {
     "finish": {
      "amount": 0.8,
      "hueShift": 0.6,
      "iridescence": 0.7
     }
    }
   },
   "S5_20": {
    "finishId": "F10",
    "variants": {
     "finish": {
      "strength": 0.75,
      "colorPhase": 0.5,
      "fresnelIntensity": 0.6,
      "paletteShift": 0.33
     }
    }
   },
   "S5_21": {
    "finishId": "F10",
    "variants": {
     "finish": {
      "strength": 0.8,
      "preserveRatio": 0.4,
      "colorPhase": 0.4,
      "paletteShift": 0.66
     }
    }
   },
   "S5_22": {
    "finishId": "F04",
    "variants": {
     "finish": {
      "amount": 0.7,
      "darkness": 0.8
     }
    }
   },
   "S5_23": {
    "finishId": "F08",
    "variants": {
     "finish": {
      "amount": 0.85,
      "hueShift": 0.85,
      "iridescence": 0.8
     }
    }
   },
   "S5_24": {
    "finishId": "F12",
    "variants": {
     "finish": {
      "amount": 0.5,
      "fresnelPower": 2.6,
      "flowSpeed": 0.4,
      "tintHex": "#9fd0ff"
     }
    }
   },
   "S6_01": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.2
     }
    }
   },
   "S6_02": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.45
     }
    }
   },
   "S6_03": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.7
     }
    }
   },
   "S6_04": {
    "variants": {
     "temper": {
      "amount": 0.6,
      "temperature": 0.15
     }
    }
   },
   "S6_05": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.35
     }
    }
   },
   "S6_06": {
    "variants": {
     "temper": {
      "amount": 0.65,
      "temperature": 0.5
     }
    }
   },
   "S6_07": {
    "variants": {
     "temper": {
      "amount": 0.75,
      "temperature": 0.55
     }
    }
   },
   "S6_08": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.4,
      "hueShift": 0.1
     }
    }
   },
   "S6_09": {
    "variants": {
     "temper": {
      "amount": 0.75,
      "temperature": 0.42
     }
    }
   },
   "S6_10": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.25
     }
    }
   },
   "S6_11": {
    "variants": {
     "temper": {
      "amount": 0.75,
      "temperature": 0.48,
      "hueShift": 0.15
     }
    }
   },
   "S6_12": {
    "variants": {
     "temper": {
      "amount": 0.72,
      "temperature": 0.75
     }
    }
   },
   "S6_13": {
    "variants": {
     "temper": {
      "amount": 0.78,
      "temperature": 0.45,
      "hueShift": 0.3
     }
    }
   },
   "S6_14": {
    "variants": {
     "temper": {
      "amount": 0.7,
      "temperature": 0.9
     }
    }
   },
   "S6_15": {
    "variants": {
     "temper": {
      "amount": 0.75,
      "temperature": 0.85,
      "hueShift": 0.2
     }
    }
   },
   "S6_16": {
    "variants": {
     "temper": {
      "amount": 0.68,
      "temperature": 0.2,
      "hueShift": -0.1
     }
    }
   },
   "S6_17": {
    "variants": {
     "temper": {
      "amount": 0.8,
      "temperature": 0.5,
      "hueShift": 0.4
     }
    }
   },
   "S6_18": {
    "variants": {
     "temper": {
      "amount": 0.8,
      "temperature": 0.7,
      "hueShift": 0.2
     }
    }
   },
   "S6_19": {
    "variants": {
     "temper": {
      "amount": 0.82,
      "temperature": 0.5,
      "hueShift": 0.5
     }
    }
   },
   "S6_20": {
    "variants": {
     "temper": {
      "amount": 0.85,
      "temperature": 0.6,
      "hueShift": 0.6
     }
    }
   },
   "S6_21": {
    "variants": {
     "temper": {
      "amount": 0.85,
      "temperature": 0.8,
      "hueShift": 0.7
     }
    }
   },
   "S6_22": {
    "variants": {
     "temper": {
      "amount": 0.88,
      "temperature": 0.55,
      "hueShift": 0.8
     }
    }
   },
   "S6_23": {
    "variants": {
     "temper": {
      "amount": 0.86,
      "temperature": 0.65,
      "hueShift": 0.9
     }
    }
   },
   "S6_24": {
    "variants": {
     "temper": {
      "amount": 0.9,
      "temperature": 0.6,
      "hueShift": 0.7
     }
    }
   },
   "S7_01": {
    "variants": {
     "edge": {
      "amount": 0.25,
      "fresnelPower": 2.2,
      "flowSpeed": 0.2,
      "tintHex": "#c8d6e5"
     }
    }
   },
   "S7_02": {
    "variants": {
     "edge": {
      "amount": 0.35,
      "fresnelPower": 2,
      "flowSpeed": 0.15,
      "tintHex": "#b0c0d0"
     }
    }
   },
   "S7_03": {
    "variants": {
     "edge": {
      "amount": 0.4,
      "fresnelPower": 2.4,
      "flowSpeed": 0.25,
      "tintHex": "#d0e0f0"
     }
    }
   },
   "S7_04": {
    "variants": {
     "edge": {
      "amount": 0.38,
      "fresnelPower": 2.3,
      "flowSpeed": 0.22,
      "tintHex": "#cfe0f5"
     }
    }
   },
   "S7_05": {
    "variants": {
     "edge": {
      "amount": 0.33,
      "fresnelPower": 2.1,
      "flowSpeed": 0.2,
      "tintHex": "#a8c0d8"
     }
    }
   },
   "S7_06": {
    "variants": {
     "edge": {
      "amount": 0.45,
      "fresnelPower": 2.5,
      "flowSpeed": 0.3,
      "tintHex": "#e0eff8"
     }
    }
   },
   "S7_07": {
    "variants": {
     "edge": {
      "amount": 0.3,
      "fresnelPower": 2,
      "flowSpeed": 0.18,
      "tintHex": "#9fb8d0"
     }
    }
   },
   "S7_08": {
    "variants": {
     "edge": {
      "amount": 0.42,
      "fresnelPower": 2.4,
      "flowSpeed": 0.28,
      "tintHex": "#d8e8f5"
     }
    }
   },
   "S7_09": {
    "variants": {
     "edge": {
      "amount": 0.55,
      "fresnelPower": 2.6,
      "flowSpeed": 0.35,
      "tintHex": "#eaf4ff"
     }
    }
   },
   "S7_10": {
    "variants": {
     "edge": {
      "amount": 0.5,
      "fresnelPower": 2.7,
      "flowSpeed": 0.3,
      "tintHex": "#f0f8ff"
     }
    }
   },
   "S7_11": {
    "variants": {
     "edge": {
      "amount": 0.52,
      "fresnelPower": 2.8,
      "flowSpeed": 0.25,
      "tintHex": "#c0e8ff"
     }
    }
   },
   "S7_12": {
    "variants": {
     "edge": {
      "amount": 0.48,
      "fresnelPower": 2.5,
      "flowSpeed": 0.32,
      "tintHex": "#dceffc"
     }
    }
   },
   "S7_13": {
    "variants": {
     "edge": {
      "amount": 0.55,
      "fresnelPower": 2.8,
      "flowSpeed": 0.4,
      "tintHex": "#bfe0ff"
     }
    }
   },
   "S7_14": {
    "variants": {
     "edge": {
      "amount": 0.7,
      "fresnelPower": 3,
      "flowSpeed": 0.5,
      "tintHex": "#9fd0ff"
     }
    }
   },
   "S7_15": {
    "variants": {
     "edge": {
      "amount": 0.65,
      "fresnelPower": 3.2,
      "flowSpeed": 0.4,
      "tintHex": "#7fbfff"
     }
    }
   },
   "S7_16": {
    "variants": {
     "edge": {
      "amount": 0.75,
      "fresnelPower": 3.5,
      "flowSpeed": 0.6,
      "tintHex": "#6fa8ff"
     }
    }
   },
   "S7_17": {
    "variants": {
     "edge": {
      "amount": 0.68,
      "fresnelPower": 3,
      "flowSpeed": 0.45,
      "tintHex": "#c8a8ff"
     }
    }
   },
   "S7_18": {
    "variants": {
     "edge": {
      "amount": 0.85,
      "fresnelPower": 4,
      "flowSpeed": 0.7,
      "tintHex": "#5f9fff"
     }
    }
   },
   "S7_19": {
    "variants": {
     "edge": {
      "amount": 0.8,
      "fresnelPower": 3.8,
      "flowSpeed": 0.65,
      "tintHex": "#a88fff"
     }
    }
   },
   "S7_20": {
    "variants": {
     "edge": {
      "amount": 0.82,
      "fresnelPower": 4.2,
      "flowSpeed": 0.55,
      "tintHex": "#8fb8ff"
     }
    }
   },
   "S7_21": {
    "variants": {
     "edge": {
      "amount": 0.9,
      "fresnelPower": 4.5,
      "flowSpeed": 0.6,
      "tintHex": "#ffd880"
     }
    }
   },
   "S7_22": {
    "variants": {
     "edge": {
      "amount": 0.88,
      "fresnelPower": 4.5,
      "flowSpeed": 0.7,
      "tintHex": "#d880ff"
     }
    }
   },
   "S7_23": {
    "variants": {
     "edge": {
      "amount": 0.92,
      "fresnelPower": 5,
      "flowSpeed": 0.5,
      "tintHex": "#a8e8ff"
     }
    }
   },
   "S7_24": {
    "variants": {
     "edge": {
      "amount": 1,
      "fresnelPower": 5,
      "flowSpeed": 0.8,
      "tintHex": "#bfefff"
     }
    }
   },
   "S8_01": {
            "handle": {
      "metalId": "h_warm_wood",
      "gain": 1.08,
      "desat": 0.04,
      "tintHex": "#87562f",
      "metalness": 0.02,
      "roughness": 0.64,
      "reflection": 0.98,
      "patternKind": 0
    }
   },
   "S8_02": {
            "handle": {
      "metalId": "h_grip_leather",
      "gain": 1.06,
      "desat": 0.12,
      "tintHex": "#57352b",
      "metalness": 0,
      "roughness": 0.78,
      "reflection": 0.92,
      "patternKind": 1
    }
   },
   "S8_03": {
            "handle": {
      "metalId": "h_antisilp",
      "gain": 1,
      "desat": 0.06,
      "tintHex": "#252a31",
      "metalness": 0,
      "roughness": 0.84,
      "reflection": 0.82,
      "patternKind": 2
    }
   },
   "S8_04": {
            "handle": {
      "metalId": "h_lightweight",
      "gain": 1.04,
      "desat": 0.05,
      "tintHex": "#434b56",
      "metalness": 0.12,
      "roughness": 0.54,
      "reflection": 1,
      "patternKind": 3
    }
   },
   "S8_05": {
            "handle": {
      "metalId": "h_bamboo",
      "gain": 1.04,
      "desat": 0.06,
      "tintHex": "#c5a45b",
      "metalness": 0,
      "roughness": 0.5,
      "reflection": 1.08,
      "patternKind": 4
    }
   },
   "S8_06": {
            "handle": {
      "metalId": "h_tactical_g10",
      "gain": 1.06,
      "desat": 0.08,
      "tintHex": "#43513a",
      "metalness": 0.18,
      "roughness": 0.52,
      "reflection": 1,
      "patternKind": 5
    }
   },
   "S8_07": {
            "handle": {
      "metalId": "h_brushed",
      "gain": 1.08,
      "desat": 0,
      "tintHex": "#b9c4d0",
      "metalness": 0.88,
      "roughness": 0.28,
      "reflection": 1.24,
      "patternKind": 6
    }
   },
   "S8_08": {
            "handle": {
      "metalId": "h_machined",
      "gain": 1.06,
      "desat": 0,
      "tintHex": "#8491a2",
      "metalness": 0.92,
      "roughness": 0.35,
      "reflection": 1.18,
      "patternKind": 7
    }
   },
   "S8_09": {
            "handle": {
      "metalId": "h_carbon_weave",
      "gain": 1.10,
      "desat": 0,
      "tintHex": "#293649",
      "metalness": 0.40,
      "roughness": 0.32,
      "reflection": 1.12,
      "patternKind": 8
    }
   },
   "S8_10": {
            "handle": {
      "metalId": "h_white_ceramic",
      "gain": 1.08,
      "desat": 0,
      "tintHex": "#d8cfbd",
      "metalness": 0.02,
      "roughness": 0.24,
      "reflection": 1.08,
      "patternKind": 9
    }
   },
   "S8_11": {
            "handle": {
      "metalId": "h_cloud_stone",
      "gain": 1.05,
      "desat": 0.02,
      "tintHex": "#abb7c7",
      "metalness": 0.02,
      "roughness": 0.38,
      "reflection": 1.02,
      "patternKind": 10
    }
   },
   "S8_12": {
            "handle": {
      "metalId": "h_aged_wood",
      "gain": 0.95,
      "desat": 0.16,
      "tintHex": "#52351f",
      "metalness": 0,
      "roughness": 0.7,
      "reflection": 0.92,
      "patternKind": 11
    }
   },
   "S8_13": {
            "handle": {
      "metalId": "h_wrap_leather",
      "gain": 1.1,
      "desat": 0.04,
      "tintHex": "#8b542f",
      "metalness": 0.08,
      "roughness": 0.43,
      "reflection": 1.08,
      "patternKind": 12
    }
   },
   "S8_14": {
            "handle": {
      "metalId": "h_mist_jade",
      "gain": 1.1,
      "desat": 0.02,
      "tintHex": "#76d9c3",
      "metalness": 0.02,
      "roughness": 0.2,
      "reflection": 1.2,
      "patternKind": 13
    }
   },
   "S8_15": {
            "handle": {
      "metalId": "h_modular_olive",
      "gain": 1.02,
      "desat": 0.08,
      "tintHex": "#46573a",
      "metalness": 0.14,
      "roughness": 0.52,
      "reflection": 0.96,
      "patternKind": 14
    }
   },
   "S8_16": {
            "handle": {
      "metalId": "h_mirror_steel",
      "gain": 1.12,
      "desat": 0,
      "tintHex": "#d9e6f4",
      "metalness": 0.96,
      "roughness": 0.12,
      "reflection": 1.4,
      "patternKind": 15
    }
   },
   "S8_17": {
            "handle": {
      "metalId": "h_deep_carbon",
      "gain": 1.14,
      "desat": 0,
      "tintHex": "#273650",
      "metalness": 0.58,
      "roughness": 0.19,
      "reflection": 1.3,
      "patternKind": 16
    }
   },
   "S8_18": {
            "handle": {
      "metalId": "h_jade_core",
      "gain": 1.12,
      "desat": 0.02,
      "tintHex": "#368f86",
      "metalness": 0.04,
      "roughness": 0.19,
      "reflection": 1.24,
      "patternKind": 17
    }
   },
   "S8_19": {
        "handle": {
      "metalId": "h_mirror_ceramic",
      "gain": 1.1,
      "desat": 0,
      "tintHex": "#f8f5ed",
      "metalness": 0.04,
      "roughness": 0.12,
      "reflection": 1.35,
      "patternKind": 18
    }
   },
   "S8_20": {
            "handle": {
      "metalId": "h_polar_irid",
      "gain": 1.1,
      "desat": 0,
      "tintHex": "#b7c9eb",
      "metalness": 0.74,
      "roughness": 0.18,
      "reflection": 1.35,
      "patternKind": 19
    }
   },
   "S8_21": {
            "handle": {
      "metalId": "h_spirit_jade",
      "gain": 1.12,
      "desat": 0,
      "tintHex": "#28d6a2",
      "metalness": 0.04,
      "roughness": 0.14,
      "reflection": 1.3,
      "patternKind": 20
    }
   },
   "S8_22": {
            "handle": {
      "metalId": "h_star_iron",
      "gain": 1.06,
      "desat": 0.02,
      "tintHex": "#545159",
      "metalness": 0.52,
      "roughness": 0.42,
      "reflection": 1.08,
      "patternKind": 21
    }
   },
   "S8_23": {
            "handle": {
      "metalId": "h_star_glaze",
      "gain": 1.10,
      "desat": 0.03,
      "tintHex": "#2d4b73",
      "metalness": 0.08,
      "roughness": 0.21,
      "reflection": 1.10,
      "patternKind": 22
    }
   },
   "S8_24": {
            "handle": {
      "metalId": "h_sky_shell",
      "gain": 1.12,
      "desat": 0.02,
      "tintHex": "#c7d7ee",
      "metalness": 0.48,
      "roughness": 0.19,
      "reflection": 1.3,
      "patternKind": 23
    }
   },
   "S9_01": {
    "wear": 0.02
   },
   "S9_02": {
    "wear": 0.201
   },
   "S9_03": {
    "wear": 0.278
   },
   "S9_04": {
    "wear": 0.359
   },
   "S9_05": {
    "wear": 0.419
   },
   "S9_06": {
    "wear": 0.506
   },
   "S9_07": {
    "wear": 0.63
   },
   "S9_08": {
    "wear": 0.23
   },
   "S9_09": {
    "wear": 0.319
   },
   "S9_10": {
    "wear": 0.163
   },
   "S9_11": {
    "wear": 0.539
   },
   "S9_12": {
    "variants": {
     "tune": {
      "colorPhase": 0.2
     }
    },
    "wear": 0.379
   },
   "S9_13": {
    "wear": 0.255
   },
   "S9_14": {
    "wear": 0.583
   },
   "S9_15": {
    "wear": 0.736
   },
   "S9_16": {
    "wear": 0.339
   },
   "S9_17": {
    "variants": {
     "tune": {
      "colorPhase": 0.35
     }
    },
    "wear": 0.459
   },
   "S9_18": {
    "wear": 0.299
   },
   "S9_19": {
    "wear": 0.814
   },
   "S9_20": {
    "variants": {
     "tune": {
      "colorPhase": 0.45,
      "iridescence": 0.5
     }
    },
    "wear": 0.439
   },
   "S9_21": {
    "wear": 1
   },
   "S9_22": {
    "variants": {
     "tune": {
      "colorPhase": 0.6
     }
    },
    "wear": 0.679
   },
   "S9_23": {
    "variants": {
     "tune": {
      "colorPhase": 0.55,
      "iridescence": 0.6
     }
    },
    "wear": 0.48
   },
   "S9_24": {
    "variants": {
     "tune": {
      "colorPhase": 0.5
     }
    },
    "wear": 0.399
   }
  };

  K3D.cardWrites = {
    WRITES,
    get: (id) => WRITES[id] || null,
    has: (id) => Object.prototype.hasOwnProperty.call(WRITES, id),
  };

export const cardWrites = __reg.proxy.cardWrites;
