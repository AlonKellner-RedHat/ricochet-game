/**
 * Hypothesis Test: Collinear Surface Ordering Bug
 *
 * In the full-demo scene at player (581, 81), three points at exactly 45° are
 * incorrectly ordered:
 *   [9] Junction[chain2-0+chain2-1] (750, 250) - nearest
 *   [10] Endpoint[chain2-1] (792, 292) - middle
 *   [11] HitPoint[room-2] (1200, 700) - farthest
 *
 * These should be in reverse order (far-to-near) for proper CCW traversal of
 * an "outward spike".
 *
 * Hypothesis: These points are NOT on the same ContinuationRay, causing the
 * sorting to fall back to distance order (near-to-far).
 */

import { describe, it, expect } from "vitest";
import { getSceneById } from "@/debug/debugScenes";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { isEndpoint, isHitPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";

describe("Collinear Surface Ordering Bug", () => {
  const scene = getSceneById("full-demo")!;
  const origin = { x: 581, y: 81 };
  const screenChain = createScreenBoundaryChain({
    minX: 0, maxX: 1280, minY: 0, maxY: 720
  });
  const allChains = [...scene.chains, screenChain];

  it("should reproduce the collinear ordering bug", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find points at approximately 45° angle
    const collinearPoints: { point: SourcePoint; angle: number; distance: number; index: number }[] = [];
    
    for (let i = 0; i < sourcePoints.length; i++) {
      const sp = sourcePoints[i]!;
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Find points at ~45° (within 0.5° tolerance)
      if (Math.abs(angle - 45) < 0.5) {
        collinearPoints.push({ point: sp, angle, distance, index: i });
      }
    }

    console.log("\n=== COLLINEAR POINTS AT 45° ===");
    for (const { point, distance, index } of collinearPoints) {
      const xy = point.computeXY();
      const rayId = point.continuationRay?.id ?? "none";
      console.log(`  [${index}] ${point.getKey()} (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) dist=${distance.toFixed(0)} ray=${rayId}`);
    }

    // AFTER FIX: Only the Junction should remain at 45°
    // The Endpoint and HitPoint are now blocked by the Junction via provenance
    console.log("\n=== ORDER ANALYSIS ===");
    console.log(`Number of collinear points: ${collinearPoints.length}`);
    console.log("EXPECTED: 1 (only Junction, Endpoint blocked by provenance)");

    // After the provenance-based fix, only the Junction remains at 45°
    // The Endpoint and HitPoint are blocked because the Junction is on the collinear surface
    expect(collinearPoints.length).toBe(1);
    expect(isJunctionPoint(collinearPoints[0]!.point)).toBe(true);
  });

  it("should check if collinear points share the same ContinuationRay", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find points at approximately 45° angle
    const collinearPoints: SourcePoint[] = [];
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      if (Math.abs(angle - 45) < 0.5) {
        collinearPoints.push(sp);
      }
    }

    console.log("\n=== CONTINUATION RAY ANALYSIS ===");
    const rayIds = new Set<string>();
    
    for (const point of collinearPoints) {
      const xy = point.computeXY();
      const rayId = point.continuationRay?.id ?? "none";
      rayIds.add(rayId);
      
      console.log(`  ${point.getKey()} @ (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)})`);
      console.log(`    continuationRay: ${rayId}`);
      
      if (point.continuationRay) {
        const ray = point.continuationRay;
        console.log(`    ray.source: ${ray.source.getKey()}`);
        console.log(`    ray.passedThrough: [${ray.passedThrough.map(p => p.getKey()).join(", ")}]`);
        console.log(`    ray.hit: ${ray.hit?.getKey() ?? "none"}`);
      }
    }

    console.log(`\nUnique ray IDs: ${Array.from(rayIds).join(", ")}`);
    console.log(`All on same ray: ${rayIds.size === 1 && !rayIds.has("none")}`);

    // HYPOTHESIS: They are NOT all on the same ray
    // This would explain why distance order is used instead of shadow boundary order
    const allOnSameRay = rayIds.size === 1 && !rayIds.has("none");
    
    if (!allOnSameRay) {
      console.log("\n=== HYPOTHESIS CONFIRMED ===");
      console.log("Points are NOT on the same ContinuationRay.");
      console.log("This causes fallback to distance order (near-to-far).");
    }

    // Document the current state
    expect(rayIds.size).toBeGreaterThan(0);
  });

  it("should trace the source of each collinear point", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find points at approximately 45° angle
    const collinearPoints: SourcePoint[] = [];
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      if (Math.abs(angle - 45) < 0.5) {
        collinearPoints.push(sp);
      }
    }

    console.log("\n=== POINT SOURCE TRACING ===");
    
    for (const point of collinearPoints) {
      const xy = point.computeXY();
      console.log(`\n${point.getKey()} @ (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)}):`);
      
      if (isJunctionPoint(point)) {
        console.log(`  Type: JunctionPoint`);
        console.log(`  Surface before: ${point.getSurfaceBefore().id}`);
        console.log(`  Surface after: ${point.getSurfaceAfter().id}`);
      } else if (isEndpoint(point)) {
        console.log(`  Type: Endpoint`);
        console.log(`  Surface: ${point.surface.id}`);
        console.log(`  Which: ${point.which}`);
      } else if (isHitPoint(point)) {
        console.log(`  Type: HitPoint`);
        console.log(`  Hit surface: ${point.hitSurface.id}`);
        console.log(`  s parameter: ${point.s.toFixed(4)}`);
      }

      if (point.continuationRay) {
        console.log(`  On ContinuationRay: ${point.continuationRay.id}`);
        console.log(`    Source: ${point.continuationRay.source.getKey()}`);
      } else {
        console.log(`  NOT on any ContinuationRay`);
      }
    }

    expect(collinearPoints.length).toBeGreaterThan(0);
  });

  it("should check if Junction is blocking and why", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find the Junction at 45°
    let junction: SourcePoint | undefined;
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      if (Math.abs(angle - 45) < 0.5 && isJunctionPoint(sp)) {
        junction = sp;
        break;
      }
    }

    expect(junction).toBeDefined();
    expect(isJunctionPoint(junction)).toBe(true);

    const jp = junction as any; // Cast to access JunctionPoint methods
    
    console.log("\n=== JUNCTION BLOCKING ANALYSIS ===");
    console.log(`Junction: ${junction!.getKey()}`);
    console.log(`Position: (${junction!.computeXY().x}, ${junction!.computeXY().y})`);
    console.log(`Surface before: ${jp.getSurfaceBefore().id}`);
    console.log(`Surface after: ${jp.getSurfaceAfter().id}`);

    // Check if isBlocking would return true
    // We need surfaceOrientations to check this properly
    // For now, let's analyze the geometry
    
    // The ray direction from origin to junction
    const jxy = junction!.computeXY();
    const rayDir = { x: jxy.x - origin.x, y: jxy.y - origin.y };
    console.log(`Ray direction: (${rayDir.x.toFixed(2)}, ${rayDir.y.toFixed(2)})`);

    // Check if junction has a continuation ray
    console.log(`Has ContinuationRay: ${!!junction!.continuationRay}`);

    if (!junction!.continuationRay) {
      console.log("\n=== POSSIBLE REASONS FOR NO CONTINUATION ===");
      console.log("1. Junction.isBlocking() returned true");
      console.log("2. Ray to junction was blocked by another surface");
      console.log("3. Continuation ray casting failed");
    }
  });

  it("FIXED: Only Junction remains at 45° after provenance fix", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find points at 45°
    let junction: SourcePoint | undefined;
    let endpoint: SourcePoint | undefined;
    let hitPoint: SourcePoint | undefined;
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      if (Math.abs(angle - 45) < 0.5) {
        if (isJunctionPoint(sp)) junction = sp;
        else if (isEndpoint(sp)) endpoint = sp;
        else if (isHitPoint(sp)) hitPoint = sp;
      }
    }

    console.log("\n=== PROVENANCE FIX VERIFICATION ===");
    console.log(`Junction at 45°: ${junction?.getKey() ?? "not found"}`);
    console.log(`Endpoint at 45°: ${endpoint?.getKey() ?? "not found"}`);
    console.log(`HitPoint at 45°: ${hitPoint?.getKey() ?? "not found"}`);

    // AFTER FIX: Only the Junction should remain
    // Endpoint and HitPoint are blocked by the Junction via provenance
    expect(junction).toBeDefined();
    expect(endpoint).toBeUndefined();
    expect(hitPoint).toBeUndefined();

    console.log("\n=== FIX VERIFIED ===");
    console.log("Only Junction at 45°. Endpoint and HitPoint are correctly blocked.");
  });

  it("FIXED: Ray to Endpoint IS now blocked by Junction via provenance", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find the Junction at 45°
    let junction: SourcePoint | undefined;
    let endpoint: SourcePoint | undefined;
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      if (Math.abs(angle - 45) < 0.5) {
        if (isJunctionPoint(sp)) junction = sp;
        else if (isEndpoint(sp)) endpoint = sp;
      }
    }

    console.log("\n=== RAY BLOCKING VERIFICATION ===");
    console.log(`Junction at 45°: ${junction?.getKey() ?? "not found"}`);
    console.log(`Endpoint at 45°: ${endpoint?.getKey() ?? "not found"}`);

    // AFTER FIX: Junction should exist, Endpoint should NOT exist at 45°
    // The Endpoint is now blocked by the Junction via provenance-based detection
    expect(junction).toBeDefined();
    expect(endpoint).toBeUndefined(); // Endpoint is blocked!

    console.log("\n=== FIX VERIFIED ===");
    console.log("Junction exists at 45°, Endpoint is BLOCKED.");
    console.log("Provenance-based junction detection is working correctly.");
  });

  it("should verify angles are exactly equal or slightly different", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find all points at approximately 45° angle with high precision
    const points: { point: SourcePoint; angle: number; distance: number }[] = [];
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Find points at ~45° (within 1° tolerance)
      if (Math.abs(angle - Math.PI / 4) < 0.02) {
        points.push({ point: sp, angle, distance });
      }
    }

    console.log("\n=== HIGH PRECISION ANGLE ANALYSIS ===");
    for (const { point, angle, distance } of points) {
      const xy = point.computeXY();
      const degrees = angle * 180 / Math.PI;
      const delta = (angle - Math.PI / 4) * 180 / Math.PI;
      console.log(`${point.getKey()}`);
      console.log(`  Position: (${xy.x.toFixed(6)}, ${xy.y.toFixed(6)})`);
      console.log(`  Distance: ${distance.toFixed(6)}`);
      console.log(`  Angle: ${degrees.toFixed(10)}° (delta from 45°: ${delta.toFixed(10)}°)`);
      console.log(`  Raw angle: ${angle.toFixed(15)} rad`);
    }

    // Check if angles are EXACTLY equal
    const angles = points.map(p => p.angle);
    const allExactlyEqual = angles.every(a => a === angles[0]);
    console.log(`\nAll angles exactly equal: ${allExactlyEqual}`);
    
    if (!allExactlyEqual) {
      console.log("\n=== FLOATING-POINT DIFFERENCE FOUND ===");
      console.log("The angles are NOT exactly equal due to floating-point representation.");
      console.log("This may cause the ray intersection check to miss the Junction.");
    }
  });

  it("ROOT CAUSE: Surface exclusion causes Junction to be missed when casting to Endpoint", () => {
    // This test proves that when casting a ray TO the Endpoint (chain2-1:end),
    // the surface chain2-1 is EXCLUDED from obstacle checking.
    // Since the Junction is at the endpoint of chain2-1, it is NOT detected as blocking.
    
    // Get the scene chains
    const chain2 = scene.chains.find(c => c.getSurfaces().some(s => s.id === "chain2-1"));
    expect(chain2).toBeDefined();

    console.log("\n=== SURFACE EXCLUSION ANALYSIS ===");
    
    // Find the specific surfaces
    const chain2_0 = chain2!.getSurfaces().find(s => s.id === "chain2-0");
    const chain2_1 = chain2!.getSurfaces().find(s => s.id === "chain2-1");
    
    expect(chain2_0).toBeDefined();
    expect(chain2_1).toBeDefined();

    console.log(`chain2-0: ${JSON.stringify(chain2_0!.segment)}`);
    console.log(`chain2-1: ${JSON.stringify(chain2_1!.segment)}`);

    // Find the junction between chain2-0 and chain2-1
    const junctions = chain2!.getJunctionPoints();
    const junction = junctions.find(jp => 
      jp.getSurfaceBefore().id === "chain2-0" && jp.getSurfaceAfter().id === "chain2-1"
    );
    
    console.log(`\nJunction: ${junction?.getKey() ?? "not found"}`);
    if (junction) {
      console.log(`Junction position: (${junction.computeXY().x}, ${junction.computeXY().y})`);
    }

    // The endpoint is chain2-1:end (at the END of chain2-1)
    // chain2-1 goes from (750, 250) to (792.43, 292.43)
    // So the end is at (792.43, 292.43)
    const endpointPos = chain2_1!.segment.end;
    console.log(`\nEndpoint position: (${endpointPos.x.toFixed(2)}, ${endpointPos.y.toFixed(2)})`);
    console.log(`Endpoint's excluded surface would be: chain2-1`);

    // When casting a ray TO the endpoint:
    // - chain2-1 is EXCLUDED (because endpoint is on chain2-1)
    // - The ray checks chain2-0 for hits
    // 
    // But HERE'S THE BUG:
    // The junction is at the END of chain2-0 (s=1)
    // When checking chain2-0, we get a hit at s=1
    // We call findSourcePointAtEndpoint which returns the Junction
    // The Junction is BLOCKING (both surfaces face same direction)
    // So the ray SHOULD be blocked...
    //
    // BUT: The junction is at the START of chain2-1 (s=0)
    // If we're checking chain2-1 first and finding s=0, we would exclude it
    // because chain2-1 is in the excluded list!
    //
    // Wait - but chain2-0 is NOT excluded. So why isn't the junction detected?

    // Let me check the ray-segment intersection more carefully
    const origin_pos = { x: 581, y: 81 };
    const endpoint_pos = endpointPos;
    const junction_pos = junction!.computeXY();

    // Ray direction
    const rayDir = {
      x: endpoint_pos.x - origin_pos.x,
      y: endpoint_pos.y - origin_pos.y
    };

    console.log(`\n=== RAY GEOMETRY ===`);
    console.log(`Ray from origin to endpoint:`);
    console.log(`  Direction: (${rayDir.x.toFixed(2)}, ${rayDir.y.toFixed(2)})`);

    // Check if the ray passes through the junction
    // If junction is on the ray, then: junction = origin + t * rayDir for some t in (0, 1)
    const t_x = (junction_pos.x - origin_pos.x) / rayDir.x;
    const t_y = (junction_pos.y - origin_pos.y) / rayDir.y;

    console.log(`\nRay parameter t for junction:`);
    console.log(`  t_x = ${t_x.toFixed(6)}`);
    console.log(`  t_y = ${t_y.toFixed(6)}`);
    console.log(`  t values match: ${Math.abs(t_x - t_y) < 1e-9}`);
    console.log(`  Junction is on ray (0 < t < 1): ${t_x > 0 && t_x < 1}`);

    // Now check if the ray intersects chain2-0
    const seg0 = chain2_0!.segment;
    console.log(`\nchain2-0 segment: (${seg0.start.x}, ${seg0.start.y}) → (${seg0.end.x}, ${seg0.end.y})`);
    
    // The junction should be at one end of chain2-0
    const junctionAtStart0 = seg0.start.x === junction_pos.x && seg0.start.y === junction_pos.y;
    const junctionAtEnd0 = seg0.end.x === junction_pos.x && seg0.end.y === junction_pos.y;
    console.log(`Junction at start of chain2-0: ${junctionAtStart0}`);
    console.log(`Junction at end of chain2-0: ${junctionAtEnd0}`);

    // If junction is at end of chain2-0, and the ray hits chain2-0 at s=1,
    // then findSourcePointAtEndpoint should find the Junction
    // and the Junction should be BLOCKING
    
    console.log("\n=== ROOT CAUSE ===");
    console.log("The Endpoint's excluded surfaces include chain2-1.");
    console.log("When casting a ray TO the Endpoint, chain2-1 is skipped.");
    console.log("");
    console.log("The Junction is at the intersection of chain2-0 and chain2-1.");
    console.log("If the ray only hits chain2-0 at s=1 (the junction position),");
    console.log("and if the Junction is found and is BLOCKING,");
    console.log("then the ray should be blocked and the Endpoint should NOT be added.");
    console.log("");
    console.log("BUT: The Endpoint IS in the polygon with its own continuation ray!");
    console.log("This means either:");
    console.log("  1. The ray doesn't hit chain2-0 at s=1 (geometry issue)");
    console.log("  2. The Junction is not found by findSourcePointAtEndpoint");
    console.log("  3. The Junction's isBlocking() returns false (incorrect)");

    // Let's verify the geometry more precisely
    // Does the ray from origin to endpoint actually intersect chain2-0?
    
    expect(junction).toBeDefined();
  });

  it("DEFINITIVE ROOT CAUSE: Ray to Endpoint does NOT intersect chain2-0 in the middle", () => {
    // Get the scene chains
    const chain2 = scene.chains.find(c => c.getSurfaces().some(s => s.id === "chain2-1"));
    expect(chain2).toBeDefined();
    
    const chain2_0 = chain2!.getSurfaces().find(s => s.id === "chain2-0")!;
    const chain2_1 = chain2!.getSurfaces().find(s => s.id === "chain2-1")!;

    const origin_pos = { x: 581, y: 81 };
    const endpoint_pos = chain2_1.segment.end; // (792.43, 292.43)

    // Scale the ray for intersection test
    const scale = 10;
    const rayEnd = {
      x: origin_pos.x + (endpoint_pos.x - origin_pos.x) * scale,
      y: origin_pos.y + (endpoint_pos.y - origin_pos.y) * scale
    };

    console.log("\n=== DEFINITIVE INTERSECTION TEST ===");
    console.log(`Origin: (${origin_pos.x}, ${origin_pos.y})`);
    console.log(`Endpoint: (${endpoint_pos.x.toFixed(2)}, ${endpoint_pos.y.toFixed(2)})`);
    console.log(`Ray end (scaled): (${rayEnd.x.toFixed(2)}, ${rayEnd.y.toFixed(2)})`);

    console.log(`\nchain2-0: (${chain2_0.segment.start.x.toFixed(2)}, ${chain2_0.segment.start.y.toFixed(2)}) → (${chain2_0.segment.end.x.toFixed(2)}, ${chain2_0.segment.end.y.toFixed(2)})`);

    // Check ray-segment intersection manually
    // Ray: P = origin + t * (endpoint - origin)
    // Segment: Q = start + s * (end - start)
    // Find t and s where P = Q

    const rayDx = endpoint_pos.x - origin_pos.x;
    const rayDy = endpoint_pos.y - origin_pos.y;
    const segDx = chain2_0.segment.end.x - chain2_0.segment.start.x;
    const segDy = chain2_0.segment.end.y - chain2_0.segment.start.y;
    const originToSegStart = {
      x: chain2_0.segment.start.x - origin_pos.x,
      y: chain2_0.segment.start.y - origin_pos.y
    };

    const cross = rayDx * segDy - rayDy * segDx;
    console.log(`\nCross product (ray × segment): ${cross.toFixed(6)}`);

    if (Math.abs(cross) < 1e-9) {
      console.log("Ray and segment are PARALLEL (cross ≈ 0)!");
      console.log("This means the ray does NOT intersect chain2-0 at all,");
      console.log("because they are parallel lines.");
      
      // Check if they're collinear
      const crossOriginToStart = rayDx * originToSegStart.y - rayDy * originToSegStart.x;
      console.log(`Cross to segment start: ${crossOriginToStart.toFixed(6)}`);
      
      if (Math.abs(crossOriginToStart) < 1e-9) {
        console.log("Ray and segment are COLLINEAR!");
        console.log("The ray passes along chain2-0, not through it.");
      }
    } else {
      const t = (originToSegStart.x * segDy - originToSegStart.y * segDx) / cross;
      const s = (originToSegStart.x * rayDy - originToSegStart.y * rayDx) / cross;
      console.log(`Intersection at t=${t.toFixed(6)}, s=${s.toFixed(6)}`);
      console.log(`Valid intersection (s in [0,1]): ${s >= 0 && s <= 1}`);
    }

    // Now check chain2-1 (which is EXCLUDED when casting to the endpoint)
    console.log(`\nchain2-1: (${chain2_1.segment.start.x.toFixed(2)}, ${chain2_1.segment.start.y.toFixed(2)}) → (${chain2_1.segment.end.x.toFixed(2)}, ${chain2_1.segment.end.y.toFixed(2)})`);

    const seg1Dx = chain2_1.segment.end.x - chain2_1.segment.start.x;
    const seg1Dy = chain2_1.segment.end.y - chain2_1.segment.start.y;
    const originToSeg1Start = {
      x: chain2_1.segment.start.x - origin_pos.x,
      y: chain2_1.segment.start.y - origin_pos.y
    };

    const cross1 = rayDx * seg1Dy - rayDy * seg1Dx;
    console.log(`Cross product (ray × chain2-1): ${cross1.toFixed(6)}`);

    if (Math.abs(cross1) < 1e-9) {
      console.log("Ray and chain2-1 are PARALLEL!");
      
      const crossOriginTo1Start = rayDx * originToSeg1Start.y - rayDy * originToSeg1Start.x;
      if (Math.abs(crossOriginTo1Start) < 1e-9) {
        console.log("Ray and chain2-1 are COLLINEAR!");
        console.log("");
        console.log("=== ROOT CAUSE PROVEN ===");
        console.log("The ray from origin to endpoint is COLLINEAR with chain2-1.");
        console.log("chain2-1 is EXCLUDED when casting to its endpoint.");
        console.log("chain2-0 is PARALLEL to the ray (not collinear), so no intersection.");
        console.log("");
        console.log("Since neither chain2-0 nor chain2-1 registers a valid intersection,");
        console.log("the Junction at (750, 250) is NEVER detected as blocking!");
        console.log("");
        console.log("The ray 'passes through' the junction without hitting any surface,");
        console.log("because both surfaces at the junction are parallel/collinear to the ray.");
      }
    }

    expect(chain2).toBeDefined();
  });

  it("FINAL PROOF: Check if findSourcePointAtEndpoint would find the Junction", () => {
    // Get the scene chains
    const chain2 = scene.chains.find(c => c.getSurfaces().some(s => s.id === "chain2-1"));
    expect(chain2).toBeDefined();
    
    const chain2_0 = chain2!.getSurfaces().find(s => s.id === "chain2-0")!;

    // Find the junction
    const junctions = chain2!.getJunctionPoints();
    const junction = junctions.find(jp => 
      jp.getSurfaceBefore().id === "chain2-0" && jp.getSurfaceAfter().id === "chain2-1"
    );
    expect(junction).toBeDefined();

    const junctionPos = junction!.computeXY();
    const chain2_0_end = chain2_0.segment.end;

    console.log("\n=== POSITION MATCHING TEST ===");
    console.log(`Junction position: (${junctionPos.x}, ${junctionPos.y})`);
    console.log(`chain2-0 end: (${chain2_0_end.x}, ${chain2_0_end.y})`);
    console.log(`Exact equality (x): ${junctionPos.x === chain2_0_end.x}`);
    console.log(`Exact equality (y): ${junctionPos.y === chain2_0_end.y}`);
    console.log(`Would findSourcePointAtEndpoint find junction: ${junctionPos.x === chain2_0_end.x && junctionPos.y === chain2_0_end.y}`);

    // Check if this is the issue
    if (junctionPos.x !== chain2_0_end.x || junctionPos.y !== chain2_0_end.y) {
      console.log("\n=== POSITION MISMATCH FOUND ===");
      console.log("The junction position and chain2-0 end position are NOT exactly equal.");
      console.log("This would cause findSourcePointAtEndpoint to fail to find the junction!");
    } else {
      // If positions match, check the actual intersection
      console.log("\n=== INVESTIGATING RAY INTERSECTION ===");
      
      // The ray from origin to endpoint
      const origin_pos = { x: 581, y: 81 };
      const chain2_1 = chain2!.getSurfaces().find(s => s.id === "chain2-1")!;
      const endpoint_pos = chain2_1.segment.end;

      // Compute the intersection manually
      const scale = 10;
      const rayEnd = {
        x: origin_pos.x + (endpoint_pos.x - origin_pos.x) * scale,
        y: origin_pos.y + (endpoint_pos.y - origin_pos.y) * scale
      };

      // Using lineLineIntersection logic
      const x1 = origin_pos.x, y1 = origin_pos.y;
      const x2 = rayEnd.x, y2 = rayEnd.y;
      const x3 = chain2_0.segment.start.x, y3 = chain2_0.segment.start.y;
      const x4 = chain2_0.segment.end.x, y4 = chain2_0.segment.end.y;

      const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      
      if (Math.abs(denom) > 1e-10) {
        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const s = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        console.log(`Ray-segment intersection: t=${t.toFixed(10)}, s=${s.toFixed(10)}`);
        console.log(`Is s exactly 1.0? ${s === 1}`);
        console.log(`Is s close to 1.0? ${Math.abs(s - 1) < 1e-9}`);
        
        // The hit would be computed as:
        const hitX = x3 + s * (x4 - x3);
        const hitY = y3 + s * (y4 - y3);
        console.log(`\nComputed hit position: (${hitX}, ${hitY})`);
        console.log(`Junction position: (${junctionPos.x}, ${junctionPos.y})`);
        console.log(`Exact match: ${hitX === junctionPos.x && hitY === junctionPos.y}`);

        if (s !== 1 && Math.abs(s - 1) < 1e-9) {
          console.log("\n=== FLOATING-POINT ROOT CAUSE ===");
          console.log("s is very close to 1 but NOT exactly 1.");
          console.log("The code checks (hit.s === 0 || hit.s === 1) which fails.");
          console.log("So the hit is treated as a MID-SEGMENT hit, not an endpoint hit.");
          console.log("findSourcePointAtEndpoint is NEVER called for this hit!");
        }
      }
    }
  });
});
