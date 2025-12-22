# Design Options: Trajectory and Reflection System

## Overview

This document presents multiple architectural approaches for implementing the trajectory system, analyzing each option's strengths, weaknesses, and suitability for the requirements defined in previous documents.

---

## Option A: Pure Functional Architecture

### Description

All calculations are implemented as pure functions. Data flows through function pipelines with no classes or mutable state. Value objects (plain interfaces) carry data between functions.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (GameScene, Player, AimingSystem - existing code)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Trajectory Functions                       │
│                                                              │
│  buildPlayerImages(player, surfaces) → ImageSequence         │
│  buildCursorImages(cursor, surfaces) → ImageSequence         │
│  buildPlannedPath(playerSeq, cursorSeq) → PathResult         │
│  buildActualPath(playerSeq, allSurfaces) → PathResult        │
│  calculateAlignment(planned, actual) → AlignmentResult       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Geometry Functions                        │
│                                                              │
│  lineLineIntersection(p1, p2, p3, p4) → IntersectionResult   │
│  reflectPointThroughLine(point, p1, p2) → Vector2            │
│  pointSideOfLine(point, p1, p2) → number                     │
│  isOnSegment(t) → boolean                                    │
└─────────────────────────────────────────────────────────────┘
```

### Code Structure

```
src/trajectory/
├── geometry.ts           # Pure geometry functions
├── imageBuilder.ts       # Image sequence construction
├── pathBuilder.ts        # Path construction functions
├── alignment.ts          # Alignment calculation
├── types.ts              # Value object interfaces
└── index.ts              # Public API
```

### Example Code

```typescript
// types.ts
interface Ray { from: Vector2; to: Vector2; }
interface ReflectedImage { position: Vector2; source: ImageSource; depth: number; }
interface ImageSequence { original: Vector2; images: ReflectedImage[]; surfaces: Surface[]; }
interface PathResult { points: Vector2[]; details: IntersectionDetail[]; }

// geometry.ts
export function lineLineIntersection(
  p1: Vector2, p2: Vector2,
  p3: Vector2, p4: Vector2
): IntersectionResult { /* ... */ }

export function reflectPointThroughLine(
  point: Vector2,
  lineP1: Vector2,
  lineP2: Vector2
): Vector2 { /* ... */ }

// imageBuilder.ts
export function buildPlayerImages(
  player: Vector2,
  surfaces: readonly Surface[]
): ImageSequence { /* ... */ }

export function buildCursorImages(
  cursor: Vector2,
  surfaces: readonly Surface[]
): ImageSequence { /* ... */ }

// pathBuilder.ts
export function buildPlannedPath(
  playerImages: ImageSequence,
  cursorImages: ImageSequence
): PathResult { /* ... */ }

// Usage
const playerSeq = buildPlayerImages(player, plannedSurfaces);
const cursorSeq = buildCursorImages(cursor, plannedSurfaces);
const plannedPath = buildPlannedPath(playerSeq, cursorSeq);
const actualPath = buildActualPath(playerSeq, allSurfaces);
const alignment = calculateAlignment(plannedPath, actualPath);
```

### Pros and Cons

| Pros | Cons |
|------|------|
| Maximum testability (pure functions) | May require passing many parameters |
| No hidden state or side effects | No encapsulation of related data |
| Easy to reason about correctness | Could lead to long function signatures |
| Functions are composable | No object identity for caching |
| Simple to parallelize | Verbose call sites |
| Direct GLSL translation | No polymorphism |

### Requirement Suitability

| Requirement | Suitability | Notes |
|-------------|-------------|-------|
| Floating-point resistance | Excellent | Pure functions use point-based rays |
| Determinism | Excellent | No hidden state |
| Testability | Excellent | Each function testable in isolation |
| GPU compatibility | Excellent | Direct translation to GLSL |
| Simplicity | Good | Many small functions |
| Caching | Poor | Need external cache management |

---

## Option B: Object-Oriented with Immutable Data

### Description

Classes encapsulate related operations. All data objects are immutable—methods return new instances rather than modifying state. Clear class hierarchy with well-defined responsibilities.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   TrajectoryCalculator                       │
│                                                              │
│  + calculatePlanned(scene: Scene): TrajectoryResult          │
│  + calculateActual(scene: Scene): TrajectoryResult           │
│  - imageBuilder: ImageBuilder                                │
│  - pathBuilder: PathBuilder                                  │
└─────────────────────────────────────────────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────┐    ┌─────────────────────────────────┐
│    ImageBuilder     │    │         PathBuilder              │
│                     │    │                                  │
│ + buildForward()    │    │ + buildPlanned(imgs, imgs)       │
│ + buildBackward()   │    │ + buildActual(imgs, surfaces)    │
└─────────────────────┘    └─────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Geometry Classes                          │
│                                                              │
│  Ray { from, to, intersect(line) }                           │
│  Line { p1, p2, reflect(point), side(point) }                │
│  Segment extends Line { contains(t) }                        │
└─────────────────────────────────────────────────────────────┘
```

