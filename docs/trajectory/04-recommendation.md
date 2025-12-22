# Recommended Design: Hybrid with Explicit Image Chains

## Overview

This document provides the detailed architectural recommendation for the trajectory system, based on the analysis in previous documents. The recommended approach is **Option C: Hybrid with Explicit Image Chains**, which provides the best balance of testability, floating-point resistance, caching, and GPU compatibility.

---

## 1. Selected Approach

### Why Option C?

| Criterion | Reason |
|-----------|--------|
| **Floating-point resistance** | Pure geometry functions with point-based rays throughout |
| **Testability** | Functions and chains are independently testable |
| **Caching** | ImageChain provides natural caching with clear invalidation |
| **GPU compatibility** | GeometryOps functions translate directly to GLSL |
| **Debuggability** | Image chains provide complete trace of all reflections |
| **Separation of concerns** | Clear boundaries between geometry, images, paths, rendering |

### Core Principles

1. **Geometry operations are pure functions** - No classes, no state, just math
2. **Image chains are the central data structure** - Cache and track all reflections
3. **Path builders consume image chains** - Separate planned and actual path logic
4. **Rendering consumes path results** - No calculation in rendering layer
5. **Point-based rays everywhere** - Never store normalized directions

---

## 2. Detailed Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TrajectorySystem                               │
│  Orchestrates all trajectory calculation and rendering                   │
│                                                                          │
│  + update(player, cursor, plannedSurfaces, allSurfaces)                  │
│  + getResult(): TrajectoryResult                                         │
│  + render(): void                                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────────┐   ┌───────────────────────┐   ┌─────────────────────┐
│    ImageChain     │   │     PathBuilder       │   │ TrajectoryRenderer  │
│                   │   │                       │   │                     │
│ • player: Vec2    │   │ + buildPlanned()      │   │ + render(result)    │
│ • cursor: Vec2    │   │ + buildActual()       │   │                     │
│ • surfaces: []    │   │ + calculateAlignment()|   │                     │
│                   │   │                       │   │                     │
│ + forward()       │   └───────────────────────┘   └─────────────────────┘
│ + backward()      │               │
│ + invalidate()    │               │
└───────────────────┘               │
        │                           │
        └───────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        GeometryOps (Pure Functions)                      │
│                                                                          │
│  lineLineIntersection(p1, p2, p3, p4): IntersectionResult                │
│  reflectPointThroughLine(point, lineP1, lineP2): Vector2                 │
│  pointSideOfLine(point, lineP1, lineP2): number                          │
│  isOnSegment(t, tolerance?): boolean                                     │
│  distanceToLine(point, lineP1, lineP2): number                           │
│  projectPointOntoLine(point, lineP1, lineP2): Vector2                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/trajectory-v2/
├── geometry/
│   ├── GeometryOps.ts          # Pure geometry functions
│   ├── types.ts                # Vector2, IntersectionResult, etc.
│   └── index.ts
├── chain/
│   ├── ImageChain.ts           # Image sequence with caching
│   ├── ReflectedImage.ts       # Image value type with provenance
│   ├── types.ts                # ImageSequence, ImageSource, etc.
│   └── index.ts
├── builder/
│   ├── PathBuilder.ts          # Unified path builder
│   ├── PlannedPathStrategy.ts  # Bidirectional image strategy
│   ├── ActualPathStrategy.ts   # Forward physics strategy
│   ├── AlignmentCalculator.ts  # Compare planned vs actual
│   ├── types.ts                # PathResult, AlignmentResult, etc.
│   └── index.ts
├── renderer/
│   ├── TrajectoryRenderer.ts   # Renders paths to graphics
│   ├── GPUReachabilityShader.ts # Optional GPU visualization
│   └── index.ts
├── TrajectorySystem.ts         # Main orchestrator
├── types.ts                    # Public API types
└── index.ts                    # Public exports
```

---

## 3. Core Data Structures

### 3.1 Geometry Types

```typescript
// geometry/types.ts

