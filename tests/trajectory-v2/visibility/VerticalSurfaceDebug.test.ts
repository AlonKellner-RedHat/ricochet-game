/**
 * Debug test for vertical surface cone boundary issues.
 */
import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createConeThroughWindow,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import {
  isOriginPoint,
  isHitPoint,
  isEndpoint,
} from "@/trajectory-v2/geometry/SourcePoint";

describe("Vertical Surface Debug", () => {
  const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

  // Vertical surface
  const VERTICAL_SURFACE = createRicochetChain("v1", [
    { x: 400, y: 260 },
    { x: 400, y: 460 },
  ]);

  it("should analyze reflected cone for player=(227,81)", () => {
    const player = { x: 227, y: 81 };
    const surface = VERTICAL_SURFACE.getSurfaces()[0]!;

    const reflectedOrigin = reflectPointThroughLine(
      player,
      surface.segment.start,
      surface.segment.end
    );

    console.log("=== SCENARIO ===");
    console.log(`Player: (${player.x}, ${player.y})`);
    console.log(`Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`);
    console.log(`Surface: (${surface.segment.start.x}, ${surface.segment.start.y}) → (${surface.segment.end.x}, ${surface.segment.end.y})`);

    const window = { start: surface.segment.start, end: surface.segment.end };
    const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

    const sourcePoints = projectConeV2(cone, [VERTICAL_SURFACE], SCREEN_BOUNDS, surface.id);
    const vertices = toVector2Array(sourcePoints);

    console.log("\n=== POLYGON VERTICES ===");
    sourcePoints.forEach((p, i) => {
      const xy = p.computeXY();
      const type = isOriginPoint(p) ? "OriginPoint" : 
                   isHitPoint(p) ? "HitPoint" : 
                   isEndpoint(p) ? "Endpoint" : "Other";
      console.log(`  ${i}: ${type} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) key=${p.getKey()}`);
    });

    // Check for self-intersections
    const intersections: string[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const a1 = vertices[i]!;
      const a2 = vertices[(i + 1) % vertices.length]!;

      for (let j = i + 2; j < vertices.length; j++) {
        if ((j + 1) % vertices.length === i) continue;

        const b1 = vertices[j]!;
        const b2 = vertices[(j + 1) % vertices.length]!;

        const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
          (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

        const d1 = cross(b1, b2, a1);
        const d2 = cross(b1, b2, a2);
        const d3 = cross(a1, a2, b1);
        const d4 = cross(a1, a2, b2);

        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
          intersections.push(
            `Edge ${i}→${(i + 1) % vertices.length} (${a1.x.toFixed(1)},${a1.y.toFixed(1)})→(${a2.x.toFixed(1)},${a2.y.toFixed(1)}) crosses Edge ${j}→${(j + 1) % vertices.length} (${b1.x.toFixed(1)},${b1.y.toFixed(1)})→(${b2.x.toFixed(1)},${b2.y.toFixed(1)})`
          );
        }
      }
    }

    if (intersections.length > 0) {
      console.log("\n=== SELF-INTERSECTIONS ===");
      intersections.forEach((s) => console.log(`  ${s}`));
    }

    // Analyze cross products between consecutive pairs
    console.log("\n=== CROSS PRODUCT ANALYSIS ===");
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i]!;
      const next = vertices[(i + 1) % vertices.length]!;
      
      const vCurrent = { x: current.x - reflectedOrigin.x, y: current.y - reflectedOrigin.y };
      const vNext = { x: next.x - reflectedOrigin.x, y: next.y - reflectedOrigin.y };
      
      const cross = vCurrent.x * vNext.y - vCurrent.y * vNext.x;
      
      console.log(`  ${i}→${(i + 1) % vertices.length}: cross=${cross.toFixed(2)} (${cross > 0 ? "CCW" : cross < 0 ? "CW" : "COLLINEAR"})`);
    }

    // Debug: check what edges the hits are on
    console.log("\n=== HIT EDGE ANALYSIS ===");
    sourcePoints.forEach((p, i) => {
      if (isHitPoint(p)) {
        const surfaceId = (p as any).hitSurface?.id;
        console.log(`  ${i}: HitPoint on ${surfaceId}`);
      }
    });

    expect(intersections.length).toBe(0);
  });
});

