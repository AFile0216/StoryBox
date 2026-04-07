import type { PromptEnhancementConfig } from '../domain/promptTemplate';

/**
 * 提示词增强服务
 */
export class PromptEnhancer {
  /**
   * 应用提示词增强
   * @param originalPrompt 原始提示词
   * @param config 增强配置
   * @returns 增强后的提示词
   */
  applyEnhancement(
    originalPrompt: string,
    config: PromptEnhancementConfig
  ): string {
    if (!config.enabled) {
      return originalPrompt;
    }

    let enhanced = originalPrompt.trim();

    // 如果原始提示词为空，直接返回
    if (!enhanced) {
      return enhanced;
    }

    // 添加前缀
    if (config.customPrefix && config.customPrefix.trim()) {
      enhanced = `${config.customPrefix.trim()}, ${enhanced}`;
    }

    // 添加质量标签
    if (config.autoAppendQualityTags && config.qualityTags && config.qualityTags.trim()) {
      enhanced = `${enhanced}, ${config.qualityTags.trim()}`;
    }

    // 添加后缀
    if (config.customSuffix && config.customSuffix.trim()) {
      enhanced = `${enhanced}, ${config.customSuffix.trim()}`;
    }

    return enhanced;
  }

  /**
   * 预览增强效果（不修改原始提示词）
   * @param originalPrompt 原始提示词
   * @param config 增强配置
   * @returns 增强预览结果
   */
  previewEnhancement(
    originalPrompt: string,
    config: PromptEnhancementConfig
  ): { original: string; enhanced: string; hasChanges: boolean } {
    const enhanced = this.applyEnhancement(originalPrompt, config);
    return {
      original: originalPrompt,
      enhanced,
      hasChanges: enhanced !== originalPrompt,
    };
  }
}

/**
 * 全局提示词增强器实例
 */
export const promptEnhancer = new PromptEnhancer();