/**
 * 2D vector/point. Used for both positions and displacements.
 */
export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

/**
 * A ray defined by two points (NOT a direction vector).
 * The ray originates at 'from' and passes through 'to', extending beyond.
 */
export interface Ray {
  readonly from: Vector2;
  readonly to: Vector2;
}

/**
 * Result of line-line intersection calculation.
 * Uses discriminated union for clear outcome handling.
 */
export type IntersectionResult =
  | {
      readonly type: 'hit';
      readonly point: Vector2;
      readonly tLine1: number;  // Parametric position on first line
      readonly tLine2: number;  // Parametric position on second line
    }
  | {
      readonly type: 'parallel';
    }
  | {
      readonly type: 'coincident';
    };

/**
 * Which side of a line a point is on.
 */
export type SideResult = 'positive' | 'negative' | 'on_line';
```

### 3.2 Image Chain Types

```typescript
// chain/types.ts

/**
 * Source information for a reflected image.
 * Tracks provenance for debugging and verification.
 */
export interface ImageSource {
  /** The position before this reflection */
  readonly position: Vector2;
  /** The surface that created this reflection (null for original) */
  readonly surface: Surface | null;
}

/**
 * A reflected image with full provenance tracking.
 */
export interface ReflectedImage {
  /** The reflected position */
  readonly position: Vector2;
  /** How this image was created */
  readonly source: ImageSource;
  /** Reflection depth (0 = original, 1 = once reflected, etc.) */
  readonly depth: number;
}

/**
 * A sequence of reflected images.
 */
export interface ImageSequence {
  /** The unreflected source position */
  readonly original: Vector2;
  /** Chain of reflected images (index 0 = first reflection) */
  readonly images: readonly ReflectedImage[];
  /** Surfaces used for reflections (in reflection order) */
  readonly surfaces: readonly Surface[];
}
```

### 3.3 Path Types

```typescript
// builder/types.ts

/**
 * Details about a single intersection in a path.
 */
export interface IntersectionDetail {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface intersected */
  readonly surface: Surface;
  /** Parametric position along segment (0-1 = on segment) */
  readonly tSegment: number;
  /** Whether the intersection is on the actual segment */
  readonly isOnSegment: boolean;
  /** The player image used for this intersection */
  readonly fromImage: ReflectedImage;
  /** The cursor image used for this intersection (planned path only) */
  readonly toImage: ReflectedImage | null;
}

/**
 * Result of path calculation.
 */
export interface PathResult {
  /** Path points from start to end */
  readonly points: readonly Vector2[];
  /** Detailed information about each intersection */
  readonly intersections: readonly IntersectionDetail[];
  /** The image sequence used to build this path */
  readonly imageSequence: ImageSequence;
  /** Whether the path reached its target (cursor for planned, end for actual) */
  readonly reachedTarget: boolean;
  /** If not reached, why (obstruction, off-segment, etc.) */
  readonly stopReason?: StopReason;
}

export type StopReason = 'obstruction' | 'off_segment' | 'exhaustion' | 'wrong_side';

/**
 * Alignment between planned and actual paths.
 */
export interface AlignmentResult {
  /** True if all planned intersections match actual */
  readonly isFullyAligned: boolean;
  /** Number of consecutive aligned segments from start */
  readonly alignedSegmentCount: number;
  /** Point where paths diverge (undefined if fully aligned) */
  readonly divergencePoint?: Vector2;
  /** Index of first misaligned intersection */
  readonly firstMismatchIndex: number;
}

/**
 * Complete trajectory result for rendering.
 */
export interface TrajectoryResult {
  readonly planned: PathResult;
  readonly actual: PathResult;
  readonly alignment: AlignmentResult;
  readonly isCursorReachable: boolean;
}
```

---

## 4. Key Algorithms

### 4.1 Line-Line Intersection (No Normalization)

```typescript
// geometry/GeometryOps.ts

