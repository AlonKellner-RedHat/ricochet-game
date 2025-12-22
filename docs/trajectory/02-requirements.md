# Requirements Analysis: Trajectory and Reflection System

## Overview

This document analyzes the requirements for a robust, simple, and readable trajectory system. Requirements are derived from the first principles and gameplay specifications, with special attention to floating-point resistance and GPU compatibility.

---

## 1. Robustness Requirements

### 1.1 Determinism

**Requirement:** Given identical inputs, the system must produce identical outputs every time.

| Aspect | Requirement |
|--------|-------------|
| Same player position + cursor + surfaces | Same trajectory points |
| Same reflection sequence | Same image positions |
| Same intersection calculation | Same parametric t values |

**Implications:**
- No reliance on object identity or memory addresses
- No random or time-based factors
- Consistent ordering of operations

### 1.2 Edge Case Handling

The system must explicitly handle all edge cases:

| Edge Case | Required Behavior |
|-----------|-------------------|
| Parallel ray and segment | Report "no intersection" cleanly |
| Coincident lines | Handle as special case or degenerate |
| Zero-length segment | Reject or treat as point |
| Ray origin on segment | Define clear behavior (t = 0 intersection) |
| Cursor at player position | Valid (zero-length trajectory) |
| Segment endpoint exactly on ray | Handle with consistent tolerance |

### 1.3 Tolerance Management

**Requirement:** A single, consistent tolerance value used throughout.

```typescript
const GEOMETRY_TOLERANCE = 1e-9;  // Single source of truth

function isOnSegment(t: number): boolean {
  return t >= -GEOMETRY_TOLERANCE && t <= 1 + GEOMETRY_TOLERANCE;
}

function pointsEqual(a: Vector2, b: Vector2): boolean {
  return Math.abs(a.x - b.x) < GEOMETRY_TOLERANCE 
      && Math.abs(a.y - b.y) < GEOMETRY_TOLERANCE;
}
```

### 1.4 Bounded Iteration

**Requirement:** All loops must have explicit bounds to prevent infinite loops.

| Operation | Bound |
|-----------|-------|
| Reflection chain length | MAX_REFLECTIONS (e.g., 10) |
| Intersection search iterations | Number of surfaces |
| Ghost path extensions | MAX_GHOST_BOUNCES (e.g., 5) |
| Path exhaustion distance | EXHAUSTION_DISTANCE (e.g., 8000 pixels) |

### 1.5 No Division by Zero

**Requirement:** All divisions must be guarded.

```typescript
function lineLineIntersection(p1, p2, p3, p4): IntersectionResult {
  const denominator = (p1.x - p2.x) * (p3.y - p4.y) 
                    - (p1.y - p2.y) * (p3.x - p4.x);
  
  if (Math.abs(denominator) < GEOMETRY_TOLERANCE) {
    return { intersects: false, parallel: true };
  }
  
  // Safe to divide
  const t = numerator / denominator;
  // ...
}
```

---

## 2. Floating-Point Requirements

### 2.1 Point-Based Rays

**Requirement:** Rays must be defined by two points, never by a normalized direction.

```typescript
// REQUIRED
interface Ray {
  from: Vector2;
  to: Vector2;
}

// FORBIDDEN
interface BadRay {
  origin: Vector2;
  direction: Vector2;  // Normalized direction - introduces errors
}
```

### 2.2 No Normalization for Storage

**Requirement:** Normalized vectors may only be computed for immediate use, never stored.

```typescript
// ALLOWED: Normalize for immediate dot product
function isApproachingFromFront(ray: Ray, surface: Surface): boolean {
  const dir = normalize(subtract(ray.to, ray.from));  // Temporary
  const normal = getSurfaceNormal(surface);           // Temporary
  return dot(dir, normal) < 0;
}

// FORBIDDEN: Storing normalized direction
class Arrow {
  direction: Vector2;  // BAD - accumulated errors
}
```

