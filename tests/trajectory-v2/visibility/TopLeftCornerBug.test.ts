/**
 * Top-Left Corner Bug Investigation
 *
 * Bug: The left-wall endpoint (20, 80) disappears from the polygon
 * with a 0.15px player movement.
 *
 * Buggy: player (130.71, 522.69) → polygon skips (20, 80)
 * Correct: player (130.86, 522.66) → polygon includes (20, 80)
 */

import { describe, it, expect } from "vitest";
import { projectConeV2, createFullCone, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createRicochetChain,
  createWallChain,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";

// Screen bounds matching demo
const BOUNDS = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

// Player positions
const BUGGY_PLAYER = { x: 130.71028971272352, y: 522.6852008399795 };
const CORRECT_PLAYER = { x: 130.86070971272358, y: 522.6601108399797 };

// The missing endpoint
const LEFT_WALL_TOP = { x: 20, y: 80 };

/**
 * Create demo surfaces (matching GameScene.ts)
 */
function createDemoChains(): SurfaceChain[] {
  const width = 1280;
  const height = 720;

  return [
    // Floor (non-reflective)
    createWallChain("floor", [
      { x: 0, y: height - 20 },
      { x: width, y: height - 20 },
    ]),
    // Ceiling (reflective)
    createRicochetChain("ceiling", [
      { x: 0, y: 80 },
      { x: width, y: 80 },
    ]),
    // Left wall (reflective) - this is the key surface
    createRicochetChain("left-wall", [
      { x: 20, y: height - 20 },
      { x: 20, y: 80 },
    ]),
    // Right wall (non-reflective)
    createWallChain("right-wall", [
      { x: width - 20, y: 80 },
      { x: width - 20, y: height - 20 },
    ]),
    // Platform
    createWallChain("platform", [
      { x: 50, y: height - 100 },
      { x: 200, y: height - 100 },
    ]),
    // Left mirror
    createRicochetChain("mirror-left", [
      { x: 250, y: 550 },
      { x: 250, y: 150 },
    ]),
    // Right mirror
    createRicochetChain("mirror-right", [
      { x: 550, y: 150 },
      { x: 550, y: 550 },
    ]),
  ];
}

describe("TopLeftCornerBug", () => {
  const chains = createDemoChains();

  it("should include left-wall endpoint (20, 80) with CORRECT player position", () => {
    const cone = createFullCone(CORRECT_PLAYER);

    const polygon = projectConeV2(cone, chains, BOUNDS);

    // Find the left-wall endpoint in the polygon
    const hasLeftWallTop = polygon.some((p) => {
      const xy = p.computeXY();
      return xy.x === LEFT_WALL_TOP.x && xy.y === LEFT_WALL_TOP.y;
    });

    console.log("\n=== CORRECT PLAYER POSITION ===");
    console.log("Player:", CORRECT_PLAYER);
    console.log("Polygon vertices:");
    polygon.forEach((p, i) => {
      const xy = p.computeXY();
      const type = isEndpoint(p) ? `Endpoint(${p.surface.id})` : isHitPoint(p) ? `HitPoint(${p.hitSurface.id})` : p.type;
      console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${type}`);
    });
    console.log("Has (20, 80):", hasLeftWallTop);

    expect(hasLeftWallTop).toBe(true);
  });

  it("should include left-wall endpoint (20, 80) with BUGGY player position", () => {
    const cone = createFullCone(BUGGY_PLAYER);

    const polygon = projectConeV2(cone, chains, BOUNDS);

    // Find the left-wall endpoint in the polygon
    const hasLeftWallTop = polygon.some((p) => {
      const xy = p.computeXY();
      return xy.x === LEFT_WALL_TOP.x && xy.y === LEFT_WALL_TOP.y;
    });

    console.log("\n=== BUGGY PLAYER POSITION ===");
    console.log("Player:", BUGGY_PLAYER);
    console.log("Polygon vertices:");
    polygon.forEach((p, i) => {
      const xy = p.computeXY();
      const type = isEndpoint(p) ? `Endpoint(${p.surface.id})` : isHitPoint(p) ? `HitPoint(${p.hitSurface.id})` : p.type;
      console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${type}`);
    });
    console.log("Has (20, 80):", hasLeftWallTop);

    // This test documents the bug - it will FAIL if the bug exists
    expect(hasLeftWallTop).toBe(true);
  });

  it("should show the sequence around left-wall for both positions", () => {
    // Test both positions and show the vertex sequence
    const positions = [
      { name: "CORRECT", pos: CORRECT_PLAYER },
      { name: "BUGGY", pos: BUGGY_PLAYER },
    ];

    for (const { name, pos } of positions) {
      const cone = createFullCone(pos);

      const polygon = projectConeV2(cone, chains, BOUNDS);

      // Find vertices near the left wall and ceiling intersection
      const relevantVertices = polygon.filter((p) => {
        const xy = p.computeXY();
        return xy.x <= 300 && xy.y <= 100; // Top-left region
      });

      console.log(`\n=== ${name} - Top-left region vertices ===`);
      relevantVertices.forEach((p) => {
        const xy = p.computeXY();
        const type = isEndpoint(p) ? `Endpoint(${p.surface.id})` : isHitPoint(p) ? `HitPoint(${p.hitSurface.id})` : p.type;
        console.log(`  (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) - ${type}`);
      });

      // Also find the vertex just before (20, 80) should appear
      const leftWallHit = polygon.find((p) => {
        if (!isHitPoint(p)) return false;
        return p.hitSurface.id === "left-wall-0" && p.computeXY().y > 100;
      });

      if (leftWallHit) {
        const hitXY = leftWallHit.computeXY();
        console.log(`  Left-wall hit: (${hitXY.x.toFixed(2)}, ${hitXY.y.toFixed(2)})`);
      }
    }

    // Just a documentation test - always passes
    expect(true).toBe(true);
  });

  it("HYPOTHESIS: preparePolygonForRendering removes (20, 80) in buggy case", () => {
    // Test both positions and see if rendering prep removes the vertex
    const positions = [
      { name: "CORRECT", pos: CORRECT_PLAYER },
      { name: "BUGGY", pos: BUGGY_PLAYER },
    ];

    console.log("\n=== TESTING preparePolygonForRendering ===");

    for (const { name, pos } of positions) {
      const cone = createFullCone(pos);
      const sourcePoints = projectConeV2(cone, chains, BOUNDS);
      const rawPolygon = toVector2Array(sourcePoints);
      const renderedPolygon = preparePolygonForRendering(rawPolygon);

      // Check if (20, 80) is in raw polygon
      const hasInRaw = rawPolygon.some((p) => p.x === 20 && p.y === 80);

      // Check if (20, 80) is in rendered polygon
      const hasInRendered = renderedPolygon.some((p) => p.x === 20 && p.y === 80);

      console.log(`\n${name}:`);
      console.log(`  Raw polygon has (20, 80): ${hasInRaw}`);
      console.log(`  Rendered polygon has (20, 80): ${hasInRendered}`);
      console.log(`  Raw polygon size: ${rawPolygon.length}`);
      console.log(`  Rendered polygon size: ${renderedPolygon.length}`);

      // Show the transition around the corner
      const cornerIdx = rawPolygon.findIndex((p) => p.x === 20 && p.y === 80);
      if (cornerIdx >= 0) {
        console.log(`  Corner context in raw (indices ${cornerIdx - 2} to ${cornerIdx + 2}):`);
        for (let i = Math.max(0, cornerIdx - 2); i <= Math.min(rawPolygon.length - 1, cornerIdx + 2); i++) {
          const p = rawPolygon[i]!;
          const marker = i === cornerIdx ? " <-- CORNER" : "";
          console.log(`    ${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})${marker}`);
        }
      }

      // Show rendered polygon around that area
      console.log(`  Rendered polygon (top-left area, y <= 150):`);
      renderedPolygon.forEach((p, i) => {
        if (p.y <= 150 || p.x <= 30) {
          console.log(`    ${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
        }
      });

      if (!hasInRendered && hasInRaw) {
        console.log(`  >>> BUG FOUND: (20, 80) removed by preparePolygonForRendering!`);
      }
    }

    // This test just documents - we'll assert based on findings
    expect(true).toBe(true);
  });

  it("TRACE: removeCollinearPoints decision for corner (20, 80)", () => {
    // Trace exactly what happens in removeCollinearPoints for the corner
    const positions = [
      { name: "CORRECT", pos: CORRECT_PLAYER },
      { name: "BUGGY", pos: BUGGY_PLAYER },
    ];

    console.log("\n=== TRACING removeCollinearPoints for corner (20, 80) ===");

    for (const { name, pos } of positions) {
      const cone = createFullCone(pos);
      const sourcePoints = projectConeV2(cone, chains, BOUNDS);
      const rawPolygon = toVector2Array(sourcePoints);

      // Find the corner index
      const cornerIdx = rawPolygon.findIndex((p) => p.x === 20 && p.y === 80);
      if (cornerIdx < 0) {
        console.log(`${name}: Corner not found in raw polygon!`);
        continue;
      }

      const prev = rawPolygon[(cornerIdx - 1 + rawPolygon.length) % rawPolygon.length]!;
      const curr = rawPolygon[cornerIdx]!;
      const next = rawPolygon[(cornerIdx + 1) % rawPolygon.length]!;

      // Calculate cross product (collinearity check)
      const cross = (curr.x - prev.x) * (next.y - prev.y) - (curr.y - prev.y) * (next.x - prev.x);

      // Calculate isBetween
      const prevToNext = Math.hypot(next.x - prev.x, next.y - prev.y);
      const prevToCurr = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const currToNext = Math.hypot(next.x - curr.x, next.y - curr.y);
      const isBetween = Math.abs(prevToCurr + currToNext - prevToNext) < 1;

      // Calculate dot product for direction check
      const dirPrevCurr = { x: curr.x - prev.x, y: curr.y - prev.y };
      const dirCurrNext = { x: next.x - curr.x, y: next.y - curr.y };
      const dot = dirPrevCurr.x * dirCurrNext.x + dirPrevCurr.y * dirCurrNext.y;

      // Decisions
      const isCollinear = Math.abs(cross) <= 2; // tolerance * 2 = 1 * 2 = 2
      const sameDirection = dot > 0;
      const shouldRemove = isCollinear && isBetween && sameDirection;

      console.log(`\n${name} (corner at index ${cornerIdx}):`);
      console.log(`  prev: (${prev.x}, ${prev.y})`);
      console.log(`  curr: (${curr.x}, ${curr.y}) <-- CORNER`);
      console.log(`  next: (${next.x}, ${next.y})`);
      console.log(`  dirPrevCurr: (${dirPrevCurr.x}, ${dirPrevCurr.y})`);
      console.log(`  dirCurrNext: (${dirCurrNext.x}, ${dirCurrNext.y})`);
      console.log(`  cross = ${cross} (raw)`);
      console.log(`  isCollinear (|cross| <= 2): ${isCollinear} (|${cross}| = ${Math.abs(cross)})`);
      console.log(`  isBetween: ${isBetween}`);
      console.log(`  dot = ${dot} (raw)`);
      console.log(`  dot.toPrecision(20) = ${dot.toPrecision(20)}`);
      console.log(`  sameDirection (dot > 0): ${sameDirection}`);
      console.log(`  shouldRemove: ${shouldRemove}`);
      console.log(`  DECISION: ${shouldRemove ? "REMOVE" : "KEEP"}`);
    }

    expect(true).toBe(true);
  });
});

