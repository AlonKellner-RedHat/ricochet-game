# Principles-Implementation Gap Analysis

This document analyzes where the current trajectory system implementation diverges from first principles in **spirit**, not just behavior. Understanding these gaps is essential for converging toward an implementation that embodies the principles rather than merely enforcing them.

## Executive Summary

The current implementation successfully produces correct behavior in most cases, but does so through a **comparative architecture** that fundamentally conflicts with the **unity principles**. The system calculates two separate paths and compares them post-hoc, rather than deriving both visualizations from a single physical truth.

This architectural choice leads to:
- Code duplication (bypass evaluated twice)
- Interpretation layers (RenderSystem must decode alignment)
- Growing conditional complexity (each edge case adds conditions)
- Fragile alignment detection (comparing paths instead of annotating one path)

## Gap 1: Dual Path vs. Unity Principle

### The Principle (7.2 Single Source of Truth)

> "There should be ONE physical path calculation that both arrow movement and visualization use."

### Current Implementation

The system has two separate path-building functions:

```typescript
// PathBuilder.ts - Two separate entry points
export function buildPlannedPath(...): PathResult { ... }
export function buildActualPath(...): PathResult { ... }
```

These are called independently from `TrajectoryEngine`:

```typescript
// TrajectoryEngine.ts lines 155-179
getPlannedPath(): PathResult {
  if (this.dirty.plannedPath || !this.cache.plannedPath) {
    this.cache.plannedPath = buildPlannedPath(...);
  }
  return this.cache.plannedPath;
}

getActualPath(): PathResult {
  if (this.dirty.actualPath || !this.cache.actualPath) {
    this.cache.actualPath = buildActualPath(...);
  }
  return this.cache.actualPath;
}
```

### The Gap

The principle states there should be ONE path calculation. The implementation has TWO, which are then compared:

```typescript
// TrajectoryEngine.ts lines 181-189
getAlignment(): AlignmentResult {
  const planned = this.getPlannedPath();
  const actual = this.getActualPath();
  this.cache.alignment = calculateAlignment(planned, actual);
  return this.cache.alignment;
}
```

**Why this matters:** When alignment is detected by comparing two paths, any subtle difference in how those paths are calculated can cause discrepancies. The architecture creates an opportunity for divergence that wouldn't exist with a unified calculation.

### Principle-Aligned Alternative

A unified calculation would produce ONE path with annotations:

```typescript
interface UnifiedPath {
  segments: PathSegment[];  // Physical reality
  cursorIndex: number;       // Where cursor falls
}

interface PathSegment {
  start: Vector2;
  end: Vector2;
  surface: Surface | null;
  wasPlanned: boolean;      // Was this segment in the plan?
  followedPlan: boolean;    // Did we hit where planned?
}
```

Alignment becomes a derived property, not a detection:
```typescript
const isAligned = path.segments.every(s => !s.wasPlanned || s.followedPlan);
```

---

## Gap 2: Bypass as Pre-filter vs. Integrated Concern

### The Principle (6.x Bypass Principles)

Bypass rules (cursor side, player side, etc.) should determine which surfaces are "active" for the trajectory.

### Current Implementation

Bypass evaluation runs BEFORE path building as a filtering step:

```typescript
// PathBuilder.ts - buildPlannedPath
export function buildPlannedPath(...): PathResult {
  // FIRST PRINCIPLE 6.x: Evaluate bypass BEFORE building path
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;
  // ... build path using activeSurfaces
}
```

And AGAIN in buildActualPath:

```typescript
// PathBuilder.ts - buildActualPath
export function buildActualPath(...): PathResult {
  // FIRST PRINCIPLE 6.x + 7.x (Bypass + Unity):
  // Use the SAME bypass evaluation as planned path for direction calculation
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
  const activeSurfaces = bypassResult.activeSurfaces;
  // ... build path using activeSurfaces
}
```

### The Gap

1. **Duplication**: `evaluateBypass()` is called twice with identical inputs
2. **Indirection**: Bypass logic is conceptually separate from path physics
3. **Pre-filtering**: Surfaces are filtered before calculation, not during

**Why this matters:** The bypass decision depends on geometry (cursor position relative to surface). By pre-filtering, we lose the opportunity to make bypass decisions inline with the physics loop, where we have all the context.

