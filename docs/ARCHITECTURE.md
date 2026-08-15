# Architecture

## 产品边界

Orca Preset Assistant 是 OrcaSlicer 主窗口中的用户预设与打印历史页面。日常只显示 Orca
和 Codex 两个窗口；面板不接管模型编辑、切片、设备、打印账号或云服务。

用户只选择一个工作区：

```text
<Workspace>\
├─ UserPresets\
│  ├─ machine\
│  ├─ process\
│  └─ filament\
└─ PrintHistory\
```

官方预设仍由 Orca 管理。工作区只保存用户自定义预设和打印档案。

## 运行组件

```text
┌────────────────────────── Orca 主进程 ──────────────────────────┐
│  定制原生控制器                                                │
│  - 当前预设 / 有效参数 / 项目摆放                              │
│  - 当前项目写入 / 用户预设热刷新 / 回滚 / 3MF 导出             │
│  - 打印成功事件                                                │
│              ↕ 带会话 token 的 wxWebView 原生桥               │
│  React 面板（User Presets / Print History）                    │
└───────────────────────┬─────────────────────────────────────────┘
                        ↕ 仅本机、固定路由 HTTP
              隐藏 Electron helper（无窗口）
                        ↕
          工作区 / 后台文件修改记录 / 提案 / 权限状态 / 打印历史包

Codex 插件 MCP
  ↕ 受限 native-state + 文件修改/当前项目提案 inbox
隐藏 helper
```

正式运行不依赖 Orca Python 插件。独立 Electron 窗口只用于开发和测试。

## 权威规则

- Orca 是当前项目和实际有效设置的权威来源；工作区文件是永久用户预设的持久来源。
- helper 负责验证并持久化业务记录，但不能自行宣布磁盘修改已被 Orca 加载。
- Codex 可在先写日志后直接修改 process / filament 用户预设文件；不直接覆盖官方或 machine 预设。
- 面板只能在收到 Orca 原生回执后把文件卡片标为 loaded，或把当前项目提案标为 applied / rolled-back。

## 两条写入路径

1. **永久用户预设**：Orca 可开可关。Codex 先记录精确文件差异，再直接更新或基于现有用户预设创建 process / filament 文件。面板展示记录但不要求再次接受；刷新时 Orca 定向热加载并回读确认。
2. **当前项目**：只修改当前打开的项目，不保存永久预设。此路径读取当前设置和原生 `writeCapabilities`，并保留面板提案审批。

永久文件修改验证：

- 日志中的目标路径、文件哈希和精确 before / after 与实际写入一致；
- JSON、文件名、设置 ID、父预设和匹配 `.info` 结构一致；
- 官方预设不会被覆盖；
- 热刷新只处理日志中已经写入的目标，不扫描或覆盖其他预设；
- 当前选中且有未保存 Orca 编辑的预设拒绝热刷新；
- 原生回读值和删除项与日志一致后，后台记录才进入“Orca 已加载”；该记录不在切片面板显示。

当前项目写入仍验证 revision、当前选择、受控参数能力和类型。Orca 返回一次性回滚 guard；任何后续 revision 或值冲突都会使回滚失效。

## 打印历史

```text
PrintHistory\<run-id>\
├─ record.json
├─ settings.json
└─ project.3mf       # 可选
```

- `record.json` 可补写结果与备注。
- `settings.json` 保存提交打印时 Orca 的完整有效设置，创建后不可改写。
- `project.3mf` 由 Orca 导出到 helper 预先准备且校验过的历史目录。
- `archiveId` 用于幂等，避免事件和轮询同时触发时重复建档。

## 数据权限

| 范围               | Codex 可读取                        | 明确不包含                 |
| ------------------ | ----------------------------------- | -------------------------- |
| `general`          | 无 Orca 数据                        | 设置、项目、路径、模型     |
| `current-settings` | 当前预设身份与有效参数              | 对象、摆放、文件路径、网格 |
| `current-project`  | 上述内容、对象/摆放及项目内模型几何 | 与当前项目无关的文件       |
| 单文件授权         | 指定的项目外 STL/3MF                | 其他模型文件               |

`current-project` 是会话权限，并自动覆盖当前打开项目中的模型；单文件授权只用于项目外文件。刷新不改变权限。

## 安全通道

- helper 只监听随机 `127.0.0.1` 端口；
- 请求必须通过精确 Origin 和 Bearer 会话令牌；
- 原生专用路由还要求内部桥接标记；
- native state 有 10 秒新鲜度限制；
- token 不写入 ready state；
- helper 路径是 Orca resources 下的固定打包位置，配置不能指定任意可执行文件；
- 父 Orca 退出时 helper 一并退出并清理 ready state。

## 源码分层

- `src/shared/`：前后端协议和可序列化数据契约；
- `src/main/domain/`：产品规则和数据结构；
- `src/main/application/`：用例编排；
- `src/main/infrastructure/`：工作区、历史、提案、配置和权限状态；
- `src/renderer/`：两页式面板及双宿主适配；
- `native/orca/`：可审查、可回退的 Orca 原生补丁；
- `plugins/orca-preset-assistant/`：独立 Codex 插件源码。

## 交付门槛

```text
TypeScript strict typecheck
ESLint
Prettier
Vitest
Electron production build
helper HTTP / headless smoke test
Orca patches sequential apply check
Orca Release build and native tests
real Orca panel smoke test
Windows package and current screenshots
```
