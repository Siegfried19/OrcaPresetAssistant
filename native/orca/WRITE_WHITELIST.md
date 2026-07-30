# Orca 原生写入白名单

本文是 `0005-expand-safe-process-filament-write-whitelist.patch` 的唯一参数清单。目标是覆盖日常高频调整，不做任意参数编辑器。

## 统一规则

- 只接受 `process` 与 `filament`；`machine` 始终只读。
- 每个 change 必须是一个标量。数组、对象、逗号/分号分隔的多值、`nil` 都拒绝。
- 布尔项只接受 JSON `true` / `false`。
- 数值项只接受 JSON number 或完整的数值字符串；整数项不接受非整数值。
- Orca 当前配置中必须存在该键，并且实际 `ConfigOptionType` 必须与规则完全一致。
- 整个 changes 对象全部验证通过后才一次应用，沿用原有 revision、预设 identity、保存验证和 rollback guard。
- 这里的范围是产品安全边界，可能比 Orca 内部理论范围更窄。

## Process（18 项）

| 参数                      | ConfigOptionType |                          产品范围 | 用途           |
| ------------------------- | ---------------: | --------------------------------: | -------------- |
| `layer_height`            |        `coFloat` | 0.04 mm ～ 当前最小喷嘴直径的 80% | 层高           |
| `wall_loops`              |          `coInt` |                             0～20 | 墙层数         |
| `top_shell_layers`        |          `coInt` |                             0～20 | 顶层数         |
| `bottom_shell_layers`     |          `coInt` |                             0～20 | 底层数         |
| `sparse_infill_density`   |      `coPercent` |                           0～100% | 稀疏填充       |
| `enable_support`          |         `coBool` |                      true / false | 启用支撑       |
| `support_threshold_angle` |          `coInt` |                            0～90° | 支撑阈值角     |
| `support_speed`           |       `coFloats` |                      1～1000 mm/s | 支撑速度       |
| `brim_width`              |        `coFloat` |                          0～50 mm | brim 宽度      |
| `skirt_loops`             |          `coInt` |                             0～10 | skirt 圈数     |
| `outer_wall_speed`        |       `coFloats` |                      1～1000 mm/s | 外墙速度       |
| `inner_wall_speed`        |       `coFloats` |                      1～1000 mm/s | 内墙速度       |
| `sparse_infill_speed`     |       `coFloats` |                      1～1000 mm/s | 稀疏填充速度   |
| `travel_speed`            |       `coFloats` |                      1～2000 mm/s | 空驶速度       |
| `default_acceleration`    |       `coFloats` |                    0～50000 mm/s² | 常规打印加速度 |
| `travel_acceleration`     |       `coFloats` |                    0～50000 mm/s² | 空驶加速度     |
| `outer_wall_acceleration` |       `coFloats` |                    0～50000 mm/s² | 外墙加速度     |
| `inner_wall_acceleration` |       `coFloats` |                    0～50000 mm/s² | 内墙加速度     |

## Filament（16 项）

| 参数                                | ConfigOptionType |       产品范围 | 用途                      |
| ----------------------------------- | ---------------: | -------------: | ------------------------- |
| `filament_flow_ratio`               |       `coFloats` |       0.5～1.5 | 流量比例                  |
| `filament_max_volumetric_speed`     |       `coFloats` | 0.1～100 mm³/s | 最大体积流量              |
| `nozzle_temperature`                |         `coInts` |     100～400 ℃ | 其他层喷嘴温度            |
| `nozzle_temperature_initial_layer`  |         `coInts` |     100～400 ℃ | 首层喷嘴温度              |
| `cool_plate_temp`                   |         `coInts` |       0～150 ℃ | Cool Plate 其他层         |
| `cool_plate_temp_initial_layer`     |         `coInts` |       0～150 ℃ | Cool Plate 首层           |
| `eng_plate_temp`                    |         `coInts` |       0～150 ℃ | Engineering Plate 其他层  |
| `eng_plate_temp_initial_layer`      |         `coInts` |       0～150 ℃ | Engineering Plate 首层    |
| `hot_plate_temp`                    |         `coInts` |       0～150 ℃ | High Temp Plate 其他层    |
| `hot_plate_temp_initial_layer`      |         `coInts` |       0～150 ℃ | High Temp Plate 首层      |
| `textured_plate_temp`               |         `coInts` |       0～150 ℃ | Textured PEI Plate 其他层 |
| `textured_plate_temp_initial_layer` |         `coInts` |       0～150 ℃ | Textured PEI Plate 首层   |
| `fan_min_speed`                     |       `coFloats` |        0～100% | 部件风扇最小值            |
| `fan_max_speed`                     |       `coFloats` |        0～100% | 部件风扇最大值            |
| `overhang_fan_speed`                |         `coInts` |        0～100% | 悬垂/桥接风扇             |
| `additional_cooling_fan_speed`      |         `coInts` |        0～100% | 辅助风扇                  |

附加关系：应用后的 `fan_min_speed` 不得大于 `fan_max_speed`。

## Machine 为什么只读

Machine 参数会影响硬件边界、运动、挤出机、启动/结束 G-code、设备连接与安全。`0005` 允许读取当前 machine identity 和过滤后的有效设置，但：

- `proposal.apply` 传入 `presetType: "machine"` 返回 `PRESET_TYPE_READ_ONLY`。
- `writeCapabilities.machine.access` 固定为 `read-only`，settings 为空。
- 正式面板必须显示“只读”，不能渲染保存按钮。

## 有意不支持

- 枚举、列表、多挤出机数组和任意 JSON 键。
- 支撑类型、填充图案、缝线策略等枚举项。
- 自定义 G-code、脚本、文件路径、账号、打印机连接和设备密钥。
- machine 参数。
- 超出本清单的“专家模式全参数写入”。

新增参数必须单独核对 Orca 源码中的 key、`ConfigOptionType`、nullable/序列化行为和范围，再增加规则、能力声明与测试；不能仅由前端传入一个新键。
