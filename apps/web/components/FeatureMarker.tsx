export function obstacleMarkerSlug(categoryId: string): string {
  if (categoryId.startsWith("curb")) {
    return "triangle";
  }

  if (categoryId.includes("barrier")) {
    return "diamond";
  }

  return "pill";
}

export function FeatureMarkerAriaLabel(kind: string, categoryLabel: string): string {
  return `${kind}: ${categoryLabel}`;
}
