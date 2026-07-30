# 产品验收清单

## 2026-07-30 自动化与构建记录

- [x] TypeScript、ESLint、Prettier 和 Vitest 通过：45 个测试通过，1 个按环境跳过。
- [x] C++ `[PresetAssistant]`：8 个用例、59 个断言通过。
- [x] Windows portable 与完整 `win-unpacked` helper 打包成功。
- [x] helper 的 loopback、Bearer、Origin 和无 token ready-state 冒烟通过。
- [x] 定制 Orca Release 编译并在独立数据目录真实启动，主窗口和 helper 均响应正常。
- [ ] 真实打印提交、永久预设另存、3MF 三策略、DPI/主题和升级保留工作区仍需人工验收。

## 工作区

- [ ] 首次选择空目录后只创建 `UserPresets` 和 `PrintHistory`。
- [ ] `UserPresets` 下只创建 `machine`、`process`、`filament`。
- [ ] 非法路径、文件代替目录、符号链接越界均被拒绝。
- [ ] 重新启动后继续使用上次工作区。
- [ ] 官方 Orca 预设没有复制或修改。

## 用户预设

- [ ] Orca 和面板显示同一组用户预设。
- [ ] 刷新显示时间、变更数或失败原因。
- [ ] 仅当前项目不会写永久预设。
- [ ] 更新当前永久预设由 Orca 原生保存。
- [ ] 另存新预设由 Orca 创建 JSON 并可重新加载；同步身份文件由 Orca 自行管理。
- [ ] 只有 JSON、没有 `.info` 的本地预设不会被误报为结构异常。
- [ ] 系统预设不能覆盖。
- [ ] 写入失败不会留下部分修改。
- [ ] 最近一次事务可以安全回滚。
- [ ] 存在后续人工修改时拒绝自动回滚。

## 打印历史

- [ ] 可以手动创建历史包。
- [ ] 成功提交打印后可以自动创建且只创建一个历史包。
- [ ] 提交失败和“仅上传”不建档。
- [ ] `settings.json` 对应点击提交时的有效设置。
- [ ] 初始状态为 submitted / pending-result。
- [ ] 可以后补成功、问题、失败和备注。
- [ ] 修改结果不改写参数快照。
- [ ] 3MF 的每次询问／始终／从不策略均正确。
- [ ] 不保存 3MF 时不保存模型路径。

## Codex 权限

- [ ] 默认 general-advice 不读取 Orca。
- [ ] current-settings 不返回对象、摆放或文件路径。
- [ ] current-project 只在会话授权后返回当前设置、零件摆放和项目内模型几何。
- [ ] 当前项目内 STL/3MF 不需要第二次逐文件授权；项目外文件仍需单独授权。
- [ ] 刷新不扩大权限。
- [ ] 永久写入必须经过面板确认。

## 界面与交付

- [ ] Orca 主窗口中有 Orca Preset Assistant 页面。
- [ ] 一级页面只有 User Presets 和 Print History。
- [ ] 中文和 English 可切换并持久化。
- [ ] Windows 缩放、暗色和亮色主题正常。
- [ ] 不需要第三个日常窗口。
- [ ] 自动化测试、构建和真实 Orca 烟测有记录。
- [ ] 安装或升级不会删除工作区。
