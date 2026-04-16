# StoryBox 对齐 LibTV 能力的兼容改造实现文档

日期：2026-04-16  
输入基线：`LibTV使用指南.docx`  
目标系统：`StoryBox (React + TypeScript + Zustand + XYFlow + Tauri/Rust + SQLite)`

## 1. 目标与落地原则

本方案用于将 LibTV 文档中的“无限画布 + 多模态节点 + 工具链 + 生成器”能力，尽量兼容到当前 StoryBox。  
本次采用分阶段落地（`P0/P1/P2`），优先完成画布交互与节点工作流兼容。

落地原则：
- 保持现有架构边界：`UI -> Store -> Application -> Infrastructure -> Persistence`。
- 节点相关能力统一通过 `domain/nodeRegistry.ts` 维护，不在 UI 层硬编码节点白名单。
- 新工具统一走 `tools/types.ts + tools/builtInTools.ts + application/toolProcessor.ts`。
- 所有新增能力必须可进入历史快照并支持撤销/重做。
- 自动持久化策略不回退（防抖 + idle + 视口轻量保存）。

## 2. 能力对齐矩阵（LibTV -> StoryBox）

| LibTV 能力 | 当前状态 | StoryBox 当前映射 | 改造结论 |
|---|---|---|---|
| 无限画布 | 已具备 | `Canvas.tsx` + ReactFlow + MiniMap | 保持，补齐画布整理能力 |
| 新建画布/项目入口 | 已具备 | 项目管理 + 画布入口 | 保持 |
| 五大基础节点（文本/图片/视频/音频/脚本） | 部分具备 | 文本/图片/视频/音频已具备；脚本无独立节点 | `P0` 通过“脚本预设节点”兼容 |
| 节点操作（拖拽/多选/分组/连接） | 已具备 | `canvasStore.ts` + `useCanvasKeyboardShortcuts.ts` | 保持，增强画布整理 |
| 工作流搭建 | 已具备 | 节点连线 + 派生节点流转 | 保持 |
| 项目菜单/左侧栏/个人中心/小地图 | 部分具备 | 标题栏/侧面板/设置页/MiniMap | UI 信息架构优化放 `P1` |
| Slash 快捷功能（九宫格/四宫格/25宫格等） | 缺失 | 无统一 Slash 能力层 | `P1` 新增 Slash Preset 引擎 |
| 图像工具：基础编辑/宫格切分/标注 | 已具备 | `crop/annotate/splitStoryboard` | 保持 |
| 图像工具：720 全景/多角度/打光/旋转镜像 | 部分缺失 | 当前无对应工具插件 | `P1` 新增工具插件 |
| 视频工具：剪辑 | 已具备 | `VideoEditorNode + VideoEditorModal` | 保持，补齐导出与任务化 |
| 视频工具：高清/解析/合成 | 部分缺失 | 现有 `VideoNode` 任务模式不完整 | `P1` 扩展视频任务模式 |
| 图像生成器（风格/焦点/镜头） | 部分具备 | 现有模型参数 + 提示词增强 | `P2` 做生成器面板归一 |
| 视频生成器（主体库） | 部分缺失 | 当前无“主体库”抽象 | `P2` 新增素材库层 |
| 模型清单（图像/视频/LLM/音频） | 部分具备 | 图像模型体系较完整 | `P2` 统一能力清单与路由 |
| 快捷键体系文档化 | 部分具备 | 代码中存在但无完整可视文档 | `P0` 先补规范，`P2` 补 UI 帮助 |

## 3. 总体架构改造

### 3.1 新增“能力编排层”而非散点功能

新增 `SlashPreset` 与 `ToolTask` 两个抽象，避免在节点组件里堆业务分支：

- `SlashPreset`：描述“快速创建一组节点 + 默认参数 + 连线策略”。
- `ToolTask`：描述“对输入媒体执行工具/模型任务 + 输出策略（新节点/覆盖）”。

### 3.2 关键公共接口新增

1) Slash 预设接口（`P1`）

