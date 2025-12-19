.PHONY: dev build test lint format typecheck clean install

# Development
dev:
	npm run dev

# Build for production
build:
	npm run build

# Preview production build
preview:
	npm run preview

# Run tests
test:
	npm test

# Run tests in watch mode
test-watch:
	npm run test:watch

# Run tests with coverage
test-coverage:
	npm run test:coverage

# Lint code
lint:
	npm run lint

# Fix linting issues
lint-fix:
	npm run lint:fix

# Format code
format:
	npm run format

# Type check
typecheck:
	npm run typecheck

# Install dependencies
install:
	npm install

# Clean build artifacts
clean:
	rm -rf dist node_modules coverage

# Full check (lint + typecheck + test)
check: lint typecheck test

# Help
help:
	@echo "Available targets:"
	@echo "  dev          - Start development server with hot reload"
	@echo "  build        - Build for production"
	@echo "  preview      - Preview production build"
	@echo "  test         - Run tests"
	@echo "  test-watch   - Run tests in watch mode"
	@echo "  test-coverage- Run tests with coverage"
	@echo "  lint         - Check code with Biome"
	@echo "  lint-fix     - Fix linting issues"
	@echo "  format       - Format code"
	@echo "  typecheck    - Run TypeScript type checking"
	@echo "  install      - Install dependencies"
	@echo "  clean        - Remove build artifacts"
	@echo "  check        - Run lint, typecheck, and test"

