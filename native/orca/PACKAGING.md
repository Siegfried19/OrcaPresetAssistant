# Orca 内嵌产品打包契约

正式产品不是 portable 单文件 EXE，也不显示第三个窗口。

## Helper 产物

使用 electron-builder 的 unpacked 目录作为 helper：

```text
release\win-unpacked\
├─ Orca Preset Assistant.exe
├─ resources\
├─ locales\
└─ 其余 Electron runtime 文件
```

必须把 `win-unpacked` 的完整内容复制到 Orca 安装资源目录：

```text
<Orca resources>\helper\
├─ Orca Preset Assistant.exe
├─ resources\
├─ locales\
└─ ...
```

不能把 `OrcaPresetAssistant-*-portable.exe` 放在这里。portable/NSIS 启动器会再创建子进程，导致 Orca 记录的 PID 与 ready 文件里的服务 PID 不一致，生命周期和认证校验都会失败。

`0004` 固定查找：

```text
<Orca resources>\helper\Orca Preset Assistant.exe
```

配置文件不能覆盖这个可执行文件路径。开发调试使用现有的 loopback `url` 配置，不增加任意 EXE 启动入口。

## Helper CLI

Orca 以无窗口模式调用：

```text
Orca Preset Assistant.exe
  --serve
  --host 127.0.0.1
  --port 0
  --session-token <native-random-token>
  --state-file <absolute-temporary-json>
  --parent-pid <orca-pid>
```

要求：

- `--serve` 不创建 `BrowserWindow`。
- 只允许绑定 `127.0.0.1`。
- `--port 0` 由操作系统分配空闲端口。
- token 至少 32 字符，只保存在进程参数、内存和 WebView fragment 中。
- ready 文件原子写入，且只能包含：

```json
{
  "schemaVersion": 1,
  "pid": 1234,
  "generatedAt": "2026-07-29T21:45:00.000Z",
  "origin": "http://127.0.0.1:47123",
  "port": 47123
}
```

- ready 文件不得包含 token 或带 token 的 URL。
- Orca 核对 PID、origin 和 port 后，自行构造 `http://127.0.0.1:<port>/#session=<token>`。
- React 读取 session 后立即清除 fragment。
- parent PID 消失时 helper 自行退出；Orca 面板销毁时也会终止自己启动的 helper。

## Orca 资源

以下文件仍随 Orca 资源打包：

```text
<Orca resources>\web\orca_preset_assistant\bridge.js
<Orca resources>\web\orca_preset_assistant\index.html
```

`bridge.js` 由原生作为 user script 注入正式 React 页面；`index.html` 只是 helper 缺失或启动失败时的诊断 fallback，不是正式产品面板。

## 打包验收

1. 打包目录中存在完整 `helper` runtime，不是 portable 单 EXE。
2. `Orca Preset Assistant.exe --serve ...` 不创建窗口。
3. ready 文件的 `pid` 等于 Orca 启动得到的 PID。
4. ready 文件不含 session token。
5. Orca WebView 加载正式 React 面板，桌面上仍只有 Orca 和 Codex 两个窗口。
6. 关闭 Orca 后 helper 进程退出，一次性 ready 文件被清理。
7. 删除 helper 目录后，Orca 只显示明确诊断 fallback，不显示“正式面板已就绪”。