/**
 * Calculate intersection of two lines defined by point pairs.
 * Uses direct formula without normalization for floating-point precision.
 *
 * Formula:
 *   t = ((x1-x3)(y3-y4) - (y1-y3)(x3-x4)) / ((x1-x2)(y3-y4) - (y1-y2)(x3-x4))
 *   u = -((x1-x2)(y1-y3) - (y1-y2)(x1-x3)) / ((x1-x2)(y3-y4) - (y1-y2)(x3-x4))
 *   
 *   Intersection = P1 + t(P2 - P1)
 */
export function lineLineIntersection(
  p1: Vector2, p2: Vector2,  // Line 1
  p3: Vector2, p4: Vector2   // Line 2
): IntersectionResult {
  const x1 = p1.x, y1 = p1.y;
  const x2 = p2.x, y2 = p2.y;
  const x3 = p3.x, y3 = p3.y;
  const x4 = p4.x, y4 = p4.y;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Check for parallel/coincident lines
  if (Math.abs(denominator) < GEOMETRY_TOLERANCE) {
    // Check if lines are coincident (same line)
    const cross = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
    if (Math.abs(cross) < GEOMETRY_TOLERANCE) {
      return { type: 'coincident' };
    }
    return { type: 'parallel' };
  }

  const tNumerator = (x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4);
  const uNumerator = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3));

  const t = tNumerator / denominator;
  const u = uNumerator / denominator;

  // Calculate intersection point using t on first line
  const point: Vector2 = {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
  };

  return {
    type: 'hit',
    point,
    tLine1: t,
    tLine2: u,
  };
}
```

### 4.2 Point Reflection (No Square Roots)

```typescript
// geometry/GeometryOps.ts

/**
 * Reflect a point through a line defined by two points.
 * 
 * Algorithm:
 *   1. Project point onto line to find closest point
 *   2. Reflected point = 2 * projection - original
 *
 * No normalization or square roots required.
 */
export function reflectPointThroughLine(
  point: Vector2,
  lineP1: Vector2,
  lineP2: Vector2
): Vector2 {
  // Vector along the line
  const dx = lineP2.x - lineP1.x;
  const dy = lineP2.y - lineP1.y;

  // Vector from line start to point
  const px = point.x - lineP1.x;
  const py = point.y - lineP1.y;

  // Parametric position of projection onto line
  // t = (AP · AB) / (AB · AB)
  const dotProduct = px * dx + py * dy;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < GEOMETRY_TOLERANCE) {
    // Degenerate line (zero length) - return original point
    return point;
  }

  const t = dotProduct / lengthSquared;

  // Projection point on line
  const projX = lineP1.x + t * dx;
  const projY = lineP1.y + t * dy;

  // Reflected point = 2 * projection - original
  return {
    x: 2 * projX - point.x,
    y: 2 * projY - point.y,
  };
}
```

### 4.3 Forward Image Building

```typescript
// chain/ImageChain.ts

private buildForwardSequence(): ImageSequence {
  const images: ReflectedImage[] = [];
  let currentPosition = this.player;

  for (let i = 0; i < this.surfaces.length; i++) {
    const surface = this.surfaces[i];
    const { start, end } = surface.segment;

    // Reflect current position through this surface
    const reflectedPosition = GeometryOps.reflectPointThroughLine(
      currentPosition,
      start,
      end
    );

    // Create image with full provenance
    const image: ReflectedImage = {
      position: reflectedPosition,
      source: {
        position: currentPosition,
        surface: surface,
      },
      depth: i + 1,
    };

    images.push(image);
    currentPosition = reflectedPosition;
  }

  return {
    original: this.player,
    images,
    surfaces: this.surfaces,
  };
}
```

### 4.4 Backward Image Building

```typescript
// chain/ImageChain.ts

