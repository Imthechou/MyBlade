# 验收规范

## 结构检查
运行 `node tools/validate-project.mjs`；这**不是**运行时验证，只保证 Cocos 场景 JSON 引用、脚本 UUID / metadata 及工程基础文件对应。

## 真正验收
Windows 上安装 Cocos Creator 3.8，配置带 GUI 登录会话的 self-hosted GitHub Runner 标签 `self-hosted`, `windows`, `cocos-3.8`，指定 `COCOS_CREATOR_EXE` 绝对路径。官方命令行的成功退出码可能是 36；CI 兼容 0/36。

GitHub Actions 将：
1. 用官方编辑器 CLI 构建 Web Mobile；
2. 启动 Chromium 真正加载 WebGL；
3. 确认初始化、修改 look 参数、触发挥刀；
4. 断言木块切分计数并截图；
5. 归档 01-normal、02-look、03-split、result.json。

## 四项测试对应

| 项目 | 当前情况 |
| --- | --- |
| 1. PBR 3D 刀 | 代码已实现，未实测 |
| 2. MCP 改材质/花纹/灯光 | 预留编辑器 Inspector 属性，但**尚未通过 MCP 实际调用** |
| 3. 3D 挥砍+木块破坏 | 代码已实现预制切面+刚体掉落，非任意切割；未实测 |
| 4. Actions 构建+截图 | 工作流与 Playwright 脚本已写；需要配置真实 Windows Runner |

## 未来验收补充
- 在 MCP 工具中执行对 LabBootstrap 的 Inspector 属性修改并保存 .scene / Prefab，PR 必须有前后截图；
- 物理轨迹需要验证木块分离发生在刀刃接触目标时，当前是挥砍动作时序驱动；
- 手机真机上测 30 FPS 下限、材质退化、内存峰值；
- 只有所有任务通过后才标记正式完成。
