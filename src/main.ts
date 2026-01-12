import { createGameConfig } from "@/config/gameConfig";
import { GameScene } from "@/scenes";
import { InvariantDebugScene } from "@/debug/InvariantDebugRenderer";
import Phaser from "phaser";

/**
 * Main entry point for the Ricochet game
 * Initializes Phaser with WebGPU/WebGL renderer
 *
 * Debug modes:
 * - ?debug=invariant - Invariant debug renderer
 *   - &scene=wall-with-gap - Select scene
 *   - &x=581&y=81 - Override player position
 */

// Check for debug mode
function isDebugMode(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("debug");
}

// Detect WebGPU support
async function checkWebGPUSupport(): Promise<boolean> {
  // Type guard for WebGPU navigator
  const nav = navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };
  if (!nav.gpu) {
    return false;
  }
  try {
    const adapter = await nav.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

async function startGame(): Promise<void> {
  const hasWebGPU = await checkWebGPUSupport();
  const debugMode = isDebugMode();

  if (hasWebGPU) {
    console.log("🎮 WebGPU supported - using hardware acceleration");
  } else {
    console.log("🎮 WebGPU not available - using WebGL fallback");
  }

  // Select scene based on debug mode
  let scenes: typeof Phaser.Scene[];
  if (debugMode === "invariant") {
    console.log("🔍 Invariant Debug Mode active");
    scenes = [InvariantDebugScene];
  } else {
    scenes = [GameScene];
  }

  const config = createGameConfig(scenes, {
    useWebGPU: hasWebGPU,
  });

  new Phaser.Game(config);
}

// Start the game
startGame().catch(console.error);
