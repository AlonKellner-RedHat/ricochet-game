/**
 * Test for umbrella mode polygon issues
 */
import { describe, it, expect } from "vitest";
import {
  createConeThroughWindow,
  projectCone,
  isFullCone,
  isPointInCone,
} from "@/trajectory-v2/visibility/ConeProjection";
import { createTestSurface } from "./testHelpers";

describe("Umbrella Polygon Issues", () => {
  it("reproduces the reported issue - polygon should not include origin", () => {
    const player = { x: 1109.0906950999993, y: 666 };
    
    // Umbrella 100px above player, 150px wide
    const umbrellaStart = { x: player.x - 75, y: player.y - 100 };
    const umbrellaEnd = { x: player.x + 75, y: player.y - 100 };
    
    console.log("Player:", player);
    console.log("Umbrella:", umbrellaStart, "to", umbrellaEnd);
    
    const cone = createConeThroughWindow(player, umbrellaStart, umbrellaEnd);
    
    expect(isFullCone(cone)).toBe(false);
    expect(cone.startLine).not.toBeNull();
    
    const allSurfaces = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
      createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
      createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true),
      createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
      createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
    ];
    
    const bounds = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
    
    const polygon = projectCone(cone, allSurfaces, bounds);
    
    console.log("Polygon vertices:", polygon.length);
    for (let i = 0; i < polygon.length; i++) {
      console.log(`  [${i}] (${polygon[i]!.x.toFixed(1)}, ${polygon[i]!.y.toFixed(1)})`);
    }
    
    // Key assertions:
    
    // 1. All vertices should be at or above the umbrella (y <= 566)
    for (const v of polygon) {
      expect(v.y).toBeLessThanOrEqual(umbrellaEnd.y + 1);
    }
    
    // 2. Polygon should include window endpoints (or very close)
    const hasLeftWindow = polygon.some(
      (v) => Math.abs(v.x - umbrellaStart.x) < 2 && Math.abs(v.y - umbrellaStart.y) < 2
    );
    const hasRightWindow = polygon.some(
      (v) => Math.abs(v.x - umbrellaEnd.x) < 2 && Math.abs(v.y - umbrellaEnd.y) < 2
    );
    expect(hasLeftWindow).toBe(true);
    expect(hasRightWindow).toBe(true);
    
    // 3. Origin should NOT be in the polygon (it's below the umbrella)
    const hasOrigin = polygon.some(
      (v) => Math.abs(v.x - player.x) < 2 && Math.abs(v.y - player.y) < 2
    );
    expect(hasOrigin).toBe(false);
    
    // 4. Polygon should be non-self-intersecting
    // Check that consecutive vertices trace a valid perimeter
    // (simplified check: no huge jumps in angle that would indicate crossing)
    let prevAngle = Math.atan2(polygon[0]!.y - player.y, polygon[0]!.x - player.x);
    let totalAngleChange = 0;
    for (let i = 1; i < polygon.length; i++) {
      const angle = Math.atan2(polygon[i]!.y - player.y, polygon[i]!.x - player.x);
      let diff = angle - prevAngle;
      // Normalize to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      totalAngleChange += Math.abs(diff);
      prevAngle = angle;
    }
    console.log("Total angle change:", (totalAngleChange * 180 / Math.PI).toFixed(1) + "°");
    
    // For a valid polygon, total angle change should be reasonable
    // (not have wild back-and-forth)
    expect(totalAngleChange).toBeLessThan(Math.PI * 4);
  });
  
  it("simple umbrella case - polygon should be a trapezoid", () => {
    const player = { x: 500, y: 500 };
    const umbrellaStart = { x: 400, y: 400 };
    const umbrellaEnd = { x: 600, y: 400 };
    
    const cone = createConeThroughWindow(player, umbrellaStart, umbrellaEnd);
    
    console.log("\nCone details:");
    console.log("  origin:", cone.origin);
    console.log("  leftBoundary:", cone.leftBoundary);
    console.log("  rightBoundary:", cone.rightBoundary);
    console.log("  startLine:", cone.startLine);
    
    // Just walls
    const walls = [
      createTestSurface("left-wall", { x: 0, y: 0 }, { x: 0, y: 800 }, false),
      createTestSurface("right-wall", { x: 1000, y: 0 }, { x: 1000, y: 800 }, false),
      createTestSurface("top-wall", { x: 0, y: 0 }, { x: 1000, y: 0 }, false),
      createTestSurface("bottom-wall", { x: 0, y: 800 }, { x: 1000, y: 800 }, false),
    ];
    
    // Check if corners are in cone
    const corners = [
      { x: 0, y: 0, name: "top-left" },
      { x: 1000, y: 0, name: "top-right" },
    ];
    for (const corner of corners) {
      const inCone = isPointInCone(corner, cone);
      const angle = Math.atan2(corner.y - player.y, corner.x - player.x);
      console.log(`  ${corner.name} (${corner.x}, ${corner.y}): inCone=${inCone}, angle=${(angle * 180 / Math.PI).toFixed(1)}°`);
    }
    
    const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
    
    const polygon = projectCone(cone, walls, bounds);
    
    console.log("\nSimple umbrella polygon:");
    for (let i = 0; i < polygon.length; i++) {
      console.log(`  [${i}] (${polygon[i]!.x.toFixed(1)}, ${polygon[i]!.y.toFixed(1)})`);
    }
    
    // All points should be at y <= 400 (at or above umbrella)
    for (const v of polygon) {
      expect(v.y).toBeLessThanOrEqual(401);
    }
    
    // Should have at least 4 points (trapezoid: 2 window endpoints + 2 ceiling hits)
    expect(polygon.length).toBeGreaterThanOrEqual(4);
  });
});

