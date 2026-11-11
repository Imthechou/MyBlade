/**
 * 视觉内核共享注册表（迁移兼容层）。
 *
 * ── 为什么存在 ──
 * src/render/legacy/** 与 src/data/legacy/** 是从 V1 机械转换过来的模块：
 * 它们的函数体逐字未改，彼此之间仍通过 `K3D.xxx` 互相调用（着色器、材质、
 * 纹理、程序化图案这些已验证的视觉实现都在里面，不能重写）。
 * ESM 没有全局变量，所以这里提供一个**显式**的共享对象来替代原来的
 * `window.K3D`，让这批模块零改动地跑起来。
 *
 * ── 边界 ──
 * · 只有 legacy 模块可以读写这个注册表；
 * · 新代码一律走 `src/render/index.js` 门面，禁止直接 import 本文件；
 * · 未来迁移 Cocos / 小游戏时，只需替换 legacy 目录与本文件，门面不动。
 */
const BACKING = {};

/**
 * @returns {{proxy: object, install: () => object}}
 */
export const K3D_REGISTRY = {
  get proxy() {
    if (typeof globalThis === 'undefined') return BACKING;
    if (!globalThis.K3D) globalThis.K3D = BACKING;
    return globalThis.K3D;
  },
  /** 把共享对象装到全局（legacy 体的 `global.K3D` / `window.K3D` 依赖它） */
  install() {
    if (typeof globalThis !== 'undefined' && !globalThis.K3D) globalThis.K3D = BACKING;
    return this.proxy;
  },
};

// 模块求值即安装：转换后的 legacy 模块一 import 就能拿到同一个对象。
K3D_REGISTRY.install();

export default K3D_REGISTRY;
