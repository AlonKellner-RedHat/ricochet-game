import Phaser from "phaser";
import { createGameConfig } from "@/config/gameConfig";
import { GameScene } from "@/scenes";

/**
 * Main entry point for the Ricochet game
 * Initializes Phaser with WebGPU/WebGL renderer
 */

// Detect WebGPU support
async function checkWebGPUSupport(): Promise<boolean> {
  if (!navigator.gpu) {
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

async function startGame(): Promise<void> {
  const hasWebGPU = await checkWebGPUSupport();

  if (hasWebGPU) {
    console.log("🎮 WebGPU supported - using hardware acceleration");
  } else {
    console.log("🎮 WebGPU not available - using WebGL fallback");
  }

  const config = createGameConfig([GameScene], {
    useWebGPU: hasWebGPU,
  });

  new Phaser.Game(config);
}

// Start the game
startGame().catch(console.error);

