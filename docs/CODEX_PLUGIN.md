# Orca Preset Assistant Codex 插件

[中文](#中文) · [English](#english)

## 中文

这个插件让 Codex 通过 Orca Preset Assistant 的受控接口读取预设、当前设置、当前项目和打印记录。它不会把 Codex 放进面板，也不会绕过面板里的数据授权。

### 从 GitHub Release 安装

1. 下载 `OrcaPresetAssistant-Codex-Plugin-<version>.zip`。
2. 解压到一个长期保留的目录，例如 `D:\Tools\OrcaPresetAssistant-Codex-Plugin`。安装后不要移动或删除这个目录。
3. 在 PowerShell 中执行：

   ```powershell
   codex plugin marketplace add "D:\Tools\OrcaPresetAssistant-Codex-Plugin"
   codex plugin add orca-preset-assistant@orca-preset-assistant-release
   codex plugin list
   ```

4. 新建一个 Codex 任务，让新插件完成加载。
5. 在 Orca 的 Preset Assistant 面板中打开设置，按本次任务需要选择数据范围。

若你从源码构建插件，先在仓库根目录运行 `pnpm package:plugin`，再解压 `release` 中生成的插件包并使用相同命令安装。

### 推荐使用方式

- 只需要通用建议：保持“通用建议”，Codex 不读取 Orca 数据。
- 需要参数诊断：授权“当前设置”，可读当前机器、工艺、材料和实际有效参数，但不读模型。
- 需要分析零件：授权“当前项目”，可读本次会话的零件摆放和支持的 STL/3MF 几何。
- 需要更新或新建永久用户预设：告诉 Codex 目标预设、修改和理由。Codex 先记录差异，再直接修改工作区文件；Orca 可开可关，也不会要求第二次接受。
- 只有需要读取实时有效值或只修改当前项目时，才明确要求 Codex 读取当前设置。当前项目修改继续在面板中确认。

示例：

```text
只给我 PAHT-CF 翘曲的通用建议，不读取当前项目。
读取当前设置，检查喷嘴温度、热床、风扇和速度是否冲突。
读取当前项目，结合零件摆放和模型形状分析这个角为什么翘。
先列出所有参数变化和代价，不要直接应用。
```

### 用户预设的本地版本

面板可在 `<Workspace>\UserPresets` 建立一个独立的本地 Git 仓库。它只保存 `machine`、`process`、`filament` 三个目录：

- “保存版本”创建一个本地快照；
- “版本历史”查看并恢复旧快照；
- 恢复会新建一个恢复提交，不重写旧历史；
- 面板不提供 GitHub、push、pull、分支或远程仓库功能。

如果希望 Codex 直接协助维护 Git，请把 `<Workspace>\UserPresets` 作为 Codex 任务文件夹打开，并明确说要检查、保存或同步哪些内容。面板不会展示 `AGENTS.md`、`CHANGELOG.md` 等 AI 工作说明。

首次选择普通父文件夹时，软件会自动建立标准目录并在不存在时创建 `UserPresets\AGENTS.md`。永久 process / filament 用户预设必须先在后台记录再写文件；刷新后只有 Orca 原生热加载回执与回读都匹配，后台记录才进入“Orca 已加载”，切片面板不会增加文件修改卡片。当前项目临时修改仍先读取 Orca 返回的 `writeCapabilities`，不维护第二份白名单；隐藏参数会明确说明没有可见面板控件。

### 更新或卸载

更新插件包时，解压到稳定目录，重新执行 Marketplace 和插件安装命令，然后新建 Codex 任务。卸载命令：

```powershell
codex plugin uninstall orca-preset-assistant@orca-preset-assistant-release
```

卸载插件不会删除工作区、用户预设或打印历史。

## English

This plugin lets Codex use the permission-controlled Orca Preset Assistant interface to read presets, current settings, the current project, and print records. It does not embed Codex in the panel or bypass the panel's data permissions.

### Install from a GitHub Release

1. Download `OrcaPresetAssistant-Codex-Plugin-<version>.zip`.
2. Extract it to a permanent location, for example `D:\Tools\OrcaPresetAssistant-Codex-Plugin`. Do not move or delete that folder after installation.
3. Run in PowerShell:

   ```powershell
   codex plugin marketplace add "D:\Tools\OrcaPresetAssistant-Codex-Plugin"
   codex plugin add orca-preset-assistant@orca-preset-assistant-release
   codex plugin list
   ```

4. Start a new Codex task so the plugin is loaded.
5. In Orca, open Preset Assistant settings and choose only the data scope required for that task.

When building the plugin from source, run `pnpm package:plugin` at the repository root, extract the generated package from `release`, and use the same installation commands.

### Recommended workflow

- For general advice, keep **General Advice** selected. Codex reads no Orca data.
- For parameter diagnosis, allow **Current Settings**. Codex can read the active machine, process, filaments, and effective settings, but not model data.
- For part analysis, allow **Current Project**. Codex can read session-scoped placement and supported STL/3MF geometry.
- To update or create a permanent user preset, describe the target, changes, and reason. Codex logs the exact file delta first and then edits the workspace files directly; Orca may be open or closed, and there is no second approval step.
- Ask Codex to read live settings only when you need effective current values or a current-project-only change. Current-project changes still require panel confirmation.

Examples:

```text
Give me general PAHT-CF warping advice without reading the current project.
Read current settings and check for conflicts among nozzle, bed, fan, and speed values.
Read the current project and use part placement and geometry to explain this lifted corner.
List every parameter delta and tradeoff first. Do not apply anything yet.
```

### Local versions for user presets

The panel can initialize an independent local Git repository at `<Workspace>\UserPresets`. It versions only the `machine`, `process`, and `filament` directories:

- **Save Version** creates a local snapshot.
- **Version History** lists and restores earlier snapshots.
- Restoring creates a new commit instead of rewriting history.
- The panel has no GitHub, push, pull, branch, or remote-management UI.

To ask Codex for direct Git help, open `<Workspace>\UserPresets` as the Codex task folder and explicitly state what should be inspected, saved, or synchronized. AI-only files such as `AGENTS.md` and `CHANGELOG.md` are not shown in the panel.

Permanent process and filament changes are logged before the JSON and matching `.info` are written. The panel refresh button re-indexes both new and modified presets; when embedded in a running Orca instance, it hot-loads only the logged targets and marks them loaded only after native readback matches. Current-project-only proposals continue to use Orca's authoritative `writeCapabilities`.

When a normal parent folder is first selected, the app creates the standard structure and adds `UserPresets\AGENTS.md` only if it does not exist. The plugin must read Orca's `writeCapabilities` instead of maintaining a second allowlist. Hidden settings are identified as having no visible panel control, and success requires both a native Orca receipt and fresh-revision readback.

### Update or uninstall

For an update, extract the new package to the permanent folder, run the Marketplace and plugin installation commands again, and start a new Codex task. To uninstall:

```powershell
codex plugin uninstall orca-preset-assistant@orca-preset-assistant-release
```

Uninstalling the plugin does not delete the workspace, user presets, or print history.
