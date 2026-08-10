# 变更日志

按日期记录 Orca Preset Assistant 工作文件夹中的产品修改、部署状态和验证结果。

## 2026-08-06

### 全部用户预设父级兼容性复核（未改产品代码）

- 同时索引 Bambu Studio 官方 BBL 资源、FullVersion 当前 Orca BBL 资源和 UserPresets 中的全部 15 份用户 preset。
- 15 份 preset 共使用 10 个父级；当前全部能在 Orca 中按名称找到，`.info base_id` 与 Orca `setting_id` 一致。
- 除已迁移的 X1C PAHT-CF 外，其余 14 份父级在 Bambu 与 Orca 中名称和 ID 原本就一致；Orca 加载时已经解析到 Orca 自己的官方内容，因此没有批量改写同值字段。
- 15 份 preset 的 `from` 均为 `User`，不存在仍绑定 Bambu 运行时的来源标记。

验证状态：全量父级身份、直接父级、完整继承链和配套 `.info` 通过；现有面板继续显示 15 份 preset。本项为兼容性审计与日志补全，没有修改 helper 源码、构建产物或部署目录。

### 内嵌预设面板：保持列表可见并显示参数修改摘要

- 移除待处理提案启动时自动打开右侧 Inspector 的行为，避免参数详情遮住用户 preset 列表。
- 在用户预设列表上方增加修改摘要：目标 preset、状态、参数修改前/修改后、原因和“查看修改与写入位置”入口。
- 摘要同时覆盖待审批、等待 Orca 回执以及已由 Orca 应用且仍可安全回滚的修改。
- 首次 snapshot 读取失败时不再永久停留在“正在读取”，改为显示真实错误和重新读取按钮。
- Orca 真实参数页的“当前预设已更新 / 查看修改 / 撤销”回执继续由原生补丁 `0012` 提供，本次未移除或替换。

验证状态：TypeScript、ESLint、Prettier 和单元测试通过（64 项通过、1 项跳过）；生产构建和 Windows 目录包生成成功；已部署到 `FullVersion/OrcaSlicer/resources/helper`，部署前版本备份为 `helper.pre-visible-summary-20260806-004845.bak`，源/目标均为 74 个文件且主程序 SHA-256 一致。临时 helper 会话实测连接 15 个预设（9 个工艺、6 个材料），启动时 preset 列表可见且 Inspector 未自动打开；列表上方正确显示 `skirt_loops: 0 → 1` 的待审批摘要，点击入口后能打开写入位置详情；无会话令牌时会显示真实错误和“重新读取”，浏览器控制台无警告或错误。
