/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// 生产：静态导出到 dist/，由 nginx 提供服务并反代 /api
// 开发：用默认 .next/ 并把 /api 代理到本机 uvicorn
const nextConfig = {
  ...(isProd
    ? { output: "export", distDir: "dist" }
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:8000/api/:path*",
            },
          ];
        },
      }),
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
