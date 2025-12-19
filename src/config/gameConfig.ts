import Phaser from "phaser";
import type { GameOptions } from "@/types";

/**
 * Default game options
 */
export const DEFAULT_GAME_OPTIONS: GameOptions = {
  width: 1280,
  height: 720,
  backgroundColor: 0x1a1a2e,
  useWebGPU: true,
};

/**
 * Creates the Phaser game configuration
 * Attempts to use WebGPU renderer, falls back to WebGL if unavailable
 */
export function createGameConfig(
  scenes: Phaser.Types.Scenes.SceneType[],
  options: Partial<GameOptions> = {}
): Phaser.Types.Core.GameConfig {
  const opts = { ...DEFAULT_GAME_OPTIONS, ...options };

  return {
    type: opts.useWebGPU ? Phaser.WEBGL : Phaser.AUTO,
    width: opts.width,
    height: opts.height,
    backgroundColor: opts.backgroundColor,
    parent: "game-container",
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: scenes,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
      pixelArt: false,
      roundPixels: false,
    },
  };
}

