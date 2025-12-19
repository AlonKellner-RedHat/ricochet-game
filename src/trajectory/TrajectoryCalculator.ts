import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { TrajectoryPoint, TrajectoryResult, TrajectoryStatus, Vector2 } from "@/types";

/**
 * TrajectoryCalculator - Computes arrow paths through surfaces
 */
export class TrajectoryCalculator {
  /**
   * Calculate the trajectory from origin toward aimPoint, bouncing off surfaces
   *
   * @param origin - Starting position (player's bow)
   * @param aimPoint - Where the player is aiming (mouse position)
   * @param plannedSurfaces - Ordered list of surfaces the player wants to hit
   * @param allSurfaces - All surfaces in the level (for collision detection)
   * @param maxDistance - Maximum distance the arrow can travel
   * @returns TrajectoryResult with path points and validation status
   */
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [{ position: origin, surfaceId: null, isPlanned: false }];

    let currentRay = RayUtils.fromPoints(origin, aimPoint);
    let remainingDistance = maxDistance;
    let planIndex = 0;
    let status: TrajectoryStatus = "valid";
    let failedAtPlanIndex = -1;

    // Keep bouncing until we run out of distance or hit a wall
    while (remainingDistance > 0) {
      // Find closest intersection with any surface
      const hit = this.findClosestHit(currentRay, allSurfaces, remainingDistance);

      if (!hit) {
        // No more intersections - add endpoint at max distance
        const endpoint = RayUtils.pointAt(currentRay, remainingDistance);
        points.push({
          position: endpoint,
          surfaceId: null,
          isPlanned: false,
        });
        break;
      }

      const { surface, intersection } = hit;

      // Check if this matches the next planned surface
      const plannedSurface = plannedSurfaces[planIndex];
      const isPlannedHit =
        planIndex < plannedSurfaces.length &&
        plannedSurface !== undefined &&
        surface.id === plannedSurface.id;

      // Add hit point to trajectory
      points.push({
        position: intersection.point!,
        surfaceId: surface.id,
        isPlanned: isPlannedHit,
      });

      remainingDistance -= intersection.t;

      // Update plan tracking
      if (isPlannedHit) {
        planIndex++;
      } else if (planIndex < plannedSurfaces.length && !surface.isPlannable()) {
        // Hit a wall/obstacle before completing the plan
        status = "hit_obstacle";
        failedAtPlanIndex = planIndex;
        break;
      }

      // Handle surface behavior
      const hitResult = surface.onArrowHit(intersection.point!, currentRay.direction);

      if (hitResult.type === "stick" || hitResult.type === "destroy") {
        // Arrow stops here
        break;
      }

      if (hitResult.type === "reflect" && hitResult.reflectedDirection) {
        // Bounce off - create new ray from hit point in reflected direction
        // Move origin slightly away from surface to avoid self-intersection
        const newOrigin = Vec2.add(
          intersection.point!,
          Vec2.scale(hitResult.reflectedDirection, 0.001)
        );
        currentRay = RayUtils.create(newOrigin, hitResult.reflectedDirection);
      }
    }

    // Check if all planned surfaces were hit
    if (status === "valid" && planIndex < plannedSurfaces.length) {
      status = "missed_surface";
      failedAtPlanIndex = planIndex;
    }

    return {
      points,
      status,
      failedAtPlanIndex,
      totalDistance: maxDistance - remainingDistance,
    };
  }

  /**
   * Find the closest surface intersection along a ray
   */
  private findClosestHit(
    ray: ReturnType<typeof RayUtils.create>,
    surfaces: readonly Surface[],
    maxDistance: number
  ): { surface: Surface; intersection: ReturnType<typeof raySegmentIntersect> } | null {
    let closest: {
      surface: Surface;
      intersection: ReturnType<typeof raySegmentIntersect>;
    } | null = null;

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.t > 0.001 && hit.t <= maxDistance) {
        if (!closest || hit.t < closest.intersection.t) {
          closest = { surface, intersection: hit };
        }
      }
    }

    return closest;
  }
}
