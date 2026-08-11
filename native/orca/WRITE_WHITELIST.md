# Orca 原生写入白名单

本文是 `0005-expand-safe-process-filament-write-whitelist.patch` 的唯一参数清单。目标是覆盖普通工艺与耗材调整，不做任意参数编辑器。

## 统一规则

- 只接受 `process` 与 `filament`；`machine` 始终只读。
- 所有修改都先进入预设助手面板，面板逐项显示修改前、修改后、理由和保存目标；只有用户点击批准后才由 Orca 原生端应用。
- 参数键必须在下方静态白名单内，Orca 当前配置中必须存在该键，实际 `ConfigOptionType` 必须与规则完全一致。
- 单值项只接受一个布尔值或有限数值。按喷嘴保存的普通参数可接受单值或 1～16 个逗号分隔值，例如 `30,30`；单值由 Orca 原生端按当前真实值数量广播，显式多值必须与当前数量一致，不能借此增删喷嘴槽位。
- 布尔项只接受 JSON `true` / `false`；布尔多值只接受 Orca 序列化形式，例如 `1,1`。数值多值逐项进行类型和范围验证。
- 对象、嵌套数组、分号列表、空值、`nil`、非有限数值以及超范围值全部拒绝。
- 整个 changes 对象全部验证通过后才一次应用，沿用 revision、预设 identity、保存验证和 rollback guard。
- 能力声明中的 `valueShape` 会明确标注 `scalar` 或 `scalar-or-vector`；多值项同时声明 `scalarBehavior: broadcast-to-current-value-count`，范围由同一补丁中的 `WriteRule` 返回给面板。

## Process（47 项）

### 质量与强度

- `layer_height`
- `initial_layer_print_height`
- `wall_loops`
- `top_shell_layers`
- `bottom_shell_layers`
- `sparse_infill_density`
- `bridge_flow`

### 支撑

- `enable_support`
- `support_threshold_angle`
- `support_speed`
- `support_interface_speed`
- `support_top_z_distance`
- `support_bottom_z_distance`
- `support_base_pattern_spacing`
- `support_angle`
- `support_interface_top_layers`
- `support_interface_bottom_layers`
- `support_interface_spacing`
- `support_bottom_interface_spacing`
- `support_expansion`
- `support_interface_loop_pattern`
- `support_object_xy_distance`
- `support_object_first_layer_gap`
- `support_on_build_plate_only`
- `support_critical_regions_only`
- `support_interface_not_for_body`
- `independent_support_layer_height`
- `tree_support_wall_count`

### 裙边、筏层、速度与加速度

- `brim_width`
- `skirt_loops`
- `skirt_distance`
- `skirt_height`
- `raft_layers`
- `initial_layer_speed`
- `outer_wall_speed`
- `inner_wall_speed`
- `sparse_infill_speed`
- `internal_solid_infill_speed`
- `top_surface_speed`
- `gap_infill_speed`
- `travel_speed`
- `default_acceleration`
- `travel_acceleration`
- `initial_layer_acceleration`
- `outer_wall_acceleration`
- `inner_wall_acceleration`
- `top_surface_acceleration`

## Filament（33 项）

### 流量、温度与耗材物性

- `filament_flow_ratio`
- `filament_max_volumetric_speed`
- `nozzle_temperature`
- `nozzle_temperature_initial_layer`
- `cool_plate_temp`
- `cool_plate_temp_initial_layer`
- `eng_plate_temp`
- `eng_plate_temp_initial_layer`
- `hot_plate_temp`
- `hot_plate_temp_initial_layer`
- `textured_plate_temp`
- `textured_plate_temp_initial_layer`
- `chamber_temperature`
- `filament_shrink`
- `filament_shrinkage_compensation_z`
- `filament_density`
- `filament_cost`
- `filament_diameter`

### 冷却与压力提前

- `fan_min_speed`
- `fan_max_speed`
- `overhang_fan_speed`
- `additional_cooling_fan_speed`
- `fan_cooling_layer_time`
- `slow_down_layer_time`
- `slow_down_min_speed`
- `close_fan_the_first_x_layers`
- `full_fan_speed_layer`
- `enable_overhang_bridge_fan`
- `slow_down_for_layer_cooling`
- `reduce_fan_stop_start_freq`
- `dont_slow_down_outer_wall`
- `enable_pressure_advance`
- `pressure_advance`

附加关系：每个对应喷嘴槽位的 `fan_min_speed` 都不得大于 `fan_max_speed`。

## Machine 为什么只读

Machine 参数会影响硬件边界、运动、挤出机、启动/结束 G-code、设备连接与安全。`proposal.apply` 传入 `presetType: "machine"` 返回 `PRESET_TYPE_READ_ONLY`，能力声明固定为 `read-only`，面板不提供批准写入操作。

## 有意不支持

- 枚举、任意 JSON 键和复杂对象；例如支撑类型、填充图案、缝线策略。
- 自定义 G-code、脚本、文件路径、账号、打印机连接和设备密钥。
- machine 参数、喷嘴槽位数量变更和 `nil` 继承状态写入。
- 超出本清单的“专家模式全参数写入”。

新增参数仍需单独核对 Orca 源码中的 key、`ConfigOptionType`、nullable/序列化行为和范围，并同步增加规则、能力声明与测试；不能只由前端传入一个新键。
