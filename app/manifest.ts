import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "미루비아 MIRUVIA",
    short_name: "미루비아",
    description: "내 피부를 비추고 나만의 관리 방향을 찾다. Reflect your skin. Find your way.",
    lang: "ko-KR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#047857",
    icons: [
      { src: "/icons/skin-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/skin-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
