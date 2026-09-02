/** A rectangle in the fixed logical game coordinate space. */
export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function rectFromCenter(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): LayoutRect {
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

export function clampRectToBounds(rect: LayoutRect, bounds: LayoutRect): LayoutRect {
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, bounds.x), bounds.x + bounds.width - rect.width),
    y: Math.min(Math.max(rect.y, bounds.y), bounds.y + bounds.height - rect.height),
  };
}

export function rectsOverlap(a: LayoutRect, b: LayoutRect, padding = 0): boolean {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

/**
 * Pick the first candidate that stays inside the safe bounds and does not
 * cover any important scene element. Candidates are intentionally ordered by
 * the caller so placement priority stays visible at the call site.
 */
export function chooseLayoutRect(
  candidates: readonly LayoutRect[],
  bounds: LayoutRect,
  obstacles: readonly LayoutRect[],
  padding = 0,
): LayoutRect | null {
  for (const candidate of candidates) {
    const clamped = clampRectToBounds(candidate, bounds);
    if (obstacles.every((obstacle) => !rectsOverlap(clamped, obstacle, padding))) {
      return clamped;
    }
  }
  return null;
}
