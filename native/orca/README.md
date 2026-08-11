# Orca 原生集成补丁

本目录保存 Orca Preset Assistant 对 OrcaSlicer 的可审阅源码补丁。补丁不会自动修改本机 Orca 源树。
本仓库是产品源码的唯一维护来源；用于重新编译 Orca 的上游源码树属于临时构建输入，
不作为第二个产品代码库。

## 基线

- 产品补丁源：[`native/orca/patches`](patches)
- 基线提交：`2d4b431d5f3994350efe1de63ebd44c32646ba51`
- 基线工作树已有且必须保留的改动：
  - `src/slic3r/plugin/host/PluginHostApp.cpp`
  - `src/slic3r/plugin/host/PluginHostUi.cpp`
  - `tests/slic3rutils/test_plugin_host_api.cpp`

本补丁不触碰上述三个文件，可以叠加在当前工作树上。

## 第一批补丁

[0001-embed-preset-assistant-panel.patch](patches/0001-embed-preset-assistant-panel.patch) 只实现主窗口内嵌底座：

- 新增 `PresetAssistantPanel`，结构为 `wxPanel + wxWebView`
- 将页面追加到 `MainFrame` 的 Notebook 末尾
- 通过页面指针查找和选择，不修改 `TabPosition` 或现有页索引
- 默认加载随 Orca 打包的静态页面
- 开发时可切换到 localhost 页面
- localhost 配置只允许回环地址，拒绝任意远程 URL
- WebView 加载失败时显示内置错误页
- 登记新增 C++ 文件到 `src/slic3r/CMakeLists.txt`
- 提供一个可用于原生冒烟测试的静态 bootstrap 页面

本批明确不包含：

- 预设读取或写入
- JavaScript 到 Orca 的业务接口
- Codex/MCP 通讯
- 打印建档
- 用户工作区选择
- 新的通用插件停靠框架

## 第二批补丁

[0002-use-workspace-user-presets-root.patch](patches/0002-use-workspace-user-presets-root.patch) 实现用户预设目录解析：

- 从 `OrcaSlicer.conf` 读取 `[orca_preset_assistant] workspace`
- 配置后将 Orca 原生用户预设根目录固定为 `<workspace>\UserPresets`
- 自动准备 `machine`、`process`、`filament` 三个目录
- 原生加载和 Orca 现有的“保存/另存用户预设”路径复用同一个目录
- 登录和切换账号不会改变或删除外部用户预设根目录
- 外部工作区启用时，阻止 OrcaCloud 用户预设拉取、删除和订阅包更新
- 官方系统预设仍从 Orca 原有的 `resources\profiles` / `system` 路径加载
- 增加 resolver、原生保存落点、账号切换保护和非法路径单元测试

本批不包含 JavaScript 桥接，也不会让当前 bootstrap 页面直接写预设。三种写入目标的原生接口和工作区设置界面属于第三批，详见 [BRIDGE_FOLLOWUP.md](BRIDGE_FOLLOWUP.md)。

当前源码中仍有几处旧 `data_dir\user` 硬编码，但不影响本批的主读取/保存链路：

- 版本升级时的 `backup_user_folder()` 仍只备份 Orca 旧用户目录；它不会备份外部工作区。
- `.orca_bundle` / `.zip` 本地包导入仍使用 Orca 旧用户目录；普通 JSON 导入会先调用新的目录更新逻辑。外部工作区模式在第三批完成前不把本地包导入算作支持能力。
- 登录迁移入口在外部工作区模式下会直接跳过，因此不会查询或迁移 Orca 旧账号目录。
- `scan_orphaned_info_files()` 仍写着旧路径，但只在已被禁止启动的云同步线程中运行。

这些边界要么与主流程无关，要么明确留给第三批；不能据此宣称“所有 Orca 用户目录功能都已迁移”。

## 第三批补丁

[0003-add-authenticated-native-operations-bridge.patch](patches/0003-add-authenticated-native-operations-bridge.patch) 增加 Orca 权威原生桥接：