```ts
export type SlashPresetId =
  | 'multicam_9'
  | 'story_drama_4'
  | 'story_continuity_25'
  | 'character_triple_view'
  | 'scene_plus_3s'
  | 'scene_minus_5s'
  | 'cinematic_lighting_fix';

export interface SlashPresetDefinition {
  id: SlashPresetId;
  title: string;
  category: 'storyboard' | 'character' | 'temporal' | 'lighting';
  createAtCursor: boolean;
  createPlan: (ctx: SlashPresetContext) => SlashExecutionPlan;
}
```

2) 工具插件扩展接口（`P1`）

```ts
export type ToolCategory = 'image' | 'video';

export interface CanvasToolPlugin {
  // existing fields...
  category?: ToolCategory;
  outputNodePolicy?: 'derived-node' | 'in-place';
  asyncTaskType?: string;
}
```

3) 节点流程追踪字段（`P0`）

```ts
interface WorkflowTraceData {
  workflowTag?: string | null;
  sourcePresetId?: string | null;
  taskTraceId?: string | null;
}
```

说明：该字段并入各节点 data 的可选字段，不破坏历史项目反序列化。

## 4. 分阶段实施

## P0：画布交互与节点工作流兼容（优先）

目标：让核心创作流与 LibTV 一致可用，优先保证可编排、可撤销、可恢复。

实施项：
- 统一“脚本节点”兼容策略：不新增独立 node type；用 `textAnnotationNode` 的 `mode='plain-text'` + 菜单“脚本预设”入口实现兼容。
- 规范节点创建入口：双击空白、连线创建、菜单创建三条路径统一走 registry 推导。
- 全局撤销一致化：画布 + 视频编辑 + 视频分镜保持一致（已具备基础，纳入验收基线）。
- 画布整理能力（新增）：`align left/right/top/bottom`、`distribute horizontal/vertical`、`auto-layout LR`。
- 快捷键规范补齐：`Ctrl/Cmd+Z`、`Ctrl/Cmd+Shift+Z`、`Ctrl/Cmd+Y`、`Ctrl/Cmd+C/V`、`Ctrl/Cmd+G`、`Delete/Backspace` 的输入态与弹窗态规则文档化。
- 新增开发文档章节：快捷键冲突规约、输入态豁免规则、全局撤销作用域 `data-global-canvas-undo="true"` 使用规范。

交付件：
- 画布整理 API 与 UI 入口。
- 脚本预设节点入口。
- 快捷键与撤销一致性文档。

验收标准：
- 画布内多选/分组/复制粘贴/撤销重做全链路可用。
- 视频编辑/视频分镜弹窗内可触发全局撤销，不破坏输入体验。
- 新建脚本预设节点后可参与连线、持久化、恢复、历史回放。

## P1：工具能力与 Slash 快捷能力兼容

目标：补齐 LibTV 文档中高频工具能力，形成“快捷预设 -> 执行链路 -> 输出节点”闭环。

实施项：
- 新增 Slash Preset 注册与执行层。
- 首批预设接入：
  - 多机位九宫格（`3x3`）
  - 剧情推演四宫格（`2x2`）
  - 25 宫格连贯分镜（`5x5`）
  - 角色三视图（`1x3`）
  - 画面推演 +3s / -5s（时序预设）
  - 电影级光影矫正（工具预设组合）
- 图像工具插件新增：
  - `rotateMirror`（旋转/水平镜像/垂直镜像）
  - `panorama720`（全景输入 + 4/12 视角截图）
  - `multiAngle`（多角度衍生图）
  - `lighting`（光照增强/方向打光）
- 视频工具任务扩展：
  - `video-enhance`
  - `video-parse`
  - `video-merge`
- 所有工具统一输出策略：默认产出派生节点，不覆盖源节点。

交付件：
- `slash preset` 模块与节点菜单/命令入口。
- 新工具插件与处理器接入。
- 视频任务模式与状态提示更新。

