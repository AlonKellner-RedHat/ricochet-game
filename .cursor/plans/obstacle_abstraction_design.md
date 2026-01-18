# Obstacle Abstraction System Design

## Overview

This document describes a comprehensive abstraction system for obstacles, shapes, collision detection, and collision effects. The goal is to enable adding new obstacle types, shapes, and behaviors without modifying existing code (Open-Closed Principle).

## Design Goals

1. **Shape Abstraction**: Support different geometric primitives (line segments, circles, arcs, etc.)
2. **Effect Abstraction**: Different collision behaviors (reflection, obstruction, portals, aligners, etc.)
3. **Two-Sided Effects**: Each obstacle can have different effects per side
4. **Unified System**: Same abstractions work across visibility, trajectory preview, actual trajectory, and planning
5. **SOLID Principles**: Especially OCP - extend through new implementations, not modifications

---

## Core Abstractions

### 1. Shape (Pure Geometry)

The `Shape` interface represents a geometric primitive with no behavioral logic.

```typescript
/**
 * Shape - Pure geometric primitive for collision detection.
 * 
 * Implementations provide ray intersection and normal calculation.
 * No behavioral logic - shapes are purely geometric.
 */
interface Shape {
  /** Type discriminator for runtime checks */
  readonly type: string;
  
  /**
   * Intersect a ray with this shape.
   * 
   * @param ray The ray to intersect
   * @param options Options like minT, exclude regions, etc.
   * @returns Intersection info, or null if no hit
   */
  intersectRay(ray: Ray, options?: ShapeIntersectOptions): ShapeHitInfo | null;
  
  /**
   * Get the outward normal at a point on the shape.
   * 
   * For line segments: perpendicular to the segment
   * For circles: radial direction from center
   * 
   * @param point A point on the shape's boundary
   * @returns Unit normal vector pointing outward
   */
  getNormalAt(point: Vector2): Vector2;
  
  /**
   * Determine which side of the shape was hit based on approach direction.
   * 
   * Uses dot product of incoming direction and normal:
   * - "front": approaching from the normal side (dot < 0)
   * - "back": approaching from behind (dot > 0)
   * 
   * @param incomingDirection Direction of the approaching ray
   * @param hitPoint The point of intersection
   * @returns Which side was hit
   */
  determineSide(incomingDirection: Vector2, hitPoint: Vector2): "front" | "back";
  
  /**
   * Create a polygon edge representation for visibility rendering.
   * 
   * Line segments → LineEdge
   * Circles → ArcEdge
   * 
   * @param from Start point of the edge section
   * @param to End point of the edge section
   * @returns A renderable polygon edge
   */
  asPolygonEdge(from: Vector2, to: Vector2): PolygonEdge;
}

interface ShapeIntersectOptions {
  /** Minimum t value (hits before this are ignored) */
  readonly minT?: number;
  /** Whether to allow off-shape hits (for extended lines) */
  readonly allowOffShape?: boolean;
}

interface ShapeHitInfo {
  /** The intersection point */
  readonly point: Vector2;
  /** Ray parameter t */
  readonly t: number;
  /** Shape parameter (0-1 for segments, angle for circles) */
  readonly shapeParam: number;
  /** Whether hit is on the actual shape bounds */
  readonly onShape: boolean;
}
```

#### Shape Implementations

| Implementation | Description | Shape Parameter |
|---------------|-------------|-----------------|
| `LineSegmentShape` | A line segment from start to end | 0-1 position along segment |
| `CircleShape` | A full circle with center and radius | Angle in radians |
| `ArcShape` | A circular arc with start/end angles | Angle in radians |

---

### 2. CollisionEffect (What Happens on Hit)

The `CollisionEffect` interface defines what happens when a ray/trajectory hits an obstacle.

