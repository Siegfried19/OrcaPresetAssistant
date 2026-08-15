# Orca Preset Assistant 技术规格

## 五类组件必须分清

1. **官方原版 OrcaSlicer**
   - 上游源码、官方预设和设备/切片/打印功能。
   - 本项目不改官方预设，也不把官方预设复制到工作区。

2. **定制 Orca 原生接口**
   - 在 Orca 主窗口增加一个 Preset Assistant 页面。
   - 读取当前有效设置、当前预设身份和经授权的零件摆放摘要。
   - 由 Orca 执行当前项目修改、工作区用户预设定向热刷新、回滚和项目 3MF 导出。
   - 成功提交打印时发送自动建档事件。

3. **Orca Python 桥接插件**
   - 本版本不使用，也不是产品运行依赖。

4. **Codex 插件 / skill / MCP**
   - 是 Codex 一侧的独立本地插件。
   - 按用户明确要求读取 Orca 状态、打印历史或指定 STL/3MF。
   - 永久用户预设先记录修改意图，再由 Codex 直接编辑工作区文件；当前项目临时修改仍提交受控提案。

5. **本地面板与后台辅助服务**
   - React 面板显示 User Presets 和 Print History。
   - 隐藏辅助进程负责工作区索引、权限状态、提案队列和历史包。
   - 辅助进程没有日常窗口，只监听随机的 `127.0.0.1` 端口。

## 实际数据流

```text
Codex MCP
  ├─ 读取 native-state.json（已按权限裁剪）
  ├─ 写入 preset-file-change-inbox（永久用户预设修改日志）
  └─ 写入 mcp-inbox（仅当前项目参数提案）
                         ↓
Orca 内嵌 React 面板 ↔ 本地 helper HTTP
          ↕                 ↕
   Orca 原生桥接       工作区 / 修改日志 / 提案 / 历史包
          ↕
当前项目 / 用户预设热刷新 / 打印提交
```

这里有两个用途不同的通道：

- 面板与 helper 使用带会话令牌的本机 HTTP；
- Codex MCP 使用受限状态文件、预设文件修改日志收件箱和当前项目提案收件箱，因为它是独立进程。

二者不能互相冒充。永久文件修改必须先落盘并通过结构校验；只有 Orca 原生热刷新回执可以把后台记录标为“Orca 已加载”。

## User Presets

- 工作区路径：`<Workspace>\UserPresets`
- 固定分类：`machine`、`process`、`filament`
- 官方预设仍从 Orca 原有资源位置加载。
- 定制 Orca 通过一个外部用户预设根目录解析器加载工作区。
- 永久修改不要求 Orca 正在运行，也不要求读取当前 Orca 设置。Codex 先记录目标、差异和文件哈希，再直接更新 process / filament 用户预设的 JSON 与匹配 `.info`。
- 新预设通常从现有用户预设复制；文件名、JSON 名称、设置 ID、父预设和 `.info` 必须一致，复制来的云同步身份必须清空。
- 面板刷新会重新索引新增和修改文件；嵌入 Orca 时还会定向热加载已记录的预设，并用内存中的实际值回读确认。
- 系统预设和 machine 预设禁止直接覆盖；需要从官方配置派生时创建新的用户预设。

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

永久用户预设只有一条写入路径：

1. Codex 读取目标（新建时读取来源）JSON、`.info` 和继承链；
2. 写入修改日志，记录精确 before / after、删除项、理由和写入前哈希；
3. Codex 直接修改工作区文件并完成结构校验；
4. 后台记录“已记录 / 已写入 / Orca 已加载 / 冲突”，不在切片面板额外显示修改卡片，也不提供接受或拒绝按钮；
5. 点击刷新后，Orca 打开时定向热加载并回读，Orca 关闭时保留“已写入”，下次启动后再确认加载。

若目标正是 Orca 当前选中且存在未保存编辑，热刷新拒绝覆盖，但磁盘修改不会丢失。用户先处理 Orca 内未保存编辑，再刷新即可。

当前项目临时修改继续使用受控提案：

Codex 提案包含：

- `requestedRevision`
- `presetKind`
- `presetId`
- `before`
- `after`
- `reason`
- 建议的 `destination`

该提案的唯一目标是 `current-project`。Orca 写入前再次验证 revision、当前所选预设、参数类型和目标权限。写入后返回权威
`before`、`after`、revision 与一次性回滚 guard。回滚仅在当前值和 revision 仍匹配时允许；
永久用户预设文件修改不复用这套接受/拒绝流程。

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
