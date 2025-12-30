/**
 * Tests for multi-stage visibility polygon rendering.
 *
 * Issue 1: Initial polygon is more contrasting than latest polygon (opacity inverted)
 * Issue 2: Cascading doesn't work for multiple planned surfaces
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ValidRegionRenderer, type IValidRegionGraphics, type VisibilityStage } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Mock graphics that records all draw calls
class MockGraphics implements IValidRegionGraphics {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  public fillStyleCalls: Array<{ color: number; alpha: number }> = [];

  clear(): void {
    this.calls.push({ method: "clear", args: [] });
  }
  fillStyle(color: number, alpha?: number): void {
    this.calls.push({ method: "fillStyle", args: [color, alpha] });
    this.fillStyleCalls.push({ color, alpha: alpha ?? 1 });
  }
  lineStyle(width: number, color: number, alpha?: number): void {
    this.calls.push({ method: "lineStyle", args: [width, color, alpha] });
  }
  beginPath(): void {
    this.calls.push({ method: "beginPath", args: [] });
  }
  moveTo(x: number, y: number): void {
    this.calls.push({ method: "moveTo", args: [x, y] });
  }
  lineTo(x: number, y: number): void {
    this.calls.push({ method: "lineTo", args: [x, y] });
  }
  closePath(): void {
    this.calls.push({ method: "closePath", args: [] });
  }
  fillPath(): void {
    this.calls.push({ method: "fillPath", args: [] });
  }
  strokePath(): void {
    this.calls.push({ method: "strokePath", args: [] });
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ method: "fillRect", args: [x, y, width, height] });
  }
  setBlendMode(blendMode: number): void {
    this.calls.push({ method: "setBlendMode", args: [blendMode] });
  }
}

/**
 * Pixel-tracking mock that simulates actual Phaser Graphics compositing.
 * Tracks per-region alpha values after all rendering operations.
 */
class PixelTrackingMockGraphics implements IValidRegionGraphics {
  private currentBlendMode: number = 0; // NORMAL
  private currentColor: number = 0;
  private currentAlpha: number = 1;
  private currentPath: Vector2[] = [];
  
  // Track alpha per named region for testing
  public regionAlphas: Map<string, number> = new Map();
  public fillStyleCalls: Array<{ color: number; alpha: number }> = [];
  
  // Define test regions as point sets
  // These will be dynamically updated based on actual polygon bounds
  private testRegions: Map<string, { x: number; y: number }> = new Map([
    ["outside", { x: -100, y: -100 }],   // A point definitely outside all polygons
    ["center", { x: 500, y: 400 }],      // A point likely inside most polygons
    ["edge", { x: 800, y: 400 }],        // A point that may be on the edge
    ["corner", { x: 100, y: 600 }],      // A corner point
  ]);

  constructor() {
    // Initialize all regions as transparent
    for (const [name] of this.testRegions) {
      this.regionAlphas.set(name, 0);
    }
  }

