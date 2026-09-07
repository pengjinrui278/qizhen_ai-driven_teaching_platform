# 前端生产镜像：多阶段构建（Node 构建静态站点 -> nginx 提供服务）
# 构建上下文：仓库根目录
FROM node:22-alpine AS builder

WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# 先装依赖（利用层缓存）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# 再复制源码并静态导出到 apps/web/dist
COPY apps/web ./apps/web
ENV NODE_ENV=production
RUN pnpm --filter @mirror/web build

FROM nginx:alpine
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html