```typescript
/**
 * CollisionEffect - Defines behavior when a ray collides with an obstacle.
 * 
 * Each effect implementation encapsulates:
 * - How the propagator state changes (reflection, teleportation, etc.)
 * - Whether the path terminates
 * - Whether this effect can be part of a plan
 * 
 * OCP: New effects are added by implementing this interface.
 */
interface CollisionEffect {
  /** Type discriminator for runtime checks and serialization */
  readonly type: string;
  
  /**
   * Transform propagator state after collision.
   * 
   * This is the core abstraction. Each effect implements its own logic:
   * - ReflectEffect: Reflects origin and target through the hit surface
   * - ObstructEffect: Throws/returns a terminal state
   * - PortalEffect: Teleports origin and target to portal exit
   * - AlignerEffect: Aligns target to surface normal
   * 
   * @param state Current propagator state
   * @param hit Collision information
   * @param cache Shared reflection cache for memoization
   * @returns New propagator state after the effect
   */
  propagate(
    state: PropagatorState,
    hit: CollisionInfo,
    cache: ReflectionCache
  ): PropagatorState;
  
  /**
   * Does this effect terminate the path?
   * 
   * - true: No further propagation (e.g., ObstructEffect)
   * - false: Path continues (e.g., ReflectEffect, PortalEffect)
   */
  terminatesPath(): boolean;
  
  /**
   * Can this effect be part of a shot plan?
   * 
   * Plannable effects can be clicked to add to the ricochet sequence.
   * - true: ReflectEffect, PortalEffect, AlignerEffect
   * - false: ObstructEffect, PassThroughEffect
   */
  isPlannable(): boolean;
  
  /**
   * Does this effect work with off-shape hits?
   * 
   * For planned paths, we detect hits on extended lines, not just segments.
   * Some effects may behave differently for off-shape hits.
   * 
   * - true: Effect works for off-shape hits (ReflectEffect in planned mode)
   * - false: Effect only works for on-shape hits
   */
  allowsOffShape(): boolean;
  
  /**
   * Get visual hint for rendering this effect.
   * 
   * Used by the rendering system to show effect-specific visuals.
   */
  getVisualHint(): EffectVisualHint;
}

interface EffectVisualHint {
  /** Color for the effect indicator */
  readonly color: number;
  /** Whether to show a glow */
  readonly glow: boolean;
  /** Icon or symbol type */
  readonly symbol?: string;
}
```

#### Effect Implementations

| Effect | `propagate()` Behavior | `terminatesPath()` | `isPlannable()` |
|--------|----------------------|-------------------|-----------------|
| `ReflectEffect` | Reflects origin/target through surface line | `false` | `true` |
| `ObstructEffect` | Returns terminal state (path ends here) | `true` | `false` |
| `PortalEffect` | Teleports origin/target to linked portal exit | `false` | `true` |
| `AlignerEffect` | Sets target along surface normal (perpendicular) | `false` | `true` |
| `ReverseReflectEffect` | Reflects in the reverse direction | `false` | `true` |
| `PassThroughEffect` | No change (continues through) | `false` | `false` |
| `RangeLimitEffect` | Terminates at range boundary | `true` | `false` |

---

### 3. Obstacle (Shape + Two-Sided Effects)

The `Obstacle` interface combines a shape with effects for each side.

```typescript
/**
 * Obstacle - A collidable entity with shape and side-specific effects.
 * 
 * Each obstacle has:
 * - A geometric shape for collision detection
 * - A "front" effect (hit from normal direction)
 * - A "back" effect (hit from opposite direction)
 * 
 * This replaces the current Surface interface with a more flexible model.
 */
interface Obstacle {
  /** Unique identifier */
  readonly id: string;
  
  /** The geometric shape of this obstacle */
  readonly shape: Shape;
  
  /** Effect when hit from the "front" side (approaching toward normal) */
  readonly frontEffect: CollisionEffect;
  
  /** Effect when hit from the "back" side (approaching away from normal) */
  readonly backEffect: CollisionEffect;
  
  /** Visual properties for rendering */
  readonly visualProperties: ObstacleVisualProperties;
  
  /** Type identifier for serialization */
  readonly obstacleType: string;
  
  /**
   * Get the effect that applies for a given side.
   */
  getEffectForSide(side: "front" | "back"): CollisionEffect;
  
  /**
   * Check if this obstacle is plannable from any side.
   */
  isPlannable(): boolean;
}

interface ObstacleVisualProperties {
  /** Primary color */
  readonly color: number;
  /** Line width for rendering */
  readonly lineWidth: number;
  /** Opacity */
  readonly alpha: number;
  /** Whether to show a glow effect */
  readonly glow: boolean;
  /** Optional secondary color for back side */
  readonly backColor?: number;
}
```

---

### 4. CollisionInfo (Hit Result with Full Provenance)

```typescript
/**
 * CollisionInfo - Complete information about a ray-obstacle collision.
 * 
 * Contains everything needed to:
 * - Determine what happened (which obstacle, which side)
 * - Apply the appropriate effect
 * - Create provenance for the hit point
 */
interface CollisionInfo {
  /** The hit point in world coordinates */
  readonly point: Vector2;
  
  /** Normal at the hit point (outward from shape) */
  readonly normal: Vector2;
  
  /** Ray parameter t (distance from ray source in ray units) */
  readonly t: number;
  
  /** Shape parameter (position along shape) */
  readonly shapeParam: number;
  
  /** Whether the hit is on the actual shape (vs extended) */
  readonly onShape: boolean;
  
  /** The obstacle that was hit */
  readonly obstacle: Obstacle;
  
  /** Which side of the obstacle was hit */
  readonly side: "front" | "back";
  
  /** The effect that applies for this hit */
  readonly effect: CollisionEffect;
  
  /** The original ray that caused the hit */
  readonly ray: Ray;
}
```