### Code Structure

```
src/trajectory/
├── geometry/
│   ├── Ray.ts
│   ├── Line.ts
│   ├── Segment.ts
│   └── index.ts
├── builders/
│   ├── ImageBuilder.ts
│   ├── PathBuilder.ts
│   └── index.ts
├── TrajectoryCalculator.ts
├── types.ts
└── index.ts
```

### Example Code

```typescript
// Line.ts
class Line {
  constructor(readonly p1: Vector2, readonly p2: Vector2) {}
  
  reflect(point: Vector2): Vector2 {
    const AB = subtract(this.p2, this.p1);
    const AP = subtract(point, this.p1);
    const t = dot(AP, AB) / dot(AB, AB);
    const projection = add(this.p1, scale(AB, t));
    return subtract(scale(projection, 2), point);
  }
  
  side(point: Vector2): number {
    return cross(subtract(this.p2, this.p1), subtract(point, this.p1));
  }
  
  intersect(other: Line): IntersectionResult { /* ... */ }
}

// Ray.ts
class Ray {
  constructor(readonly from: Vector2, readonly to: Vector2) {}
  
  asLine(): Line {
    return new Line(this.from, this.to);
  }
  
  intersect(line: Line): IntersectionResult {
    return this.asLine().intersect(line);
  }
}

// ImageBuilder.ts
class ImageBuilder {
  buildForward(origin: Vector2, surfaces: Surface[]): ImageSequence {
    const images: ReflectedImage[] = [{ position: origin, source: null, depth: 0 }];
    let current = origin;
    
    for (let i = 0; i < surfaces.length; i++) {
      const line = new Line(surfaces[i].segment.start, surfaces[i].segment.end);
      const reflected = line.reflect(current);
      images.push({ position: reflected, source: { position: current, surface: surfaces[i] }, depth: i + 1 });
      current = reflected;
    }
    
    return { original: origin, images, surfaces };
  }
}

// Usage
const calculator = new TrajectoryCalculator();
const result = calculator.calculate(scene);
```

### Pros and Cons

| Pros | Cons |
|------|------|
| Encapsulates related operations | More complex class hierarchies |
| Cleaner API for complex operations | Risk of hidden mutable state |
| Natural grouping of functionality | Harder to test in isolation |
| Polymorphism possible | More boilerplate |
| Familiar OO patterns | Less direct GLSL translation |
| Easy to add caching | Potential for god classes |

### Requirement Suitability

| Requirement | Suitability | Notes |
|-------------|-------------|-------|
| Floating-point resistance | Good | Must discipline to use point-based rays |
| Determinism | Moderate | Must ensure immutability |
| Testability | Moderate | Classes can have hidden dependencies |
| GPU compatibility | Moderate | Need to extract data for shaders |
| Simplicity | Moderate | More concepts to understand |
| Caching | Excellent | Objects can cache internally |

---

## Option C: Hybrid with Explicit Image Chains

### Description

Combines pure functions for geometry with explicit data structures for image chains. The image chain is a first-class concept with clear lifecycle. Path builders consume image chains.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                   TrajectorySystem                           │
│  (Orchestrates image building, path calculation, caching)    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌────────────────────┐
│ ImageChain    │    │  PathBuilder  │    │ TrajectoryRenderer │
│               │    │               │    │                    │
│ • forward()   │    │ • planned()   │    │ • render()         │
│ • backward()  │    │ • actual()    │    │                    │
│ • cache       │    │ • alignment() │    │                    │
└───────────────┘    └───────────────┘    └────────────────────┘
        │                     │
        └──────────┬──────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                GeometryOps (Pure Functions)                  │
│                                                              │
│  lineLineIntersection()    reflectPoint()    pointSide()     │
└─────────────────────────────────────────────────────────────┘
```

### Code Structure

```
src/trajectory/
├── geometry/
│   ├── GeometryOps.ts      # Pure functions
│   └── types.ts            # Geometry value objects
├── chain/
│   ├── ImageChain.ts       # Image chain with caching
│   └── types.ts            # Image-related types
├── builder/
│   ├── PlannedPathBuilder.ts
│   ├── ActualPathBuilder.ts
│   └── AlignmentCalculator.ts
├── renderer/
│   └── TrajectoryRenderer.ts
├── TrajectorySystem.ts     # Orchestrator
└── index.ts
```

### Example Code

```typescript
// ImageChain.ts
class ImageChain {
  private _forward: ImageSequence | null = null;
  private _backward: ImageSequence | null = null;
  private _cacheKey: string | null = null;
  
