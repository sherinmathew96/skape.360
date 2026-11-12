import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SKAPE360",
    short_name: "SKAPE360",
    description: "Studio Skape's projects, site work and team in one place.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#f8f8f8",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
