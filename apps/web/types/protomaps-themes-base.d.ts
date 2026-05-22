import type { LayerSpecification } from "maplibre-gl";

declare module "protomaps-themes-base" {
  /** Vector basemap layers without symbol/glyph-heavy labels (fits NF-PRIV-01 self-hosted fonts policy). */
  export function noLabels(sourceId: string, themeName: string): LayerSpecification[];

  export function layers(
    sourceId: string,
    themeName: string,
    lang?: string,
    fontstackRegular?: string,
  ): LayerSpecification[];
}
