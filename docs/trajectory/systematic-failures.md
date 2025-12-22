# Systematic Failure Patterns

This document catalogs patterns in the current architecture that systematically lead to first principle violations. Understanding these patterns helps prevent future violations and guides refactoring efforts.

## Pattern 1: Dual Calculation

### Description

The same calculation is performed multiple times in different contexts, creating opportunities for divergence.

### Manifestation in Codebase

**Example: evaluateBypass called twice**

```typescript
// PathBuilder.ts - buildPlannedPath (line 203)
const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

// PathBuilder.ts - buildActualPath (line 344)
const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
```

Both calls use identical inputs and produce identical outputs, yet they run independently.

**Example: Image sequences built twice**

```typescript
// buildPlannedPath
const playerImages = buildForwardImages(player, activeSurfaces);
const cursorImages = buildBackwardImages(cursor, activeSurfaces);

// buildActualPath
const playerImages = buildForwardImages(player, activeSurfaces);
const cursorImages = buildBackwardImages(cursor, activeSurfaces);
```

### Root Cause

The architecture treats `buildPlannedPath` and `buildActualPath` as independent operations, when they share common dependencies.

### Failure Mode

If someone modifies one call site (e.g., adds a parameter to `evaluateBypass` in `buildPlannedPath`), they may forget to update the other. The two paths will then have different bypass behavior, causing alignment issues.

### Prevention

Share the bypass result at a higher level:

```typescript
// In TrajectoryEngine
const bypassResult = evaluateBypass(...);
const plannedPath = buildPlannedPath(..., bypassResult);
const actualPath = buildActualPath(..., bypassResult);
```

Or unify into a single calculation.

---

## Pattern 2: Interpretation Gap

### Description

The producer of data and the consumer of data have different understandings of what the data means, requiring an interpretation layer.

### Manifestation in Codebase

**Example: RenderSystem interprets AlignmentResult**

```typescript
// Engine produces
interface AlignmentResult {
  isFullyAligned: boolean;
  alignedSegmentCount: number;
  divergencePoint?: Vector2;
}

// RenderSystem must interpret
if (alignment.isFullyAligned) {
  this.renderAlignedPath(actualPath);
} else {
  // Complex interpretation logic...
  const nextPointIndex = this.findNextPointAfterDivergence(
    planned.points,
    divergencePoint,
    alignedCount
  );
  // ...
}
```

The engine says "here's where paths diverge" but the renderer must figure out "which segments should be which color."

### Root Cause

The engine produces intermediate data (alignment info) rather than final data (render segments). The renderer must bridge this gap with interpretation logic.

### Failure Mode

The interpretation logic in RenderSystem has bugs like:
- `findNextPointAfterDivergence` may return the wrong index
- `isPointOnSegment` tolerance may not match engine tolerances
- Drawing from divergence point may miss intermediate reflection points

These bugs occur even when the engine is correct.

### Prevention

Engine should produce render-ready data:

```typescript
interface RenderSegment {
  start: Vector2;
  end: Vector2;
  style: 'solid' | 'dashed';
  color: 'green' | 'red' | 'yellow';
}

interface EngineResults {
  renderSegments: RenderSegment[];  // Ready to draw
}
```

---

## Pattern 3: State Fragmentation

### Description

Information about a single concept is scattered across multiple data structures, making it hard to maintain consistency.

### Manifestation in Codebase

**Example: Surface state scattered**

```typescript
// Planned surfaces - in AimingSystem
private plannedSurfaces: Surface[];

// Bypassed surfaces - in PathResult
readonly bypassedSurfaces?: readonly BypassedSurfaceInfo[];

// Hit surfaces - in HitInfo[]
readonly hitInfo: readonly HitInfo[];

// All surfaces - in GameAdapter
allSurfaces: readonly Surface[];
```

To understand the state of a single surface, you must check:
1. Is it in `plannedSurfaces`?
2. Is it in `bypassedSurfaces`?
3. Is it in `hitInfo`?
4. Is it in `allSurfaces`?

### Root Cause

The architecture evolved incrementally, adding new state as needed without consolidating.

### Failure Mode

- A surface is added to plan but not removed from bypassed list
- A surface is hit but its hit info is in the wrong order relative to plan order
- Rendering checks one list but not another

### Prevention

Centralize surface state:

```typescript
interface SurfaceState {
  surface: Surface;
  planOrder: number | null;      // null = not planned
  bypassReason: BypassReason | null;  // null = not bypassed
  hitResult: HitResult | null;   // null = not hit
}

// Single source of truth
surfaceStates: Map<string, SurfaceState>;
```

---

## Pattern 4: Conditional Accumulation

### Description

