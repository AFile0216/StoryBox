export interface StableReversePromptResult {
  analysis: string;
  prompts: {
    mj: Record<string, unknown>;
    nanobanana: Record<string, unknown>;
    jimeng: Record<string, unknown>;
  };
}

function sanitizeJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?/iu, '')
      .replace(/```$/u, '')
      .trim();
  }
  return trimmed;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function normalizePromptPayload(value: unknown): StableReversePromptResult['prompts'] {
  const payload = ensureObject(value);
  const defaultMj = {
    prompt: '',
    negative_prompt: '',
    style: '',
    aspect_ratio: '',
  };
  const defaultNanobanana = {
    prompt: '',
    negative_prompt: '',
    style: '',
    aspect_ratio: '',
  };
  const defaultJimeng = {
    prompt: '',
    negative_prompt: '',
    style: '',
    aspect_ratio: '',
  };
  return {
    mj: { ...defaultMj, ...ensureObject(payload.mj) },
    nanobanana: { ...defaultNanobanana, ...ensureObject(payload.nanobanana) },
    jimeng: { ...defaultJimeng, ...ensureObject(payload.jimeng) },
  };
}

function ensureAnalysis(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function normalizeReversePromptResult(
  input: unknown,
  fallbackAnalysis = 'Unable to parse model output. Returning normalized empty prompt payload.'
): StableReversePromptResult {
  const payload = ensureObject(input);
  return {
    analysis: ensureAnalysis(payload.analysis, fallbackAnalysis),
    prompts: normalizePromptPayload(payload.prompts),
  };
}

export function parseAndNormalizeReversePromptResult(
  rawText: string,
  fallbackAnalysis?: string
): StableReversePromptResult {
  const sanitized = sanitizeJsonText(rawText);
  try {
    const parsed = JSON.parse(sanitized);
    return normalizeReversePromptResult(parsed, fallbackAnalysis);
  } catch {
    return normalizeReversePromptResult({}, fallbackAnalysis);
  }
}
