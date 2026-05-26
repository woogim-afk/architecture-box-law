import type { NextConfig } from "next";

const BLOG_ORIGIN = "https://box-archi.tistory.com";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // tistory 블로그에서만 iframe 허용
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors 'self' ${BLOG_ORIGIN}`,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