private buildBackwardSequence(): ImageSequence {
  // Process surfaces in REVERSE order
  const reversedSurfaces = [...this.surfaces].reverse();
  const images: ReflectedImage[] = [];
  let currentPosition = this.cursor;

  for (let i = 0; i < reversedSurfaces.length; i++) {
    const surface = reversedSurfaces[i];
    const { start, end } = surface.segment;

    const reflectedPosition = GeometryOps.reflectPointThroughLine(
      currentPosition,
      start,
      end
    );

    const image: ReflectedImage = {
      position: reflectedPosition,
      source: {
        position: currentPosition,
        surface: surface,
      },
      depth: i + 1,
    };

    images.push(image);
    currentPosition = reflectedPosition;
  }

  return {
    original: this.cursor,
    images,
    surfaces: reversedSurfaces,
  };
}
```

### 4.5 Planned Path Construction

```typescript
// builder/PlannedPathStrategy.ts

export function buildPlannedPath(
  forward: ImageSequence,
  backward: ImageSequence
): PathResult {
  const points: Vector2[] = [forward.original];
  const intersections: IntersectionDetail[] = [];
  const n = forward.surfaces.length;

  for (let i = 0; i < n; i++) {
    // Get corresponding images
    // Forward: P[0], P[1], ..., P[n]
    // Backward (reversed): C[n], C[n-1], ..., C[0]
    const playerImage = i === 0
      ? { position: forward.original, source: { position: forward.original, surface: null }, depth: 0 }
      : forward.images[i - 1];
    
    const cursorImageIndex = n - 1 - i;
    const cursorImage = cursorImageIndex >= 0 && cursorImageIndex < backward.images.length
      ? backward.images[cursorImageIndex]
      : { position: backward.original, source: { position: backward.original, surface: null }, depth: 0 };

    const surface = forward.surfaces[i];

    // Ray from player image to cursor image
    const intersection = GeometryOps.lineLineIntersection(
      playerImage.position,
      cursorImage.position,
      surface.segment.start,
      surface.segment.end
    );

    if (intersection.type === 'hit') {
      points.push(intersection.point);

      intersections.push({
        point: intersection.point,
        surface,
        tSegment: intersection.tLine2,
        isOnSegment: GeometryOps.isOnSegment(intersection.tLine2),
        fromImage: playerImage,
        toImage: cursorImage,
      });
    }
  }

  // Final point is the cursor
  points.push(backward.original);

  return {
    points,
    intersections,
    imageSequence: forward,
    reachedTarget: true,  // Planned path always reaches cursor by definition
  };
}
```

### 4.6 Actual Path Construction

```typescript
// builder/ActualPathStrategy.ts

export function buildActualPath(
  forward: ImageSequence,
  allSurfaces: readonly Surface[]
): PathResult {
  const points: Vector2[] = [forward.original];
  const intersections: IntersectionDetail[] = [];
  let currentPosition = forward.original;
  let reachedTarget = false;
  let stopReason: StopReason | undefined;

  for (let i = 0; i < forward.surfaces.length; i++) {
    const targetImage = forward.images[i];
    const plannedSurface = forward.surfaces[i];

    // Create ray from current position toward target image
    const ray: Ray = { from: currentPosition, to: targetImage.position };

    // Check for obstructions before reaching planned surface
    const obstruction = findFirstObstruction(ray, allSurfaces, plannedSurface);

    if (obstruction) {
      // Hit something before planned surface
      points.push(obstruction.point);
      stopReason = 'obstruction';
      break;
    }

    // Calculate intersection with planned surface
    const intersection = GeometryOps.lineLineIntersection(
      currentPosition,
      targetImage.position,
      plannedSurface.segment.start,
      plannedSurface.segment.end
    );

    if (intersection.type !== 'hit') {
      stopReason = 'off_segment';
      break;
    }

    // Check if intersection is on actual segment
    if (!GeometryOps.isOnSegment(intersection.tLine2)) {
      // Off-segment hit - actual path diverges here
      // Continue in current direction to exhaustion or obstruction
      const forwardPath = extendForward(currentPosition, targetImage.position, allSurfaces);
      points.push(...forwardPath.points);
      stopReason = 'off_segment';
      break;
    }

    // Valid on-segment hit
    points.push(intersection.point);
    intersections.push({
      point: intersection.point,
      surface: plannedSurface,
      tSegment: intersection.tLine2,
      isOnSegment: true,
      fromImage: { position: currentPosition, source: { position: currentPosition, surface: null }, depth: i },
      toImage: null,
    });

    currentPosition = intersection.point;
  }

  if (!stopReason) {
    reachedTarget = true;
  }

  return {
    points,
    intersections,
    imageSequence: forward,
    reachedTarget,
    stopReason,
  };
}
```

---

## 5. Floating-Point Strategy

### 5.1 Consistent Tolerance

```typescript
// geometry/GeometryOps.ts

