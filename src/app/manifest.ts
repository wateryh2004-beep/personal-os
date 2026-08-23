import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/personal-os",
    name: "Personal OS",
    short_name: "Personal OS",
    description: "A private personal operating system",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#f5f5f7",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