### 2.3 Verifiable Reflections

**Requirement:** Every reflection must be mathematically verifiable.

```typescript
function verifyReflection(original: Vector2, reflected: Vector2, line: Line): boolean {
  const doubleReflected = reflectPoint(reflected, line);
  return pointsEqual(original, doubleReflected);
}
```

### 2.4 Image-Based Direction

**Requirement:** Ray directions must be derived from image positions.

```typescript
// The ray from player toward first surface uses the first cursor image
function getFirstRayDirection(playerImages: ImageSequence, cursorImages: ImageSequence): Ray {
  const from = playerImages.images[0].position;  // Player
  const to = cursorImages.images[cursorImages.images.length - 1].position;  // Last cursor image
  return { from, to };
}
```

### 2.5 Intersection Precision

**Requirement:** Intersection calculations must use the full point coordinates.

```typescript
// Use exact endpoint coordinates
const intersection = lineLineIntersection(
  ray.from, ray.to,           // Full precision points
  segment.start, segment.end  // Full precision points
);

// NOT this
const intersection = rayInDirection(
  ray.origin, ray.direction,  // Direction has precision loss
  segment
);
```

---

## 3. Simplicity Requirements

### 3.1 Pure Functions for Calculations

**Requirement:** All geometric calculations must be pure functions with no side effects.

```typescript
// PURE: Output depends only on inputs
function reflectPoint(point: Vector2, lineP1: Vector2, lineP2: Vector2): Vector2 {
  // ... calculation ...
  return reflectedPoint;
}

// IMPURE (FORBIDDEN for calculations)
function reflectPoint(point: Vector2, line: Line): Vector2 {
  this.lastReflection = point;  // Side effect!
  return reflectedPoint;
}
```

### 3.2 Single Responsibility

**Requirement:** Each function does exactly one thing.

| Function | Responsibility |
|----------|----------------|
| `lineLineIntersection` | Calculate intersection of two lines |
| `reflectPoint` | Reflect a point through a line |
| `pointSide` | Determine which side of a line a point is on |
| `isOnSegment` | Check if parametric t is within [0, 1] |

**Not:** `calculateIntersectionAndReflectIfNeeded` (multiple responsibilities)

### 3.3 Minimal Parameters

**Requirement:** Functions should require only what they need.

```typescript
// GOOD: Minimal parameters
function reflectPoint(
  point: Vector2,
  lineP1: Vector2,
  lineP2: Vector2
): Vector2;

// BAD: Excessive context
function reflectPoint(
  point: Vector2,
  surface: Surface,      // Only need the segment endpoints
  scene: Scene,          // Irrelevant
  options: ReflectOptions // Over-engineering
): Vector2;
```

### 3.4 Clear Return Types

**Requirement:** Use discriminated unions for operations that can fail or have multiple outcomes.

```typescript
// GOOD: Clear outcomes
type IntersectionResult =
  | { type: 'hit'; point: Vector2; tRay: number; tSegment: number }
  | { type: 'parallel' }
  | { type: 'behind' };  // Intersection behind ray origin

// BAD: Nullable with unclear meaning
type BadResult = {
  point: Vector2 | null;  // Why null? Parallel? Behind? Error?
  t: number;              // What does this mean if point is null?
};
```

### 3.5 No Hidden State

**Requirement:** Calculations must depend only on explicit inputs.

```typescript
// FORBIDDEN
class Calculator {
  private lastResult: Result;
  
  calculate(input: Input): Result {
    if (this.lastResult && ...) {  // Hidden dependency!
      return this.lastResult;
    }
    // ...
  }
}

// ALLOWED
function calculate(input: Input, cache?: Cache): Result {
  // Cache is explicit parameter
}
```

---

## 4. Readability Requirements

### 4.1 Descriptive Naming

**Requirement:** Names must clearly describe purpose.