/**
 * Single source of truth for floating-point tolerance.
 * Used throughout all geometry calculations.
 */
export const GEOMETRY_TOLERANCE = 1e-9;

/**
 * Check if parametric value is within segment bounds [0, 1].
 */
export function isOnSegment(t: number, tolerance = GEOMETRY_TOLERANCE): boolean {
  return t >= -tolerance && t <= 1 + tolerance;
}

/**
 * Check if two points are effectively equal.
 */
export function pointsEqual(a: Vector2, b: Vector2, tolerance = GEOMETRY_TOLERANCE): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
}
```

### 5.2 No Stored Directions

```typescript
// CORRECT: Direction derived when needed
function getDirection(ray: Ray): Vector2 {
  const dx = ray.to.x - ray.from.x;
  const dy = ray.to.y - ray.from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  return { x: dx / len, y: dy / len };
}

// INCORRECT: Would introduce precision errors
interface BadRay {
  origin: Vector2;
  direction: Vector2;  // NEVER store this
}
```

### 5.3 Reflection Verification

```typescript
// chain/ImageChain.ts

/**
 * Verify that all reflections in the chain are mathematically correct.
 * Should be used in tests and optionally in debug mode.
 */
public verify(): boolean {
  for (const image of this._forward?.images ?? []) {
    if (!image.source.surface) continue;

    const { start, end } = image.source.surface.segment;
    const doubleReflected = GeometryOps.reflectPointThroughLine(
      image.position,
      start,
      end
    );

    if (!GeometryOps.pointsEqual(image.source.position, doubleReflected)) {
      console.error('Reflection verification failed:', {
        original: image.source.position,
        reflected: image.position,
        doubleReflected,
      });
      return false;
    }
  }
  return true;
}
```

---

## 6. GPU Rendering Integration

### 6.1 Shader Uniform Structure

```typescript
// renderer/GPUReachabilityShader.ts

interface ReachabilityUniforms {
  player: [number, number];
  playerImages: [number, number][];  // Max 10 images
  surfaceCount: number;
  surfaces: [number, number, number, number][];  // [startX, startY, endX, endY]
}

function prepareUniforms(chain: ImageChain, allSurfaces: Surface[]): ReachabilityUniforms {
  const forward = chain.forward;

  return {
    player: [forward.original.x, forward.original.y],
    playerImages: forward.images.map(img => [img.position.x, img.position.y]),
    surfaceCount: allSurfaces.length,
    surfaces: allSurfaces.map(s => [
      s.segment.start.x, s.segment.start.y,
      s.segment.end.x, s.segment.end.y
    ]),
  };
}
```

### 6.2 GLSL Fragment Shader

```glsl
// reachability.frag

uniform vec2 player;
uniform vec2 playerImages[10];
uniform int imageCount;
uniform vec4 surfaces[50];
uniform int surfaceCount;

