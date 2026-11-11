/**
 * 平台服务层 —— 统一出口
 *
 * 上层只 import 本文件，不直接依赖具体平台实现，
 * 这样换宿主（Cocos / 微信 / 抖音 / iOS）时改动被限制在 platform/ 内部。
 */

import env from './env.js';
import rng from './rng.js';
import bus from './bus.js';
import storage from './storage.js';
import audio from './audio.js';
import haptics from './haptics.js';
import motion from './motion.js';
import net from './net.js';

export { env, rng, bus, storage, audio, haptics, motion, net };
export * as RNG from './rng.js';
export { EVENTS } from './bus.js';

export default { env, rng, bus, storage, audio, haptics, motion, net };
