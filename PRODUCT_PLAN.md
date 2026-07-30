# Orca Preset Assistant 产品实施计划

## 当前状态

阶段 1–5 的产品实现、自动化测试、Windows 打包、原生编译和隔离启动冒烟已经完成。
剩余工作不是继续扩功能，而是在用户真实 Orca/打印机环境中完成永久预设另存、一次真实打印建档、
3MF 三策略以及 Windows DPI/主题的人工验收。

## 产品目标

Orca Preset Assistant 是 OrcaSlicer 主窗口中的一个页面。它只提供两个用户页面：

1. User Presets：查看、创建、更新和回滚用户自定义预设。
2. Print History：自动或手动建立打印历史包，并保存可复现的实际参数。

日常使用只需要 Orca 和 Codex 两个窗口。Orca 是项目、切片状态和预设写入的唯一权威来源。

## 用户工作区

用户首次使用时只选择一个工作文件夹。程序只创建两个子文件夹：

```text
<Workspace>\
├─ UserPresets\
│  ├─ machine\
│  ├─ process\
│  └─ filament\
└─ PrintHistory\
```

官方 Orca 预设保留在 Orca 原有资源目录，不复制到工作区。

## 阶段与验收

### 阶段 1：正式产品基线

- 产品、包名、可执行文件和界面统一改为 Orca Preset Assistant。
- 配置项从“预设目录”改为“工作区”。
- 自动创建并验证两个固定子目录。
- 左侧一级导航只保留 User Presets 和 Print History。
- 中英文完整可切换。

验收：

- 新工作区只出现 `UserPresets` 和 `PrintHistory` 两个子目录。
- 三类用户预设可以扫描、筛选和查看。
- 打印历史页面能列出历史包。
- `pnpm quality` 和生产构建通过。

### 阶段 2：Orca 原生预设写入

- 定制 Orca 支持独立的 User Presets 根目录。
- 面板显示 Codex 修改提案的 before、after、理由和目标。
- 支持三个目标：
  - current-project
  - update-current-preset
  - save-as-new-preset
- 系统预设禁止覆盖。
- 所有永久保存调用 Orca 原生预设保存路径。

验收：

- 新预设由 Orca 创建 JSON 和 `.info`，并立即出现在 Orca 与面板中。
- 更新永久预设后 Orca 当前选择和有效参数同步刷新。
- 当前项目修改不改变永久预设。

### 阶段 3：事务和安全回滚

- 每次应用记录 transaction id、before、after、目标、结果和时间。
- 回滚前验证当前值没有被后续人工修改。
- 一次事务全部成功或全部失败。
- save-as-new 的回滚只切回旧预设，不自动删除新预设。

验收：

- 三种目标均可回滚。
- 冲突时拒绝强制回滚并显示原因。
- 失败不会留下部分参数。

### 阶段 4：打印历史包

- 手动建档。
- Orca 成功提交打印后可自动建档。
- 每个历史包至少包含：
  - `record.json`
  - `settings.json`
  - 可选 `project.3mf`
- 初始状态使用 submitted / pending-result。
- 结果、备注和材料用途可以后补或修订。

验收：

- 自动建档只在成功提交打印后触发。
- `settings.json` 包含当时所有实际生效设置。
- 3MF 策略“每次询问／始终／从不”均生效。
- 修改打印结果不改写参数快照。

### 阶段 5：Codex 权限和最终交付

- general-advice：默认，不读取 Orca。
- current-settings：读取机器、喷嘴、工艺、材料和参数，不读取几何。
- current-project：一次性读取当前预设、完整参数、项目对象、摆放和项目内模型几何。
- file-inspection：仅用于项目外 STL/3MF 的可选单文件授权。
- 面板刷新不会扩大权限。
- 生成最终 Windows 产品包、使用说明和验收记录。

验收：

- 未授权时桥接不返回受限数据。
- 权限可以查看、修改和撤销。
- Orca 主窗口中可以直接打开面板，无第三个日常窗口。
- 全部自动化测试和真实 Orca 烟测通过。

## 明确不做

- 不开发第二套切片器。
- 不重写打印机云、MQTT 或账号体系。
- 不进行 Bambu 与 Orca 的长期双向同步。
- 不自动扫描最近 STL/3MF。
- 不让面板手工拼接 Orca 预设 JSON 或 `.info`。
- 模型几何访问仅随 `current-project` 会话开放；降级或状态过期后不可读取。
