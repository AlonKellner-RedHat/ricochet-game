import { describe, it, expect } from "vitest";
import { getSceneById } from "@/debug/debugScenes";
import {
  createFullCone,
  projectConeV2,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";

describe("Debug PreComputedPairs", () => {
  const origin = { x: 581, y: 81 };

  it("traces PreComputedPairs for junction collinear continuation", () => {
    const sceneConfig = getSceneById("full-demo");
    const screenChain = createScreenBoundaryChain({
      minX: 0, maxX: 1280, minY: 0, maxY: 720,
    });
    const allChains: SurfaceChain[] = [...sceneConfig!.chains, screenChain];

    const cone = createFullCone(origin);
    const sourcePoints = projectConeV2(cone, allChains);

    // Find the junction and endpoint at 45°
    const junction = sourcePoints.find(
      (p) => p.getKey() === "junction:chain-16:1"
    );
    const endpoint = sourcePoints.find(
      (p) => p.getKey() === "endpoint:chain2-1:end"
    );
    const hitRoom2 = sourcePoints.find(
      (p) => p.getKey().includes("room-2") && 
             p.computeXY().x > 1190 && p.computeXY().x < 1210
    );

    console.log("Junction:", junction?.getKey());
    console.log("Endpoint:", endpoint?.getKey());
    console.log("HitPoint:", hitRoom2?.getKey());

    expect(junction).toBeDefined();
    expect(endpoint).toBeDefined();

    // Check if they share a continuationRay
    console.log("Junction continuationRay:", junction?.continuationRay?.id);
    console.log("Endpoint continuationRay:", endpoint?.continuationRay?.id);
    console.log("HitPoint continuationRay:", hitRoom2?.continuationRay?.id);

    // Find their positions in the sorted polygon
    const junctionIndex = sourcePoints.findIndex(
      (p) => p.getKey() === "junction:chain-16:1"
    );
    const endpointIndex = sourcePoints.findIndex(
      (p) => p.getKey() === "endpoint:chain2-1:end"
    );
    const hitIndex = sourcePoints.findIndex(
      (p) => p === hitRoom2
    );

    console.log("Polygon indices:");
    console.log("  Junction:", junctionIndex);
    console.log("  Endpoint:", endpointIndex);
    console.log("  HitPoint:", hitIndex);

    // For CCW blocking (far-before-near), the order should be:
    // hitIndex < endpointIndex < junctionIndex
    console.log("\nExpected order: HitPoint < Endpoint < Junction (far to near)");
    console.log("Actual order:", hitIndex, "<", endpointIndex, "<", junctionIndex);

    // Get distances from origin
    const junctionDist = Math.sqrt((junction!.computeXY().x - origin.x) ** 2 + (junction!.computeXY().y - origin.y) ** 2);
    const endpointDist = Math.sqrt((endpoint!.computeXY().x - origin.x) ** 2 + (endpoint!.computeXY().y - origin.y) ** 2);
    const hitDist = hitRoom2 ? Math.sqrt((hitRoom2.computeXY().x - origin.x) ** 2 + (hitRoom2.computeXY().y - origin.y) ** 2) : 0;

    console.log("\nDistances from origin:");
    console.log("  Junction:", junctionDist.toFixed(1));
    console.log("  Endpoint:", endpointDist.toFixed(1));
    console.log("  HitPoint:", hitDist.toFixed(1));

    // This should pass if PreComputedPairs are working correctly
    expect(hitIndex).toBeLessThan(endpointIndex);
    expect(endpointIndex).toBeLessThan(junctionIndex);
  });
});