- `wxWebView` 请求同时校验协议版本、页面来源、每面板随机 token、参数白名单和 revision。
- 原生向所有受信页面注入完整 `window.OrcaPresetAssistant` 适配器，不依赖 Electron preload。
- `state.get` 只返回常驻安全状态；完整有效参数、项目摆放和打印待建档分别使用独立授权。
- `project.get` 的 `project:geometry` 会话授权返回零件摆放，并仅列出当前项目实际引用且存在的 STL/3MF 源文件；Codex 插件据此生成几何统计与三视图。`project:placement` 兼容入口仍不返回源路径。
- `workspace.set` 持久化工作区并明确返回需要重启；`presets.refresh` 在没有安全重载事务前返回 `RESTART_REQUIRED`，不会显示假刷新成功。
- `proposal.apply` 要求 `approvedAt`、`expectedPresetName` 和明确 destination；Orca 返回 `authority: "orca"`、状态、revision、before/after。
- 三种 destination 已对安全白名单中的工艺参数形成闭环：仅当前项目、更新当前用户永久预设、另存为新用户永久预设。
- 回滚有 revision guard。另存新永久预设的回滚只切回原预设，不删除已经创建的新预设。
- 成功提交打印后通过 `CallAfter` 在 UI 线程发出 pending 建档事件；真正持久化由工作区 helper 完成。
- `project.export-copy` 只允许把当前项目副本静默导出到 helper 已准备的 `<workspace>\PrintHistory` 子路径，不改变当前项目路径。

`0003` 单独应用时，写入白名单仍只有 `process.layer_height`；后续由 `0005` 扩展。

随补丁保留的 HTML 是诊断 fallback，不是最终面板。

## 第四批补丁

[0004-start-headless-dashboard-helper.patch](patches/0004-start-headless-dashboard-helper.patch) 负责正式面板宿主装配：

- 只从固定的 `<Orca resources>\helper\Orca Preset Assistant.exe` 定位 helper，配置文件不能指定任意可执行文件。
- 以 `--serve --host 127.0.0.1 --port 0` 无窗口启动，传入随机 session token、绝对 state file 和 Orca parent pid。
- 不解析 stdout；等待 helper 原子写入不含秘密的 ready JSON，核对 schema、pid、固定 loopback origin 和端口，再由原生把内存中的 session token 拼入 URL fragment。
- 加载 helper 提供的正式 React 页面；原生继续作为项目、预设和打印事件的唯一权威。
- 面板销毁时停止 timer、终止自己启动的 helper，并清理一次性 state file。
- 配置合法 localhost `url` 时仍作为开发覆盖，不启动 packaged helper。

helper 的打包契约是：`--serve` 绝不能创建 `BrowserWindow`，只能绑定 `127.0.0.1`；ready 文件为 `{schemaVersion:1,pid,generatedAt,origin,port}`，不得包含 token 或带 token 的 URL；父进程退出后 helper 自退。必须复制完整 `win-unpacked` runtime，不能放 portable 启动器。详见 [PACKAGING.md](PACKAGING.md)。若 helper 可执行文件没有随包安装，Orca 只会显示诊断 fallback，不能称最终产品面板已交付。

## 第五批补丁

[0005-expand-safe-process-filament-write-whitelist.patch](patches/0005-expand-safe-process-filament-write-whitelist.patch) 扩展日常写入能力，但不开放任意参数：

- process 开放 18 个高频标量：层高、墙层、顶底层、填充、支撑、裙边/筏边、常用速度与加速度。
- filament 开放 16 个高频标量：喷嘴/热床温度、流量、最大体积流量和常用风扇。
- 每项写入都依次校验参数白名单、Orca `ConfigOptionType`、单标量语法、数值范围；风扇最小值不得高于最大值。
- `state.get` 与 `settings.get` 返回同一份 `writeCapabilities`，正式面板可直接据此显示可写/只读状态。
- machine 明确为只读；诊断 fallback 也直接显示这一边界。
- 三种 destination 和原有 rollback guard 对 process、filament 共用同一事务路径。

完整参数与边界见 [WRITE_WHITELIST.md](WRITE_WHITELIST.md)。这不是“全参数编辑器”，枚举、脚本、路径、设备连接和 machine 运动安全参数都不在写入面内。

## 第六、七批兼容性补丁

[0006-fix-wx-build-compatibility.patch](patches/0006-fix-wx-build-compatibility.patch) 只修复当前 Windows/wxWidgets 构建接口差异：

- 避免 `std::string` 的 most-vexing-parse；
- 使用当前 wxWidgets 的三参数 `wxProcess::Kill`；
- 为工作区目录选择器传入 `app.GetTopWindow()`。

