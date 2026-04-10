# StoryBox

基于节点画布的 AI 分镜与媒体编排工具。  
支持图片上传/处理、文本与分镜协作、视频时间线编辑、以及本地媒体预览节点。

## 主要功能

- 节点化画布：上传图片、图片编辑、文本节点、分镜节点、视频预览节点、音频预览节点等
- 图像工作流：文本生图、图生图、超分、分镜切割与导出
- 视频编辑节点：分镜轨 + 文字轨时间线编辑，导出文本轨内容
- 媒体拖拽：支持将图片、视频、音频直接拖入画布生成对应节点
- 自动持久化：项目数据存储到 SQLite，重启后自动恢复

## 技术栈

- 前端：React 18 + TypeScript + Zustand + `@xyflow/react` + TailwindCSS
- 桌面端：Tauri 2
- 后端：Rust（Tauri Commands）
- 存储：SQLite（`rusqlite`，WAL）
- i18n：`react-i18next` + `i18next`

## 环境要求

- Node.js 20+
- npm 10+
- Rust stable（含 Cargo）
- Tauri 平台依赖（Windows/macOS）

参考文档：
- [基础工具安装配置（Windows/macOS）](./docs/development-guides/base-tools-installation.md)

## 快速开始

```bash
npm install
```

前端开发：

```bash
npm run dev
```

Tauri 联调：

```bash
npm run tauri dev
```

## 常用命令

```bash
# TypeScript 类型检查
npx tsc --noEmit

# Rust 快速检查
cd src-tauri && cargo check

# 前端构建
npm run build

# 桌面端构建
npm run tauri build
```

## 版本管理与发布

### 本地发布（推荐）

```bash
# 自动 patch 递增 + 打 tag + 推送
npm run release -- patch --notes-file docs/releases/vx.y.z.md

# 或手动指定版本
npm run release -- 0.2.0 --notes-file docs/releases/v0.2.0.md
```

### GitHub 构建自动迭代版本

已配置在工作流：`/.github/workflows/windows-exe.yml`

- 触发：`push` 到 `master/main`，或手动 `workflow_dispatch`
- 行为：构建前自动执行 patch 递增，并同步到以下文件：
  - `package.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- 自动提交消息格式：
  - `chore(ci): auto bump version to vX.Y.Z [skip ci]`

对应脚本：

```bash
# 自动递增（默认 patch）
npm run bump:version

# 指定递增级别
node scripts/auto-bump-version.mjs minor
node scripts/auto-bump-version.mjs major
```

## 项目结构（核心）

```text
src/
  features/canvas/          # 画布主流程（节点、工具、模型、UI）
  stores/                   # 全局状态与自动持久化
  commands/                 # 前端到 Tauri 命令桥接
  i18n/                     # 国际化
src-tauri/src/
  commands/                 # Rust 命令实现
  lib.rs                    # Tauri 命令注册
docs/development-guides/    # 开发文档
```

## 扩展指引

- 新模型：`src/features/canvas/models/image/<provider>/`
- 新工具：`tools/types.ts` -> `tools/builtInTools.ts` -> `ui/tool-editors/*` -> `application/toolProcessor.ts`
- 新节点：`domain/canvasNodes.ts` + `domain/nodeRegistry.ts` + `nodes/index.ts`

### 感谢 [痕继痕迹](https://space.bilibili.com/39337803?spm_id_from=333.337.search-card.all.click)
详见：
- [项目开发环境与注意事项](./docs/development-guides/project-development-setup.md)
- [供应商与模型扩展指南](./docs/development-guides/provider-and-model-extension.md)
