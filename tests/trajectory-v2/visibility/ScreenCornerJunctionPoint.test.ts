/**
 * TDD Test: Screen Corner JunctionPoint
 *
 * Screen corners should be represented as JunctionPoints, not HitPoints.
 * This test verifies the fix for the floating-point bug where rays to
 * screen corners were being blocked by the corner's own boundary surfaces.
 *
 * Principle: Screen boundaries are a regular SurfaceChain with JunctionPoints
 * at corners - no special handling.
 */

import { describe, expect, it } from "vitest";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import { isHitPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };
const CORNERS = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1280, y: 0 },
  bottomRight: { x: 1280, y: 720 },
  bottomLeft: { x: 0, y: 720 },
};

/**
 * Find a SourcePoint at a specific position in the polygon.
 */
function findPointAt(
  sourcePoints: SourcePoint[],
  target: Vector2,
  tolerance: number = 0.1
): SourcePoint | undefined {
  return sourcePoints.find((sp) => {
    const xy = sp.computeXY();
    return Math.abs(xy.x - target.x) < tolerance && Math.abs(xy.y - target.y) < tolerance;
  });
}

describe("Screen Corner JunctionPoint", () => {
  // Use an origin that has a clear line of sight to the bottom-right corner
  // This is the exact origin from the failing invariant test
  const ORIGIN: Vector2 = { x: 668.19, y: 573.89 };

  it("should represent bottom-right corner as JunctionPoint, not HitPoint", () => {
    // Create screen chain - this is the only chain needed for this test
    // Screen boundaries are just a regular SurfaceChain - no special handling
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

    // Project visibility cone with only screen boundaries as obstacles
    const source = createFullCone(ORIGIN);
    const sourcePoints = projectConeV2(source, [screenChain]);

    // Find the point at the bottom-right corner
    const bottomRightPoint = findPointAt(sourcePoints, CORNERS.bottomRight);

    expect(bottomRightPoint).toBeDefined();
    console.log("Bottom-right corner point type:", bottomRightPoint?.constructor.name);

    if (bottomRightPoint) {
      const xy = bottomRightPoint.computeXY();
      console.log(`  Position: (${xy.x}, ${xy.y})`);

      if (isHitPoint(bottomRightPoint)) {
        console.log(`  Surface: ${bottomRightPoint.hitSurface.id}`);
        console.log("  *** BUG: Corner is HitPoint instead of JunctionPoint ***");
      }

      if (isJunctionPoint(bottomRightPoint)) {
        const before = bottomRightPoint.getSurfaceBefore();
        const after = bottomRightPoint.getSurfaceAfter();
        console.log(`  Junction between: ${before.id} and ${after.id}`);
      }
    }

    // The corner MUST be a JunctionPoint
    expect(isJunctionPoint(bottomRightPoint)).toBe(true);
  });

  it("should represent all four corners as JunctionPoints", () => {
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const source = createFullCone(ORIGIN);
    const sourcePoints = projectConeV2(source, [screenChain]);

    console.log("Checking all four corners:");

    for (const [name, corner] of Object.entries(CORNERS)) {
      const point = findPointAt(sourcePoints, corner);

      if (point) {
        const isJunction = isJunctionPoint(point);
        const isHit = isHitPoint(point);
        const status = isJunction ? "JunctionPoint" : isHit ? "HitPoint" : "Other";
        console.log(`  ${name}: ${status}`);

        expect(isJunction).toBe(true);
      } else {
        // Corner might not be visible from this origin - that's OK
        console.log(`  ${name}: not in polygon (not visible from origin)`);
      }
    }
  });

  it("should have valid adjacent pairs between corner JunctionPoints and edge HitPoints", () => {
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const source = createFullCone(ORIGIN);
    const sourcePoints = projectConeV2(source, [screenChain]);

    console.log("\nPolygon vertices:");
    for (let i = 0; i < sourcePoints.length; i++) {
      const sp = sourcePoints[i]!;
      const xy = sp.computeXY();
      const type = isJunctionPoint(sp)
        ? "Junction"
        : isHitPoint(sp)
          ? `HitPoint[${sp.hitSurface.id}]`
          : "Other";
      console.log(`  [${i}] ${type} at (${xy.x.toFixed(1)}, ${xy.y.toFixed(1)})`);
    }

    // Check that adjacent vertices share a surface
    let invalidPairs = 0;
    for (let i = 0; i < sourcePoints.length; i++) {
      const s1 = sourcePoints[i]!;
      const s2 = sourcePoints[(i + 1) % sourcePoints.length]!;

      // Get surface IDs
      const ids1 = getSurfaceIds(s1);
      const ids2 = getSurfaceIds(s2);

      const shared = ids1.some((id) => ids2.includes(id));
      if (!shared) {
        console.log(`  *** Invalid pair [${i}→${(i + 1) % sourcePoints.length}]: ${ids1} → ${ids2}`);
        invalidPairs++;
      }
    }

    expect(invalidPairs).toBe(0);
  });
});

/**
 * Get surface IDs from a SourcePoint.
 */
function getSurfaceIds(sp: SourcePoint): string[] {
  if (isHitPoint(sp)) {
    return [sp.hitSurface.id];
  }
  if (isJunctionPoint(sp)) {
    return [sp.getSurfaceBefore().id, sp.getSurfaceAfter().id];
  }
  return [];
}