  constructor(
    private player: Vector2,
    private cursor: Vector2,
    private surfaces: readonly Surface[]
  ) {}
  
  get forward(): ImageSequence {
    if (!this._forward) {
      this._forward = this.buildForward();
    }
    return this._forward;
  }
  
  get backward(): ImageSequence {
    if (!this._backward) {
      this._backward = this.buildBackward();
    }
    return this._backward;
  }
  
  private buildForward(): ImageSequence {
    const images: ReflectedImage[] = [];
    let current = this.player;
    
    for (const surface of this.surfaces) {
      const reflected = GeometryOps.reflectPoint(
        current,
        surface.segment.start,
        surface.segment.end
      );
      images.push({ position: reflected, source: { position: current, surface }, depth: images.length + 1 });
      current = reflected;
    }
    
    return { original: this.player, images, surfaces: this.surfaces };
  }
  
  private buildBackward(): ImageSequence {
    const reversedSurfaces = [...this.surfaces].reverse();
    const images: ReflectedImage[] = [];
    let current = this.cursor;
    
    for (const surface of reversedSurfaces) {
      const reflected = GeometryOps.reflectPoint(
        current,
        surface.segment.start,
        surface.segment.end
      );
      images.push({ position: reflected, source: { position: current, surface }, depth: images.length + 1 });
      current = reflected;
    }
    
    return { original: this.cursor, images, surfaces: reversedSurfaces };
  }
  
  invalidate(): void {
    this._forward = null;
    this._backward = null;
  }
}

// PlannedPathBuilder.ts
class PlannedPathBuilder {
  build(chain: ImageChain): PathResult {
    const forward = chain.forward;
    const backward = chain.backward;
    const points: Vector2[] = [forward.original];
    
    for (let i = 0; i < forward.surfaces.length; i++) {
      const playerImg = forward.images[i] ?? { position: forward.original };
      const cursorImg = backward.images[forward.surfaces.length - 1 - i];
      
      if (!cursorImg) continue;
      
      const intersection = GeometryOps.lineLineIntersection(
        playerImg.position,
        cursorImg.position,
        forward.surfaces[i].segment.start,
        forward.surfaces[i].segment.end
      );
      
      if (intersection.intersects && intersection.point) {
        points.push(intersection.point);
      }
    }
    
    points.push(backward.original);
    return { points, /* ... */ };
  }
}

// Usage
const chain = new ImageChain(player, cursor, plannedSurfaces);
const plannedPath = new PlannedPathBuilder().build(chain);
const actualPath = new ActualPathBuilder().build(chain, allSurfaces);
```

### Pros and Cons

| Pros | Cons |
|------|------|
| Clear data flow | Two concepts (functions + chains) |
| Built-in caching via ImageChain | Need discipline to keep separation |
| Pure geometry functions | Slightly more complex structure |
| Explicit lifecycle | More files/classes |
| Easy to debug (trace image chain) | Cache invalidation complexity |
| Good balance of concerns | |

### Requirement Suitability

| Requirement | Suitability | Notes |
|-------------|-------------|-------|
| Floating-point resistance | Excellent | GeometryOps uses point-based rays |
| Determinism | Excellent | Chain is explicit, functions are pure |
| Testability | Excellent | Functions and chain testable separately |
| GPU compatibility | Good | GeometryOps translates to GLSL |
| Simplicity | Good | Clear responsibilities |
| Caching | Excellent | ImageChain handles caching |

---

## Option D: Lazy Evaluation with Memoization

### Description

All calculations are lazy—computed only when accessed. Results are memoized based on input hash. Functional reactive style where values are derived from dependencies.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    TrajectoryState                           │
│  (Reactive state container with lazy computed properties)    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │ playerImages │ │ cursorImages │ │  alignment   │
      │   (lazy)     │ │   (lazy)     │ │   (lazy)     │
      └──────────────┘ └──────────────┘ └──────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   plannedPath    │
                    │   actualPath     │
                    │     (lazy)       │
                    └──────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                GeometryOps (Pure Functions)                  │
└─────────────────────────────────────────────────────────────┘
```

### Code Structure

```
src/trajectory/
├── geometry/
│   └── GeometryOps.ts
├── state/
│   ├── TrajectoryState.ts
│   ├── computedProperty.ts  # Memoization helper
│   └── types.ts
├── renderer/
│   └── TrajectoryRenderer.ts
└── index.ts
```

### Example Code

