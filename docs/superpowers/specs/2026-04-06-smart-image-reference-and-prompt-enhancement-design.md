# 智能图片引用与提示词优化系统设计

## 概述

为 StoryBox 添加智能图片引用解析和分层提示词优化功能，解决当前只能发送所有上游图片的问题，并提供提示词增强能力。

## 问题描述

**当前问题：**
1. 节点生成时会将所有连接的上游图片发送给 AI 模型
2. 无法精确控制使用哪些图片
3. 缺少提示词优化和模板管理功能

**用户需求：**
1. 通过 `@图1` `@图2` 标记精确引用特定图片
2. 只发送被引用的图片给 AI 模型
3. 提供内置提示词模板库
4. 支持可选的 AI 提示词优化

## 解决方案

### 方案选择：混合方案（方案 C）

**图片引用处理：**
- 解析提示词中的 `@图N` 标记
- 只发送被引用的图片
- 无引用时发送所有图片（向后兼容）

**提示词优化：**
- 基础层：内置模板库 + 自动质量词增强
- 高级层：可选的 AI 优化服务

## 架构设计

### 1. 模块结构

```
src/features/prompt-enhancement/
  ├── domain/
  │   ├── promptTemplate.ts        # 提示词模板数据结构
  │   └── enhancementConfig.ts     # 增强配置类型
  ├── application/
  │   ├── templateManager.ts       # 模板管理服务
  │   ├── promptEnhancer.ts        # 提示词增强逻辑
  │   └── aiOptimizer.ts           # AI 优化器（可选）
  ├── infrastructure/
  │   └── builtInTemplates.ts      # 内置模板库
  └── ui/
      ├── PromptTemplateDialog.tsx # 模板选择对话框
      └── PromptEnhanceButton.tsx  # 增强按钮组件
```

### 2. 数据流

```
用户输入提示词
  → 解析 @图N 标记
  → 过滤引用的图片
  → 应用提示词增强（如果启用）
  → 调用 AI 优化（如果启用）
  → 发送到 AI 模型
```

## 数据结构

### 提示词模板

```typescript
export interface PromptTemplate {
  id: string;
  name: string;
  category: PromptTemplateCategory;
  content: string;
  description?: string;
  tags?: string[];
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export type PromptTemplateCategory =
  | 'style'      // 风格
  | 'scene'      // 场景
  | 'character'  // 人物
  | 'quality'    // 质量词
  | 'lighting'   // 光照
  | 'camera'     // 镜头
  | 'custom';    // 自定义
```

### 增强配置

```typescript
export interface PromptEnhancementConfig {
  enabled: boolean;
  autoAppendQualityTags: boolean;
  qualityTags: string;
  customPrefix: string;
  customSuffix: string;
}

export interface AiOptimizerConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'dashscope' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
  optimizationMode: 'expand' | 'refine' | 'professional';
  systemPrompt?: string;
}
```

### Settings Store 扩展

```typescript
interface SettingsState {
  // ... 现有字段
  promptEnhancement: PromptEnhancementConfig;
  aiOptimizer: AiOptimizerConfig;
  promptTemplates: PromptTemplate[];
}
```

### 节点数据扩展

```typescript
interface StoryboardGenNodeData {
  // ... 现有字段
  originalPrompt?: string;
  enhancedPrompt?: string;
  optimizationHistory?: {
    timestamp: number;
    original: string;
    enhanced: string;
    mode: string;
  }[];
}
```

## 核心功能实现

### 1. 图片引用解析

**文件：** `src/features/canvas/application/referenceTokenEditing.ts`

```typescript
// 新增导出函数
export function extractReferencedImageIndices(
  text: string,
  maxImageCount?: number
): number[] {
  const tokens = findReferenceTokens(text, maxImageCount);
  const indices = tokens.map(t => t.value - 1); // @图1 -> index 0
  return [...new Set(indices)].sort((a, b) => a - b);
}

export function filterReferencedImages(
  allImages: string[],
  prompt: string
): string[] {
  const referencedIndices = extractReferencedImageIndices(prompt, allImages.length);

  // 如果没有引用标记，返回所有图片（向后兼容）
  if (referencedIndices.length === 0) {
    return allImages;
  }

  // 只返回被引用的图片
  return referencedIndices
    .filter(idx => idx >= 0 && idx < allImages.length)
    .map(idx => allImages[idx]);
}
```

### 2. 提示词增强服务

**文件：** `src/features/prompt-enhancement/application/promptEnhancer.ts`

