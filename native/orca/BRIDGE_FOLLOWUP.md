# Orca 原生桥接：已实现事实与剩余边界

本文描述 `0003`、`0004` 和 `0005` 补丁当前真实能力。它不是未来愿望清单。

## 角色边界

- Orca 原生桥接：项目状态、预设选择与写入、项目副本导出、成功提交打印事件的唯一权威。
- 无窗口 helper：正式 React 页面、本地工作区、提案队列、打印历史持久化。
- Codex：在用户许可范围内读取状态或模型，并提出修改建议。
- 诊断 bootstrap：helper 缺失或启动失败时的 fallback，不是正式面板。
- Electron preload、PluginHost、Python 插件和 MCP 不承载 Orca 面板权威写入。

## 宿主闭环

`0004` 只从固定随包路径启动完整 unpacked helper：

```text
<Orca resources>\helper\Orca Preset Assistant.exe
```

helper 使用随机端口、随机 session token 和 parent pid，无 `BrowserWindow`。ready 文件不含 token；Orca 核对 PID、固定 `127.0.0.1` origin 和端口后，自己构造带 session fragment 的页面 URL。

正式 React 页面由 helper 提供，但完整 `window.OrcaPresetAssistant` 由 Orca 通过 `AddUserScript` 注入，因此不依赖 helper 页面自行加载 `bridge.js`。

## 请求 envelope

```json
{
  "requestId": "uuid",
  "version": 1,
  "token": "per-panel-random-token",
  "method": "state.get",
  "expectedRevision": 12,
  "params": {}
}
```

只有 mutation 需要 `expectedRevision`。成功和失败都返回当前原生 revision：

```json
{
  "requestId": "uuid",
  "ok": true,
  "revision": 13,
  "data": {}
}
```

handler 依次校验消息大小、JSON 结构、未知字段、受信同源页面、协议版本、token、方法、参数和 revision。所有运行时操作都在 wx UI 线程执行。

## 读取方法

### `state.get`

常驻安全状态：工作区是否配置/生效、项目和预设 dirty 状态、三类当前预设 identity、是否有 pending 打印建档。绝不返回 mesh 或零件摆放。

### `settings.get`

要求 `authorization: "settings:read"`。返回过滤敏感连接字段后的 Orca 有效参数和当前预设 identity。

### `project.get`

- `authorization: "project:summary"`：只返回项目是否有对象和 dirty 状态。
- `authorization: "project:placement"`：额外返回对象名、实例、盘号/盘名、位移 mm、旋转 rad、缩放、镜像和可打印状态。
- `authorization: "project:geometry"`：在摆放信息基础上，返回当前项目实际引用且存在的 STL/3MF 路径，由 Codex 插件生成几何统计和三视图；该权限只在 `current-project` 会话内使用。

两种模式都不返回 STL/3MF mesh、源文件路径、账号或设备秘密。

## 工作区

### `workspace.get`

返回配置路径、当前生效路径、实际 UserPresets root 和是否需要重启。

### `workspace.set`

只接受一个绝对且非文件系统根目录的 `workspace`，写入：

```ini
[orca_preset_assistant]
workspace = C:\OrcaPresetWorkspace
```

调用 `AppConfig::save()` 后明确返回 `restartRequired: true`。不迁移、不复制、不删除旧目录。

### `workspace.choose`

打开原生目录选择器，然后复用 `workspace.set`。

### `presets.refresh`

当前明确返回 `RESTART_REQUIRED`。重复 `load_user_presets()` 会跳过同名预设，不能包装成刷新成功。

## 提案写入

### `proposal.apply`

请求必须包含：

```json
{
  "approvedAt": "2026-07-29T21:45:00Z",
  "expectedPresetName": "0.20mm Standard",
  "destination": "current-project",
  "presetType": "process",
  "changes": {
    "layer_height": "0.20"
  },
  "reason": "用户可见说明"
}
```

规则：

- `approvedAt` 必须非空，表示面板已经明确批准。
- `expectedPresetName` 必须与 Orca 此刻选中的预设完全一致；否则返回 `PRESET_SELECTION_CHANGED`。
- destination 只有：
  - `current-project`
  - `update-current-preset`
  - `save-as-new-preset`
- 永久写入要求外部工作区已经生效。
- 覆盖目标必须是可覆盖的用户预设；系统/default/project/external 预设受保护。
- 另存名称必须安全且不能重名。
- 先验证整个 changes，再一次应用；保存后验证 JSON、`.info`、路径和实际值。

