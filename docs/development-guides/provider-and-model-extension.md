# 自定义 API 与模型扩展指南

本文档描述当前版本的扩展方式。当前架构已经从“前端固定供应商 + 后端分别适配”切换为“前端配置多个自定义 OpenAI 兼容接口 + 后端统一 `openai-compatible` provider”。

## 1. 关键文件

- 前端接口配置：
  - `src/features/canvas/models/customInterfaces.ts`
  - `src/stores/settingsStore.ts`
  - `src/components/SettingsDialog.tsx`
- 前端模型注册：
  - `src/features/canvas/models/registry.ts`
  - `src/features/canvas/models/types.ts`
- 画布模型选择与请求下发：
  - `src/features/canvas/ui/ModelParamsControls.tsx`
  - `src/features/canvas/nodes/ImageEditNode.tsx`
  - `src/features/canvas/nodes/StoryboardGenNode.tsx`
  - `src/commands/ai.ts`
  - `src/features/canvas/infrastructure/tauriAiGateway.ts`
- Tauri 后端：
  - `src-tauri/src/commands/ai.rs`
  - `src-tauri/src/ai/mod.rs`
  - `src-tauri/src/ai/providers/mod.rs`
  - `src-tauri/src/ai/providers/openai_compatible/mod.rs`

## 2. 当前模型机制

前端不再从 `src/features/canvas/models/image/<provider>/` 静态拼装所有供应商模型。

现在的模型来自设置中的自定义接口配置：

1. 用户在设置里添加一个接口。
2. 用户在该接口下填写多个模型 ID。
3. `registry.ts` 根据接口和模型 ID 动态生成模型定义。
4. 画布节点直接展示这些动态模型。

模型 ID 的内部格式为：

```text
openai-compatible/<interfaceId>/<encodedModelName>
```

真实发送给第三方 API 的模型名来自运行时字段 `apiModel`，不是这个内部 ID。

## 3. 新增一个默认接口能力

如果只是想让某个第三方 OpenAI 兼容服务更容易被用户使用，优先考虑：

1. 在 `customInterfaces.ts` 中调整默认 `baseUrl`。
2. 或者在设置页中补充提示文案、示例模型列表。

不建议再回到“新增一个固定供应商页面卡片”的旧模式。

## 4. 后端扩展方式

当前统一走 `openai-compatible` provider。

其职责是：

- 接收前端传来的 `runtime_config`
- 读取：
  - `api_key`
  - `base_url`
  - `api_model`
- 调用：
  - `POST {base_url}/images/generations`

如果某个第三方服务依然兼容 OpenAI Images 接口，优先通过配置解决，不要再新增一个独立 provider。

只有在以下情况才建议新增新的 Rust provider：

- 请求路径与 OpenAI 兼容接口完全不同
- 鉴权方式不同
- 返回结构明显不同
- 需要任务提交 / 轮询而不是同步生成

## 5. 请求链路

当前生成链路如下：

1. 节点中选中接口与模型。
2. 节点将 `interfaceId / interfaceName / apiKey / baseUrl / apiModel` 放入 `runtimeConfig`。
3. 前端通过 `src/commands/ai.ts` 转成 snake_case 的 `runtime_config`。
4. Tauri `GenerateRequestDto` 接收后映射到 Rust 的 `GenerateRuntimeConfig`。
5. `openai-compatible` provider 使用运行时配置发起请求。

这意味着：

- 生成请求不依赖全局 mutable provider 状态
- 同时存在多个不同接口时不会串线
- 同一 provider 可以对应多个账号和多个 base URL

## 6. 验证步骤

前端改动后：

```bash
npx tsc --noEmit
npm run build
```

如涉及 Rust：

```bash
cd src-tauri
cargo check
```

如果本地 Rust 环境异常，但 GitHub Actions 正常，可优先以 Actions 构建结果为准，同时单独修复本机工具链。

## 7. 常见问题

### 7.1 设置里加了模型，但画布里没出现

- 检查是否已点击“保存”
- 检查模型列表是否一行一个
- 检查模型名是否被空格或空行清空

### 7.2 画布里能选模型，但生成时报 401/404

- 检查 Base URL 是否正确
- 检查模型名是否与第三方文档一致
- 检查该接口是否真的是 OpenAI Images 兼容接口

### 7.3 某个第三方不是 `/images/generations`

这种情况不要硬塞到当前配置里。应新增独立 Rust provider，再由前端决定是否继续暴露为通用接口或专用能力。