[0007-guard-assistant-tab-during-mainframe-init.patch](patches/0007-guard-assistant-tab-during-mainframe-init.patch) 来自真实启动冒烟：`CalibrationPanel` 初始化会在助手页创建前产生一次空页面事件。补丁先确认 `m_preset_assistant` 已创建，再调用 `activate()`，避免两个空指针相等时误调用。

## 第八批实机修复

[0008-fix-helper-handoff-and-protect-workspace.patch](patches/0008-fix-helper-handoff-and-protect-workspace.patch) 修复首次实机选择工作区时发现的两个问题：

- 将 helper ready 定时器事件绑定到其 owner panel，确保正式 React 页面能够接替静态诊断 fallback；
- 在删除 ready 文件前关闭读取流，避免 Windows Temp 遗留状态 JSON；
- 拒绝把已经包含至少两个 `machine/process/filament` 直属目录的 Orca/Bambu 实时预设根目录选作产品工作区。

## 第九批语言修复

[0009-follow-orca-language-for-assistant-tab.patch](patches/0009-follow-orca-language-for-assistant-tab.patch)
让 Orca 原生页签名称只跟随 Orca 自己的界面语言：

- 简体和繁体中文显示“预设助手”；
- 英文及其他尚未提供面板翻译的语言显示“Preset Assistant”；
- 面板内部语言仍由面板自己的中英文切换控制，二者互不覆盖。

## 第十批当前项目几何权限

[0010-enable-current-project-geometry-access.patch](patches/0010-enable-current-project-geometry-access.patch)
把“当前项目”从摆放摘要升级为可分析模型形状的会话权限：

- `project:geometry` 同时返回零件摆放和当前项目实际引用的 STL/3MF 源文件；
- `project:placement` 保留为兼容入口，仍不返回源路径；
- 只接受存在的绝对 STL/3MF 路径，不枚举最近文件或项目外目录；
- 增加原生授权边界测试。

## 第十一批 LAN Only 发送提示

[0011-explain-bambu-lan-developer-mode.patch](patches/0011-explain-bambu-lan-developer-mode.patch)
只改善 Bambu 网络插件授权错误的可理解性：

- 将 `BAMBU_NETWORK_SIGNED_ERROR`（`-26`）从通用“发送失败”改为明确的 LAN Only / Developer Mode 处理办法；
- 英文使用源字符串，简体中文通过 Orca 原生 gettext 目录翻译；
- 不修改发送协议、不绕过授权，也不会尝试远程切换打印机安全设置。

## 参数页保持 Orca 原生交互

Prepare 参数区域不再插入“当前预设已更新 / 查看修改 / 撤销”横条：

- 提案状态、修改前后值和安全回滚入口只保留在 Preset Assistant 面板；
- Orca 参数页继续使用自身的 dirty 标记、字段复原与 Undo 交互，避免出现多个含义相近的撤销入口；
- `proposal.apply` 的权威回执、revision 更新和原生数值回读保持不变；
- 已验证的提案历史可以保留，但不会长期占用切片参数区域。

## 第十三批普通参数扩展与多值单值广播

[0013-expand-write-whitelist-and-broadcast-scalars.patch](patches/0013-expand-write-whitelist-and-broadcast-scalars.patch)
在现有原生桥接基线上扩展普通工艺/耗材写入范围，并修复按喷嘴保存的多值参数无法可靠写入的问题：

- 普通工艺白名单扩展到 47 项、普通耗材白名单扩展到 33 项；
- 插件发送一个合法标量时，由 Orca 原生端读取当前真实值数量并广播到全部现有槽位；
- 显式发送多个值时仍必须与当前数量一致，不能新增或删除喷嘴槽位；
- 能力声明明确返回 `scalarBehavior: broadcast-to-current-value-count`；
- 数量不匹配错误会显示期望数量和实际收到的数量。

## 第十四批参数可见性与验证元数据

[0014-publish-parameter-visibility-and-verification.patch](patches/0014-publish-parameter-visibility-and-verification.patch)
让原生能力声明成为面板与 Codex 插件的单一参数来源：

- 每项能力同时发布 Orca 配置定义中的名称、分类和编辑模式；
- 发布 `panelVisibility`，明确区分当前参数面板可见项与只能原生读写/回读的隐藏项；
- `support_interface_loop_pattern` 标为 `hidden`，避免客户端给出不存在的面板路径；
- 发布 `verification: orca-readback`，客户端只在原生回执和新 revision 数值匹配后显示成功；
- Codex 插件直接消费这份能力声明，不再维护重复白名单。