Each edge case or principle adds new conditional logic, causing functions to grow without refactoring.

### Manifestation in Codebase

**Example: buildActualPath growing conditions**

```typescript
export function buildActualPath(...): PathResult {
  // Condition 1: No active surfaces
  if (activeSurfaces.length === 0) {
    currentDirection = normalize(cursor - player);
  } else {
    // Condition 2: With active surfaces
    const playerImages = buildForwardImages(...);
    // ...
    
    // Condition 3: Degenerate case
    if (len < 1e-6) {
      // Condition 4: Fallback to surface midpoint
      const surfaceMid = {...};
      // ...
      
      // Condition 5: Still degenerate
      if (len < 1e-6) {
        // Condition 6: Final fallback to cursor
        // ...
      }
    }
  }
  
  // Main loop with more conditions...
  while (reflectionCount < maxReflections) {
    // Condition 7: Check cursor is ahead
    if (dotWithDir > 0) {
      // Condition 8: Check cursor is on path
      if (deviation < 0.01) {
        // Condition 9: Check cursor before hit
        if (cursorDist < hitDist) {
          // ...
        }
      }
    }
    
    // Condition 10: No hit
    if (!hit) { ... }
    
    // Condition 11: Can't reflect
    if (!hit.canReflect) { ... }
  }
  
  // More conditions for return...
}
```

The function is ~200 lines with deeply nested conditions.

### Root Cause

Each bug fix or new principle adds a condition rather than restructuring. The function grows organically.

### Failure Mode

- Conditions interact unexpectedly (condition A changes a variable that condition B relies on)
- Early returns bypass later logic that should run
- Tolerance values (0.01, 1e-6) are scattered and may be inconsistent

### Prevention

Extract conditions into named functions with clear contracts:

```typescript
function determineInitialDirection(player, cursor, activeSurfaces): Vector2 {
  // All direction logic here
}

function checkCursorOnPath(currentPoint, direction, cursor, hit): CursorCheckResult {
  // All cursor-on-path logic here
}

function processHit(hit, currentPoint): HitProcessResult {
  // All hit processing here
}
```

Or use a state machine pattern where each state handles its conditions.

---

## Pattern 5: Tolerance Inconsistency

### Description

Different parts of the codebase use different tolerance values for the same type of comparison.

### Manifestation in Codebase

```typescript
// PathBuilder.ts - point comparison
if (distance(plannedStart, actualStart) > 0.01) { ... }

// PathBuilder.ts - direction comparison
if (dotProduct < 0.999) { ... }

// PathBuilder.ts - degenerate vector
if (len < 1e-6) { ... }

// RenderSystem.ts - point on segment
const delta = Math.abs(startToPoint + pointToEnd - startToEnd);
return delta < tolerance;  // tolerance = 5

// PathBuilder.ts - cursor on path
if (deviation < 0.01) { ... }
```

We have tolerances of: 0.01, 0.999, 1e-6, 5, 1.

### Root Cause

Tolerances added ad-hoc when floating-point issues were encountered, without defining a consistent strategy.

### Failure Mode

- Point is "on segment" by one check but "not on path" by another
- Segments "align" by direction but not by endpoint
- Degenerate detection triggers in one place but not another

### Prevention

Define tolerance constants with clear semantics:

```typescript
// geometry/tolerances.ts
export const POINT_EQUALITY_TOLERANCE = 0.01;  // pixels
export const DIRECTION_ALIGNMENT_TOLERANCE = 0.001;  // radians, ~0.06 degrees
export const DEGENERATE_LENGTH_TOLERANCE = 1e-6;
export const ON_SEGMENT_TOLERANCE = 5;  // pixels, for visual matching
```

Use consistently:
```typescript
import { POINT_EQUALITY_TOLERANCE } from './tolerances';
if (distance(a, b) < POINT_EQUALITY_TOLERANCE) { ... }
```

---

## Pattern 6: Implicit Dependencies

### Description

Functions depend on external state or the order of previous operations without making this explicit.

### Manifestation in Codebase

**Example: TrajectoryEngine cache dependencies**

```typescript
// TrajectoryEngine.ts
getPlannedPath(): PathResult {
  if (this.dirty.plannedPath || !this.cache.plannedPath) {
    this.cache.plannedPath = buildPlannedPath(
      this.player,
      this.cursor,
      this.plannedSurfaces,  // Implicitly depends on setPlannedSurfaces being called
      this.allSurfaces       // Implicitly depends on setAllSurfaces being called
    );
  }
  return this.cache.plannedPath;
}
```

The function relies on:
1. `setPlayer` having been called
2. `setCursor` having been called
3. `setPlannedSurfaces` having been called
4. `setAllSurfaces` having been called

None of this is explicit in the function signature.