```typescript
export class PromptEnhancer {
  applyEnhancement(
    originalPrompt: string,
    config: PromptEnhancementConfig
  ): string {
    if (!config.enabled) {
      return originalPrompt;
    }

    let enhanced = originalPrompt.trim();

    // 添加前缀
    if (config.customPrefix) {
      enhanced = `${config.customPrefix.trim()}, ${enhanced}`;
    }

    // 添加质量标签
    if (config.autoAppendQualityTags && config.qualityTags) {
      enhanced = `${enhanced}, ${config.qualityTags.trim()}`;
    }

    // 添加后缀
    if (config.customSuffix) {
      enhanced = `${enhanced}, ${config.customSuffix.trim()}`;
    }

    return enhanced;
  }
}
```

### 3. AI 优化器服务

**文件：** `src/features/prompt-enhancement/application/aiOptimizer.ts`

```typescript
export class AiPromptOptimizer {
  async optimize(
    prompt: string,
    config: AiOptimizerConfig
  ): Promise<string> {
    if (!config.enabled || !config.apiKey) {
      return prompt;
    }

    const systemPrompt = this.buildSystemPrompt(config.optimizationMode);
    const optimized = await this.callAiApi(prompt, systemPrompt, config);
    return optimized;
  }

  private buildSystemPrompt(mode: string): string {
    const prompts = {
      expand: '你是一个专业的 AI 绘画提示词专家。请扩展用户的提示词，添加更多细节描述，但保持原意不变。只返回优化后的提示词，不要解释。',
      refine: '你是一个专业的 AI 绘画提示词专家。请精简和优化用户的提示词，去除冗余，保留核心要素。只返回优化后的提示词，不要解释。',
      professional: '你是一个专业的 AI 绘画提示词专家。请将用户的提示词转换为专业的艺术描述，添加摄影术语、艺术风格等。只返回优化后的提示词，不要解释。'
    };
    return prompts[mode] || prompts.expand;
  }
}
```

### 4. 节点生成逻辑修改

**修改文件：**
- `src/features/canvas/nodes/StoryboardGenNode.tsx`
- `src/features/canvas/nodes/ImageEditNode.tsx`

```typescript
const handleGenerate = async () => {
  const rawPrompt = promptText;

  // 1. 过滤引用的图片
  const filteredImages = filterReferencedImages(incomingImages, rawPrompt);

  // 2. 应用基础增强
  const enhancedPrompt = promptEnhancer.applyEnhancement(
    rawPrompt,
    settings.promptEnhancement
  );

  // 3. 可选：AI 优化
  const finalPrompt = settings.aiOptimizer.enabled
    ? await aiOptimizer.optimize(enhancedPrompt, settings.aiOptimizer)
    : enhancedPrompt;

  // 4. 发送到 AI 模型
  await canvasAiGateway.submitGenerateImageJob({
    prompt: finalPrompt,
    referenceImages: filteredImages, // 只发送被引用的图片
    // ... 其他参数
  });
};
```

## UI 组件

### 1. 设置界面扩展

在 `SettingsDialog.tsx` 中添加两个新的设置区域：

**提示词增强设置：**
- 启用/禁用开关
- 自动添加质量标签开关
- 质量标签文本框
- 自定义前缀文本框
- 自定义后缀文本框
- 管理模板库按钮

**AI 优化器设置：**
- 启用/禁用开关
- AI 服务商选择（OpenAI / Anthropic / 通义千问 / 自定义）
- API Key 输入
- 模型名称输入
- 优化模式选择（扩展 / 精简 / 专业）

### 2. 提示词模板管理对话框

**文件：** `src/features/prompt-enhancement/ui/PromptTemplateDialog.tsx`

功能：
- 分类标签页（全部 / 风格 / 场景 / 人物 / 质量 / 光照 / 镜头 / 自定义）
- 模板卡片网格展示
- 插入、编辑、删除操作
- 创建新模板按钮

### 3. 节点增强按钮

在提示词输入框旁边添加：
- 模板选择按钮（图书馆图标）
- AI 优化按钮（星星图标，仅在启用时显示）
- 预览增强效果按钮（眼睛图标）

## 内置模板库

提供 12+ 个内置模板，涵盖：

**风格类：**
- 写实风格
- 动漫风格
- 油画风格

**质量类：**
- 高质量
- 专业级

**光照类：**
- 自然光
- 戏剧光

**镜头类：**
- 特写镜头
- 广角镜头

**场景类：**
- 室内场景
- 户外场景

**人物类：**
- 开心表情
- 奔跑动作

## 错误处理

### 图片引用验证

```typescript
export function validateImageReferences(
  prompt: string,
  availableImageCount: number
): { valid: boolean; warnings: string[] } {
  const referencedIndices = extractReferencedImageIndices(prompt, availableImageCount);
  const warnings: string[] = [];

  for (const index of referencedIndices) {
    if (index >= availableImageCount) {
      warnings.push(`@图${index + 1} 引用的图片不存在（只有 ${availableImageCount} 张图片）`);
    }
  }

  return { valid: warnings.length === 0, warnings };
}
```

