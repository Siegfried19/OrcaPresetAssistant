# 验证状态

最后更新：2026-08-11

本页记录当前源码已经验证的事实，以及仍需要真实用户环境确认的项目。它不是稳定版发布声明。

## 已完成的自动化验证

- TypeScript 类型检查、ESLint、Prettier 和 Vitest 全部通过。
- 应用测试：81 个通过，1 个按运行环境跳过；覆盖新工作区自动生成 `AGENTS.md`、已有指引不覆盖、Windows Git 路径别名识别、提案权威回读、原生 Undo 完全/部分回滚、Redo 和第三值调整识别。
- Codex 插件的模型检查、当前项目访问与 MCP 集成测试：3 个通过。
- Codex Skill 快速校验与插件规范校验通过；独立 Release ZIP 可生成并包含 Marketplace 清单、插件和双语说明。
- Codex 插件直接使用原生 `writeCapabilities` 的 MCP 测试通过，不再依赖重复参数白名单。
- Orca 原生 `[PresetAssistant]` 测试：12 个用例、94 个断言通过；覆盖可见/隐藏参数元数据与 `orca-readback` 验证声明。
- Orca 有效补丁链 `0001`→`0011`、`0013`→`0014` 已从干净产品基线顺序通过 `git apply --check --whitespace=error-all` 并完整重放；已移除的参数页额外提示补丁 `0012` 不再属于补丁链。
- 累计原生源码已完成 Release 编译和定向测试；最终原生桥源码与实际构建版本一致。
- Windows portable 面板与完整 unpacked helper 成功构建。
- v0.6.3 完整定制 Orca、独立 portable 和 Codex 插件三个发布附件均已生成并通过 ZIP 完整性/结构检查；完整包明确排除 helper、DLL 和 asar 调试备份，校验值写入 `SHA256SUMS-0.6.3.txt`。
- 当前 Electron helper 生产构建成功，TypeScript、ESLint 和 Prettier 全部通过。
- 历史 GitHub Actions 红灯已定位为 Windows 临时 Git 仓库根路径误判；修复后的分支推送已通过远端 `Quality` 全部步骤。
- 定制 Orca Release 构建成功，面板可从 Orca 主窗口启动。
- helper 只监听 `127.0.0.1`；错误 token 返回 401，错误 Origin 返回 403。
- ready state 不保存 session token。
- “当前项目”权限包含当前预设、有效参数、零件摆放和项目内 STL/3MF 几何。
- Bambu 网络插件返回 `-26` 时，原生发送窗口会显示 LAN Only / Developer Mode 的明确处理办法。
- 面板设置页和用户文档均提供中英文 LAN Only 安全提示。
- `UserPresets` 本地版本测试覆盖独立仓库识别、初始化、预设范围提交、历史读取、删除新增预设的恢复，以及存在未保存或范围外暂存文件时拒绝恢复/提交。
- 生产构建可读取真实工作区的 15 个预设，并显示逐预设 Git 状态、最近本地版本和版本历史入口。
- 实机批准 `layer_height: 0.18 → 0.19` 后，在 Orca 切片页使用原生 Undo；助手重新读取后自动显示“已回滚”、当前值 `0.18`，且不再出现 stale revision 错误。
- 实机发送新的 `layer_height: 0.18 → 0.20` 提案后，首页单张“最新修改”卡片正确覆盖上一条已回滚提案，中文原因显示正常。

## 仍需真实环境验收

- 首次选择正式工作区并重启 Orca。
- 在 Orca 中另存新永久预设，确认 JSON 由 Orca 创建且可重新加载；同步身份文件由 Orca 自行管理。
- 放入一个名称与 settings ID 一致、但没有 `.info` 的本地 JSON 预设，确认面板不显示结构异常。
- 在打印机屏幕开启 LAN Only 与 Developer Mode，重新连接后真实提交一次打印，确认能够开始打印且只自动生成一个历史包。
- 分别验证 3MF 的“始终 / 每次询问 / 从不”策略。
- 打印后补写结果，并确认参数快照不被修改。
- 检查常用 Windows 缩放比例、明暗主题和中英文界面。
- 在新的 Orca 上游版本上重放补丁并完成回归验证。
- 在实际面板中手工完成一次“启用本地版本 → 保存版本 → 修改预设 → 恢复旧版本”的端到端验收。
- 在修复版实际面板批准一次多值参数标量写入，确认 `support_interface_speed: 20` 由 Orca 权威回执为当前真实槽位数量；`support_interface_loop_pattern` 是原生可读写但无面板控件的隐藏参数，应仅在明确需要时通过助手修改。

## 验证命令

```powershell
pnpm install --frozen-lockfile
pnpm quality
node --test `
  plugins/orca-preset-assistant/server/model-inspector.test.mjs `
  plugins/orca-preset-assistant/server/server.test.mjs `
  plugins/orca-preset-assistant/server/state.test.mjs
pnpm package:plugin
```

原生补丁的重放、构建和测试方法见 [native/orca/README.md](../native/orca/README.md)。
