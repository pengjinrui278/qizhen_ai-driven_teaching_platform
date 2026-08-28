# 后端生产镜像
# 构建上下文：apps/api/
FROM python:3.12-slim

WORKDIR /app

# 安装依赖（pg8000 纯 Python，无需系统 libpq）
COPY pyproject.toml ./
RUN pip install --no-cache-dir -e "."

# 复制源码
COPY src ./src

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uvicorn", "mirror_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "src"]
