/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// 生产：静态导出到 dist/，由 nginx 提供服务并反代 /api
// 开发：用默认 .next/ 并把 /api 代理到本机 uvicorn
const nextConfig = {
  devIndicators: false,
  experimental: { proxyTimeout: 180000 },
  ...(isProd
    ? { output: "export", distDir: "dist" }
    : {
        distDir: ".next-dev",
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: (process.env.MIRROR_DEV_API_URL || "http://localhost:8000") + "/api/:path*",
            },
          ];
        },
      }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
