# MyBlade — Godot 3D 技术样板

使用 Godot 4.5.2（GDScript + Compatibility 渲染器）的**独立可运行 3D 原型**，开发分支 `feat/godot-3d-lab`。不会修改旧《锻刀大赛》，也不会覆盖另一个 Cocos 分支。

## 已实现的技术内容

- 程序化建模：独立 3D 刀身网格、刀柄、护手、刀尖，不依赖外部模型；
- PBR 金属：`shaders/steel.gdshader` 具备金属度、粗糙度、参数化折叠花纹；
- 可直接用 AI 改 `scripts/arena.gd` 中的刀身颜色、花纹强度、灯光；
- 鼠标和触摸滑动切割 3D 木块，木块从**预制切口**分为两个带刚体的碎块并掉落；
- 3.2 秒后自动重生木块，连续挥刀；
- 底部按钮可以实时调整金属颜色、花纹和灯光；键盘 C/P/L 亦可；
- GitHub Actions 云端无界面构建 Web、Playwright 检查与截图 Artifact，不需要个人 Windows Runner。

**真实性边界**：刀具是真正的 3D 网格、碎块使用 GodotPhysics3D，但目前切割命中根据滑动区域和动画时间判定，并非逐帧刀刃-木块物理碰撞，也不是任意平面实时布尔切割。目的是验证视觉、输入、物理和自动化工作流，不能误报成完整的真实切割模拟。

## 操作

打开游戏，在舞台中间从左到右划动手指；击中后看木块分离、翻滚、落地。点击 **STEEL COLOR / PATTERN / LIGHTING** 按钮调整外观。

## 已完成的实机浏览器验收（2026-10-30）

首次 CI 构建、WebGL 启动、金属变色/灯光修改、木块分裂和自动重生全部通过；Playwright 控制台没有报错。
[测试运行与截图（Actions）](https://github.com/Imthechou/MyBlade/actions/runs/40987290845)。
[截图 Artifact](https://github.com/Imthechou/MyBlade/actions/runs/40987290845/artifacts/12947443175)。

发布网页只差仓库首次启用 Pages：打开 [Settings → Pages](https://github.com/Imthechou/MyBlade/settings/pages)，将 Source 设为 **GitHub Actions**，然后重跑 Godot workflow。未启用时部署作业现在会跳过，不影响已通过的实际构建。

## 验收

- `git clone -b feat/godot-3d-lab https://github.com/Imthechou/MyBlade.git`
- 如本地有 Godot 4.5.2：直接打开 `project.godot`。
- 无本地引擎也可以：查看 GitHub Actions 的 **Godot Web build + Playwright** 运行和截图证据。
- CI 导出的 `godot-web-build` Artifact 是可部署 Web 包；`godot-web-screenshots` 包含截图、浏览器报错与状态。
- GitHub Pages 需仓库启用 Pages（GitHub Actions 源）后才能产生在线链接，不能仅因生成 CI 配置就声称已发布。

## 技术选型与局限

Web 版使用 Godot **Compatibility / WebGL 2.0**，不使用 Forward+ 材质和 C#。微信小游戏不是官方直接导出目标，后续需单独评估第三方适配方案。

原 Cocos PR 保持独立，不合并。
