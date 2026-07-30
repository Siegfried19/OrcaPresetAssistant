# Orca Preset Assistant 技术规格

## 五类组件必须分清

1. **官方原版 OrcaSlicer**
   - 上游源码、官方预设和设备/切片/打印功能。
   - 本项目不改官方预设，也不把官方预设复制到工作区。

2. **定制 Orca 原生接口**
   - 在 Orca 主窗口增加一个 Preset Assistant 页面。
   - 读取当前有效设置、当前预设身份和经授权的零件摆放摘要。
   - 由 Orca 自己执行当前项目修改、永久预设保存、新预设创建、回滚和项目 3MF 导出。
   - 成功提交打印时发送自动建档事件。

3. **Orca Python 桥接插件**
   - 本版本不使用，也不是产品运行依赖。

4. **Codex 插件 / skill / MCP**
   - 是 Codex 一侧的独立本地插件。
   - 按用户授权读取 Orca 状态、打印历史或指定 STL/3MF，并提交参数修改提案。
   - 不直接写 Orca 预设，不绕过面板审批。

5. **本地面板与后台辅助服务**
   - React 面板显示 User Presets 和 Print History。
   - 隐藏辅助进程负责工作区索引、权限状态、提案队列和历史包。
   - 辅助进程没有日常窗口，只监听随机的 `127.0.0.1` 端口。

## 实际数据流

```text
Codex MCP
  ├─ 读取 native-state.json（已按权限裁剪）
  └─ 写入 mcp-inbox（仅参数提案）
                         ↓
Orca 内嵌 React 面板 ↔ 本地 helper HTTP
          ↕                 ↕
   Orca 原生桥接       工作区 / 提案 / 历史包
          ↕
当前项目 / Orca 原生预设保存 / 打印提交
```

这里有两个用途不同的通道：

- 面板与 helper 使用带会话令牌的本机 HTTP；
- Codex MCP 使用受限状态文件和提案收件箱，因为它是独立进程。

二者不能互相冒充。只有 Orca 原生回执可以把提案标为已应用或已回滚。

## User Presets

- 工作区路径：`<Workspace>\UserPresets`
- 固定分类：`machine`、`process`、`filament`
- 官方预设仍从 Orca 原有资源位置加载。
- 定制 Orca 通过一个外部用户预设根目录解析器加载工作区。
- 面板不手工合成云同步 `.info`；只有 JSON 的本地预设同样有效。永久保存和另存新预设仍必须走 Orca 原生保存。
- 系统预设禁止覆盖，只允许另存为新的用户预设。

## Print History

每次打印对应一个目录：

```text
<Workspace>\PrintHistory\<run-id>\
├─ record.json
├─ settings.json
└─ project.3mf        # 可选
```

- `record.json`：结果、备注、来源和时间，可在打印后补写或修改。
- `settings.json`：提交打印时 Orca 的完整有效设置快照，创建后不改写。
- `project.3mf`：按“始终 / 每次询问 / 从不”策略选择是否保存。
- 自动建档使用 Orca 生成的 `archiveId` 保证同一次提交只建一个档。
- 详情视图直接展示机器、工艺、材料、快照完整度和有效参数，并可打开对应历史包。
- 用户确认删除后只把经过校验的 `<run-id>` 目录移入 Windows 回收站，不永久删除文件。

## 写入与回滚

Codex 提案包含：

- `requestedRevision`
- `presetKind`
- `presetId`
- `before`
- `after`
- `reason`
- 建议的 `destination`

用户在面板最终明确选择：

1. `current-project`：仅当前项目；
2. `update-current-preset`：更新当前永久用户预设；
3. `save-as-new-preset`：另存为新的永久用户预设。

Orca 写入前再次验证 revision、当前所选预设、参数类型、目标权限和新名称。写入后返回权威
`before`、`after`、revision 与一次性回滚 guard。回滚仅在当前值和 revision 仍匹配时允许；
另存新预设的回滚只切回原预设，不自动删除新预设。

## 权限与隐私

- `general`：默认，不读取 Orca 数据。
- `current-settings`：读取当前机器、工艺、材料和有效参数，不读取模型、对象或路径。
- `current-project`：本次 Codex 会话可读取当前设置、对象与摆放，并检查当前项目引用的 STL/3MF 几何。
- 项目外 STL/3MF：保留逐文件授权能力，但不再作为读取当前项目模型的前置步骤。

常驻 `native-state.json` 按以上范围裁剪。只有 `current-project` 会话可写入当前项目报告的受支持模型源路径；权限降级或状态过期后插件拒绝读取，刷新面板不会扩大权限。

## 本机协议

- helper 仅监听 `127.0.0.1` 的随机端口。
- 所有请求必须同时满足精确 Origin 和 Bearer 会话令牌。
- 原生回执、原生打印事件和状态发布还要求内部桥接标记。
- 请求体最大 2 MiB；只暴露固定路由，不接受任意文件路径转发。
- 会话令牌只在 Orca 内存和页面 URL fragment 中传递，不写入 ready state。

## 当前安全范围

- 机器预设可读取、显示和归档，但本版本不允许 Codex 自动写入机器级参数。
- Codex 写入使用明确的 process / filament 参数白名单；白名单外参数由 Orca 拒绝。
- 不进行跨切片器的长期双向同步。
