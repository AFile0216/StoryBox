const STORYBOARD_AT_TAG_REGEX = /@\s*(?:图|视频)\d+/g;
const STORYBOARD_AT_PREFIX_REGEX = /@(?=\s*(?:图|视频)\d+)/g;

export function sanitizeStoryboardText(input: string, ignoreAtTag: boolean): string {
  if (!ignoreAtTag) {
    return input.trim();
  }

  return input
    .replace(STORYBOARD_AT_TAG_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function sanitizeStoryboardPromptText(input: string): string {
  return input
    .replace(STORYBOARD_AT_PREFIX_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
