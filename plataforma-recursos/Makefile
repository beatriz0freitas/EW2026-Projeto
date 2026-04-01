SHELL := /bin/sh

.PHONY: init up down logs restart ps

init:
	@if [ -f .env ]; then \
		echo ".env já existe. Não foi alterado."; \
	else \
		cp .env.example .env; \
		echo ".env criado a partir de .env.example"; \
		echo "Atualiza JWT_SECRET em .env antes de usar em ambientes partilhados."; \
	fi

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose down
	docker compose up -d --build

ps:
	docker compose ps
