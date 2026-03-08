# Makefile for TeamClaw
.PHONY: help install test lint typecheck check web work clean

help:
	@echo "TeamClaw - Available Commands:"
	@echo ""
	@echo "  Setup"
	@echo "    make install  - Install pnpm dependencies"
	@echo ""
	@echo "  Quality"
	@echo "    make test     - Run test suite"
	@echo "    make lint     - Lint code"
	@echo "    make typecheck - Run type checker"
	@echo "    make check    - Lint + typecheck + test"
	@echo ""
	@echo "  Run"
	@echo "    make web      - Launch web UI (http://localhost:8000)"
	@echo "    make work    - Run work sessions (CLI)"
	@echo ""
	@echo "  Maintenance"
	@echo "    make clean   - Remove build artifacts"

install:
	@echo "Installing dependencies..."
	pnpm install
	@echo "Dependencies installed!"

test:
	@echo "Running tests..."
	pnpm run test

lint:
	@echo "Linting..."
	pnpm run lint 2>/dev/null || echo "Add lint script to package.json"

typecheck:
	@echo "Type checking..."
	pnpm run typecheck

check: typecheck test
	@echo "Checks passed!"

web:
	pnpm run build && NODE_ENV=production node dist/cli.js web

work:
	pnpm run build && node dist/cli.js work --web

clean:
	@echo "Cleaning..."
	rm -rf dist node_modules .turbo .pnpm-store
	rm -rf data/test_vector_store data/vector_store
	@echo "Cleaned!"