vec2 reflectPoint(vec2 P, vec2 A, vec2 B) {
    vec2 AB = B - A;
    vec2 AP = P - A;
    float t = dot(AP, AB) / dot(AB, AB);
    vec2 projection = A + t * AB;
    return 2.0 * projection - P;
}

float pointSide(vec2 P, vec2 A, vec2 B) {
    return (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
}

bool lineIntersectsSegment(vec2 p1, vec2 p2, vec2 s1, vec2 s2) {
    float denom = (p1.x - p2.x) * (s1.y - s2.y) - (p1.y - p2.y) * (s1.x - s2.x);
    if (abs(denom) < 0.0001) return false;
    
    float t = ((p1.x - s1.x) * (s1.y - s2.y) - (p1.y - s1.y) * (s1.x - s2.x)) / denom;
    float u = -((p1.x - p2.x) * (p1.y - s1.y) - (p1.y - p2.y) * (p1.x - s1.x)) / denom;
    
    return t > 0.0 && u >= 0.0 && u <= 1.0;
}

void main() {
    vec2 cursor = gl_FragCoord.xy;
    
    // Build cursor images (backward reflection)
    vec2 cursorImages[10];
    vec2 current = cursor;
    
    for (int i = imageCount - 1; i >= 0; i--) {
        vec4 surf = surfaces[i];
        cursorImages[imageCount - 1 - i] = reflectPoint(current, surf.xy, surf.zw);
        current = cursorImages[imageCount - 1 - i];
    }
    
    // Check if path is valid
    bool reachable = true;
    vec2 pathPoint = player;
    
    for (int i = 0; i < imageCount && reachable; i++) {
        vec2 target = cursorImages[imageCount - 1 - i];
        
        // Check for obstructions
        for (int j = 0; j < surfaceCount && reachable; j++) {
            if (j == i) continue;  // Skip the target surface
            vec4 surf = surfaces[j];
            if (lineIntersectsSegment(pathPoint, target, surf.xy, surf.zw)) {
                reachable = false;
            }
        }
        
        // Check if hit is on segment
        vec4 targetSurf = surfaces[i];
        float denom = (pathPoint.x - target.x) * (targetSurf.x - targetSurf.z) 
                    - (pathPoint.y - target.y) * (targetSurf.y - targetSurf.w);
        if (abs(denom) > 0.0001) {
            float u = -((pathPoint.x - target.x) * (pathPoint.y - targetSurf.y) 
                      - (pathPoint.y - target.y) * (pathPoint.x - targetSurf.x)) / denom;
            if (u < 0.0 || u > 1.0) {
                reachable = false;
            }
        }
        
        pathPoint = target;
    }
    
    // Output color based on reachability
    gl_FragColor = reachable 
        ? vec4(0.0, 1.0, 0.5, 0.3)   // Green: reachable
        : vec4(1.0, 0.0, 0.0, 0.1);  // Red: not reachable
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests for GeometryOps

```typescript
// tests/trajectory-v2/geometry/GeometryOps.test.ts

describe('lineLineIntersection', () => {
  it('finds intersection of crossing lines', () => {
    const result = lineLineIntersection(
      { x: 0, y: 0 }, { x: 10, y: 10 },
      { x: 0, y: 10 }, { x: 10, y: 0 }
    );
    expect(result.type).toBe('hit');
    expect(result.point).toEqual({ x: 5, y: 5 });
  });

  it('detects parallel lines', () => {
    const result = lineLineIntersection(
      { x: 0, y: 0 }, { x: 10, y: 0 },
      { x: 0, y: 5 }, { x: 10, y: 5 }
    );
    expect(result.type).toBe('parallel');
  });

  it('handles perpendicular lines', () => { /* ... */ });
  it('handles nearly parallel lines', () => { /* ... */ });
});

describe('reflectPointThroughLine', () => {
  it('reflects point through horizontal line', () => {
    const result = reflectPointThroughLine(
      { x: 5, y: 3 },
      { x: 0, y: 5 }, { x: 10, y: 5 }
    );
    expect(result).toEqual({ x: 5, y: 7 });
  });

  it('is involutory (reflect twice = identity)', () => {
    const original = { x: 3, y: 7 };
    const line = { p1: { x: 0, y: 0 }, p2: { x: 10, y: 5 } };
    
    const once = reflectPointThroughLine(original, line.p1, line.p2);
    const twice = reflectPointThroughLine(once, line.p1, line.p2);
    
    expect(twice.x).toBeCloseTo(original.x);
    expect(twice.y).toBeCloseTo(original.y);
  });
});
```

### 7.2 Integration Tests for ImageChain

```typescript
// tests/trajectory-v2/chain/ImageChain.test.ts

describe('ImageChain', () => {
  it('builds forward images through single surface', () => {
    const chain = new ImageChain(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      [horizontalSurfaceAt(y: 5)]
    );

    const forward = chain.forward;
    expect(forward.images).toHaveLength(1);
    expect(forward.images[0].position.y).toBe(10);  // Reflected through y=5
  });

  it('builds backward images in reverse order', () => { /* ... */ });
  it('caches results until invalidated', () => { /* ... */ });
  it('passes verification for all reflections', () => { /* ... */ });
});
```

### 7.3 End-to-End Trajectory Tests

```typescript
// tests/trajectory-v2/TrajectorySystem.test.ts

describe('TrajectorySystem', () => {
  it('calculates aligned paths for valid reflection', () => {
    const system = new TrajectorySystem();
    const result = system.calculate({
      player: { x: 0, y: 0 },
      cursor: { x: 10, y: 0 },
      plannedSurfaces: [horizontalSurfaceAt(5)],
      allSurfaces: [horizontalSurfaceAt(5)],
    });

    expect(result.alignment.isFullyAligned).toBe(true);
    expect(result.isCursorReachable).toBe(true);
  });

  it('detects off-segment divergence', () => { /* ... */ });
  it('detects obstruction divergence', () => { /* ... */ });
  it('handles empty surface list', () => { /* ... */ });
});
```

---

## 8. Migration Path

### Phase 1: Implement Core Geometry (Week 1)

1. Create `src/trajectory-v2/geometry/` with pure functions
2. Comprehensive unit tests for all geometry operations
3. No integration with existing code yet

### Phase 2: Implement Image Chain (Week 1-2)

1. Create `src/trajectory-v2/chain/` with ImageChain class
2. Tests for forward/backward building and caching
3. Verification tests for reflection correctness

### Phase 3: Implement Path Builders (Week 2)

1. Create `src/trajectory-v2/builder/` with path strategies
2. Tests for planned and actual path construction
3. Alignment calculation tests

### Phase 4: Implement TrajectorySystem (Week 2-3)

1. Create orchestrator that combines all components
2. Integration tests for complete workflows
3. Compare outputs with existing system

### Phase 5: Implement Renderer (Week 3)

1. Create new renderer consuming TrajectoryResult
2. Visual verification of all scenarios
3. GPU shader implementation (optional)

### Phase 6: Integration and Switchover (Week 3-4)

1. Add feature flag to switch between old and new systems
2. Run both in parallel to verify equivalence
3. Remove old trajectory code once verified

---

## 9. Summary

The recommended **Hybrid with Explicit Image Chains** architecture provides:

1. **Floating-point resistance** through point-based rays and no stored directions
2. **Testability** with pure geometry functions and clear data structures
3. **Caching** via ImageChain with explicit invalidation
4. **GPU compatibility** with directly translatable math
5. **Debuggability** through provenance tracking in reflected images
6. **Clear separation** of concerns across layers

This architecture addresses the fundamental issues in the current system while providing a solid foundation for future enhancements like GPU-accelerated reachability visualization.

