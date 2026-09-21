import type { MetadataRoute } from "next";

// Required by `output: "export"`: metadata routes must be prerendered.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "match.build",
    short_name: "match.build",
    description: "The operating system for independent matchmakers",
    start_url: "/",
    display: "standalone",
    background_color: "#fcf9f5",
    theme_color: "#8f2239",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
