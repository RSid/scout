import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scout — District accessibility previews",
    short_name: "Scout DC",
    start_url: "/",
    theme_color: "var(--color-surface)",
    background_color: "var(--color-surface)",
    display: "standalone",
  };
}
