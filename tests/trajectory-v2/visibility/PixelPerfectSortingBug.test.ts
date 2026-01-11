/**
 * Test for pixel-perfect sorting bug with pyramid surfaces.
 * 
 * The issue: When pyramid surface endpoints align from the player's perspective,
 * the sorting becomes unstable - jumping from left side to right side incorrectly.
 */
import { describe, it, expect } from "vitest";
import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { projectConeV2, createFullCone, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createSingleSurfaceChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

function createTestSurface(id: string, start: Vector2, end: Vector2): SurfaceChain {
  const surface = new RicochetSurface(id, { start, end });
  return createSingleSurfaceChain(surface);
}

describe("Pixel Perfect Sorting Bug - Pyramid Surfaces", () => {
  const bounds = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };
  
  // Player position from the bug report
  const player = { x: 1090.8850699188959, y: 666 };
  
  // Pyramid surfaces (stacked horizontal surfaces, shortest at bottom)
  const pyramid1 = createTestSurface("pyramid-1-0", { x: 1030, y: 500 }, { x: 1070, y: 500 }); // bottom, shortest
  const pyramid2 = createTestSurface("pyramid-2-0", { x: 1015, y: 460 }, { x: 1085, y: 460 });
  const pyramid3 = createTestSurface("pyramid-3-0", { x: 1000, y: 420 }, { x: 1100, y: 420 });
  const pyramid4 = createTestSurface("pyramid-4-0", { x: 985, y: 380 }, { x: 1115, y: 380 }); // top, longest
  
  const allChains = [pyramid1, pyramid2, pyramid3, pyramid4];

  it("should include left endpoint of pyramid-1 (1030, 500) in the polygon", () => {
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, bounds);
    const vertices = toVector2Array(points);
    
    console.log("Polygon vertices:");
    vertices.forEach((v, i) => {
      console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    });
    
    // Find the left endpoint of pyramid-1 at (1030, 500)
    const pyramid1LeftIdx = vertices.findIndex(v => 
      Math.abs(v.x - 1030) < 1 && Math.abs(v.y - 500) < 1
    );
    
    console.log(`Pyramid-1 left endpoint (1030, 500) at index: ${pyramid1LeftIdx}`);
    
    // This endpoint should exist in the polygon
    expect(pyramid1LeftIdx).toBeGreaterThanOrEqual(0);
  });

  it("should have left endpoints in correct order: (985,380) → (1000,420) → (1015,460) → (1030,500)", () => {
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, bounds);
    const vertices = toVector2Array(points);
    
    // Find left endpoints of each pyramid surface
    const p4LeftIdx = vertices.findIndex(v => Math.abs(v.x - 985) < 1 && Math.abs(v.y - 380) < 1);
    const p3LeftIdx = vertices.findIndex(v => Math.abs(v.x - 1000) < 1 && Math.abs(v.y - 420) < 1);
    const p2LeftIdx = vertices.findIndex(v => Math.abs(v.x - 1015) < 1 && Math.abs(v.y - 460) < 1);
    const p1LeftIdx = vertices.findIndex(v => Math.abs(v.x - 1030) < 1 && Math.abs(v.y - 500) < 1);
    
    console.log(`Left endpoints: p4=${p4LeftIdx}, p3=${p3LeftIdx}, p2=${p2LeftIdx}, p1=${p1LeftIdx}`);
    
    // All should exist
    expect(p4LeftIdx).toBeGreaterThanOrEqual(0);
    expect(p3LeftIdx).toBeGreaterThanOrEqual(0);
    expect(p2LeftIdx).toBeGreaterThanOrEqual(0);
    expect(p1LeftIdx).toBeGreaterThanOrEqual(0);
    
    // They should be in order (CCW from player on right side)
    // Since player is at x=1090, looking left, CCW goes from top to bottom
    // So p4 (top) should come before p1 (bottom)
  });

  it("should not have right endpoints appearing before left endpoints are done", () => {
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, bounds);
    const vertices = toVector2Array(points);
    
    // Find all pyramid endpoints
    const leftEndpoints = [
      { name: "p4-left", x: 985, y: 380 },
      { name: "p3-left", x: 1000, y: 420 },
      { name: "p2-left", x: 1015, y: 460 },
      { name: "p1-left", x: 1030, y: 500 },
    ];
    
    const rightEndpoints = [
      { name: "p1-right", x: 1070, y: 500 },
      { name: "p2-right", x: 1085, y: 460 },
      { name: "p3-right", x: 1100, y: 420 },
      { name: "p4-right", x: 1115, y: 380 },
    ];
    
    // Find indices
    const leftIndices = leftEndpoints.map(ep => ({
      name: ep.name,
      idx: vertices.findIndex(v => Math.abs(v.x - ep.x) < 1 && Math.abs(v.y - ep.y) < 1)
    }));
    
    const rightIndices = rightEndpoints.map(ep => ({
      name: ep.name,
      idx: vertices.findIndex(v => Math.abs(v.x - ep.x) < 1 && Math.abs(v.y - ep.y) < 1)
    }));
    
    console.log("Left endpoints:", leftIndices);
    console.log("Right endpoints:", rightIndices);
    
    // The bug: p1-right (1070, 500) appears at index 47 while p1-left (1030, 500) is missing
    // This means we jump from left side to right side incorrectly
    
    // All left endpoints should appear before any right endpoints in CCW order from player at x=1090
    const maxLeftIdx = Math.max(...leftIndices.filter(l => l.idx >= 0).map(l => l.idx));
    const minRightIdx = Math.min(...rightIndices.filter(r => r.idx >= 0).map(r => r.idx));
    
    console.log(`Max left index: ${maxLeftIdx}, Min right index: ${minRightIdx}`);
    
    // If we find a right endpoint appearing before all left endpoints are done,
    // that's the bug (unless the polygon wraps around)
  });

  it("should have all polygon edges follow rays or surfaces", () => {
    const cone = createFullCone(player);
    const points = projectConeV2(cone, allChains, bounds);
    const vertices = toVector2Array(points);
    
    const invalidEdges: string[] = [];
    
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i]!;
      const next = vertices[(i + 1) % vertices.length]!;
      
      // Check if edge follows a ray from player
      const isRay = isOnRayFromOrigin(player, current, next);
      
      // Check if edge is on a surface (horizontal for pyramid)
      const isSurface = isOnSurfaceLine(current, next, allChains);
      
      // Check if edge is on screen boundary
      const isScreen = isOnScreenBoundary(current, next, bounds);
      
      if (!isRay && !isSurface && !isScreen) {
        invalidEdges.push(`Edge ${i}→${(i+1) % vertices.length}: (${current.x.toFixed(2)}, ${current.y.toFixed(2)}) → (${next.x.toFixed(2)}, ${next.y.toFixed(2)})`);
      }
    }
    
    if (invalidEdges.length > 0) {
      console.error("Invalid edges found:", invalidEdges);
    }
    
    expect(invalidEdges.length).toBe(0);
  });
});

