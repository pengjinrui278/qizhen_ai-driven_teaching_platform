# 前端生产镜像：多阶段构建（Node 构建静态站点 -> Caddy 提供服务与自动 HTTPS）
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
COPY apps/windows-helper ./apps/windows-helper
COPY scripts/build-windows-helper.cjs ./scripts/build-windows-helper.cjs
ARG NEXT_PUBLIC_ICP_NUMBER=""
ARG NEXT_PUBLIC_PUBLIC_SECURITY_NUMBER=""
ARG NEXT_PUBLIC_PUBLIC_SECURITY_URL=""
ENV NEXT_PUBLIC_ICP_NUMBER=$NEXT_PUBLIC_ICP_NUMBER
ENV NEXT_PUBLIC_PUBLIC_SECURITY_NUMBER=$NEXT_PUBLIC_PUBLIC_SECURITY_NUMBER
ENV NEXT_PUBLIC_PUBLIC_SECURITY_URL=$NEXT_PUBLIC_PUBLIC_SECURITY_URL
ENV NODE_ENV=production
RUN pnpm --filter @mirror/web build

FROM caddy:2-alpine
COPY --from=builder /repo/apps/web/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