```typescript
// computedProperty.ts
function memoized<T>(compute: () => T, getDeps: () => unknown[]): () => T {
  let cached: T | undefined;
  let lastDeps: unknown[] | undefined;
  
  return () => {
    const deps = getDeps();
    if (!lastDeps || !depsEqual(deps, lastDeps)) {
      cached = compute();
      lastDeps = deps;
    }
    return cached!;
  };
}

// TrajectoryState.ts
class TrajectoryState {
  private _player: Vector2 = { x: 0, y: 0 };
  private _cursor: Vector2 = { x: 0, y: 0 };
  private _plannedSurfaces: Surface[] = [];
  private _allSurfaces: Surface[] = [];
  
  // Lazy computed properties
  readonly playerImages = memoized(
    () => buildPlayerImages(this._player, this._plannedSurfaces),
    () => [this._player, this._plannedSurfaces]
  );
  
  readonly cursorImages = memoized(
    () => buildCursorImages(this._cursor, this._plannedSurfaces),
    () => [this._cursor, this._plannedSurfaces]
  );
  
  readonly plannedPath = memoized(
    () => buildPlannedPath(this.playerImages(), this.cursorImages()),
    () => [this.playerImages(), this.cursorImages()]
  );
  
  readonly actualPath = memoized(
    () => buildActualPath(this.playerImages(), this._allSurfaces),
    () => [this.playerImages(), this._allSurfaces]
  );
  
  readonly alignment = memoized(
    () => calculateAlignment(this.plannedPath(), this.actualPath()),
    () => [this.plannedPath(), this.actualPath()]
  );
  
  // Setters trigger recalculation on next access
  setPlayer(p: Vector2) { this._player = p; }
  setCursor(c: Vector2) { this._cursor = c; }
  setPlannedSurfaces(s: Surface[]) { this._plannedSurfaces = s; }
  setAllSurfaces(s: Surface[]) { this._allSurfaces = s; }
}

// Usage
const state = new TrajectoryState();
state.setPlayer(playerPosition);
state.setCursor(cursorPosition);
state.setPlannedSurfaces(planned);
state.setAllSurfaces(all);

// Only computed when accessed
const path = state.plannedPath();  // Computed
const path2 = state.plannedPath(); // Cached
```

### Pros and Cons

| Pros | Cons |
|------|------|
| Automatic caching | Complex dependency tracking |
| Only computes what's needed | Debugging can be tricky |
| Reactive updates | Memory for cached values |
| No manual invalidation | Dependency cycles possible |
| Clean API | Less explicit data flow |
| Efficient for partial access | Harder to understand initially |

### Requirement Suitability

| Requirement | Suitability | Notes |
|-------------|-------------|-------|
| Floating-point resistance | Good | Underlying functions use point-based rays |
| Determinism | Excellent | Memoization ensures consistency |
| Testability | Moderate | Need to test memoization separately |
| GPU compatibility | Good | Computed values can feed shader |
| Simplicity | Moderate | Memoization adds complexity |
| Caching | Excellent | Built-in memoization |

---

## Comparative Analysis

### Summary Table

| Criterion | Option A | Option B | Option C | Option D |
|-----------|----------|----------|----------|----------|
| **Testability** | ★★★★★ | ★★★☆☆ | ★★★★★ | ★★★☆☆ |
| **Simplicity** | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★☆☆ |
| **Caching** | ★★☆☆☆ | ★★★★☆ | ★★★★★ | ★★★★★ |
| **GPU Compat** | ★★★★★ | ★★★☆☆ | ★★★★☆ | ★★★★☆ |
| **Float Resist** | ★★★★★ | ★★★★☆ | ★★★★★ | ★★★★☆ |
| **Debuggability** | ★★★★☆ | ★★★☆☆ | ★★★★★ | ★★★☆☆ |
| **Extensibility** | ★★★☆☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ |

### Decision Matrix

| Requirement | Weight | A | B | C | D |
|-------------|--------|---|---|---|---|
| Floating-point resistance | 25% | 5 | 4 | 5 | 4 |
| Testability | 20% | 5 | 3 | 5 | 3 |
| Simplicity | 15% | 4 | 3 | 4 | 3 |
| Caching | 15% | 2 | 4 | 5 | 5 |
| GPU compatibility | 10% | 5 | 3 | 4 | 4 |
| Debuggability | 10% | 4 | 3 | 5 | 3 |
| Extensibility | 5% | 3 | 4 | 4 | 3 |
| **Weighted Total** | 100% | **4.05** | **3.40** | **4.65** | **3.60** |

---

## Recommendation

Based on the analysis, **Option C: Hybrid with Explicit Image Chains** scores highest and best satisfies the requirements:

1. **Floating-point resistance:** Pure geometry functions with point-based rays
2. **Testability:** Both functions and chain are testable independently
3. **Caching:** ImageChain provides natural caching boundary
4. **GPU compatibility:** GeometryOps functions translate directly to GLSL
5. **Debuggability:** Image chain provides clear trace of all reflections

The next document (04-recommendation.md) will provide detailed implementation guidance for Option C.