| Bad Name | Good Name |
|----------|-----------|
| `intersect` | `lineLineIntersection` |
| `reflect` | `reflectPointThroughLine` |
| `check` | `isPointOnPositiveSide` |
| `calc` | `calculatePlannedPath` |
| `t` | `parametricPosition` or `tSegment` |

### 4.2 Documentation Standards

**Requirement:** All public functions must have JSDoc with:
- Description of purpose
- Parameter descriptions with types and constraints
- Return value description
- Example usage for complex functions

```typescript
/**
 * Calculate the intersection of two lines defined by point pairs.
 * 
 * Uses the parametric line-line intersection formula without normalization
 * to maintain floating-point precision.
 * 
 * @param line1P1 - First point of line 1
 * @param line1P2 - Second point of line 1
 * @param line2P1 - First point of line 2
 * @param line2P2 - Second point of line 2
 * @returns Intersection result with parametric positions
 * 
 * @example
 * const result = lineLineIntersection(
 *   { x: 0, y: 0 }, { x: 10, y: 10 },
 *   { x: 0, y: 10 }, { x: 10, y: 0 }
 * );
 * // result = { type: 'hit', point: { x: 5, y: 5 }, tLine1: 0.5, tLine2: 0.5 }
 */
function lineLineIntersection(...): IntersectionResult;
```

### 4.3 Separation of Concerns

**Requirement:** Clear boundaries between layers.

```
┌─────────────────────────────────────────┐
│           Rendering Layer               │
│  • Consumes path data                   │
│  • Draws visual elements                │
│  • No geometry calculations             │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│         Path Building Layer             │
│  • Constructs planned/actual paths      │
│  • Uses geometry ops                    │
│  • Manages image sequences              │
└─────────────────────────────────────────┘
                    │
┌─────────────────────────────────────────┐
│          Geometry Ops Layer             │
│  • Pure math functions                  │
│  • No game concepts                     │
│  • No surface/arrow types               │
└─────────────────────────────────────────┘
```

---

## 5. Performance Requirements

### 5.1 Caching Strategy

**Requirement:** Image sequences should be cached when inputs haven't changed.

```typescript
interface CacheKey {
  playerPosition: Vector2;
  cursorPosition: Vector2;
  surfaceIds: string[];  // Ordered list of planned surface IDs
}

// Only recalculate if key changes
if (!keysEqual(currentKey, cachedKey)) {
  cachedImages = buildImageSequences(player, cursor, surfaces);
  cachedKey = currentKey;
}
```

### 5.2 Lazy vs. Eager Evaluation

**Requirement:** Prefer eager evaluation for simplicity, with lazy evaluation only where proven necessary.

| Operation | Strategy | Rationale |
|-----------|----------|-----------|
| Image sequence building | Eager | Needed for path calculation anyway |
| Path construction | Eager | Needed for rendering |
| Ghost path extension | Lazy | Only needed if visible |
| Obstruction checking | Eager | Critical for correctness |

### 5.3 Bounded Complexity

**Requirement:** Operations must have known complexity bounds.

| Operation | Complexity | Bound |
|-----------|------------|-------|
| Build image sequence | O(N) | N = planned surfaces |
| Build planned path | O(N) | N = planned surfaces |
| Check obstructions | O(M) | M = all surfaces |
| Find first intersection | O(M) | M = all surfaces |
| GPU per-pixel check | O(N × M) | Per pixel |

---

## 6. GPU Compatibility Requirements

### 6.1 Data Structure Compatibility

**Requirement:** Core data structures must be representable as shader uniforms.

```typescript
// Must map to GPU types
interface GPUCompatibleData {
  player: [number, number];           // vec2
  images: [number, number][];         // vec2[] (fixed max size)
  surfaces: [number, number, number, number][];  // vec4[] (start.xy, end.xy)
  surfaceCount: number;               // int
}
```

### 6.2 Bounded Array Sizes

**Requirement:** All arrays must have compile-time maximum sizes for shader compatibility.

