# MyBlade — 锻刀大赛试玩工程

面向移动端的静态 3D 锻刀游戏，完整游戏源代码位于 `game/`。

## 试玩

- 在线试玩： https://imthechou.github.io/MyBlade/ （以最新成功部署为准）
- 本地试玩：运行 `python3 scripts/prepare_game.py` 恢复压缩包（如已存在 `game/` 会自动跳过）；再运行 `python3 -m http.server 4173 --directory game`，浏览器打开 `http://localhost:4173/`。
- 不要直接双击 HTML 文件：Three.js / ES module 模型加载需要 HTTP 服务。

## 目录

- `game/`：最新优化版 ZIP 还原出的可编辑游戏源代码；不再提交重复 ZIP。
- `qa/archive-playtest.cjs`：真实 Chromium 移动端/桌面端逐页点击和截图。
- `qa/forge-visual.spec.cjs`：五阶段锻造回归测试（其中后段使用测试夹具准备状态，不等于人工完整操作）。
- `qa/load-handoff.spec.cjs`：WebGL 渲染场景、首页到锻造的切换回归。
- `.github/workflows/`：Pages 发布和自动试玩。

## 测试范围

Chromium 模拟手机触控不代表真机性能、音量、振动，仍需实机检查。Cocos/Godot 实验留在各自独立分支，不合入此工程。
