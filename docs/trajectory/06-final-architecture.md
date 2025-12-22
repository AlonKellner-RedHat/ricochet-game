# Final Architecture: Trajectory System

## Executive Summary

The trajectory system uses a **three-layer architecture** with clear boundaries:

1. **Geometry Layer** - Pure math functions (no game concepts)
2. **Engine Layer** - Calculations, caching, and formal interface
3. **Systems Layer** - Independent consumers with coordinator

```
┌──────────────────────────────────────────────────────────────────┐
│                         SYSTEMS LAYER                             │
│  AimingSystem │ RenderSystem │ ArrowSystem │ ReachabilitySystem  │
│                    ↓ (via Coordinator) ↓                          │
├──────────────────────────────────────────────────────────────────┤
│                         ENGINE LAYER                              │
│        ITrajectoryEngine (formal interface)                       │
│     ImageCache │ PathBuilder │ ValidityChecker                    │
│                         ↓                                         │
├──────────────────────────────────────────────────────────────────┤
│                        GEOMETRY LAYER                             │
│                    GeometryOps (pure functions)                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Core Design Principles

### 1. Floating-Point Resistance

**Rays are defined by two points, never by direction vectors.**

```typescript
// CORRECT
interface Ray {
  from: Vector2;  // Start point
  to: Vector2;    // Target point
}

// WRONG - introduces floating-point errors
interface BadRay {
  origin: Vector2;
  direction: Vector2;  // Normalized = error accumulation
}
```

### 2. Image-Based Reflection

All trajectories are computed using **reflected images**:

- **Forward images**: Player reflected through each surface
- **Backward images**: Cursor reflected through surfaces (reverse order)
- **Path construction**: Connect corresponding images

```
Player ────────┬──────── Player Image₁ ────────┬──────── Player Image₂
               │                               │
          [Surface 1]                     [Surface 2]
               │                               │
Cursor Image₂ ─┴────── Cursor Image₁ ──────────┴──────────── Cursor
```

### 3. Provenance Tracking

Every reflected image stores its origin:

```typescript
interface ReflectedImage {
  position: Vector2;        // Where the image is
  source: {
    position: Vector2;      // Where it came from
    surface: Surface | null; // What created it
  };
  depth: number;            // How many reflections deep
}
```

---

## Layer 1: Geometry (Pure Functions)

**Location:** `src/trajectory-v2/geometry/`

**Purpose:** Mathematical operations with no game knowledge.

### Key Functions

```typescript
// Line intersection (no normalization)
lineLineIntersection(p1, p2, p3, p4): IntersectionResult

// Point reflection (no square roots)
reflectPointThroughLine(point, lineP1, lineP2): Vector2

// Side determination (cross product)
pointSideOfLine(point, lineP1, lineP2): number

// Segment containment
isOnSegment(t: number): boolean  // t ∈ [0, 1]
```

### Characteristics

- No classes, only functions
- No side effects
- No game types (Surface, Arrow, etc.)
- Directly translatable to GLSL

---

## Layer 2: Engine (Calculations + Caching)

**Location:** `src/trajectory-v2/engine/`

**Purpose:** Provide all trajectory calculations through a formal interface.

### Engine Interface

```typescript
interface ITrajectoryEngine {
  // Configuration
  setPlayer(position: Vector2): void;
  setCursor(position: Vector2): void;
  setPlannedSurfaces(surfaces: Surface[]): void;
  setAllSurfaces(surfaces: Surface[]): void;

  // Cached Calculations
  getPlayerImages(): ImageSequence;
  getCursorImages(): ImageSequence;
  getPlannedPath(): PathResult;
  getActualPath(): PathResult;
  getAlignment(): AlignmentResult;

  // Validity
  isPositionReachable(position: Vector2): boolean;

  // GPU Support
  getShaderUniforms(): ShaderUniforms;

  // Events
  onResultsChanged(callback: (results) => void): Unsubscribe;
}
```

### Internal Components

```
┌─────────────────────────────────────────────────────┐
│                  TrajectoryEngine                    │
│                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ ImageCache  │  │ PathBuilder │  │  Validity   │  │
│  │             │  │             │  │  Checker    │  │
│  │ • forward   │  │ • planned   │  │             │  │
│  │ • backward  │  │ • actual    │  │ • segment   │  │
│  │ • invalidate│  │ • alignment │  │ • obstruct  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
│                         │                            │
│                         ▼                            │
│                   GeometryOps                        │
└─────────────────────────────────────────────────────┘
```

### Caching Strategy

- Images recalculated only when inputs change
- Paths depend on images (automatic invalidation)
- Alignment depends on both paths

---

## Layer 3: Systems (Consumers + Coordinator)

**Location:** `src/trajectory-v2/systems/`

**Purpose:** Independent systems that use engine results for specific tasks.

### System Types

| System | Consumes | Produces | Purpose |
|--------|----------|----------|---------|
| **AimingSystem** | Paths, Alignment | Plan events, Shoot events | Handle input, manage plan |
| **RenderSystem** | Paths, Alignment | — | Draw trajectories |
| **ArrowSystem** | Waypoints | — | Manage flying arrows |
| **ReachabilitySystem** | Shader uniforms | — | GPU per-pixel visualization |

### System Interface

```typescript
interface ITrajectorySystem {
  readonly id: string;
  onEngineUpdate(results: EngineResults): void;
  update(deltaTime: number): void;
  dispose(): void;
}
```

### System Coordinator

Manages systems and routes communications:

```typescript
class SystemCoordinator {
  registerSystem(system: ITrajectorySystem): void;
  connect(producerId, consumerId, eventType, handler): void;
  update(deltaTime: number): void;
}
```

### Inter-System Communication

```
┌─────────────┐  "arrow_shot"  ┌─────────────┐
│AimingSystem │ ────────────► │ ArrowSystem │
└─────────────┘                └─────────────┘
       │
       │ "plan_changed"
       ▼