验收标准：
- 任意 Slash 预设可一键创建节点组合并自动连线。
- 图像/视频工具执行后生成可追溯派生节点。
- 工具失败时节点状态与错误提示一致（`taskStatus='error'` + message）。

## P2：生成器能力层与模型清单兼容

目标：将“图像生成器/视频生成器/模型清单”统一为可配置、可维护能力层。

实施项：
- 生成器面板统一：
  - 图像生成：风格、焦点编辑、镜头聚焦、摄像机控制作为参数组。
  - 视频生成：主体库选择 + 视频任务模式参数组。
- 能力清单统一：
  - 图像/视频/LLM/音频模型清单配置格式统一。
  - 设置页与模型注册保持单一事实源。
- 主体库（素材库）抽象：
  - 支持收藏、标签、检索、引用到视频/分镜节点。
- 快捷键帮助面板：
  - 将当前快捷键输出到可视文档与帮助弹窗。

交付件：
- 生成器统一参数面板。
- 模型能力清单文档 + 配置字段。
- 主体库最小可用实现（MVP）。

验收标准：
- 不同 provider/模型切换后，节点参数面板可正确联动。
- 主体库素材可稳定引用到视频/分镜流程。
- 快捷键帮助与实际行为一致，无冲突键位。

## 5. 受影响模块清单（开发入口）

- 节点域模型：`src/features/canvas/domain/canvasNodes.ts`
- 节点注册：`src/features/canvas/domain/nodeRegistry.ts`
- 画布主流程：`src/features/canvas/Canvas.tsx`
- 快捷键：`src/features/canvas/hooks/useCanvasKeyboardShortcuts.ts`
- 工具注册与处理：`src/features/canvas/tools/*`、`src/features/canvas/application/toolProcessor.ts`
- 节点菜单：`src/features/canvas/NodeSelectionMenu.tsx`
- 视频节点链路：`src/features/canvas/nodes/VideoNode.tsx`、`VideoEditorNode.tsx`、`VideoStoryboardNode.tsx`
- i18n：`src/i18n/locales/zh.json`、`src/i18n/locales/en.json`

## 6. 测试与验收计划

### 6.1 自动检查

```bash
npx tsc --noEmit
cd src-tauri && cargo check
npm run build
```

### 6.2 手测主路径

- 路径 A：新建项目 -> 新建脚本预设节点 -> 连接分镜生成 -> 生成 -> 撤销/重做 -> 重启恢复。
- 路径 B：视频节点 -> 视频分镜 -> 视频编辑 -> 在弹窗输入态使用撤销/重做 -> 关闭重开验证状态一致。
- 路径 C：执行 Slash 预设（9 宫格/4 宫格/25 宫格）-> 自动建链 -> 调整布局 -> 持久化恢复。
- 路径 D：图像工具（切分/标注/旋转镜像）-> 派生节点产出 -> 导出验证。
- 路径 E：视频工具（剪辑/解析/合成）-> 任务状态 -> 输出节点验证。

### 6.3 回归关注点

- 拖拽与缩放性能无明显回退。
- 节点历史快照体积可控，无频繁无效写入。
- 旧项目 JSON 反序列化不报错（新增字段必须 optional）。

## 7. 风险与回滚

主要风险：
- Slash 与工具扩展后，节点数据字段增长导致历史快照膨胀。
- 视频任务模式增加后，UI 分支复杂度上升。
- 快捷键扩展可能与输入态冲突。

控制策略：
- 所有新增字段可选并提供默认值。
- 新任务模式通过 feature flag 控制发布。
- 快捷键逻辑统一在 hook 层，不在组件内散落监听。

回滚策略：
- 按阶段开关回滚（P1/P2 能力可单独关闭）。
- 保留旧任务模式兼容路径，避免持久化数据无法读取。

## 8. 里程碑交付定义

- `P0 Done`：核心工作流兼容完成，可稳定生产使用。
- `P1 Done`：Slash 与工具能力达到 LibTV 高频使用覆盖。
- `P2 Done`：生成器与模型能力层完成统一，形成长期可扩展架构。