---

### 5. PolygonEdge (For Visibility Rendering)

```typescript
/**
 * PolygonEdge - A single edge of a visibility polygon.
 * 
 * Visibility polygons are composed of edges, not just vertices.
 * Each edge knows how to render itself (line, arc, etc.).
 */
interface PolygonEdge {
  /** Edge type discriminator */
  readonly type: "line" | "arc";
  
  /** Start vertex */
  readonly from: Vector2;
  
  /** End vertex */
  readonly to: Vector2;
  
  /**
   * Render this edge to a graphics context.
   */
  render(graphics: GraphicsContext): void;
  
  /**
   * Get interpolated point at parameter t in [0, 1].
   * 
   * t=0 → from, t=1 → to
   */
  getPointAt(t: number): Vector2;
  
  /**
   * Get the approximate length of this edge.
   */
  getLength(): number;
}

/**
 * LineEdge - A straight line edge.
 */
interface LineEdge extends PolygonEdge {
  readonly type: "line";
}

/**
 * ArcEdge - A circular arc edge.
 */
interface ArcEdge extends PolygonEdge {
  readonly type: "arc";
  
  /** Center of the arc's circle */
  readonly center: Vector2;
  
  /** Radius of the arc */
  readonly radius: number;
  
  /** Start angle in radians */
  readonly startAngle: number;
  
  /** End angle in radians */
  readonly endAngle: number;
  
  /** Whether to draw counterclockwise */
  readonly anticlockwise: boolean;
}
```

---

### 6. VisibilityPolygon (Edge-Aware)

```typescript
/**
 * VisibilityPolygon - A polygon with typed edges for rendering.
 * 
 * Unlike a simple vertex array, this structure knows about edge types.
 * This enables proper rendering of arc sections (e.g., range limits).
 */
interface VisibilityPolygon {
  /** Polygon vertices in order */
  readonly vertices: VisibilityVertex[];
  
  /** 
   * Edges connecting consecutive vertices.
   * edges[i] connects vertices[i] to vertices[(i+1) % n]
   */
  readonly edges: PolygonEdge[];
  
  /** The origin point for this visibility polygon */
  readonly origin: Vector2;
  
  /** Whether the polygon is valid (>= 3 vertices) */
  readonly isValid: boolean;
}

interface VisibilityVertex {
  /** Position in world coordinates */
  readonly position: Vector2;
  
  /** Source of this vertex */
  readonly source: "surface" | "screen" | "range_limit" | "junction";
  
  /** Angle from origin (for sorting) */
  readonly angle: number;
  
  /** The obstacle that created this vertex (if any) */
  readonly obstacle?: Obstacle;
}
```

---

## System Integration

### Hit Detection (Unified)

```typescript
/**
 * Find the next obstacle hit for a ray.
 * 
 * This is the unified hit detection function that works with the
 * Obstacle abstraction. It replaces findNextHit from RayCasting.ts.
 */
function findNextObstacleHit(
  ray: Ray,
  obstacles: readonly Obstacle[],
  options: ObstacleHitOptions = {}
): CollisionInfo | null {
  const { minT = 0, excludeIds = new Set(), allowOffShape = false } = options;
  
  let closest: CollisionInfo | null = null;
  
  for (const obstacle of obstacles) {
    if (excludeIds.has(obstacle.id)) continue;
    
    const shapeHit = obstacle.shape.intersectRay(ray, { minT, allowOffShape });
    if (!shapeHit) continue;
    
    // Skip if we already have a closer hit
    if (closest && shapeHit.t >= closest.t) continue;
    
    // Determine which side was hit
    const direction = { x: ray.target.x - ray.source.x, y: ray.target.y - ray.source.y };
    const side = obstacle.shape.determineSide(direction, shapeHit.point);
    const effect = obstacle.getEffectForSide(side);
    
    // Get normal at hit point
    const normal = obstacle.shape.getNormalAt(shapeHit.point);
    
    closest = {
      point: shapeHit.point,
      normal,
      t: shapeHit.t,
      shapeParam: shapeHit.shapeParam,
      onShape: shapeHit.onShape,
      obstacle,
      side,
      effect,
      ray,
    };
  }
  
  return closest;
}
```

