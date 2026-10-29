# MyBlade · Cocos Creator 3.8 刀具技术验证

独立于原《锻刀大赛》仓库。目标：真正的 Cocos 3D 工程，验证刀具 PBR 材质、编辑器/MCP 调参、3D 挥砍及带刚体的木块分离、CI Web 截图。

## 当前实现（原型，不是完整物理切削）

- 程序化生成带刀尖、护手和刀柄的 **3D MeshRenderer 刀具**。
- 使用 `builtin-standard` PBR（金属度、粗糙度），以真实 3D 几何条纹模拟浅层花纹。
- `Lab Controller` 节点上的 `LabBootstrap` 组件可直接在编辑器/MCP 修改 **bladeTint、patternContrast、lightLux**。
- 鼠标/触摸在目标区域划过可以挥刀。木块以**预设切割平面**分成两块，Cocos 3D 刚体/碰撞体负责飞散掉落。**尚不支持任意角度的实时 Mesh 布尔切割**。
- Web 专用自动化接口：`globalThis.__MYBLADE.setLook({color:[120,175,220], pattern:.85, light:26000})`、`slash()`、`reset()`、`state`。测试完成后不用于游戏正式玩法。

## 打开工程

安装 Cocos Creator **3.8.x**，从 Dashboard 导入此仓库根目录，打开 `assets/scene.scene`，预览。场景脚本挂载使用 `LabBootstrap.ts.meta` 的稳定 UUID。首次导入需要等待编辑器初始化索引。

## 自动验收

`npm run` 非此工程构建入口：Cocos 工程由编辑器构建。GitHub Actions 分为：
- Ubuntu：检查场景引用、源码结构、稳定 UUID；
- Windows self-hosted + GUI：真正用 Cocos 3.8 构建 `web-mobile`，通过 Playwright 操作测试与截图，并上传 Artifacts。

需要在 Windows 图形登录会话中配置自托管 Runner，打标签 `cocos-3.8`，并设置 Runner 环境变量 `COCOS_CREATOR_EXE` 指向 CocosCreator.exe。构建成功但没有联网的 Actions Artifacts 时也不应声称发布成功。GitHub Pages 并未自动启用。

## MCP 实验

Cocos CLI 提供 MCP Server 入口，也可接 Cocos 3.8 编辑器 MCP 扩展。让 Agent 找到场景节点 `Lab Controller`，修改组件的三个公开属性，再运行 Web build 与截图对比。**工具连接/实际 MCP 编辑器调用尚未在此仓库验收**；不能仅因为存在公开属性就宣布此项完成。

## 验收进度

- [x] 3D 刀具、PBR 材质和波纹：代码/场景已实现（待编辑器实测）。
- [ ] MCP 实际修改材质和灯光后截图比对。
- [x] 3D 挥刀与木块分裂：代码已实现（待运行时验证）。
- [ ] Actions 上运行 Cocos Web 构建并通过 Playwright，截图上传。
