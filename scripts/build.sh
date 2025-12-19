#!/bin/bash
set -e

echo "🔨 Building Ricochet game..."

# Clean previous build
rm -rf dist

# Run TypeScript check
echo "📝 Type checking..."
npx tsc --noEmit

# Run linter
echo "🔍 Linting..."
npx biome check src tests

# Build for production
echo "📦 Building for production..."
npx vite build

echo "✅ Build complete! Output in dist/"