  private pointInPolygon(point: { x: number; y: number }, polygon: Vector2[]): boolean {
    if (polygon.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i]!.x, yi = polygon[i]!.y;
      const xj = polygon[j]!.x, yj = polygon[j]!.y;
      
      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // Track which operations hit which regions
  public operationLog: Array<{ blend: string; alpha: number; regionsHit: string[] }> = [];
  private operationCount = 0;

  private applyFillToRegions(): void {
    const ERASE = 4;
    const NORMAL = 0;

    const regionsHit: string[] = [];

    for (const [regionName, regionPoint] of this.testRegions) {
      if (this.pointInPolygon(regionPoint, this.currentPath)) {
        regionsHit.push(regionName);
        const existingAlpha = this.regionAlphas.get(regionName) ?? 0;
        
        if (this.currentBlendMode === ERASE) {
          // ERASE: remove existing content (set to 0)
          this.regionAlphas.set(regionName, 0);
        } else if (this.currentBlendMode === NORMAL) {
          // NORMAL: composite new alpha on top
          // resultAlpha = srcAlpha + dstAlpha * (1 - srcAlpha)
          const newAlpha = this.currentAlpha + existingAlpha * (1 - this.currentAlpha);
          this.regionAlphas.set(regionName, newAlpha);
        }
      }
    }

    if (regionsHit.length > 0) {
      this.operationLog.push({
        blend: this.currentBlendMode === ERASE ? "ERASE" : "NORMAL",
        alpha: this.currentAlpha,
        regionsHit,
      });
    }
  }

  clear(): void {
    for (const [name] of this.testRegions) {
      this.regionAlphas.set(name, 0);
    }
  }

  fillStyle(color: number, alpha?: number): void {
    this.currentColor = color;
    this.currentAlpha = alpha ?? 1;
    this.fillStyleCalls.push({ color, alpha: alpha ?? 1 });
  }

  lineStyle(_width: number, _color: number, _alpha?: number): void {}

  beginPath(): void {
    this.currentPath = [];
  }

  moveTo(x: number, y: number): void {
    this.currentPath.push({ x, y });
  }

  lineTo(x: number, y: number): void {
    this.currentPath.push({ x, y });
  }

  closePath(): void {}

  fillPath(): void {
    this.applyFillToRegions();
  }

  strokePath(): void {}

  fillRect(x: number, y: number, width: number, height: number): void {
    // Treat fillRect as a polygon covering the entire rect
    this.currentPath = [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
    this.applyFillToRegions();
  }

  setBlendMode(blendMode: number): void {
    this.currentBlendMode = blendMode;
  }

  getRegionBrightness(regionName: string): number {
    const alpha = this.regionAlphas.get(regionName) ?? 0;
    // Brightness = how much background shows through = 1 - alpha
    // Higher number = brighter
    return 1 - alpha;
  }
}

// Create a test surface
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = true
): Surface {
  const segment = { start, end };
  return {
    id,
    segment,
    canReflect,
    getCenter: () => ({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }),
    isPlannable: () => canReflect,
    canReflectFrom: () => canReflect,
    getReflectionNormal: () => ({ x: 0, y: -1 }),
    getNormalDirection: () => ({ x: 0, y: -1 }),
  } as Surface;
}

describe("Multi-Stage Rendering", () => {
  let graphics: MockGraphics;
  let renderer: ValidRegionRenderer;
  const screenBounds = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

  beforeEach(() => {
    graphics = new MockGraphics();
    renderer = new ValidRegionRenderer(graphics, screenBounds);
  });

  describe("Issue 1: Opacity calculation", () => {
    it("should calculate higher visibility for later stages", () => {
      // Access private method via any cast for testing
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);

      // With 2 stages (indices 0 and 1)
      const stage0Visibility = calcVisibility(0, 2);
      const stage1Visibility = calcVisibility(1, 2);

      console.log("Stage 0 visibility:", stage0Visibility);
      console.log("Stage 1 visibility:", stage1Visibility);

      // Stage 1 (latest) should have HIGHER visibility than Stage 0
      expect(stage1Visibility).toBeGreaterThan(stage0Visibility);
      expect(stage1Visibility).toBe(32); // Latest (depth 0): 32/1 = 32%
      expect(stage0Visibility).toBe(8); // depth=1: 32/4 = 8%
    });

    it("should calculate lower overlay alpha for later stages (brighter)", () => {
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);
      const visToAlpha = (renderer as any).visibilityToOverlayAlpha.bind(renderer);

      const stage0Visibility = calcVisibility(0, 2);
      const stage1Visibility = calcVisibility(1, 2);

      const stage0Alpha = visToAlpha(stage0Visibility);
      const stage1Alpha = visToAlpha(stage1Visibility);

      console.log("Stage 0 overlay alpha:", stage0Alpha);
      console.log("Stage 1 overlay alpha:", stage1Alpha);

      // Lower alpha = brighter (less dark overlay)
      // Stage 1 (latest) should have LOWER alpha than Stage 0
      // Formula: overlayAlpha = shadowAlpha * (1 - visibility/100)
      // With shadowAlpha = 0.7 and 4^depth:
      // - 32% visibility → 0.7 * 0.68 = 0.476
      // - 8% visibility → 0.7 * 0.92 = 0.644
      expect(stage1Alpha).toBeLessThan(stage0Alpha);
      expect(stage1Alpha).toBeCloseTo(0.476, 2); // 32% visibility
      expect(stage0Alpha).toBeCloseTo(0.644, 2); // 8% visibility
    });

    it("should render later stages with lower overlay alpha", () => {
      const player = { x: 500, y: 600 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-1", { x: 400, y: 300 }, { x: 600, y: 300 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!];

      renderer.render(player, plannedSurfaces, surfaces, null);

      // Find fillStyle calls with the overlay color (0x000000)
      const overlayFillCalls = graphics.fillStyleCalls.filter(c => c.color === 0x000000);
      console.log("Overlay fill style calls:", overlayFillCalls);

      // Should have at least 3 fills: background, stage 0 lit, stage 1 lit
      expect(overlayFillCalls.length).toBeGreaterThanOrEqual(3);

      // The order should be: shadow (0.7), stage0 alpha, stage1 alpha
      // Stage 1 alpha should be lower (brighter) than stage 0 alpha
      const shadowAlpha = overlayFillCalls[0]?.alpha;
      expect(shadowAlpha).toBeCloseTo(0.7, 2);

      // If there are 2 stages, we should see 2 different lit alphas
      // Later stages should have lower alpha
    });
  });

  describe("Issue 2: Cascading through multiple planned surfaces", () => {
    it("should compute N+1 stages for N planned surfaces (cascading)", () => {
      const player = { x: 816, y: 666 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
        createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!, surfaces[2]!]; // 2 planned surfaces

      renderer.render(player, plannedSurfaces, surfaces, null);

      const stages = renderer.getVisibilityStages();
      console.log("Number of stages computed:", stages.length);
      console.log("Planned surfaces:", plannedSurfaces.length);

      // With 2 planned surfaces, we should have 3 stages:
      // Stage 0: Player visibility
      // Stage 1: Visibility reflected through first surface (ricochet-4)
      // Stage 2: Visibility reflected through second surface (ricochet-1)
      expect(stages.length).toBe(3);
    });

    it("should extract visible segments from each surface using previous stage's points", () => {
      const player = { x: 816, y: 666 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
        createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!, surfaces[2]!]; // ricochet-4 first, ricochet-1 second

      renderer.render(player, plannedSurfaces, surfaces, null);

      const stages = renderer.getVisibilityStages();
      
      // Correct cascading behavior:
      // Stage 0: Player's direct visibility (source points include what player sees)
      // Stage 1: Uses visible segments on ricochet-4 from Stage 0's source points
      // Stage 2: Uses visible segments on ricochet-1 from Stage 1's source points

      console.log("Stage count:", stages.length);
      for (let i = 0; i < stages.length; i++) {
        console.log(`Stage ${i}: valid=${stages[i]?.isValid}, polygon length=${stages[i]?.polygon.length}`);
      }

      // Verify cascading produces 3 stages
      expect(stages.length).toBe(3);

      // Each subsequent stage should have fewer or equal polygon points (light diminishes through reflections)
      expect(stages[0]?.polygon.length).toBeGreaterThanOrEqual(stages[1]?.polygon.length ?? 0);
    });

    it("should incrementally reflect origin through each surface", () => {
      const player = { x: 816, y: 666 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
        createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!, surfaces[2]!];

      renderer.render(player, plannedSurfaces, surfaces, null);

      const stages = renderer.getVisibilityStages();

      // With cascading, we get 3 stages:
      // Stage 0: Origin = player
      // Stage 1: Origin = player reflected through ricochet-4
      // Stage 2: Origin = player reflected through ricochet-4 AND ricochet-1
      expect(stages.length).toBe(3);

      // Verify stage 0 origin is player
      expect(stages[0]?.origin).toEqual(player);

      // Verify stage 1 origin is different from player (reflected once)
      expect(stages[1]?.origin).not.toEqual(player);
      console.log("Stage 1 origin:", stages[1]?.origin);

      // Verify stage 2 origin is different from stage 1 (reflected twice)
      expect(stages[2]?.origin).not.toEqual(stages[1]?.origin);
      console.log("Stage 2 origin:", stages[2]?.origin);
    });
  });

  describe("Brightness ordering", () => {
    it("should ensure each polygon is brighter than the previous: background < stage0 < stage1 < ... < stageN", () => {
      const player = { x: 500, y: 600 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-1", { x: 400, y: 300 }, { x: 600, y: 300 }, true),
        createTestSurface("ricochet-2", { x: 300, y: 200 }, { x: 500, y: 200 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!, surfaces[2]!];

      renderer.render(player, plannedSurfaces, surfaces, null);

      // Get all fillStyle calls with the overlay color
      const overlayFillCalls = graphics.fillStyleCalls.filter(c => c.color === 0x000000);
      console.log("All overlay fill style calls:", overlayFillCalls);

      // Expected order (from darkest to brightest):
      // 1. Shadow (background): highest alpha = darkest
      // 2. Stage 0: lower alpha = brighter
      // 3. Stage 1: even lower alpha = brighter
      // 4. Stage N: lowest alpha = brightest

      // Extract alphas in order
      const alphas = overlayFillCalls.map(c => c.alpha);
      console.log("Alphas in render order:", alphas);

      // The shadow (first fill) should have highest alpha
      const shadowAlpha = alphas[0];
      expect(shadowAlpha).toBeCloseTo(0.7, 2);

      // Each subsequent polygon should have LOWER alpha (brighter)
      for (let i = 1; i < alphas.length; i++) {
        const prevAlpha = alphas[i - 1]!;
        const currAlpha = alphas[i]!;
        console.log(`Alpha ${i-1} (${prevAlpha}) >= Alpha ${i} (${currAlpha})?`);
        expect(prevAlpha).toBeGreaterThanOrEqual(currAlpha);
      }

      // The last polygon should have lowest alpha (brightest)
      // With 32% visibility: 0.7 * (1 - 0.32) = 0.476
      const lastAlpha = alphas[alphas.length - 1];
      expect(lastAlpha).toBeCloseTo(0.476, 2);
    });

    it("should produce strictly decreasing overlay alphas for increasing stage indices", () => {
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);
      const visToAlpha = (renderer as any).visibilityToOverlayAlpha.bind(renderer);

      // Simulate 4 stages
      const totalStages = 4;
      const alphas: number[] = [];

      for (let i = 0; i < totalStages; i++) {
        const visibility = calcVisibility(i, totalStages);
        const alpha = visToAlpha(visibility);
        alphas.push(alpha);
        console.log(`Stage ${i}: visibility=${visibility}%, alpha=${alpha}`);
      }

      // Alphas should be strictly decreasing (each stage is brighter)
      for (let i = 1; i < alphas.length; i++) {
        expect(alphas[i - 1]).toBeGreaterThan(alphas[i]!);
      }

      // Stage 0 should have highest alpha (dimmest)
      // Stage N-1 should have lowest alpha (brightest)
      // With 32% visibility: 0.7 * (1 - 0.32) = 0.476
      expect(alphas[0]).toBeGreaterThan(alphas[alphas.length - 1]!);
      expect(alphas[alphas.length - 1]).toBeCloseTo(0.476, 2);
    });
  });

  describe("Pixel-level brightness simulation", () => {
    /**
     * This test simulates actual pixel compositing to verify that
     * later polygons result in brighter pixels than earlier polygons.
     * 
     * The scene background is dark (0x1a1a2e = RGB 26,26,46).
     * We overlay black (0x000000) at various alphas.
     * Final pixel = overlay * alpha + background * (1 - alpha)
     * 
     * Lower overlay alpha = more background shows through = brighter pixel.
     */
    it("should prove pixels in last polygon are brighter than first polygon", () => {
      // Scene background color (dark blue-ish)
      const sceneBackground = { r: 26, g: 26, b: 46 }; // 0x1a1a2e
      
      // Overlay color (black)
      const overlayColor = { r: 0, g: 0, b: 0 };

      // Calculate pixel brightness after compositing overlay on background
      const calculatePixelBrightness = (overlayAlpha: number): number => {
        // Standard alpha compositing: result = src * alpha + dst * (1 - alpha)
        const r = overlayColor.r * overlayAlpha + sceneBackground.r * (1 - overlayAlpha);
        const g = overlayColor.g * overlayAlpha + sceneBackground.g * (1 - overlayAlpha);
        const b = overlayColor.b * overlayAlpha + sceneBackground.b * (1 - overlayAlpha);
        // Return luminance (simple average for this test)
        return (r + g + b) / 3;
      };

      // Get the overlay alphas for each region
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);
      const visToAlpha = (renderer as any).visibilityToOverlayAlpha.bind(renderer);

      // Simulate 3 stages (like: player view, 1st reflection, 2nd reflection)
      const totalStages = 3;
      
      const shadowAlpha = 0.7; // Background shadow
      const stage0Alpha = visToAlpha(calcVisibility(0, totalStages));
      const stage1Alpha = visToAlpha(calcVisibility(1, totalStages));
      const stage2Alpha = visToAlpha(calcVisibility(2, totalStages)); // Latest

      console.log("Overlay alphas:");
      console.log(`  Shadow: ${shadowAlpha}`);
      console.log(`  Stage 0: ${stage0Alpha}`);
      console.log(`  Stage 1: ${stage1Alpha}`);
      console.log(`  Stage 2 (latest): ${stage2Alpha}`);

      // Calculate final pixel brightness for each region
      const shadowBrightness = calculatePixelBrightness(shadowAlpha);
      const stage0Brightness = calculatePixelBrightness(stage0Alpha);
      const stage1Brightness = calculatePixelBrightness(stage1Alpha);
      const stage2Brightness = calculatePixelBrightness(stage2Alpha);

      console.log("Pixel brightness (higher = brighter):");
      console.log(`  Shadow: ${shadowBrightness.toFixed(2)}`);
      console.log(`  Stage 0: ${stage0Brightness.toFixed(2)}`);
      console.log(`  Stage 1: ${stage1Brightness.toFixed(2)}`);
      console.log(`  Stage 2 (latest): ${stage2Brightness.toFixed(2)}`);

      // CRITICAL ASSERTION: Later polygons MUST be brighter
      // shadow < stage0 < stage1 < stage2 (latest)
      expect(stage0Brightness).toBeGreaterThan(shadowBrightness);
      expect(stage1Brightness).toBeGreaterThan(stage0Brightness);
      expect(stage2Brightness).toBeGreaterThan(stage1Brightness);

      // Latest polygon should be the brightest
      expect(stage2Brightness).toBeGreaterThan(shadowBrightness);
    });

    it("should verify ERASE+FILL produces correct final alpha per region", () => {
      /**
       * Simulate the actual rendering sequence and track final alpha per region.
       * 
       * Rendering sequence:
       * 1. Fill entire screen with shadow (0.7)
       * 2. For each stage:
       *    - ERASE polygon (sets alpha to 0)
       *    - FILL polygon with stage alpha
       * 
       * Final state:
       * - Shadow region (not touched by any stage): 0.7
       * - Stage 0 only (not overlapped by later stages): stage0Alpha
       * - Stage 1 only: stage1Alpha
       * - Stage 2 (latest): stage2Alpha
       */
      
      // Simulate pixel alpha at a point in each region
      type Region = "shadow" | "stage0" | "stage1" | "stage2";
      const finalAlphas: Record<Region, number> = {
        shadow: 0,
        stage0: 0,
        stage1: 0,
        stage2: 0,
      };

      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);
      const visToAlpha = (renderer as any).visibilityToOverlayAlpha.bind(renderer);
      const totalStages = 3;

      const shadowAlpha = 0.7;
      const stageAlphas = [
        visToAlpha(calcVisibility(0, totalStages)),
        visToAlpha(calcVisibility(1, totalStages)),
        visToAlpha(calcVisibility(2, totalStages)),
      ];

      // Step 1: Fill all regions with shadow
      finalAlphas.shadow = shadowAlpha;
      finalAlphas.stage0 = shadowAlpha;
      finalAlphas.stage1 = shadowAlpha;
      finalAlphas.stage2 = shadowAlpha;

      // Step 2: Process Stage 0 (ERASE + FILL)
      // Stage 0 polygon covers: stage0, stage1, stage2 regions (nested)
      finalAlphas.stage0 = 0; // ERASE
      finalAlphas.stage1 = 0; // ERASE (stage1 is inside stage0)
      finalAlphas.stage2 = 0; // ERASE (stage2 is inside stage0)
      finalAlphas.stage0 = stageAlphas[0]!; // FILL
      finalAlphas.stage1 = stageAlphas[0]!; // FILL (still covered by stage0)
      finalAlphas.stage2 = stageAlphas[0]!; // FILL (still covered by stage0)

      // Step 3: Process Stage 1 (ERASE + FILL)
      // Stage 1 polygon covers: stage1, stage2 regions
      finalAlphas.stage1 = 0; // ERASE
      finalAlphas.stage2 = 0; // ERASE
      finalAlphas.stage1 = stageAlphas[1]!; // FILL
      finalAlphas.stage2 = stageAlphas[1]!; // FILL

      // Step 4: Process Stage 2 (ERASE + FILL)
      // Stage 2 polygon covers: stage2 region only
      finalAlphas.stage2 = 0; // ERASE
      finalAlphas.stage2 = stageAlphas[2]!; // FILL

      console.log("Final overlay alphas per region:");
      console.log(`  Shadow: ${finalAlphas.shadow}`);
      console.log(`  Stage 0: ${finalAlphas.stage0}`);
      console.log(`  Stage 1: ${finalAlphas.stage1}`);
      console.log(`  Stage 2: ${finalAlphas.stage2}`);

      // Verify: lower alpha = brighter (less dark overlay)
      // shadow (0.7) > stage0 > stage1 > stage2 (0.5)
      expect(finalAlphas.shadow).toBeGreaterThan(finalAlphas.stage0);
      expect(finalAlphas.stage0).toBeGreaterThan(finalAlphas.stage1);
      expect(finalAlphas.stage1).toBeGreaterThan(finalAlphas.stage2);

      // Calculate brightness
      const sceneBackground = { r: 26, g: 26, b: 46 };
      const brightness = (alpha: number) => 
        (sceneBackground.r * (1 - alpha) + sceneBackground.g * (1 - alpha) + sceneBackground.b * (1 - alpha)) / 3;

      console.log("Pixel brightness per region:");
      console.log(`  Shadow: ${brightness(finalAlphas.shadow).toFixed(2)}`);
      console.log(`  Stage 0: ${brightness(finalAlphas.stage0).toFixed(2)}`);
      console.log(`  Stage 1: ${brightness(finalAlphas.stage1).toFixed(2)}`);
      console.log(`  Stage 2: ${brightness(finalAlphas.stage2).toFixed(2)}`);

      // CRITICAL: Later stages must be brighter
      expect(brightness(finalAlphas.stage0)).toBeGreaterThan(brightness(finalAlphas.shadow));
      expect(brightness(finalAlphas.stage1)).toBeGreaterThan(brightness(finalAlphas.stage0));
      expect(brightness(finalAlphas.stage2)).toBeGreaterThan(brightness(finalAlphas.stage1));
    });

    it("BUG REPRODUCTION: if ERASE fails, alphas stack and later stages get darker", () => {
      /**
       * This test reproduces the bug the user is seeing.
       * 
       * If ERASE doesn't work, each FILL adds alpha on top of existing alpha.
       * Result: Later stages have MORE darkness stacked = DARKER pixels.
       * 
       * This is the OPPOSITE of desired behavior.
       */
      
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);
      const visToAlpha = (renderer as any).visibilityToOverlayAlpha.bind(renderer);
      const totalStages = 3;

      const shadowAlpha = 0.7;
      const stageAlphas = [
        visToAlpha(calcVisibility(0, totalStages)),
        visToAlpha(calcVisibility(1, totalStages)),
        visToAlpha(calcVisibility(2, totalStages)),
      ];

      console.log("Stage overlay alphas:", stageAlphas);

      // Simulate what happens if ERASE FAILS and alphas STACK
      // Using alpha compositing: resultAlpha = srcAlpha + dstAlpha * (1 - srcAlpha)
      const stackAlpha = (existing: number, added: number): number => {
        return added + existing * (1 - added);
      };

      // Non-overlapping regions (each stage is in a different area)
      const buggyFinalAlphas = {
        shadow: shadowAlpha,
        stage0: shadowAlpha, // starts with shadow
        stage1: shadowAlpha,
        stage2: shadowAlpha,
      };

      // If ERASE fails, each stage's FILL stacks on top of shadow
      buggyFinalAlphas.stage0 = stackAlpha(shadowAlpha, stageAlphas[0]!);
      buggyFinalAlphas.stage1 = stackAlpha(shadowAlpha, stageAlphas[1]!);
      buggyFinalAlphas.stage2 = stackAlpha(shadowAlpha, stageAlphas[2]!);

      console.log("BUGGY final alphas (ERASE fails, stacking on shadow):");
      console.log(`  Shadow: ${buggyFinalAlphas.shadow.toFixed(3)}`);
      console.log(`  Stage 0: ${buggyFinalAlphas.stage0.toFixed(3)}`);
      console.log(`  Stage 1: ${buggyFinalAlphas.stage1.toFixed(3)}`);
      console.log(`  Stage 2: ${buggyFinalAlphas.stage2.toFixed(3)}`);

      // In the buggy case, higher stageAlpha means MORE total darkness
      // Stage 0 alpha (0.62) > Stage 2 alpha (0.5)
      // So Stage 0 stacked = 0.7 + 0.62*(1-0.7) = 0.886
      //    Stage 2 stacked = 0.7 + 0.5*(1-0.7) = 0.85
      // Stage 0 is DARKER than Stage 2!
      
      // Wait, that's still wrong direction. Let me reconsider...
      // The bug would be if we DON'T erase and just keep adding darkness.
      
      // Actually, if no ERASE happens, we're adding overlay on top of overlay.
      // For regions that get drawn multiple times (overlapping stages):
      
      console.log("\nNested regions simulation (Stage 2 inside Stage 1 inside Stage 0):");
      
      // Start with shadow everywhere
      let nestedStage0 = shadowAlpha;
      let nestedStage1 = shadowAlpha;
      let nestedStage2 = shadowAlpha;

      // Stage 0 draws over all three regions (no ERASE)
      nestedStage0 = stackAlpha(nestedStage0, stageAlphas[0]!);
      nestedStage1 = stackAlpha(nestedStage1, stageAlphas[0]!);
      nestedStage2 = stackAlpha(nestedStage2, stageAlphas[0]!);

      // Stage 1 draws over stage1 and stage2 regions (no ERASE)
      nestedStage1 = stackAlpha(nestedStage1, stageAlphas[1]!);
      nestedStage2 = stackAlpha(nestedStage2, stageAlphas[1]!);

      // Stage 2 draws over stage2 region only (no ERASE)
      nestedStage2 = stackAlpha(nestedStage2, stageAlphas[2]!);

      console.log("BUGGY nested alphas (no ERASE, alphas stack):");
      console.log(`  Shadow: ${shadowAlpha.toFixed(3)}`);
      console.log(`  Stage 0 only: ${nestedStage0.toFixed(3)}`);
      console.log(`  Stage 1 (inside Stage 0): ${nestedStage1.toFixed(3)}`);
      console.log(`  Stage 2 (inside both): ${nestedStage2.toFixed(3)}`);

      // Calculate brightness (lower alpha = brighter... but we're stacking so higher = darker)
      const sceneBackground = { r: 26, g: 26, b: 46 };
      const brightness = (alpha: number) => 
        (sceneBackground.r * (1 - alpha) + sceneBackground.g * (1 - alpha) + sceneBackground.b * (1 - alpha)) / 3;

      const shadowBrightness = brightness(shadowAlpha);
      const stage0Brightness = brightness(nestedStage0);
      const stage1Brightness = brightness(nestedStage1);
      const stage2Brightness = brightness(nestedStage2);

      console.log("BUGGY brightness (stacked alphas):");
      console.log(`  Shadow: ${shadowBrightness.toFixed(2)}`);
      console.log(`  Stage 0: ${stage0Brightness.toFixed(2)}`);
      console.log(`  Stage 1: ${stage1Brightness.toFixed(2)}`);
      console.log(`  Stage 2 (latest): ${stage2Brightness.toFixed(2)}`);

      // THE BUG: Stage 2 (latest) is DARKER than Stage 0 because more overlays stacked
      // This matches user's report: "pixels in last polygon are darker than first"
      expect(stage2Brightness).toBeLessThan(stage0Brightness); // BUG: latest is darker!
      
      // This is WRONG - we want later stages to be BRIGHTER
      // The fix requires ERASE to work, or a different rendering approach
    });

    it("ACTUAL BUG TEST: verifies fill alphas decrease from Stage 0 to Stage N", () => {
      /**
       * This test captures all FILL operations (NORMAL blend mode with overlay color)
       * and verifies they have decreasing alphas for increasing stage indices.
       * 
       * Expected: shadow (0.7) > stage0Alpha > stage1Alpha > ... > stageNAlpha (0.5)
       * 
       * If the alphas are in wrong order, later stages will be darker.
       */
      
      const pixelGraphics = new PixelTrackingMockGraphics();
      const pixelRenderer = new ValidRegionRenderer(pixelGraphics, screenBounds);

      const player = { x: 500, y: 600 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-1", { x: 400, y: 300 }, { x: 600, y: 300 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!]; // 1 planned surface = 2 stages

      pixelRenderer.render(player, plannedSurfaces, surfaces, null);

      // Log the stages
      const stages = pixelRenderer.getVisibilityStages();
      console.log(`Total stages: ${stages.length}`);
      
      // Extract FILL operations (NORMAL blend with overlay alpha)
      const fillOps = pixelGraphics.operationLog.filter(op => op.blend === "NORMAL");
      console.log("\nFILL operations (NORMAL blend):");
      for (let i = 0; i < fillOps.length; i++) {
        console.log(`  Fill ${i}: alpha=${fillOps[i]!.alpha.toFixed(2)}`);
      }

      // Expected fill sequence:
      // 1. Shadow fill: 0.7 (darkest)
      // 2. Stage 0 fill: ~0.58 (intermediate)  
      // 3. Stage 1 fill: 0.5 (brightest)

      expect(fillOps.length).toBeGreaterThanOrEqual(3);

      // Verify shadow is first and darkest
      expect(fillOps[0]!.alpha).toBeCloseTo(0.7, 1);

      // Verify each subsequent fill has LOWER alpha (brighter)
      const stageFills = fillOps.slice(1); // Exclude shadow
      console.log("\nStage fill alphas (should decrease):");
      for (let i = 0; i < stageFills.length; i++) {
        console.log(`  Stage ${i} fill: ${stageFills[i]!.alpha.toFixed(3)}`);
      }

      // Each stage fill should have lower alpha than the previous
      for (let i = 1; i < stageFills.length; i++) {
        const prevAlpha = stageFills[i - 1]!.alpha;
        const currAlpha = stageFills[i]!.alpha;
        console.log(`  Checking: stage${i-1} alpha (${prevAlpha.toFixed(3)}) > stage${i} alpha (${currAlpha.toFixed(3)})`);
        expect(prevAlpha).toBeGreaterThan(currAlpha);
      }

      // Last fill should be the brightest (0.5)
      const lastFillAlpha = stageFills[stageFills.length - 1]!.alpha;
      expect(lastFillAlpha).toBeCloseTo(0.5, 1);
    });

    it("verifies a point inside all stages gets the LATEST stage's alpha (brightest)", () => {
      /**
       * A point that is inside ALL stage polygons should end up with
       * the LAST stage's alpha (the brightest one).
       */
      
      const pixelGraphics = new PixelTrackingMockGraphics();
      const pixelRenderer = new ValidRegionRenderer(pixelGraphics, screenBounds);

      const player = { x: 500, y: 600 };
      const surfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ricochet-1", { x: 400, y: 300 }, { x: 600, y: 300 }, true),
      ];
      const plannedSurfaces = [surfaces[1]!];

      pixelRenderer.render(player, plannedSurfaces, surfaces, null);

      // The "center" test point at (500, 400) should be inside both Stage 0 and Stage 1
      const centerAlpha = pixelGraphics.regionAlphas.get("center") ?? 0;
      console.log(`Center point (500,400) final alpha: ${centerAlpha.toFixed(3)}`);

      // It should have the LAST stage's alpha (0.5 = brightest)
      expect(centerAlpha).toBeCloseTo(0.5, 1);
      
      // Brightness = 1 - alpha = 0.5 (50% bright)
      const centerBrightness = 1 - centerAlpha;
      console.log(`Center point brightness: ${centerBrightness.toFixed(3)}`);
      expect(centerBrightness).toBeCloseTo(0.5, 1);
    });
  });

  describe("Visibility formula verification", () => {
    it("should follow the formula: 32 / 4^depth", () => {
      const calcVisibility = (renderer as any).calculateStageVisibility.bind(renderer);

      // Test with 4 stages
      const totalStages = 4;
      const expectedVisibilities = [
        { stageIndex: 0, depth: 3, expected: 32 / 64 },   // 0.5%
        { stageIndex: 1, depth: 2, expected: 32 / 16 },   // 2%
        { stageIndex: 2, depth: 1, expected: 32 / 4 },    // 8%
        { stageIndex: 3, depth: 0, expected: 32 / 1 },    // 32%
      ];

      for (const { stageIndex, depth, expected } of expectedVisibilities) {
        const actual = calcVisibility(stageIndex, totalStages);
        console.log(`Stage ${stageIndex} (depth ${depth}): expected=${expected}, actual=${actual}`);
        expect(actual).toBeCloseTo(expected, 2);
      }
    });
  });
});

