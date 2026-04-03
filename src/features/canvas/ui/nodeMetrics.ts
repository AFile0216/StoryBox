function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveAdaptiveHandleStyle(width?: number, height?: number) {
  const basis = Math.min(width ?? 240, height ?? 200);
  const size = clamp(Math.round(basis * 0.035), 10, 16);
  const offset = Math.max(6, Math.round(size * 0.6));

  return {
    width: size,
    height: size,
    borderWidth: 2,
    left: -offset,
    right: -offset,
  };
}

export function resolveResponsiveTextScale(width?: number, height?: number) {
  const basis = Math.min(width ?? 360, height ?? 280);
  if (basis < 240) {
    return 'compact';
  }
  if (basis > 520) {
    return 'comfortable';
  }
  return 'regular';
}
