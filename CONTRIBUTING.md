# 贡献指南

感谢你改进 Orca Preset Assistant。请把每次变更保持在一个清楚、可验证的范围内。

## 开发环境

- Windows 10/11
- Node.js 22+
- pnpm 11

```powershell
pnpm install --frozen-lockfile
pnpm quality
node --test `
  plugins/orca-preset-assistant/server/model-inspector.test.mjs `
  plugins/orca-preset-assistant/server/server.test.mjs
```

提交 Pull Request 前，请说明用户可见变化、验证结果和仍未验证的真实打印场景。

## Orca 原生变更

原生改动必须作为 `native/orca/patches/` 下的编号补丁维护，并基于 `native/orca/README.md` 指定的 OrcaSlicer 提交重放。新增或修改补丁时：

1. 按编号顺序执行 `git apply --check --whitespace=error-all`。
2. 构建 Release 版本并运行相关原生测试。
3. 更新补丁说明、验收项和验证状态。
4. 不把完整 Orca 源码树或编译产物提交到本仓库。

## 数据与隐私

- 测试夹具必须使用虚构的预设、路径和打印记录。
- 不提交真实模型、用户预设、打印历史、账号信息、访问令牌或设备连接信息。
- 文档示例使用仓库相对路径或明显的占位路径，不写个人计算机绝对路径。
- 不扩大 Codex 数据权限或 Orca 写入白名单，除非同时提供明确的产品理由、失败关闭行为和测试。

## 许可证

提交代码即表示你有权按本仓库的 `AGPL-3.0-only` 许可证提供该贡献。
