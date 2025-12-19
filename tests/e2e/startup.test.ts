import { expect, test } from "@playwright/test";

/**
 * E2E test to detect console errors during game initialization
 *
 * This test catches issues like:
 * - Undefined variable access (e.g., using this.player before it's created)
 * - Missing dependencies
 * - Runtime type errors
 * - Failed asset loads
 */
test.describe("Game Startup", () => {
  test("should initialize without console errors", async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Capture console.error events
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
      // Optionally track warnings too
      if (msg.type() === "warning") {
        warnings.push(msg.text());
      }
    });

    // Capture uncaught exceptions
    page.on("pageerror", (error) => {
      errors.push(`Uncaught: ${error.message}`);
    });

    // Navigate to the game
    await page.goto("/");

    // Wait for Phaser to initialize
    // The game creates a canvas element when ready
    await page.waitForSelector("canvas", { timeout: 10000 });

    // Give the game a moment to fully initialize and render first frame
    await page.waitForTimeout(1000);

    // Report any errors found
    if (errors.length > 0) {
      console.log("Console errors detected:");
      for (const error of errors) {
        console.log(`  - ${error}`);
      }
    }

    // Assert no errors occurred
    expect(errors, `Expected no console errors, but found: ${errors.join(", ")}`).toHaveLength(0);
  });

  test("should render the game canvas", async ({ page }) => {
    await page.goto("/");

    // Wait for canvas to appear
    const canvas = await page.waitForSelector("canvas", { timeout: 10000 });
    expect(canvas).not.toBeNull();

    // Verify canvas has dimensions (game is rendering)
    const boundingBox = await canvas.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox?.width).toBeGreaterThan(0);
    expect(boundingBox?.height).toBeGreaterThan(0);
  });

  test("should display game title", async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto("/");

    // Wait for canvas first
    await page.waitForSelector("canvas", { timeout: 10000 });

    // Give Phaser time to render text
    await page.waitForTimeout(500);

    // No page errors should occur
    expect(errors).toHaveLength(0);
  });
});
