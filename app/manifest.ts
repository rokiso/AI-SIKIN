import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AI 피부 분석 및 맞춤 관리 서비스",
    short_name: "AI피부맞춤",
    description: "내 피부를 이해하고 나에게 맞는 일상 스킨케어를 알아보세요.",
    lang: "ko-KR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#047857",
    icons: [
      { src: "/icons/sikin-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/sikin-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
