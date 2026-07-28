# Bambu Preset Dashboard

一个用于维护 Bambu Studio 自定义工艺、材料与设备预设的本地工程面板。

它把三件经常分散的事放在同一个界面里：

- 当前有哪些预设，以及它们继承自哪个官方预设；
- 哪些参数相对本地 Git 记录发生了变化；
- 每个工艺和材料最近一次实际打印的结果，是否仍对应当前参数版本。

## 直接使用

双击仓库根目录中的：

```text
BambuPresetDashboard.exe
```

这是便携版本，不需要安装 Node.js、Python 或其他运行环境。应用通常会自动识别：

```text
%APPDATA%\BambuStudio\user\*
```

如果预设目录被移动过，在面板左下角选择一次即可；路径会保存在应用自己的用户配置中。

标题栏右侧可以随时切换中文或 English。语言选择会保存在本机，下次启动自动沿用。

## 数据边界

- 预设 JSON 和 `.info` 在当前版本中始终只读。
- 面板不会自动 `git add`、提交或推送。
- 只有点击“保存打印记录”时，才会向当前预设仓库追加：

```text
engineering/events.jsonl
```

每一行是独立的 UTF-8 JSON 事件，包含时间、结果、备注、预设相对路径、SHA-256 和当时的自定义 JSON 快照。旧事件不会因后来结论改变而被覆盖。

## 开发

开发环境需要 Node.js 22+ 与 pnpm。

```powershell
pnpm install
pnpm dev
```

完整质量检查：

```powershell
pnpm quality
```

生成 Windows 便携版本：

```powershell
pnpm package:win
```

产物位于 `release/`。`build.cmd` 执行相同的质量检查与打包流程。

## 项目结构

```text
src/
  main/
    application/       用例编排与应用状态
    domain/            预设身份和记录规则
    infrastructure/    文件、Git、Bambu 与配置适配器
    ipc/               经过校验的桌面接口
  preload/             最小权限的 Electron bridge
  renderer/
    src/components/    可复用界面组件
    src/hooks/         界面状态与用例调用
    src/i18n/          类型安全的中英文文案与持久化语言状态
    src/styles/        设计 token 和布局
  shared/              主进程与界面共享的只读契约
```

更完整的分层与扩展约束见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 仓库关系

本软件是独立 Git 仓库。Bambu Studio 的实时预设仓库只在运行时通过路径连接，不作为 submodule，也不会被复制进软件仓库。
