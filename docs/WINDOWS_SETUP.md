# Windows 11：MyBlade AI + Cocos 自动构建配置

> **建议先运行本地验证，不要立刻把日常使用的个人电脑变成常驻 GitHub Runner。** 此仓库是 public，外部 PR 不能获得在你电脑上运行代码的权限。工作流已经限制自托管步骤仅来自仓库 `main` / `feat/cocos-blade-lab` 的 push；PR 仅使用 GitHub 托管的 Ubuntu 结构检查。即便如此，自托管 Runner 仍存在风险，最好使用隔离测试设备或虚拟机。

## A. 最少操作：本机 3D 测试（不需要 Runner）

1. 从 [Cocos 官方下载页](https://www.cocos.com/creator-download) 安装 Cocos Dashboard，再安装 **Cocos Creator 3.8.8**（或其他 3.8.x）；不要安装一个没有对应 API 的旧大版本。
2. 安装 Node.js 22+：[官方 Node.js](https://nodejs.org/)。
3. 克隆/下载 [MyBlade 分支](https://github.com/Imthechou/MyBlade/tree/feat/cocos-blade-lab)。例如：

   ```powershell
   git clone -b feat/cocos-blade-lab https://github.com/Imthechou/MyBlade.git
   cd MyBlade
   ```

4. 使用 Dashboard 导入 MyBlade 文件夹，打开 `assets/scene.scene`，等待资源索引完成。**首次需要这一步以发现编辑器或资源导入报错**。
5. 在工程根目录打开 PowerShell，执行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\run-local-validation.ps1
   ```

6. 按提示粘贴 `CocosCreator.exe` 的完整路径；脚本真正构建 `web-mobile`，启动 Chromium，自动切开木块，生成 `artifacts\01-normal.png`、`02-look.png`、`03-split.png` 和 `result.json`。

**此脚本不会安装 Cocos，也不会打开防火墙端口。** 遇到错误先看编辑器窗口及构建日志。

## B. 接 GitHub Actions（只在安全可控的机器上操作）

1. 打开 GitHub 官方页面 [MyBlade → Settings → Actions → Runners](https://github.com/Imthechou/MyBlade/settings/actions/runners)，点 `New self-hosted runner`，选择 Windows / x64。
2. **在一个单独的目录**（如 `C:\actions-runner`）严格执行页面最新的下载安装/校验命令，而不是复制仓库中的旧下载地址。
3. 页面生成的一次性注册令牌会过期；在 `config.cmd` 的命令最后添加 `--labels cocos-3.8`。按提示注册，不要安装 Windows 服务，建议先保持前台手动运行。
4. 打开仓库根目录 PowerShell：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\tools\start-windows-runner.ps1 -RunnerDirectory 'C:\actions-runner'
   ```

   在提示中填入 CocosCreator.exe 路径。脚本临时设置 `COCOS_CREATOR_EXE` 环境变量并启动 `run.cmd`。
5. 保持 PowerShell 窗口打开，在 GitHub 上对受信任分支 `feat/cocos-blade-lab` 提交一次新的 commit。**这个仓库只有 push 会触发本机 Web 真实构建**。完成后看 Actions 页面和 screenshot Artifacts。
6. 测完按 `Ctrl+C` 结束 Runner；不推荐个人电脑全天运行。

**切勿将注册 token、GitHub PAT、账号密码放进 GitHub 文件、Issue、PR、截图或发给 AI。**

## GitHub Workflow 的安全边界

- `pull_request`：仅托管 Ubuntu 做代码结构检查；可能接触来自 fork 的不可信代码，但不接触本地 Windows。
- `push`：仅仓库受控分支触发自托管构建，不接收 fork PR。
- Runner 在用户登录后的图形会话中运行（官方 Cocos Creator CLI 仍需 GUI）。
- 本仓库 `public`；如果需要反复测试、安装更多第三方 MCP，优先使用独立 VM 或专用机器，避免给日常电脑持久访问权限。

## 阶段验收标准

1. 本地 `run-local-validation.ps1` 产生 3 张实际渲染图片和通过的结果报告；
2. Github Actions 的 Windows job 真正完成 Cocos Web Build + Playwright；
3. 根据 Artifacts 修复可能存在的 Cocos API/运行时问题；
4. 再单独接入经过代码审查的 MCP 插件，实际编辑 `Lab Controller` 属性并复测；MCP 尚未接通，不能当作已完成。
