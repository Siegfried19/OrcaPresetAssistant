# 发布流程

本项目不把二进制或完整 Orca 构建提交到 Git。GitHub Release 必须对应一个可公开获取的源码提交或标签。

## 发布前

1. 更新版本号、变更说明和 `docs/VALIDATION.md`。
2. 运行：

   ```powershell
   pnpm install --frozen-lockfile
   pnpm quality
   node --test `
     plugins/orca-preset-assistant/server/model-inspector.test.mjs `
     plugins/orca-preset-assistant/server/server.test.mjs
   pnpm package:plugin
   ```

3. 在固定 OrcaSlicer 基线上按顺序重放全部补丁，运行原生测试并构建 Release。
4. 在干净的 Windows 用户环境中完成工作区、预设另存、打印建档、3MF 策略和双语界面验收。
5. 确认发布包内保留 `LICENSE`、`NOTICE` 以及第三方依赖要求的许可证文件。

## 发布内容

建议每个 GitHub Release 提供：

- 完整的定制 Orca Windows 压缩包；
- 独立 portable 面板（仅供预览和排障）；
- `OrcaPresetAssistant-Codex-Plugin-<version>.zip`，包含 Marketplace 清单、插件和双语安装说明；
- SHA-256 校验文件；
- 对应源码标签与简短变更说明；
- 已验证项目和已知限制。

不要只分发 helper 的单个 EXE。Electron helper 必须携带完整运行时，并与匹配版本的 Orca 原生补丁一起使用。
Codex 插件包必须与同一源码标签生成，解压后的根目录应直接包含 `.agents/` 和 `plugins/`。

面向普通用户发布前建议完成 Windows 代码签名；没有签名时应明确说明系统可能显示未知发布者警告。