### AI 优化错误处理

- API 调用失败：显示友好错误提示
- 网络超时：30 秒超时机制
- 配置错误：验证 API Key 和模型名称

## Tauri 命令扩展

**新增文件：** `src-tauri/src/commands/ai_optimizer.rs`

```rust
#[tauri::command]
pub async fn optimize_prompt(
    prompt: String,
    provider: String,
    api_key: String,
    base_url: Option<String>,
    model: String,
    system_prompt: String,
) -> Result<String, String> {
    match provider.as_str() {
        "openai" => optimize_with_openai(prompt, api_key, model, system_prompt).await,
        "anthropic" => optimize_with_anthropic(prompt, api_key, model, system_prompt).await,
        "dashscope" => optimize_with_dashscope(prompt, api_key, model, system_prompt).await,
        "custom" => optimize_with_custom(prompt, api_key, base_url, model, system_prompt).await,
        _ => Err("不支持的 AI 服务商".to_string()),
    }
}
```

## 实现顺序

### 阶段 1：核心功能（必须）

1. 扩展 `referenceTokenEditing.ts`，添加图片引用解析函数
2. 修改 `StoryboardGenNode.tsx` 和 `ImageEditNode.tsx` 的生成逻辑
3. 应用图片过滤
4. 基础测试验证

**预计工作量：** 2-3 小时

### 阶段 2：基础增强（推荐）

1. 创建提示词增强模块结构
2. 实现 `PromptEnhancer` 类
3. 扩展 Settings Store
4. 创建内置模板库
5. 实现设置界面 UI（提示词增强部分）
6. 实现模板管理对话框
7. 在节点中添加模板选择按钮

**预计工作量：** 4-6 小时

### 阶段 3：高级功能（可选）

1. 实现 `AiPromptOptimizer` 类
2. 添加 Tauri 命令（Rust 侧）
3. 实现设置界面 UI（AI 优化部分）
4. 在节点中添加 AI 优化按钮
5. 实现优化历史记录

**预计工作量：** 6-8 小时

## 测试策略

### 单元测试

```typescript
// 图片引用解析测试
describe('图片引用解析', () => {
  test('正确提取单个引用', () => {
    const prompt = '一个女孩站在 @图1 的场景中';
    const indices = extractReferencedImageIndices(prompt, 3);
    expect(indices).toEqual([0]);
  });

  test('正确提取多个引用', () => {
    const prompt = '@图1 的场景，@图3 的服装，@图2 的光线';
    const indices = extractReferencedImageIndices(prompt, 5);
    expect(indices).toEqual([0, 1, 2]);
  });

  test('无引用时返回所有图片', () => {
    const images = ['img1.jpg', 'img2.jpg', 'img3.jpg'];
    const filtered = filterReferencedImages(images, '一个美丽的场景');
    expect(filtered).toEqual(images);
  });
});

// 提示词增强测试
describe('提示词增强', () => {
  test('添加质量标签', () => {
    const config = {
      enabled: true,
      autoAppendQualityTags: true,
      qualityTags: 'masterpiece, best quality',
      customPrefix: '',
      customSuffix: '',
    };
    const result = promptEnhancer.applyEnhancement('一个女孩', config);
    expect(result).toBe('一个女孩, masterpiece, best quality');
  });
});
```

### 集成测试

1. 创建测试项目，连接多个图片节点
2. 在提示词中使用 `@图1` `@图2` 标记
3. 验证只有被引用的图片被发送
4. 测试无引用时的向后兼容性

## 向后兼容性

- 无 `@图N` 标记时，保持原有行为（发送所有图片）
- 新增配置项默认关闭
- 节点数据字段为可选，不破坏现有项目
- 数据库无需迁移

## 性能考虑

- 图片引用解析：O(n) 复杂度，性能影响极小
- 模板库：内存缓存，避免重复读取
- AI 优化：异步调用，不阻塞 UI，30 秒超时
- 大量模板：虚拟滚动优化

## 安全考虑

- API Key 加密存储
- 敏感信息不记录到日志
- AI 优化请求添加速率限制
- 验证用户输入，防止注入攻击

## 未来扩展

1. 支持更多 AI 服务商
2. 提示词翻译功能（中文 → 英文）
3. 提示词历史记录和收藏
4. 社区模板分享
5. 批量应用模板到多个节点

## 总结

本设计方案通过智能图片引用解析和分层提示词优化，解决了当前系统的核心痛点，同时保持向后兼容性和良好的扩展性。分阶段实现策略确保核心功能优先交付，高级功能按需开发。
