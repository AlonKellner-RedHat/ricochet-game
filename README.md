# Ricochet Game

A 2D ricochet physics game built with TypeScript and Phaser, featuring WebGPU rendering when available.

## Features

- 🎮 **Phaser 3.86+** with WebGPU/WebGL rendering
- 📦 **Vite** for fast development and optimized builds
- 🔷 **TypeScript** with strict type checking
- 🧪 **Vitest** for unit testing
- 🔍 **Biome** for linting and formatting
- 🐳 **DevContainer** support for consistent development

## Prerequisites

- Node.js 18+
- npm 9+

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
make dev
# or
npm run dev
```

Open http://localhost:8000 in your browser.

## Development

### Commands

| Command | Description |
|---------|-------------|
| `make dev` | Start dev server with HMR |
| `make build` | Build for production |
| `make test` | Run tests |
| `make lint` | Check code with Biome |
| `make typecheck` | Run TypeScript checks |
| `make check` | Run all checks |

### Project Structure

```
ricochet-game/
├── src/
│   ├── main.ts           # Entry point
│   ├── config/           # Game configuration
│   ├── core/             # Core systems (Grid, Input, Debug)
│   ├── scenes/           # Phaser scenes
│   └── types/            # TypeScript definitions
├── tests/                # Unit tests
├── assets/               # Game assets
├── docs/                 # Documentation
└── scripts/              # Build scripts
```

## WebGPU Support

The game automatically detects WebGPU support and uses it when available, falling back to WebGL for broader compatibility. Press backtick (`) in-game to toggle the debug view showing renderer info.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## DevContainer

This project includes a devcontainer configuration. Open in VS Code and select "Reopen in Container" when prompted.

## License

MIT

