import type { ImageModelDefinition } from '../../types';

export const TCNANOBANA_GEMINI_FLASH_IMAGE_MODEL_ID = 'tcnanobana/gemini-2.5-flash-image';

const ASPECT_RATIOS = [
  '1:1', '16:9', '9:16', '4:3', '3:4',
  '3:2', '2:3', '4:5', '5:4', '21:9',
] as const;

export const imageModel: ImageModelDefinition = {
  id: TCNANOBANA_GEMINI_FLASH_IMAGE_MODEL_ID,
  mediaType: 'image',
  displayName: 'Gemini 2.5 Flash Image',
  providerId: 'tcnanobana',
  providerKind: 'custom-api',
  description: 'Gemini 2.5 Flash 图像生成与编辑（TC Nano Banana 代理）',
  eta: '1min',
  expectedDurationMs: 60000,
  defaultAspectRatio: '16:9',
  defaultResolution: '1K',
  aspectRatios: ASPECT_RATIOS.map((value) => ({ value, label: value })),
  resolutions: [
    { value: '1K', label: '1K' },
    { value: '2K', label: '2K' },
    { value: '4K', label: '4K' },
  ],
  resolveRequest: ({ referenceImageCount }) => ({
    requestModel: TCNANOBANA_GEMINI_FLASH_IMAGE_MODEL_ID,
    modeLabel: referenceImageCount > 0 ? '编辑模式' : '生成模式',
  }),
};