### RayPropagator (Effect-Based)

```typescript
/**
 * Updated RayPropagator that uses CollisionEffect for propagation.
 */
interface RayPropagator {
  getState(): PropagatorState;
  getRay(): Ray;
  
  /**
   * Propagate through a collision using the hit's effect.
   * 
   * This replaces reflectThrough(surface) with a more general approach.
   * The effect determines how the state changes.
   */
  propagateThroughHit(hit: CollisionInfo): RayPropagator;
  
  fork(): RayPropagator;
  getCacheStats(): ReflectionCacheStats;
}

// Implementation
function propagateThroughHit(hit: CollisionInfo): RayPropagator {
  const newState = hit.effect.propagate(this.getState(), hit, this.cache);
  return createPropagatorWithState(newState, this.cache);
}
```

---

## Migration Strategy

### Phase 1: Introduce Abstractions (Non-Breaking)

1. Create new interfaces (`Shape`, `CollisionEffect`, `Obstacle`, etc.)
2. Create implementations for existing behaviors:
   - `LineSegmentShape` wrapping current segment logic
   - `ReflectEffect` wrapping current reflection logic
   - `ObstructEffect` for wall behavior
3. Create adapter: `surfaceToObstacle(surface: Surface): Obstacle`

### Phase 2: Add New Implementations

4. Add `CircleShape` for range limits
5. Add `ArcShape` for partial circles
6. Add `RangeLimitEffect` for range boundary behavior
7. Add `ArcEdge` for visibility polygon rendering

### Phase 3: Migrate Core Systems

8. Update `findNextHit` → `findNextObstacleHit`
9. Update `RayPropagator.reflectThrough` → `propagateThroughHit`
10. Update visibility polygon building to produce edges
11. Update rendering to handle arc edges

### Phase 4: Add Future Effects

12. `PortalEffect` for teleportation
13. `AlignerEffect` for trajectory alignment
14. `ReverseReflectEffect` for reverse bounces

---

## Example: Current Surface → New Obstacle

```typescript
// Current: RicochetSurface
class RicochetSurface implements Surface {
  canReflectFrom(incomingDirection: Vector2): boolean {
    const normal = this.getNormal();
    return Vec2.dot(incomingDirection, normal) < 0;
  }
}

// New: Using abstractions
function createRicochetObstacle(id: string, segment: LineSegment): Obstacle {
  return {
    id,
    shape: new LineSegmentShape(segment),
    frontEffect: new ReflectEffect(),  // Reflects from front
    backEffect: new ObstructEffect(),   // Blocks from back
    visualProperties: { color: 0x00ff00, lineWidth: 3, alpha: 1, glow: true },
    obstacleType: "ricochet",
    getEffectForSide: (side) => side === "front" ? this.frontEffect : this.backEffect,
    isPlannable: () => true,
  };
}

// New: Creating a two-way mirror
function createTwoWayMirror(id: string, segment: LineSegment): Obstacle {
  return {
    id,
    shape: new LineSegmentShape(segment),
    frontEffect: new ReflectEffect(),  // Reflects from both sides!
    backEffect: new ReflectEffect(),
    visualProperties: { color: 0x00ffff, lineWidth: 3, alpha: 1, glow: true },
    obstacleType: "two-way-mirror",
    getEffectForSide: (side) => side === "front" ? this.frontEffect : this.backEffect,
    isPlannable: () => true,
  };
}
```

---

## Open Questions

1. **CircleShape vs ArcShape**: Should we have separate classes, or should `CircleShape` support angle ranges?

2. **PortalEffect linking**: How should portal pairs be linked? Options:
   - Effect carries reference to exit portal
   - Separate `PortalPair` manager
   - ID-based lookup at propagation time

3. **AlignerEffect direction**: Should alignment be:
   - Perpendicular to surface (along normal)
   - Parallel to surface
   - Configurable

4. **Backward compatibility**: How long to maintain `Surface` interface as a facade?

---

## Relationship to Project Rules

This design follows the project rules from `.cursor/rules/ricochet-game.mdc`:

- **No epsilons**: Shape intersection uses exact calculations
- **Use provenance**: `CollisionInfo` carries full hit provenance
- **CCW comparisons**: Shape implementations use cross-product for side detection
- **Store decisions**: Effects are determined at hit time and stored in `CollisionInfo`
- **OCP**: New shapes and effects are added through new implementations
- **KISS**: Each abstraction has a single responsibility
