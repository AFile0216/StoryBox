# Canvas 快捷键与输入态规范

日期：2026-04-16

## 目标

- 保证画布快捷键在“输入态”和“编辑弹窗态”下行为一致。
- 保证全局撤销/重做可以覆盖视频编辑、视频分镜等关键编辑面板。
- 新增画布编排能力（对齐、分布、自动布局）并提供快捷键与 UI 双入口。

## 输入态拦截规则

- 默认规则：当焦点位于 `input / textarea / contentEditable` 时，画布快捷键不触发。
- 特例规则：若事件目标位于 `data-global-canvas-undo=\"true\"` 作用域内，则 `Undo/Redo` 仍可触发。
- 目的：不破坏文本输入，同时允许弹窗编辑时回退画布历史。

## 全局撤销作用域

- 通过容器属性声明：
  - `data-global-canvas-undo=\"true\"`
- 当前覆盖场景：
  - 视频分镜编辑器弹窗
  - 视频编辑器弹窗

## 画布快捷键清单

- `Ctrl/Cmd + Z`：撤销
- `Ctrl/Cmd + Shift + Z`：重做
- `Ctrl/Cmd + Y`：重做
- `Ctrl/Cmd + C`：复制选中节点
- `Ctrl/Cmd + V`：粘贴节点（上传节点支持图片粘贴优先）
- `Ctrl/Cmd + G`：分组
- `Delete / Backspace`：删除选中节点
- `Alt + Shift + ←`：左对齐
- `Alt + Shift + →`：右对齐
- `Alt + Shift + ↑`：顶对齐
- `Alt + Shift + ↓`：底对齐
- `Alt + Shift + H`：水平分布
- `Alt + Shift + V`：垂直分布
- `Alt + Shift + L`：自动布局（左到右）

## 交互入口对齐

- 顶部左侧提供快速编排按钮（左对齐、顶对齐、自动布局）。
- 顶部右侧提供 `Arrange` 菜单，展示完整编排动作与快捷键提示。
- 快捷键和按钮都走 `canvasStore` 同一组编排 API，保证行为一致。
