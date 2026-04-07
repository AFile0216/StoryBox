/**
 * 提示词模板分类
 */
export type PromptTemplateCategory =
  | 'style'      // 风格（写实、动漫、油画等）
  | 'scene'      // 场景（室内、户外、城市等）
  | 'character'  // 人物（表情、动作、服装等）
  | 'quality'    // 质量词（高清、细节等）
  | 'lighting'   // 光照（自然光、戏剧光等）
  | 'camera'     // 镜头（特写、广角等）
  | 'custom';    // 自定义

/**
 * 提示词模板
 */
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

/**
 * 提示词增强配置
 */
export interface PromptEnhancementConfig {
  enabled: boolean;
  autoAppendQualityTags: boolean;
  qualityTags: string;
  customPrefix: string;
  customSuffix: string;
}

/**
 * AI 优化器配置
 */
export interface AiOptimizerConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'dashscope' | 'custom';
  apiKey: string;
  baseUrl?: string;
  model: string;
  optimizationMode: 'expand' | 'refine' | 'professional';
  systemPrompt?: string;
}

/**
 * 默认的提示词增强配置
 */
export const DEFAULT_PROMPT_ENHANCEMENT_CONFIG: PromptEnhancementConfig = {
  enabled: false,
  autoAppendQualityTags: false,
  qualityTags: 'masterpiece, best quality, highly detailed',
  customPrefix: '',
  customSuffix: '',
};

/**
 * 默认的 AI 优化器配置
 */
export const DEFAULT_AI_OPTIMIZER_CONFIG: AiOptimizerConfig = {
  enabled: false,
  provider: 'openai',
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4',
  optimizationMode: 'expand',
  systemPrompt: '',
};