┌─────────────┐
│RenderSystem │
└─────────────┘
```

---

## Data Flow

### Per-Frame Update

```
1. Input Layer
   └── Mouse position → Engine.setCursor()
   └── Keyboard → Player position → Engine.setPlayer()

2. Engine Recalculation (if inputs changed)
   └── Invalidate affected caches
   └── Rebuild images (forward + backward)
   └── Rebuild paths (planned + actual)
   └── Calculate alignment
   └── Emit onResultsChanged

3. Coordinator
   └── Route results to all systems
   └── Systems process in parallel

4. Systems Update
   └── RenderSystem draws trajectories
   └── AimingSystem checks for shoot input
   └── ReachabilitySystem updates shader
```

### Shooting Flow

```
1. Player clicks
2. AimingSystem.shoot()
   └── Check engine.getAlignment().isFullyAligned
   └── Get engine.getActualPath().points
   └── Emit "arrow_shot" event with waypoints

3. Coordinator routes to ArrowSystem
4. ArrowSystem.createArrow(waypoints)
```

---

## File Structure

```
src/trajectory-v2/
├── geometry/
│   ├── GeometryOps.ts          # Pure math functions
│   ├── types.ts                # Vector2, Ray, IntersectionResult
│   └── index.ts
│
├── engine/
│   ├── ITrajectoryEngine.ts    # Engine interface
│   ├── TrajectoryEngine.ts     # Implementation
│   ├── ImageCache.ts           # Image sequence caching
│   ├── PathBuilder.ts          # Path construction
│   ├── ValidityChecker.ts      # Validity checks
│   ├── types.ts                # ImageSequence, PathResult, etc.
│   └── index.ts
│
├── systems/
│   ├── ITrajectorySystem.ts    # System interfaces
│   ├── AimingSystem.ts
│   ├── RenderSystem.ts
│   ├── ArrowSystem.ts
│   ├── ReachabilitySystem.ts
│   └── index.ts
│
├── coordinator/
│   ├── SystemCoordinator.ts
│   ├── types.ts                # SystemEvent, etc.
│   └── index.ts
│
└── index.ts                    # Public exports
```

---

## Key Algorithms

### Planned Path (Bidirectional Images)

```
Given N planned surfaces:

1. Build forward images: P₀ → P₁ → ... → Pₙ
   (reflect player through each surface)

2. Build backward images: C₀ → C₁ → ... → Cₙ
   (reflect cursor through surfaces in REVERSE order)

3. For each surface i:
   - Ray from Pᵢ to Cₙ₋ᵢ
   - Intersect with surface i
   - Add intersection to path

4. Path = [Player, Hit₁, Hit₂, ..., Cursor]
```

### Actual Path (Forward Physics)

```
1. Start with planned path direction

2. For each segment:
   - Check for obstructions
   - If on-segment hit: reflect and continue
   - If off-segment hit: diverge (forward physics)
   - If obstruction: stop

3. Actual path may diverge from planned
```

### Alignment Detection

```
Compare planned and actual paths segment by segment:

- Same direction? → Aligned
- Same endpoint? → Aligned
- Different? → Divergence point found

Result:
- alignedSegmentCount: N
- divergencePoint: Vector2 | undefined
- isFullyAligned: boolean
```

---

## GPU Integration

The architecture supports GPU-based per-pixel reachability:

```glsl
// Fragment shader receives:
uniform vec2 player;
uniform vec2 playerImages[MAX_REFLECTIONS];
uniform vec4 surfaces[MAX_SURFACES];  // (startX, startY, endX, endY)
uniform int surfaceCount;

// For each pixel:
// 1. Treat pixel as cursor position
// 2. Build backward cursor images
// 3. Check if path is valid (on-segment, no obstructions)
// 4. Color based on reachability
```

---

## Testing Strategy

| Layer | Test Type | Focus |
|-------|-----------|-------|
| Geometry | Unit | Mathematical correctness, edge cases |
| Engine | Unit + Integration | Caching, invalidation, path construction |
| Systems | Integration | Event flow, state management |
| Full | E2E | Complete workflows, visual verification |

---

## Summary

| Aspect | Approach |
|--------|----------|
| **Precision** | Point-based rays, no stored directions |
| **Caching** | Engine manages all caching transparently |
| **Separation** | Geometry → Engine → Systems (clear boundaries) |
| **Communication** | Event-based via Coordinator |
| **GPU** | First-class support via shader uniforms |
| **Testing** | Each layer independently testable |
| **Extensibility** | Add systems without modifying engine |


