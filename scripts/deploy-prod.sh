#!/usr/bin/env bash
# 在生产机 /home/ubuntu/app 上执行：拉取 origin/main，重建容器，刷新课程包。
# 本机调用：ssh ubuntu@124.220.5.87 'bash /home/ubuntu/app/scripts/deploy-prod.sh'
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/app}"
cd "$APP_DIR"

if [[ ! -f .env ]]; then
  echo "缺少 $APP_DIR/.env，拒绝部署。" >&2
  exit 1
fi

git fetch origin
git reset --hard origin/main

docker compose -f compose.prod.yml up -d --build

docker compose -f compose.prod.yml exec -T api python -m mirror_api.cli seed-profiles
docker compose -f compose.prod.yml exec -T api python -m mirror_api.cli import-all-coursepacks
docker compose -f compose.prod.yml exec -T api python -m mirror_api.cli status

echo "已同步到 http://124.220.5.87/  commit=$(git rev-parse --short HEAD)"