成功 data：

```json
{
  "authority": "orca",
  "status": "applied",
  "applied": true,
  "destination": "current-project",
  "presetType": "process",
  "targetPreset": "0.20mm Standard",
  "before": {
    "layer_height": "0.16"
  },
  "after": {
    "layer_height": "0.20"
  },
  "rollbackGuard": {
    "id": "uuid",
    "validAtRevision": 13
  }
}
```

值已经相同时返回 `status: "unchanged"`，不会假装执行了一次写入。

`0005` 把白名单扩展为 process 18 项、filament 16 项；每项都校验实际 Orca `ConfigOptionType`、单标量语法和产品范围。完整清单见 [WRITE_WHITELIST.md](WRITE_WHITELIST.md)。

machine 有意保持只读：传入 `presetType=machine` 返回 `PRESET_TYPE_READ_ONLY`。`state.get` 与 `settings.get` 都返回 `writeCapabilities`，面板必须据此显示 process/filament 为 controlled-write、machine 为 read-only，不能把 machine 渲染成可保存。

### `proposal.rollback`

要求最新有效 guard，并验证当前值没有在写入后再次变化。

- 当前项目：恢复 before 值。
- 更新当前用户永久预设：恢复 before 并再次原生保存。
- 另存新永久预设：只切回原预设；新建的永久预设继续保留，不自动删除。

### Orca 参数页更新回执

`0012` 在 `proposal.apply` 成功返回前，把同一份 Orca 权威 `before/after` 发布到真实 `ParamsPanel`。回执显示目标预设、destination 和修改数量，并可展开 Orca 参数名称、单位、修改前和修改后值。

回执中的“撤销”不建立第二套写入逻辑，而是调用同一个 `proposal.rollback` 事务。revision 或当前值发生变化时，guard 失效并拒绝覆盖用户后续手工修改；成功撤销时，回执保留并标记“本次更新已撤销”。永久预设在 `save_preset()` 后通常没有普通 dirty 回滚箭头，因此该回执是永久写入的明确可见确认。

## 打印建档

PrintJob 只有在设备提交成功后才通过 `wxGetApp().CallAfter` 把事件切回 UI 线程。原生 payload 包含：

- pending archive id 和提交时间
- 当前三类预设 identity
- 过滤敏感字段后的有效参数
- `modelGeometryIncluded: false`
- `persistenceOwner: "workspace-helper"`

原生不直接写打印历史；helper 收到事件后按设置决定：

- `never`：只保存 settings 快照。
- `ask`：询问用户；需要 3MF 时先让 helper 在 `PrintHistory` 内准备唯一临时路径，再调用 `project.export-copy`。
- `always`：同样先成功取得项目副本，再完成建档；不能在没有 `project.3mf` 时显示 always 成功。

### `project.export-copy`

要求 `authorization: "project:export-copy"` 和绝对 `destinationPath`。目标必须：

- 扩展名为 `.3mf`
- 位于 helper 已准备的 `<workspace>\PrintHistory` 子目录
- 父目录已经存在
- 目标文件尚不存在

原生调用 `Plater::export_3mf(..., SaveStrategy::Silence)` 并验证结果。`Silence` 保证不改变当前项目路径。

## 最小验收

1. 0001→0002→0003→0004→0005→0006→0007→0008→0009→0010→0011→0012 在临时 Orca 基线上顺序通过 `git apply --check --whitespace=error-all`。
2. 错误来源、token、协议、revision、批准状态或预设 identity 全部失败关闭。
3. 正式 React 页面来自无窗口 helper，桌面仍只有 Orca 和 Codex 两个窗口。
4. session token 不写入 ready 文件；语言 query 插在 `#session` fragment 之前。
5. 三种 destination 对白名单内 process/filament 参数均返回 `presetType` 和 Orca 权威 before/after。
6. 新永久预设回滚后仍在磁盘，只切回原预设。
7. `presets.refresh` 在安全热重载完成前明确要求重启。
8. placement 摘要不含 mesh 和源文件路径。
9. 自动建档只在打印提交成功后触发；3MF 策略没有假成功。
10. helper 缺失时只显示诊断 fallback，不宣称最终面板就绪。
11. machine 写入失败关闭；未列入白名单、ConfigOption 类型不符、多值、越界值和 `fan_min_speed > fan_max_speed` 全部拒绝。
