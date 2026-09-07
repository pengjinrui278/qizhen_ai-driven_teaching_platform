# 后端生产镜像
# 构建上下文：apps/api/
FROM python:3.12-slim

WORKDIR /app

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 使用国内 PyPI 镜像，避免跨境网络导致构建失败
RUN pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/ \
 && pip config set global.trusted-host mirrors.aliyun.com

# 先复制包元数据与源码：hatchling 的可编辑安装需要 src/mirror_api 存在
COPY pyproject.toml ./
COPY src ./src

# 安装依赖（pg8000 纯 Python，无需系统 libpq）
RUN pip install --no-cache-dir -e "."

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uvicorn", "mirror_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "src"]
