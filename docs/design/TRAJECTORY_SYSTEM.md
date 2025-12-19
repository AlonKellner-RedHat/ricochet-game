# Trajectory System Specification

## Overview

The trajectory system calculates arrow paths using linear algebra and vector reflection. All calculations are deterministic and produce the same result given the same inputs, enabling reliable real-time preview.

---

## First Principles: Vector Reflection

### The Reflection Formula

When a vector `d` (direction) hits a surface with normal `n`, the reflected vector `r` is:

```
r = d - 2(d · n)n
```

Where:
- `d` is the incident direction (normalized)
- `n` is the surface normal (normalized, pointing away from the surface)
- `d · n` is the dot product
- `r` is the reflected direction (normalized)

### Visual Representation

```
           n (normal)
           ↑
           │
    d      │      r
     ╲     │     ╱
      ╲    │    ╱
       ╲   │   ╱
        ╲  │  ╱
         ╲ │ ╱
          ╲│╱
     ──────●────── surface
```

The angle of incidence equals the angle of reflection.

---

## Core Data Structures

### Vector2

```typescript
interface Vector2 {
  readonly x: number;
  readonly y: number;
}

// Immutable operations - return new vectors
const Vec2 = {
  create(x: number, y: number): Vector2 {
    return { x, y };
  },
  
  add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  },
  
  subtract(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
  },
  
  scale(v: Vector2, scalar: number): Vector2 {
    return { x: v.x * scalar, y: v.y * scalar };
  },
  
  dot(a: Vector2, b: Vector2): number {
    return a.x * b.x + a.y * b.y;
  },
  
  lengthSquared(v: Vector2): number {
    return v.x * v.x + v.y * v.y;
  },
  
  length(v: Vector2): number {
    return Math.sqrt(Vec2.lengthSquared(v));
  },
  
  normalize(v: Vector2): Vector2 {
    const len = Vec2.length(v);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  },
  
  reflect(direction: Vector2, normal: Vector2): Vector2 {
    // r = d - 2(d · n)n
    const d = Vec2.normalize(direction);
    const n = Vec2.normalize(normal);
    const dotProduct = Vec2.dot(d, n);
    return Vec2.subtract(d, Vec2.scale(n, 2 * dotProduct));
  },
  
  // Perpendicular vector (90° counter-clockwise)
  perpendicular(v: Vector2): Vector2 {
    return { x: -v.y, y: v.x };
  },
  
  // Distance between two points
  distance(a: Vector2, b: Vector2): number {
    return Vec2.length(Vec2.subtract(b, a));
  },
  
  // Direction from a to b (normalized)
  direction(from: Vector2, to: Vector2): Vector2 {
    return Vec2.normalize(Vec2.subtract(to, from));
  }
};
```

### LineSegment

```typescript
interface LineSegment {
  readonly start: Vector2;
  readonly end: Vector2;
}

const Segment = {
  create(start: Vector2, end: Vector2): LineSegment {
    return { start, end };
  },
  
  // Get direction vector of segment
  direction(segment: LineSegment): Vector2 {
    return Vec2.direction(segment.start, segment.end);
  },
  
  // Get normal vector (perpendicular to segment, pointing "left" of direction)
  normal(segment: LineSegment): Vector2 {
    const dir = Segment.direction(segment);
    return Vec2.perpendicular(dir);
  },
  
  // Get length of segment
  length(segment: LineSegment): number {
    return Vec2.distance(segment.start, segment.end);
  },
  
  // Get midpoint
  midpoint(segment: LineSegment): Vector2 {
    return {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2
    };
  }
};
```

### Ray

```typescript
interface Ray {
  readonly origin: Vector2;
  readonly direction: Vector2; // Should be normalized
}

const RayUtils = {
  create(origin: Vector2, direction: Vector2): Ray {
    return { origin, direction: Vec2.normalize(direction) };
  },
  
  // Create ray from origin pointing towards target
  fromPoints(origin: Vector2, target: Vector2): Ray {
    return RayUtils.create(origin, Vec2.direction(origin, target));
  },
  
  // Get point along ray at parameter t
  pointAt(ray: Ray, t: number): Vector2 {
    return Vec2.add(ray.origin, Vec2.scale(ray.direction, t));
  }
};
```

---

## Ray-Segment Intersection

### Algorithm

Use parametric line intersection. A ray can be expressed as:
```
P(t) = origin + t * direction, where t >= 0
```

A segment can be expressed as:
```
Q(s) = start + s * (end - start), where 0 <= s <= 1
```

Find t and s where P(t) = Q(s).

