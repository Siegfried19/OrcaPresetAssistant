# Architecture

## 设计目标

1. 用户双击一个便携 EXE 即可使用。
2. 预设读取、Git 差异、打印证据和界面彼此解耦。
3. 默认只读，任何写入都必须来自明确的用户动作。
4. 后续功能以新增用例或适配器扩展，不让 React 组件直接访问磁盘。
5. Git 中的数据保持透明、可审计、可被其他工具读取。

## 运行时边界

```text
React renderer
    │ typed, narrow IPC contract
Electron preload
    │ validated commands
Application service
    ├── preset repository (read-only)
    ├── Git service (read-only)
    ├── event store (append-only)
    ├── local configuration
    └── Bambu launcher
```

Renderer 启用了 sandbox、context isolation，并关闭 Node integration。界面不能提交任意文件路径或任意 IPC channel；主进程只接受预设 ID 和有限枚举值，再对当前扫描结果做二次校验。

## 分层规则

- `shared/` 只放可序列化的契约，不依赖 Electron、Node 或 React。
- `domain/` 只表达工程规则，不调用文件系统或 UI。
- `application/` 编排用例，维护当前预设根目录和快照。
- `infrastructure/` 隔离外部状态：JSON、`.info`、Git、进程与用户配置。
- `renderer/` 只消费 `DashboardApi`，不假设预设位于固定目录。
- 组件使用设计 token，不在 JSX 中散落颜色、阴影和尺寸常量。

## 写入策略

当前唯一的业务写入是 `engineering/events.jsonl`：

- 只追加，不原地修改历史；
- 一次写入一个完整 JSON 对象；
- 路径使用预设仓库内的相对路径；
- 同时存 SHA-256 与自定义 JSON 快照；
- 展示时重新计算 SHA-256，区分“当前版本证据”和“旧参数版本证据”。

应用自己的根目录配置写入 Electron `userData/config.json`，不污染 Bambu 目录。

## 推荐扩展顺序

### 参数对比

新增 `ComparePresetUseCase` 和只读的官方继承解析适配器。界面只接收归一化后的参数差异，不自行解析 Bambu JSON。

### 图片与缺陷标注

新增 `AttachmentStore`，事件中保存内容哈希和相对引用。避免在 JSONL 中嵌入二进制内容。

### 第三方教程与本地知识

新增独立 `KnowledgeRepository`，将来源、抓取时间、摘要、适用材料/设备和证据等级建模。不要把知识条目混进预设 JSON。

### 参数编辑

只有在实现继承链解析、完整校验、备份和用户确认后再开放。编辑必须是单独命令，不能复用打印记录接口，也不能由 renderer 直接提交任意 JSON。

## 代码质量门槛

合并前必须通过：

```text
TypeScript strict typecheck
ESLint
Prettier check
Vitest
electron-vite production build
真实预设只读扫描
便携 EXE 启动与界面截图
```