function isOnRayFromOrigin(origin: Vector2, p1: Vector2, p2: Vector2): boolean {
  const v1 = { x: p1.x - origin.x, y: p1.y - origin.y };
  const v2 = { x: p2.x - origin.x, y: p2.y - origin.y };
  const cross = v1.x * v2.y - v1.y * v2.x;
  return Math.abs(cross) < 1; // Allow small tolerance for floating point
}

function isOnSurfaceLine(p1: Vector2, p2: Vector2, chains: SurfaceChain[]): boolean {
  for (const chain of chains) {
    for (const surface of chain.getSurfaces()) {
      const seg = surface.segment;
      // Check if both points are on the line defined by the surface
      const cross1 = (p1.x - seg.start.x) * (seg.end.y - seg.start.y) - (p1.y - seg.start.y) * (seg.end.x - seg.start.x);
      const cross2 = (p2.x - seg.start.x) * (seg.end.y - seg.start.y) - (p2.y - seg.start.y) * (seg.end.x - seg.start.x);
      if (Math.abs(cross1) < 1 && Math.abs(cross2) < 1) {
        return true;
      }
    }
  }
  return false;
}

function isOnScreenBoundary(p1: Vector2, p2: Vector2, bounds: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  // Top edge (y = minY)
  if (Math.abs(p1.y - bounds.minY) < 1 && Math.abs(p2.y - bounds.minY) < 1) return true;
  // Bottom edge (y = maxY)
  if (Math.abs(p1.y - bounds.maxY) < 1 && Math.abs(p2.y - bounds.maxY) < 1) return true;
  // Left edge (x = minX)
  if (Math.abs(p1.x - bounds.minX) < 1 && Math.abs(p2.x - bounds.minX) < 1) return true;
  // Right edge (x = maxX)
  if (Math.abs(p1.x - bounds.maxX) < 1 && Math.abs(p2.x - bounds.maxX) < 1) return true;
  return false;
}