```typescript
interface RaySegmentHit {
  readonly hit: boolean;
  readonly point: Vector2 | null;
  readonly t: number; // Distance along ray (in direction units)
  readonly s: number; // Position along segment (0-1)
  readonly normal: Vector2 | null;
}

function raySegmentIntersect(ray: Ray, segment: LineSegment): RaySegmentHit {
  const NO_HIT: RaySegmentHit = { hit: false, point: null, t: -1, s: -1, normal: null };
  
  // Ray: P = origin + t * direction
  // Segment: Q = start + s * (end - start)
  
  const segmentDir = Vec2.subtract(segment.end, segment.start);
  const originToStart = Vec2.subtract(segment.start, ray.origin);
  
  // Cross product in 2D: a × b = a.x * b.y - a.y * b.x
  const cross = (a: Vector2, b: Vector2) => a.x * b.y - a.y * b.x;
  
  const denominator = cross(ray.direction, segmentDir);
  
  // Parallel or coincident lines
  if (Math.abs(denominator) < 1e-10) {
    return NO_HIT;
  }
  
  const t = cross(originToStart, segmentDir) / denominator;
  const s = cross(originToStart, ray.direction) / denominator;
  
  // t must be positive (ray goes forward)
  // s must be in [0, 1] (hit is on segment)
  if (t < 0 || s < 0 || s > 1) {
    return NO_HIT;
  }
  
  const point = RayUtils.pointAt(ray, t);
  
  // Calculate normal - always point towards ray origin
  let normal = Segment.normal(segment);
  if (Vec2.dot(normal, ray.direction) > 0) {
    normal = Vec2.scale(normal, -1); // Flip if pointing away
  }
  
  return { hit: true, point, t, s, normal };
}
```

---

## Trajectory Calculation

### TrajectoryPoint

```typescript
interface TrajectoryPoint {
  readonly position: Vector2;
  readonly surfaceId: string | null; // null for origin and unplanned endpoints
  readonly isPlanned: boolean; // Was this a planned surface hit?
}
```

### TrajectoryResult

```typescript
type TrajectoryStatus = 
  | 'valid'           // All planned surfaces hit in order
  | 'missed_surface'  // A planned surface was not hit
  | 'hit_obstacle'    // Hit a non-ricochet surface before completing plan
  | 'out_of_range';   // Path exceeded max distance

interface TrajectoryResult {
  readonly points: TrajectoryPoint[];
  readonly status: TrajectoryStatus;
  readonly failedAtPlanIndex: number; // -1 if valid, otherwise index of missed surface
  readonly totalDistance: number;
}
```

### TrajectoryCalculator

```typescript
interface TrajectoryCalculator {
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult;
}

class DefaultTrajectoryCalculator implements TrajectoryCalculator {
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [
      { position: origin, surfaceId: null, isPlanned: false }
    ];
    
    let currentRay = RayUtils.fromPoints(origin, aimPoint);
    let remainingDistance = maxDistance;
    let planIndex = 0;
    
    while (remainingDistance > 0) {
      // Find closest intersection with any surface
      const hit = this.findClosestHit(currentRay, allSurfaces, remainingDistance);
      
      if (!hit) {
        // No more intersections - add endpoint at max distance
        const endpoint = RayUtils.pointAt(currentRay, remainingDistance);
        points.push({ position: endpoint, surfaceId: null, isPlanned: false });
        break;
      }
      
      const { surface, intersection } = hit;
      
      // Add hit point to trajectory
      points.push({
        position: intersection.point!,
        surfaceId: surface.id,
        isPlanned: planIndex < plannedSurfaces.length && 
                   surface.id === plannedSurfaces[planIndex].id
      });
      
      remainingDistance -= intersection.t;
      
      // Check if this is a planned surface
      if (planIndex < plannedSurfaces.length) {
        if (surface.id === plannedSurfaces[planIndex].id) {
          // Correct planned surface hit
          planIndex++;
        } else if (!surface.isPlannable()) {
          // Hit obstacle before planned surface
          return {
            points,
            status: 'hit_obstacle',
            failedAtPlanIndex: planIndex,
            totalDistance: maxDistance - remainingDistance
          };
        }
        // Hit wrong ricochet surface - continue (will miss planned one)
      }
      
      // Determine what happens at this surface
      if (!surface.isPlannable()) {
        // Non-ricochet surface - arrow sticks
        break;
      }
      
      // Ricochet - calculate new direction
      const reflected = Vec2.reflect(currentRay.direction, intersection.normal!);
      
      // Move origin slightly away from surface to avoid self-intersection
      const newOrigin = Vec2.add(intersection.point!, Vec2.scale(reflected, 0.001));
      currentRay = RayUtils.create(newOrigin, reflected);
    }
    
    // Check if all planned surfaces were hit
    if (planIndex < plannedSurfaces.length) {
      return {
        points,
        status: 'missed_surface',
        failedAtPlanIndex: planIndex,
        totalDistance: maxDistance - remainingDistance
      };
    }
    
    return {
      points,
      status: 'valid',
      failedAtPlanIndex: -1,
      totalDistance: maxDistance - remainingDistance
    };
  }
  
  private findClosestHit(
    ray: Ray,
    surfaces: readonly Surface[],
    maxDistance: number
  ): { surface: Surface; intersection: RaySegmentHit } | null {
    let closest: { surface: Surface; intersection: RaySegmentHit } | null = null;
    
    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);
      
      if (hit.hit && hit.t <= maxDistance) {
        if (!closest || hit.t < closest.intersection.t) {
          closest = { surface, intersection: hit };
        }
      }
    }
    
    return closest;
  }
}
```

