# Makefile
# ------------------------------------------------------------
# Developer-facing command interface for Vantage.
#
# Important:
# - The Makefile should stay thin.
# - Do not put core build/test/migration logic here.
# - Delegate actual work to scripts in /scripts.
#
# Responsibility split:
# - Makefile: convenient command interface
# - scripts/build.sh: actual build/test/artifact workflow
# - scripts/setup-first.sh: first-time local setup
# - scripts/migrate.sh: controlled database migrations
# - docker compose: runtime orchestration
# ------------------------------------------------------------
SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help start stop restart logs build build-first setup-first test migrate clean

help:
	@echo "Vantage developer commands:"
	@echo ""
	@echo "  make start        Start Docker services only"
	@echo "  make stop         Stop Docker services only"
	@echo "  make restart      Restart Docker services"
	@echo "  make logs         View Docker logs"
	@echo "  make build        Run tests, then build Docker artifacts"
	@echo "  make build-first  First-time build with setup/migrations"
	@echo "  make setup-first  Prepare first-time local/dev environment"
	@echo "  make test         Run test suite"
	@echo "  make migrate      Run controlled database migrations"
	@echo "  make clean        Stop services and remove local containers"
	@echo ""

start:
	$(COMPOSE) up -d

stop:
	$(COMPOSE) stop

restart:
	$(COMPOSE) stop
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

build:
	./scripts/build.sh

build-first:
	./scripts/build.sh --first

setup-first:
	./scripts/setup-first.sh

test:
	./scripts/test.sh

migrate:
	./scripts/migrate.sh

clean:
	$(COMPOSE) down