**Example: ArrowSystem depends on AimingSystem state**

```typescript
// ArrowSystem gets waypoints from somewhere
arrow.waypoints = [...];  // Where do these come from?

// They come from AimingSystem, but the dependency is implicit
this.aimingSystem.getArrowWaypoints();
```

### Root Cause

Object-oriented state management where methods read from `this` rather than taking explicit parameters.

### Failure Mode

- Calling methods in the wrong order produces incorrect results
- Difficult to test because you must set up all implicit state
- Race conditions if state changes between method calls

### Prevention

Make dependencies explicit:

```typescript
// Pure function - all inputs explicit
function buildPlannedPath(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): PathResult { ... }

// Or use a builder pattern with required fields
interface TrajectoryInput {
  player: Vector2;
  cursor: Vector2;
  plannedSurfaces: readonly Surface[];
  allSurfaces: readonly Surface[];
}

function calculateTrajectory(input: TrajectoryInput): TrajectoryResult { ... }
```

---

## Pattern 7: Mixed Abstraction Levels

### Description

A single function operates at multiple levels of abstraction, mixing high-level decisions with low-level calculations.

### Manifestation in Codebase

**Example: buildActualPath**

```typescript
export function buildActualPath(...): PathResult {
  // High-level: Bypass evaluation
  const bypassResult = evaluateBypass(...);
  
  // High-level: Direction strategy selection
  if (activeSurfaces.length === 0) { ... }
  else { ... }
  
  // Mid-level: Image calculation
  const playerImages = buildForwardImages(...);
  
  // Low-level: Vector math
  let dx = cursorImage.x - playerImage.x;
  let dy = cursorImage.y - playerImage.y;
  let len = Math.sqrt(dx * dx + dy * dy);
  
  // High-level: Physics loop
  while (reflectionCount < maxReflections) {
    // Mid-level: Ray casting
    const hit = raycastForward(...);
    
    // Low-level: Dot product for cursor check
    const dotWithDir = toCursor.x * currentDirection.x + toCursor.y * currentDirection.y;
    
    // High-level: Path termination decision
    if (!hit.canReflect) { return {...}; }
  }
}
```

### Root Cause

Functions grow to handle "one more thing" without extracting helpers.

### Failure Mode

- Hard to understand because you must context-switch between abstraction levels
- Hard to test because the function does too many things
- Hard to modify because changes at one level may affect another

### Prevention

Separate abstraction levels:

```typescript
// High-level orchestration
function buildActualPath(input: TrajectoryInput): PathResult {
  const bypass = evaluateBypass(input);
  const direction = deriveInitialDirection(input, bypass.activeSurfaces);
  return tracePhysicalPath(input.player, direction, input.allSurfaces);
}

// Mid-level operations
function deriveInitialDirection(...): Vector2 { ... }
function tracePhysicalPath(...): PathResult { ... }

// Low-level utilities
function normalize(v: Vector2): Vector2 { ... }
function dotProduct(a: Vector2, b: Vector2): number { ... }
```

---

## Summary Table

| Pattern | Example Location | Impact | Prevention |
|---------|------------------|--------|------------|
| Dual Calculation | `evaluateBypass` called twice | Divergence risk | Share at higher level |
| Interpretation Gap | RenderSystem decodes alignment | Bug amplification | Engine produces render-ready data |
| State Fragmentation | Surface info in 4+ places | Inconsistency | Centralize surface state |
| Conditional Accumulation | buildActualPath 200+ lines | Interaction bugs | Extract named functions |
| Tolerance Inconsistency | 5+ different tolerances | Edge case failures | Define constants |
| Implicit Dependencies | TrajectoryEngine state | Order-dependent bugs | Explicit parameters |
| Mixed Abstraction Levels | buildActualPath | Cognitive overload | Separate by level |

## Relationship to First Principles

| Pattern | Principles Violated |
|---------|---------------------|
| Dual Calculation | 7.2 Single Source of Truth |
| Interpretation Gap | 1.x Visual Principles (colors may be wrong) |
| State Fragmentation | 6.x Bypass Principles (bypass state may be inconsistent) |
| Conditional Accumulation | All (each condition is a patch for a principle) |
| Tolerance Inconsistency | 4.x Alignment Principles |
| Implicit Dependencies | 7.1 Arrow-Visualization Unity |
| Mixed Abstraction Levels | General code quality |

## Conclusion

These patterns are interconnected. Dual Calculation leads to State Fragmentation. Implicit Dependencies enable Conditional Accumulation. Tolerance Inconsistency causes Interpretation Gap issues.

The solution is not to patch individual patterns but to redesign the architecture to prevent them from occurring. See `unified-architecture.md` for the proposed design.