```typescript
const MAX_REFLECTIONS = 10;
const MAX_SURFACES = 50;

// Shader declaration
// uniform vec2 images[10];
// uniform vec4 surfaces[50];
```

### 6.3 Algorithm Portability

**Requirement:** Core algorithms must be expressible in GLSL without modification.

```typescript
// TypeScript
function reflectPoint(P: Vector2, A: Vector2, B: Vector2): Vector2 {
  const AB = subtract(B, A);
  const AP = subtract(P, A);
  const t = dot(AP, AB) / dot(AB, AB);
  const projection = add(A, scale(AB, t));
  return subtract(scale(projection, 2), P);
}

// Equivalent GLSL
// vec2 reflectPoint(vec2 P, vec2 A, vec2 B) {
//   vec2 AB = B - A;
//   vec2 AP = P - A;
//   float t = dot(AP, AB) / dot(AB, AB);
//   vec2 projection = A + t * AB;
//   return 2.0 * projection - P;
// }
```

### 6.4 No Branching Dependencies

**Requirement:** Core calculations should minimize GPU-unfriendly branching.

```glsl
// PREFERRED: Branchless or simple branches
float isOnSegment = step(0.0, t) * step(t, 1.0);  // 1.0 if on segment

// AVOID: Complex nested branches
if (t > 0.0) {
  if (t < 1.0) {
    if (someOtherCondition) {
      // Deep nesting hurts GPU performance
    }
  }
}
```

---

## 7. Testability Requirements

### 7.1 Unit Test Coverage

**Requirement:** All pure functions must have comprehensive unit tests.

| Function | Test Cases |
|----------|------------|
| `lineLineIntersection` | Crossing, parallel, coincident, perpendicular |
| `reflectPoint` | Various angles, point on line, point at endpoint |
| `pointSide` | Positive, negative, exactly on line |
| `isOnSegment` | Inside, outside, at endpoints, near tolerance |

### 7.2 Property-Based Testing

**Requirement:** Reflection operations should satisfy mathematical properties.

```typescript
// Involution: reflect(reflect(P)) = P
test('reflection is involutory', () => {
  forAll(point, line, (P, L) => {
    const P_prime = reflectPoint(P, L);
    const P_double = reflectPoint(P_prime, L);
    expect(P_double).toBeCloseTo(P);
  });
});

// Equidistance: distance(P, line) = distance(P', line)
test('reflection preserves distance from line', () => {
  forAll(point, line, (P, L) => {
    const P_prime = reflectPoint(P, L);
    expect(distanceToLine(P, L)).toBeCloseTo(distanceToLine(P_prime, L));
  });
});
```

### 7.3 Integration Test Scenarios

**Requirement:** End-to-end scenarios must be tested.

| Scenario | Verification |
|----------|--------------|
| Single reflection, on-segment | Path points match expected |
| Single reflection, off-segment | Actual path diverges correctly |
| Multiple reflections | Image chain is correct |
| Obstruction before reflection | Surface is bypassed |
| Cursor beyond surface | Planned path still valid |

---

## 8. Requirements Summary Matrix

| Category | Requirement | Priority |
|----------|-------------|----------|
| Robustness | Deterministic outputs | Critical |
| Robustness | Edge case handling | Critical |
| Robustness | Bounded iteration | Critical |
| Float | Point-based rays | Critical |
| Float | No stored normalization | Critical |
| Float | Verifiable reflections | High |
| Simplicity | Pure functions | High |
| Simplicity | Single responsibility | High |
| Simplicity | Clear return types | High |
| Readability | Descriptive names | Medium |
| Readability | JSDoc documentation | Medium |
| Readability | Layer separation | High |
| Performance | Image caching | Medium |
| Performance | Bounded complexity | High |
| GPU | Shader-compatible structures | Medium |
| GPU | Portable algorithms | Medium |
| Test | Unit test coverage | High |
| Test | Property-based tests | Medium |

