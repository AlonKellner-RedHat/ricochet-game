import type { GameOptions } from "@/types";
import Phaser from "phaser";

/**
 * Default game options
 */
export const DEFAULT_GAME_OPTIONS: GameOptions = {
  width: 1280,
  height: 720,
  backgroundColor: 0x1a1a2e,
  useWebGPU: false,
  /**
   * Force Canvas renderer instead of WebGL.
   * Canvas mode properly supports ERASE blend mode (destination-out),
   * which is needed for correct multi-stage visibility overlay rendering.
   * Set to true if you see incorrect overlay brightness ordering.
   */
  forceCanvas: true,
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

  // Determine renderer type:
  // - forceCanvas: Use Canvas2D (supports all blend modes including ERASE)
  // - useWebGPU: Use WebGL (limited blend mode support)
  // - default: AUTO (usually WebGL)
  const rendererType = opts.forceCanvas
    ? Phaser.CANVAS
    : opts.useWebGPU
      ? Phaser.WEBGL
      : Phaser.AUTO;

  return {
    type: rendererType,
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