## URL 配置

默认页面：

```text
<Orca resources>\web\orca_preset_assistant\index.html
```

开发时可以在 Orca 的 `OrcaSlicer.conf` 中加入：

```ini
[orca_preset_assistant]
url = http://localhost:5173
workspace = D:\OrcaPresetWorkspace
```

允许的主机只有：

- `localhost`
- `127.0.0.1`
- `[::1]`

支持 HTTP 和 HTTPS。配置为空或不合法时自动回退到静态页面。

页面 URL 会附加当前 Orca 语言，例如：

```text
?lang=zh_CN
```

`workspace` 必须是绝对路径，不能是盘符根目录。第二批只负责读取并验证这个键；在第三批桥接完成前，测试人员需要手工写入配置并重启 Orca。最终产品由面板的“选择工作区”操作通过受认证原生桥接写入同一键、调用 `AppConfig::save()`，并明确返回“需重启后切换”。不会在已有预设仍驻留内存时偷偷热切目录。

## 补丁顺序

完整原生验证按下列顺序应用。`0003` 依赖 `0001` 和 `0002`；已移除的参数页回执补丁不再属于补丁链：

```powershell
$patchRoot = (Resolve-Path ".\native\orca\patches").Path
git apply --check "$patchRoot\0001-embed-preset-assistant-panel.patch"
git apply --check "$patchRoot\0002-use-workspace-user-presets-root.patch"
git apply --check "$patchRoot\0003-add-authenticated-native-operations-bridge.patch"
git apply --check "$patchRoot\0004-start-headless-dashboard-helper.patch"
git apply --check "$patchRoot\0005-expand-safe-process-filament-write-whitelist.patch"
git apply --check "$patchRoot\0006-fix-wx-build-compatibility.patch"
git apply --check "$patchRoot\0007-guard-assistant-tab-during-mainframe-init.patch"
git apply --check "$patchRoot\0008-fix-helper-handoff-and-protect-workspace.patch"
git apply --check "$patchRoot\0009-follow-orca-language-for-assistant-tab.patch"
git apply --check "$patchRoot\0010-enable-current-project-geometry-access.patch"
git apply --check "$patchRoot\0011-explain-bambu-lan-developer-mode.patch"
git apply --check "$patchRoot\0013-expand-write-whitelist-and-broadcast-scalars.patch"
git apply --check "$patchRoot\0014-publish-parameter-visibility-and-verification.patch"
```

不能在未应用前一批的原始源树上单独检查后续补丁。产品仓库验证使用临时导出的 Orca 基线依次应用前置补丁，不改动用户日常 Orca 安装。

## 应用

先关闭 OrcaSlicer，然后在 Orca 源树中执行只读检查：

```powershell
git status --short --branch
$patchRoot = (Resolve-Path ".\native\orca\patches").Path
git apply --check "$patchRoot\0001-embed-preset-assistant-panel.patch"
git apply --check "$patchRoot\0002-use-workspace-user-presets-root.patch"
# 在临时基线上按“补丁顺序”列表应用；每一步先 check，再应用。
```

确认检查通过后应用：

```powershell
git apply "$patchRoot\0001-embed-preset-assistant-panel.patch"
git apply "$patchRoot\0002-use-workspace-user-presets-root.patch"
git apply "$patchRoot\0003-add-authenticated-native-operations-bridge.patch"
git apply "$patchRoot\0004-start-headless-dashboard-helper.patch"
git apply "$patchRoot\0005-expand-safe-process-filament-write-whitelist.patch"
git apply "$patchRoot\0006-fix-wx-build-compatibility.patch"
git apply "$patchRoot\0007-guard-assistant-tab-during-mainframe-init.patch"
git apply "$patchRoot\0008-fix-helper-handoff-and-protect-workspace.patch"
git apply "$patchRoot\0009-follow-orca-language-for-assistant-tab.patch"
git apply "$patchRoot\0010-enable-current-project-geometry-access.patch"
git apply "$patchRoot\0011-explain-bambu-lan-developer-mode.patch"
git apply "$patchRoot\0013-expand-write-whitelist-and-broadcast-scalars.patch"
git apply "$patchRoot\0014-publish-parameter-visibility-and-verification.patch"
```

应用后先核对范围：