### Principle-Aligned Alternative

Bypass should be checked during ray-surface interaction:

```typescript
// During ray casting loop
for (const surface of surfaces) {
  if (shouldBypassDuringHit(ray, surface, cursor)) {
    surface.bypassReason = 'cursor_wrong_side';
    continue; // Skip this surface
  }
  // Check for hit...
}
```

This integrates bypass into the physics loop rather than pre-filtering.

---

## Gap 3: Direction Parameterization Split

### The Principle (3.3 Direction Parameterization)

> "Initial direction is derived from bidirectional image reflection."

### Current Implementation

`buildActualPath` uses bidirectional images for direction calculation ONLY, then switches to forward physics:

```typescript
// PathBuilder.ts lines 350-409 (conceptual)
export function buildActualPath(...): PathResult {
  // Part 1: Use bidirectional images for DIRECTION
  if (activeSurfaces.length === 0) {
    currentDirection = normalize(cursor - player);
  } else {
    const playerImages = buildForwardImages(player, activeSurfaces);
    const cursorImages = buildBackwardImages(cursor, activeSurfaces);
    const playerImage = getPlayerImageForSurface(playerImages, 0);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);
    currentDirection = normalize(cursorImage - playerImage);
  }

  // Part 2: Use forward physics for HITS
  while (reflectionCount < maxReflections) {
    const hit = raycastForward(currentPoint, currentDirection, ...);
    // ... forward physics loop
  }
}
```

### The Gap

The function has two distinct phases:
1. **Direction derivation** (bidirectional images)
2. **Path calculation** (forward physics)

This conceptual split within one function creates cognitive overhead. The reader must understand that the function uses two different paradigms for different purposes.

**Why this matters:** When debugging, it's unclear which paradigm is responsible for a bug. The hybrid approach combines the complexity of both without the simplicity of either.

### Principle-Aligned Alternative

Make the paradigm explicit in the type system:

```typescript
interface DirectionParams {
  source: 'cursor_direct' | 'image_reflected';
  direction: Vector2;
}

function deriveDirection(player, cursor, activeSurfaces): DirectionParams { ... }
function calculatePhysicalPath(start, direction, surfaces): PathResult { ... }
```

Or unify completely by using only forward physics with a cursor-parameterized direction.

---

## Gap 4: Forward Projection as Afterthought

### The Principle (7.1 Arrow-Visualization Unity)

> "The arrow's trajectory when shot MUST be exactly the same as the solid-green + dashed-yellow visualization."

### Current Implementation

Forward projection is calculated at the END of path building:

```typescript
// PathBuilder.ts - end of buildActualPath
const forwardProjection = calculateForwardProjectionWithPhysics(
  lastPoint || player,
  currentDirection,
  allSurfaces,
  lastHitSurface
);

return {
  points,
  hitInfo,
  forwardProjection,  // Separate property
  // ...
};
```

### The Gap

The main path and forward projection are calculated separately and stored as different properties. The arrow uses both:

```typescript
// ArrowSystem conceptually
arrow.waypoints = [...actualPath.points, ...actualPath.forwardProjection];
```

This separation implies they are different things. But according to the principle, they are the SAME thing: the physical path the arrow follows.

**Why this matters:** Having two arrays that must be concatenated creates opportunities for bugs. If the forward projection starts from the wrong point or has the wrong direction, the arrow will jump.

### Principle-Aligned Alternative

One continuous path with a marker:

```typescript
interface ContinuousPath {
  points: Vector2[];      // ALL points, including beyond cursor
  cursorReachedAt: number; // Index where cursor is on path (-1 if not reached)
  terminatedBy: Surface | null; // What stopped the path
}
```

Visualization becomes slicing, not concatenation:
```typescript
const beforeCursor = path.points.slice(0, cursorReachedAt + 1);
const afterCursor = path.points.slice(cursorReachedAt);
```

---

## Gap 5: Alignment as Detection, Not Property

### The Principle (4.1 Full Alignment Condition)

Alignment should be a clear, deterministic property of the paths.

### Current Implementation

Alignment is computed by comparing two paths AFTER they're built:

