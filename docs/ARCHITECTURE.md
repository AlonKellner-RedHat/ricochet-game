# Architecture Overview

## Project Structure

```
ricochet-game/
├── src/
│   ├── main.ts              # Application entry point
│   ├── config/
│   │   └── gameConfig.ts    # Phaser game configuration
│   ├── core/
│   │   ├── index.ts         # Core module exports
│   │   ├── Grid.ts          # Grid system for positioning
│   │   ├── InputManager.ts  # Input handling
│   │   └── DebugView.ts     # Debug overlay system
│   ├── scenes/
│   │   ├── index.ts         # Scene exports
│   │   └── GameScene.ts     # Main game scene
│   └── types/
│       └── index.ts         # TypeScript type definitions
├── tests/
│   └── core/                # Unit tests for core systems
├── assets/
│   ├── sprites/             # Game sprites and textures
│   ├── fonts/               # Custom fonts
│   └── audio/               # Sound effects and music
├── docs/                    # Project documentation
└── scripts/                 # Build and utility scripts
```

## Core Systems

### Grid System (`src/core/Grid.ts`)
Handles spatial positioning and snapping for game objects.

### Input Manager (`src/core/InputManager.ts`)
Unified input handling for mouse/touch and keyboard.

### Debug View (`src/core/DebugView.ts`)
Runtime debug overlay for development.

## Rendering

The game uses Phaser 3.86+ with WebGPU support when available, falling back to WebGL for broader compatibility.

