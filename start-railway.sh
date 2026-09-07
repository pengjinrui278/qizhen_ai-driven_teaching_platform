#!/bin/sh
set -e

# Railway 会注入 PORT 环境变量；容器内 nginx 监听该端口，
# /api 转发给本机 uvicorn。
PORT=${PORT:-8080}

cat > /etc/nginx/nginx.conf <<EOF
events { worker_connections 1024; }
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

    server {
        listen ${PORT};
        server_name _;

        location /api {
            proxy_pass http://127.0.0.1:8000;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        location / {
            root /app/dist;
            try_files \$uri \$uri.html \$uri/ /index.html;
        }
    }
}
EOF

cat > /etc/supervisor/conf.d/supervisord.conf <<EOF
[supervisord]
nodaemon=true
user=root

[program:uvicorn]
command=uvicorn mirror_api.main:app --host 127.0.0.1 --port 8000 --workers 1
directory=/app
environment=PYTHONPATH="/app/src"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g 'daemon off;'
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
