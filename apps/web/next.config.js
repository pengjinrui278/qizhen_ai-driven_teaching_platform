/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  // 只在生产构建时启用静态导出到 dist/；开发时用默认 .next/，避免 dev server 读错目录
  ...(isProd ? { output: "export", distDir: "dist" } : {}),
  images: {
    unoptimized: true,
  },
  // 开发时代理 /api 到后端 uvicorn（生产环境由 nginx 反代）
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
