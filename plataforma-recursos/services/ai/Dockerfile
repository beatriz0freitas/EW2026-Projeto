FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalação de dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8000

CMD ["python3", "-c", "import http.server; http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=8000)"]