```typescript
// PathBuilder.ts - calculateAlignment
export function calculateAlignment(
  planned: PathResult,
  actual: PathResult
): AlignmentResult {
  // Compare points, directions, lengths...
  for (let i = 0; i < minLength - 1; i++) {
    // Check if segment starts align
    if (distance(plannedStart, actualStart) > 0.01) {
      divergencePoint = plannedStart;
      break;
    }
    // Check if segment directions align
    // ... complex comparison logic
  }
}
```

### The Gap

The comparison algorithm is complex (60+ lines) and uses tolerances (0.01, 0.999) that can cause edge cases. Alignment is "detected" rather than being an inherent property.

**Why this matters:** Any bug in the comparison algorithm will cause incorrect rendering, even if the paths are correctly calculated. The comparison is an additional layer where bugs can hide.

### Principle-Aligned Alternative

With a unified path, alignment is annotated during calculation:

```typescript
// During path building
for (let i = 0; i < plannedSurfaces.length; i++) {
  const hit = raycast(currentPoint, direction, allSurfaces);
  
  segment.wasPlanned = plannedSurfaces.includes(hit.surface);
  segment.followedPlan = segment.wasPlanned && hit.onSegment;
  
  if (!segment.followedPlan) {
    allFollowingSegments.diverged = true;
  }
}
```

No comparison needed. Alignment is known at calculation time.

---

## Gap 6: RenderSystem Interprets Engine Output

### The Principle (Implicit: Simplicity)

Systems should receive data in a form ready for their purpose.

### Current Implementation

RenderSystem receives `EngineResults` and must interpret the alignment:

```typescript
// RenderSystem.ts
render(): void {
  const { plannedPath, actualPath, alignment } = this.lastResults;

  if (alignment.isFullyAligned) {
    this.renderAlignedPath(actualPath);
  } else {
    this.renderDivergedPaths(plannedPath, actualPath, alignment);
  }
}
```

Then `renderDivergedPaths` has complex logic to:
1. Find the divergence point on the path
2. Determine which segments to draw green
3. Determine which segments to draw red
4. Determine which segments to draw yellow

```typescript
// RenderSystem.ts - complex interpretation
private renderPlannedFromDivergence(
  planned: PathResult,
  divergencePoint: Vector2,
  alignedCount: number
): void {
  let nextPointIndex = this.findNextPointAfterDivergence(
    planned.points,
    divergencePoint,
    alignedCount
  );
  // ... draw logic
}
```

### The Gap

The engine produces raw data. The renderer must decode it. This creates an interpretation layer where bugs can occur.

**Why this matters:** If the engine's alignment information is slightly off, or the renderer's interpretation is slightly wrong, the visualization will be incorrect even though both are "working correctly."

### Principle-Aligned Alternative

Engine produces render-ready segments:

```typescript
interface RenderSegment {
  start: Vector2;
  end: Vector2;
  style: 'solid' | 'dashed';
  color: 'green' | 'red' | 'yellow';
}

// Engine output
interface RenderOutput {
  segments: RenderSegment[];
}

// RenderSystem - no interpretation
render(): void {
  for (const segment of this.lastResults.segments) {
    this.drawSegment(segment);
  }
}
```

---

## Summary of Gaps

| Gap | Principle Violated | Current Approach | Unified Approach |
|-----|-------------------|------------------|------------------|
| Dual Path | 7.2 Single Source | Two paths, compare | One path, annotate |
| Bypass Pre-filter | 6.x Bypass | Filter before calc | Check during calc |
| Direction Split | 3.3 Parameterization | Hybrid paradigm | Explicit separation |
| Forward Projection | 7.1 Unity | Separate property | Continuous path |
| Alignment Detection | 4.1 Alignment | Compare after | Annotate during |
| Render Interpretation | Simplicity | Decode alignment | Receive segments |

## Conclusion

The gaps share a common theme: **separation where unity is needed**. The architecture treats planned and actual paths as separate concerns that must be reconciled, when they should be a single physical reality with annotations about the plan.

The path forward is not to add more comparison logic or edge-case handling, but to refactor toward a unified architecture where alignment, bypass, and rendering are inherent properties of a single calculation, not detected or interpreted after the fact.

See `unified-architecture.md` for the proposed solution.

