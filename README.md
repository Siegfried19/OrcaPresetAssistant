# Orca Preset Assistant

Orca Preset Assistant 是嵌入 OrcaSlicer 主窗口的用户预设与打印历史工作台。日常使用只需要 Orca 和 Codex 两个窗口：Orca 继续负责模型、切片、设备和打印，助手面板负责预设审阅、受控写入与打印结果归档。

> 当前状态：Windows 早期预览版。核心流程和自动化测试已经建立，真实打印、不同显示缩放和 Orca 升级兼容仍需持续验证。公开稳定安装包尚未发布。

![Orca Preset Assistant 中文界面](./docs/images/dashboard-zh.png)

English summary: Orca Preset Assistant embeds a preset and print-history workspace in OrcaSlicer. Codex can inspect the current project only with explicit permission, while Orca remains the authority for applying preset changes.

## 产品范围

面板只有两个一级页面：

- **用户自定义预设**：查看 machine、process、filament 用户预设，审阅 Codex 参数提案，并明确选择写入位置。
- **打印历史**：自动或手动保存打印档案，记录实际有效参数，并在打印后补写结果和备注。

首次使用时选择一个工作文件夹。程序只管理下面两个子文件夹：

```text
<Workspace>\
├─ UserPresets\
│  ├─ machine\
│  ├─ process\
│  └─ filament\
└─ PrintHistory\
```

官方 Orca 预设继续保留在 Orca 原有位置，不复制、不修改。

## 主要能力

- 在 Orca 内查看当前工作区的三类用户预设。
- 用“Orca 创建/管理”或“本地 JSON”标记预设来源；只有 JSON 的本地预设仍可正常使用。
- 让 Codex 按授权级别读取通用状态、当前设置，或当前项目的零件摆放和模型几何。
- 审批参数变化并选择“仅当前项目 / 更新当前永久预设 / 另存为新永久预设”。
- 在没有后续冲突时回滚最近一次 Orca 写入。
- 打印提交成功后自动建档，可选择是否保存当前项目 3MF 副本。
- 打印完成后补写成功、问题、失败和备注。
- Orca 原生标签跟随 Orca 语言；面板内容可独立切换中文或英文。

机器预设目前只读。Codex 自动写入只开放给 Orca 原生层明确验证过的 process / filament 参数白名单。

## Bambu LAN Only 打印

本项目的定制 Orca 没有 Bambu Lab 的应用签名。使用较新打印机固件时，普通授权模式会拒绝它直接发起打印，并可能返回 `-26`。如果你只使用 LAN Only：

1. 在打印机屏幕进入 LAN Only 设置；
2. 开启 LAN Only，并同时手动开启 **Developer Mode**；
3. 回到 Orca，重新连接打印机后再发送打印。

不需要安装 Bambu Connect。Developer Mode 会开放打印机的局域网接口，只应在可信的本地网络中使用；Bambu Lab 也说明该模式需要用户自行承担局域网安全责任。参考 [Bambu Lab 对 Developer Mode 的官方说明](https://blog.bambulab.com/updates-and-third-party-integration-with-bambu-connect/)。

若发送仍显示 `-26`，先确认打印机上的 Developer Mode 仍为开启状态，再在 Orca 中断开并重新连接设备。本项目不会远程开启或关闭打印机的安全设置。

## 权限与隐私

Codex 默认只提供通用建议。用户可按会话选择：

- 不读取当前项目；
- 读取当前预设和有效参数；
- 读取当前项目的零件摆放与 STL/3MF 几何。

模型权限只覆盖当前 Orca 项目实际引用的文件，不扫描最近文件或其他目录。Orca 是项目状态与预设写入的唯一权威来源，面板不会手工生成云同步 `.info` 元数据，也不会直接覆盖官方预设。只有 JSON 的本地预设同样有效，不会因此显示结构异常。

详细边界见 [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) 和 [架构说明](./docs/ARCHITECTURE.md)。

## 仓库结构

本仓库包含产品需要维护的全部源码，不依赖旧的 Bambu 面板代码库。

```text
src/                         Electron/React 面板与本地 helper
native/orca/                 针对固定 OrcaSlicer 基线的可审阅补丁
plugins/orca-preset-assistant/
                             Codex 插件源码
docs/                        用户、架构、验证与发布文档
tests/                       应用测试
```

`FullVersion/`、`release/`、`node_modules/` 和编译输出不会进入 Git。公开二进制应通过 GitHub Releases 单独发布，并与对应源码版本关联。

## 本地开发

要求：

- Windows 10/11
- Node.js 22+
- pnpm 11（仓库固定为 `pnpm@11.9.0`）

```powershell
pnpm install --frozen-lockfile
pnpm quality
pnpm dev
```

插件集成测试：

```powershell
node --test `
  plugins/orca-preset-assistant/server/model-inspector.test.mjs `
  plugins/orca-preset-assistant/server/server.test.mjs
```

生成独立 Windows 便携面板：

```powershell
pnpm package:win
```

该便携程序主要用于界面预览和故障排查。完整日常体验需要把 helper 与原生补丁一起构建进 Orca；规则见 [原生补丁说明](./native/orca/README.md) 和 [打包说明](./native/orca/PACKAGING.md)。

## 文档

- [用户指南](./docs/USER_GUIDE.md)
- [产品计划](./PRODUCT_PLAN.md)
- [技术规格](./TECHNICAL_SPEC.md)
- [验收清单](./ACCEPTANCE.md)
- [当前验证状态](./docs/VALIDATION.md)
- [发布流程](./docs/RELEASING.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全策略](./SECURITY.md)

## 许可证与商标

本仓库以 [GNU Affero General Public License v3.0 only](./LICENSE) 发布。OrcaSlicer 原生集成基于 OrcaSlicer 的 AGPL-3.0 代码与接口，因此整个仓库采用同一许可证，避免把同一产品拆成含混的授权边界。

本项目不是 OrcaSlicer、SoftFever 或 Bambu Lab 的官方产品。相关名称和商标属于各自权利人。第三方依赖继续适用其各自许可证；详见 [NOTICE.md](./NOTICE.md)。