```powershell
git status --short
git diff --stat
git diff -- src/slic3r/CMakeLists.txt src/slic3r/GUI/MainFrame.cpp src/slic3r/GUI/MainFrame.hpp src/slic3r/GUI/PresetAssistantPanel.cpp src/slic3r/GUI/PresetAssistantPanel.hpp resources/web/orca_preset_assistant/index.html
git diff -- src/libslic3r/PresetBundle.cpp src/libslic3r/PresetBundle.hpp src/slic3r/GUI/GUI_App.cpp tests/libslic3r/test_preset_bundle_loading.cpp
```

## 构建

复用现有 Windows Release 构建目录：

```powershell
cmake --build build --config Release --target ALL_BUILD -- -m
```

本批至少需要确认：

- `PresetAssistantPanel.cpp` 编译成功
- `ParamsPanel.cpp` 与 `PresetAssistantBridge.cpp` 编译成功
- `OrcaSlicer.dll` 重新链接成功
- `resources\web\orca_preset_assistant\index.html` 出现在打包目录
- `test_preset_bundle_loading.cpp` 中 `[Preset][Workspace]` 测试通过
- `test_preset_assistant_bridge.cpp` 中白名单、machine 只读和能力声明测试通过
- 空数据目录启动 Orca 时不会在 MainFrame 初始化期间崩溃

## 冒烟验收

1. 不配置 URL，启动 Orca。
2. 主窗口末尾出现 `Preset Assistant` 页面。
3. 现有 Home、Prepare、Preview、Device、Project、Calibration 页面顺序和选择逻辑不变。
4. 打开新页面，可以看到 `Native host ready`。
5. 在 `OrcaSlicer.conf` 配置 localhost URL 并启动对应前端。
6. 再次进入页面时加载 localhost 页面。
7. 配置远程 URL，例如 `https://example.com`，页面必须回退到打包静态页。
8. 停止 localhost 服务，再进入页面时显示内置加载错误，并可在服务恢复后重新进入页面重试。
9. 配置绝对 `workspace` 并重启，Orca 从 `<workspace>\UserPresets` 加载三类用户预设。
10. 在 Orca 原生界面另存一个用户工艺预设，文件出现在 `<workspace>\UserPresets\process`。
11. 登录或切换 OrcaCloud 账号，外部目录不被删除或改写，日志明确显示用户预设云同步已禁用。
12. 官方预设仍正常显示，且 Orca 的系统预设目录没有发生变化。
13. 从助手批准并应用一次 process 或 filament 修改，助手面板显示原生回执和新 revision 的回读验证结果。
14. 在 Prepare 参数区使用 Orca 自身的字段复原或 Undo，助手面板自动同步为完全回滚、部分回滚或已在 Orca 中调整。
15. 使用 Redo 恢复全部修改后，助手面板自动回到“已应用并验证”；revision 冲突只触发权威状态刷新，不向用户显示 stale 错误。
16. 新提案到达时，首页的单张“最新修改”卡片直接替换旧提案；参数区不会出现助手额外插入的提示或撤销横条。

## 回退

尚未提交时，先检查反向补丁：

```powershell
$patchRoot = (Resolve-Path ".\native\orca\patches").Path
git apply -R --check "$patchRoot\0001-embed-preset-assistant-panel.patch"
git apply -R --check "$patchRoot\0002-use-workspace-user-presets-root.patch"
```

检查通过后回退：

```powershell
git apply -R "$patchRoot\0001-embed-preset-assistant-panel.patch"
git apply -R "$patchRoot\0002-use-workspace-user-presets-root.patch"
```

如果该补丁已经形成独立提交，使用 `git revert <commit>`，不要使用 `git reset --hard`。

## 已知边界

- 本补丁基于当前 grafted Orca 基线制作，升级 Orca 上游前必须重新执行 `git apply --check`。
- 静态 bootstrap 只是诊断 fallback；正式 React 页面来自无窗口 helper。
- 三种 destination 对白名单中的 process 与 filament 标量已接通；machine 有意保持只读。
- 白名单不含枚举、脚本、路径、设备连接、挤出机/运动系统或任意 JSON 键；新增参数必须逐项建规则与测试。
- 安全热刷新尚未实现，`presets.refresh` 明确返回需要重启。
- helper server、完整 `win-unpacked` runtime 和 Orca 原生补丁必须一起打包并完成构建/运行验收，才能称最终产品。