---

## Real-Time Updates

The trajectory must update every frame as the player moves and aims.

### Update Triggers

| Event | Effect on Trajectory |
|-------|---------------------|
| Mouse move | Aim direction changes |
| Player position change | Origin changes |
| Surface added to plan | Validation changes |
| Surface removed from plan | Validation changes |

### Performance Considerations

1. **Caching**: Cache trajectory when inputs haven't changed
2. **Early exit**: Stop calculation when validity is determined
3. **Spatial partitioning**: For levels with many surfaces, use quadtree for faster intersection tests

```typescript
class CachedTrajectoryCalculator implements TrajectoryCalculator {
  private cache: {
    origin: Vector2;
    aimPoint: Vector2;
    planIds: string[];
    result: TrajectoryResult;
  } | null = null;
  
  private delegate: TrajectoryCalculator;
  
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const planIds = plannedSurfaces.map(s => s.id);
    
    // Check cache
    if (this.cache &&
        Vec2.distance(this.cache.origin, origin) < 0.001 &&
        Vec2.distance(this.cache.aimPoint, aimPoint) < 0.001 &&
        this.arraysEqual(this.cache.planIds, planIds)) {
      return this.cache.result;
    }
    
    // Calculate and cache
    const result = this.delegate.calculate(origin, aimPoint, plannedSurfaces, allSurfaces, maxDistance);
    this.cache = { origin, aimPoint, planIds, result };
    
    return result;
  }
  
  private arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  
  invalidate(): void {
    this.cache = null;
  }
}
```

---

## Rendering the Trajectory

### Visual States

| Status | Line Color | Description |
|--------|------------|-------------|
| `valid` | White/Green | Full path shown, all segments same color |
| `missed_surface` | Red after miss point | Green up to last valid hit, red after |
| `hit_obstacle` | Red at obstacle | Green up to obstacle, red X at impact |
| `out_of_range` | Yellow/Orange at end | Green path, dashed line for exhaustion zone |

### TrajectoryRenderer

```typescript
interface TrajectoryRenderer {
  render(result: TrajectoryResult, graphics: Phaser.GameObjects.Graphics): void;
}

class DefaultTrajectoryRenderer implements TrajectoryRenderer {
  private readonly colors = {
    valid: 0x00ff00,      // Green
    invalid: 0xff0000,    // Red
    exhausted: 0xffaa00,  // Orange
    planned: 0x00ffff     // Cyan highlight for planned surface hits
  };
  
  render(result: TrajectoryResult, graphics: Phaser.GameObjects.Graphics): void {
    graphics.clear();
    
    const points = result.points;
    if (points.length < 2) return;
    
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      
      // Determine color for this segment
      const color = this.getSegmentColor(result, i);
      
      graphics.lineStyle(2, color, 0.8);
      graphics.lineBetween(from.position.x, from.position.y, to.position.x, to.position.y);
      
      // Draw hit marker at planned surface hits
      if (to.isPlanned) {
        graphics.fillStyle(this.colors.planned, 1);
        graphics.fillCircle(to.position.x, to.position.y, 4);
      }
    }
    
    // Draw arrow at endpoint
    this.drawArrowhead(graphics, points[points.length - 1].position, result);
  }
  
  private getSegmentColor(result: TrajectoryResult, segmentIndex: number): number {
    if (result.status === 'valid') {
      return this.colors.valid;
    }
    
    // Count planned hits up to this segment
    let plannedHits = 0;
    for (let i = 0; i <= segmentIndex; i++) {
      if (result.points[i].isPlanned) plannedHits++;
    }
    
    // If we haven't reached the failure point yet, show as valid
    if (result.status === 'missed_surface' && plannedHits <= result.failedAtPlanIndex) {
      return this.colors.valid;
    }
    
    return this.colors.invalid;
  }
  
  private drawArrowhead(
    graphics: Phaser.GameObjects.Graphics,
    position: Vector2,
    result: TrajectoryResult
  ): void {
    const color = result.status === 'valid' ? this.colors.valid : this.colors.invalid;
    graphics.fillStyle(color, 1);
    graphics.fillCircle(position.x, position.y, 3);
  }
}
```

---

## Test Cases

See `TEST_SPECIFICATIONS.md` for comprehensive test cases. Key scenarios:

1. **Simple reflection**: 45° ray hitting horizontal surface
2. **Multiple bounces**: Chain of planned ricochets
3. **Missed surface**: Ray passes by planned surface
4. **Obstacle blocking**: Wall between origin and planned ricochet
5. **Out of range**: Path too long before completing plan
6. **Edge cases**: Ray parallel to surface, hitting segment endpoints

