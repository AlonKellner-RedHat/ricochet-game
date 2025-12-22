# Engine-Systems Architecture Analysis

## Overview

This document analyzes the proposed architectures against a key requirement: separation between a **Core Engine** (providing all calculations) and **Consumer Systems** (using the engine for specific purposes with their own processes and interactions).

---

## 1. The Requirement

### 1.1 Core Engine

A unified calculation layer providing:
- Reflected image computation and caching
- Line/segment intersection calculations
- Validity checks (on-segment, sidedness, obstruction)
- Image sequence management
- No knowledge of specific use cases

### 1.2 Consumer Systems

Independent systems that use the core engine:
- Each has its own process/workflow
- Each may combine engine calculations differently
- Systems can interact with each other
- Systems do NOT duplicate engine calculations

### 1.3 System Interactions

Systems should be able to:
- Share computed results from the engine
- Communicate state changes
- Coordinate without tight coupling

---

## 2. Analysis of Proposed Options

### 2.1 Option A: Pure Functional Architecture

```
┌─────────────────────────────────────────┐
│           Consumer Systems              │
│  (AimingSystem, ArrowSystem, etc.)      │
│         ↓ call functions ↓              │
├─────────────────────────────────────────┤
│       Trajectory Functions              │
│  buildPlayerImages(), buildPath(), etc. │
│         ↓ call functions ↓              │
├─────────────────────────────────────────┤
│       Geometry Functions                │
│  lineLineIntersection(), reflect(), etc.│
└─────────────────────────────────────────┘
```

**Engine-Systems Adherence:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clear engine boundary | ★★★☆☆ | Functions exist but no formal "engine" object |
| Caching | ★★☆☆☆ | No built-in caching; each caller must manage |
| System isolation | ★★★★☆ | Systems are naturally separate |
| System interaction | ★★☆☆☆ | Must pass data explicitly between systems |
| Shared computations | ★★☆☆☆ | Risk of redundant calculations |

**Issues:**
- No centralized caching mechanism
- Each system would call the same functions independently
- No formal contract between engine and systems
- Inter-system communication requires explicit data passing

### 2.2 Option B: Object-Oriented with Immutable Data

```
┌─────────────────────────────────────────┐
│           Consumer Systems              │
│  (AimingSystem, ArrowSystem, etc.)      │
│         ↓ use calculator ↓              │
├─────────────────────────────────────────┤
│       TrajectoryCalculator              │
│  (coordinates ImageBuilder, PathBuilder)│
│         ↓ delegates to ↓                │
├─────────────────────────────────────────┤
│    ImageBuilder    PathBuilder          │
│         ↓ uses ↓                        │
├─────────────────────────────────────────┤
│       Geometry Classes                  │
│  Ray, Line, Segment                     │
└─────────────────────────────────────────┘
```

**Engine-Systems Adherence:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clear engine boundary | ★★★☆☆ | TrajectoryCalculator could be engine, but mixed concerns |
| Caching | ★★★★☆ | Objects can cache internally |
| System isolation | ★★★☆☆ | Classes may create hidden dependencies |
| System interaction | ★★★☆☆ | Objects can be shared but ownership unclear |
| Shared computations | ★★★☆☆ | Possible but not enforced |

**Issues:**
- TrajectoryCalculator mixes engine and system concerns
- No clear protocol for systems to share engine results
- Risk of god-class accumulating responsibilities

### 2.3 Option C: Hybrid with Explicit Image Chains

```
┌─────────────────────────────────────────┐
│           Consumer Systems              │
│  (AimingSystem, ArrowSystem, Renderer)  │
│         ↓ use system ↓                  │
├─────────────────────────────────────────┤
│       TrajectorySystem                  │
│  (orchestrator, not engine)             │
│         ↓ uses engine ↓                 │
├─────────────────────────────────────────┤
│    ImageChain    PathBuilder            │
│  (caching)       (path logic)           │
│         ↓ uses ↓                        │
├─────────────────────────────────────────┤
│       GeometryOps                       │
│  (pure functions)                       │
└─────────────────────────────────────────┘
```

**Engine-Systems Adherence:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clear engine boundary | ★★★★☆ | GeometryOps + ImageChain form engine, but boundary not explicit |
| Caching | ★★★★★ | ImageChain provides caching |
| System isolation | ★★★★☆ | Systems use TrajectorySystem interface |
| System interaction | ★★★☆☆ | Through TrajectorySystem, but not formalized |
| Shared computations | ★★★★☆ | ImageChain can be shared |

**Issues:**
- Engine boundary not explicitly defined
- TrajectorySystem is both orchestrator and system
- No formal protocol for system interactions

### 2.4 Option D: Lazy Evaluation with Memoization

```
┌─────────────────────────────────────────┐
│           Consumer Systems              │
│  (access computed properties)           │
│         ↓ read properties ↓             │
├─────────────────────────────────────────┤
│       TrajectoryState                   │
│  (reactive, memoized)                   │
│         ↓ computes lazily ↓             │
├─────────────────────────────────────────┤
│       GeometryOps                       │
│  (pure functions)                       │
└─────────────────────────────────────────┘
```

**Engine-Systems Adherence:**

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Clear engine boundary | ★★☆☆☆ | Everything in TrajectoryState |
| Caching | ★★★★★ | Built-in memoization |
| System isolation | ★★☆☆☆ | All systems access same state object |
| System interaction | ★★★★☆ | Through shared reactive state |
| Shared computations | ★★★★★ | Memoization ensures no redundancy |

**Issues:**
- No separation between engine and systems
- All logic in single state container
- Difficult to extend with new systems

---

## 3. Gap Analysis

None of the proposed options fully satisfy the Engine-Systems requirement. Key gaps:

| Gap | Description |
|-----|-------------|
| **No formal Engine interface** | Engine capabilities not defined as a contract |
| **Mixed concerns in orchestrators** | TrajectorySystem/Calculator mix engine and system logic |
| **Implicit system boundaries** | Systems not formally defined or separated |
| **Ad-hoc system interaction** | No protocol for systems to communicate |
| **Unclear ownership** | Who owns the engine? Who can invalidate cache? |

---

## 4. Proposed Enhancement: Explicit Engine-Systems Architecture

### 4.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            CONSUMER SYSTEMS                              │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ AimingSystem│  │ ArrowSystem │  │RenderSystem │  │ReachabilitySystem│ │
│  │             │  │             │  │             │  │   (GPU shader)   │ │
│  │ • plan mgmt │  │ • shooting  │  │ • drawing   │  │ • per-pixel calc │ │
│  │ • UI input  │  │ • waypoints │  │ • colors    │  │ • zone display   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │
│         │                │                │                   │          │
│         └────────────────┼────────────────┼───────────────────┘          │
│                          │                │                              │
│                          ▼                ▼                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      SYSTEM COORDINATOR                            │  │
│  │                                                                    │  │
│  │  • Routes engine results to interested systems                     │  │
│  │  • Manages system lifecycle                                        │  │
│  │  • Handles inter-system events                                     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
└────────────────────────────────────┼─────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           TRAJECTORY ENGINE                              │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        Engine Interface                            │  │
│  │                                                                    │  │
│  │  getPlayerImages(surfaces): ImageSequence                          │  │
│  │  getCursorImages(surfaces): ImageSequence                          │  │
│  │  getPlannedPath(): PathResult                                      │  │
│  │  getActualPath(): PathResult                                       │  │
│  │  getAlignment(): AlignmentResult                                   │  │
│  │  isPositionReachable(pos): boolean                                 │  │
│  │  invalidate(): void                                                │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   ImageCache    │  │   PathBuilder   │  │   ValidityChecker       │  │
│  │                 │  │                 │  │                         │  │
│  │ • forward imgs  │  │ • planned path  │  │ • on-segment check      │  │
│  │ • backward imgs │  │ • actual path   │  │ • obstruction check     │  │
│  │ • invalidation  │  │ • alignment     │  │ • sidedness check       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘  │
│           │                    │                        │                │
│           └────────────────────┼────────────────────────┘                │
│                                │                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                        GeometryOps                                   ││
│  │                                                                      ││
│  │  lineLineIntersection()  reflectPoint()  pointSide()  isOnSegment() ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Engine Interface

```typescript
// engine/TrajectoryEngine.ts

/**
 * Core engine interface - the contract between engine and systems.
 * All calculations go through this interface.
 */
interface ITrajectoryEngine {
  // === Configuration ===
  setPlayer(position: Vector2): void;
  setCursor(position: Vector2): void;
  setPlannedSurfaces(surfaces: readonly Surface[]): void;
  setAllSurfaces(surfaces: readonly Surface[]): void;
  
  // === Image Calculations (cached) ===
  getPlayerImages(): ImageSequence;
  getCursorImages(): ImageSequence;
  
  // === Path Calculations (cached) ===
  getPlannedPath(): PathResult;
  getActualPath(): PathResult;
  getAlignment(): AlignmentResult;
  
  // === Validity Checks ===
  isPositionReachable(position: Vector2): boolean;
  getObstructions(from: Vector2, to: Vector2): Surface[];
  
  // === For GPU Systems ===
  getShaderUniforms(): ShaderUniforms;
  
  // === Cache Management ===
  invalidate(): void;
  
  // === Events ===
  onResultsChanged(callback: (results: EngineResults) => void): () => void;
}
```

### 4.3 System Interface

```typescript
// systems/ITrajectorySystem.ts

/**
 * Base interface for all systems that consume the engine.
 */
interface ITrajectoryConsumerSystem {
  /** Unique identifier for this system */
  readonly id: string;
  
  /** Called when engine results change */
  onEngineUpdate(results: EngineResults): void;
  
  /** Called each frame for system-specific updates */
  update(deltaTime: number): void;
  
  /** Clean up resources */
  dispose(): void;
}

/**
 * Systems can also produce events for other systems.
 */
interface ITrajectoryProducerSystem extends ITrajectoryConsumerSystem {
  /** Subscribe to events from this system */
  onEvent(callback: (event: SystemEvent) => void): () => void;
}
```

### 4.4 System Implementations

```typescript
// systems/AimingSystem.ts

/**
 * Handles player aiming input and plan management.
 * 
 * Consumes: Engine results for trajectory visualization
 * Produces: Plan change events, shoot events
 */
class AimingSystem implements ITrajectoryProducerSystem {
  readonly id = 'aiming';
  
  private engine: ITrajectoryEngine;
  private eventHandlers: Set<(event: SystemEvent) => void> = new Set();
  
  constructor(engine: ITrajectoryEngine) {
    this.engine = engine;
  }
  
  // Handle mouse input, update cursor position
  handleMouseMove(position: Vector2): void {
    this.engine.setCursor(position);
  }
  
  // Toggle surface in plan
  toggleSurface(surface: Surface): void {
    const current = this.engine.getPlannedSurfaces();
    const newPlan = /* ... */;
    this.engine.setPlannedSurfaces(newPlan);
    
    // Notify other systems
    this.emit({ type: 'plan_changed', plan: newPlan });
  }
  
  // Attempt to shoot
  shoot(): ArrowCreationData | null {
    const results = this.engine.getAlignment();
    if (!results.isFullyAligned) {
      return null;  // Can't shoot when misaligned
    }
    
    const waypoints = this.engine.getActualPath().points;
    this.emit({ type: 'arrow_shot', waypoints });
    
    return { waypoints };
  }
  
  onEngineUpdate(results: EngineResults): void {
    // Update internal state based on new calculations
  }
  
  update(deltaTime: number): void {
    // Per-frame updates
  }
  
  onEvent(callback: (event: SystemEvent) => void): () => void {
    this.eventHandlers.add(callback);
    return () => this.eventHandlers.delete(callback);
  }
  
  private emit(event: SystemEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }
  
  dispose(): void {
    this.eventHandlers.clear();
  }
}
```

```typescript
// systems/RenderSystem.ts

/**
 * Renders trajectory visualization.
 * 
 * Consumes: Engine results for path data
 * Produces: Nothing (pure consumer)
 */
class RenderSystem implements ITrajectoryConsumerSystem {
  readonly id = 'render';
  
  private graphics: Phaser.GameObjects.Graphics;
  private lastResults: EngineResults | null = null;
  
  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics();
  }
  
  onEngineUpdate(results: EngineResults): void {
    this.lastResults = results;
  }
  
  update(deltaTime: number): void {
    if (!this.lastResults) return;
    
    this.graphics.clear();
    this.drawPlannedPath(this.lastResults.plannedPath);
    this.drawActualPath(this.lastResults.actualPath);
    this.drawAlignment(this.lastResults.alignment);
  }
  
  private drawPlannedPath(path: PathResult): void { /* ... */ }
  private drawActualPath(path: PathResult): void { /* ... */ }
  private drawAlignment(alignment: AlignmentResult): void { /* ... */ }
  
  dispose(): void {
    this.graphics.destroy();
  }
}
```

```typescript
// systems/ReachabilitySystem.ts

/**
 * GPU-based reachability visualization.
 * 
 * Consumes: Engine shader uniforms
 * Produces: Nothing (pure consumer)
 */
class ReachabilitySystem implements ITrajectoryConsumerSystem {
  readonly id = 'reachability';
  
  private shader: Phaser.GameObjects.Shader;
  private engine: ITrajectoryEngine;
  
  constructor(scene: Phaser.Scene, engine: ITrajectoryEngine) {
    this.engine = engine;
    this.shader = this.createShader(scene);
  }
  
  onEngineUpdate(results: EngineResults): void {
    const uniforms = this.engine.getShaderUniforms();
    this.updateShaderUniforms(uniforms);
  }
  
  update(deltaTime: number): void {
    // Shader updates automatically via uniforms
  }
  
  private createShader(scene: Phaser.Scene): Phaser.GameObjects.Shader { /* ... */ }
  private updateShaderUniforms(uniforms: ShaderUniforms): void { /* ... */ }
  
  dispose(): void {
    this.shader.destroy();
  }
}
```

### 4.5 System Coordinator

```typescript
// coordinator/SystemCoordinator.ts

/**
 * Manages system lifecycle and inter-system communication.
 */
class SystemCoordinator {
  private engine: ITrajectoryEngine;
  private systems: Map<string, ITrajectoryConsumerSystem> = new Map();
  private subscriptions: Map<string, Array<() => void>> = new Map();
  
  constructor(engine: ITrajectoryEngine) {
    this.engine = engine;
    
    // Subscribe to engine updates
    engine.onResultsChanged(this.handleEngineUpdate.bind(this));
  }
  
  /**
   * Register a system with the coordinator.
   */
  registerSystem(system: ITrajectoryConsumerSystem): void {
    this.systems.set(system.id, system);
  }
  
  /**
   * Connect a producer system's events to a consumer.
   */
  connect(
    producerId: string,
    consumerId: string,
    eventType: string,
    handler: (event: SystemEvent) => void
  ): void {
    const producer = this.systems.get(producerId) as ITrajectoryProducerSystem;
    if (!producer || !('onEvent' in producer)) {
      throw new Error(`Producer system ${producerId} not found or not a producer`);
    }
    
    const unsubscribe = producer.onEvent((event) => {
      if (event.type === eventType) {
        handler(event);
      }
    });
    
    // Track subscription for cleanup
    const key = `${producerId}->${consumerId}`;
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, []);
    }
    this.subscriptions.get(key)!.push(unsubscribe);
  }
  
  /**
   * Update all systems.
   */
  update(deltaTime: number): void {
    for (const system of this.systems.values()) {
      system.update(deltaTime);
    }
  }
  
  /**
   * Handle engine results change.
   */
  private handleEngineUpdate(results: EngineResults): void {
    for (const system of this.systems.values()) {
      system.onEngineUpdate(results);
    }
  }
  
  /**
   * Clean up all systems.
   */
  dispose(): void {
    for (const unsubscribes of this.subscriptions.values()) {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    }
    for (const system of this.systems.values()) {
      system.dispose();
    }
    this.systems.clear();
    this.subscriptions.clear();
  }
}
```

### 4.6 Usage Example

```typescript
// GameScene.ts

class GameScene extends Phaser.Scene {
  private engine!: ITrajectoryEngine;
  private coordinator!: SystemCoordinator;
  private aimingSystem!: AimingSystem;
  
  create(): void {
    // Create the engine
    this.engine = new TrajectoryEngine();
    
    // Create the coordinator
    this.coordinator = new SystemCoordinator(this.engine);
    
    // Create systems
    this.aimingSystem = new AimingSystem(this.engine);
    const renderSystem = new RenderSystem(this);
    const arrowSystem = new ArrowSystem(this);
    const reachabilitySystem = new ReachabilitySystem(this, this.engine);
    
    // Register systems
    this.coordinator.registerSystem(this.aimingSystem);
    this.coordinator.registerSystem(renderSystem);
    this.coordinator.registerSystem(arrowSystem);
    this.coordinator.registerSystem(reachabilitySystem);
    
    // Connect systems
    this.coordinator.connect('aiming', 'arrow', 'arrow_shot', (event) => {
      arrowSystem.createArrow(event.waypoints);
    });
    
    this.coordinator.connect('aiming', 'render', 'plan_changed', (event) => {
      // Render system redraws with new plan
    });
  }
  
  update(time: number, delta: number): void {
    // Update engine inputs
    this.engine.setPlayer(this.player.position);
    this.engine.setCursor(this.input.activePointer);
    
    // Update all systems
    this.coordinator.update(delta / 1000);
  }
}
```

---

## 5. Comparison: Before and After

### Before (Option C as proposed)

```
Systems directly use TrajectorySystem
    └── TrajectorySystem owns everything
            └── ImageChain, PathBuilder, etc.
```

**Issues:**
- TrajectorySystem is both engine and orchestrator
- Systems coupled to specific implementation
- No formal system interaction protocol

### After (Enhanced Architecture)

```
Systems register with Coordinator
    └── Coordinator routes engine events
            └── Engine provides formal interface
                    └── ImageCache, PathBuilder, etc.
```

**Benefits:**
- Clear engine boundary with formal interface
- Systems are independent and replaceable
- Formal event-based inter-system communication
- Engine can be tested without systems
- Systems can be tested with mock engine

---

## 6. Revised File Structure

```
src/trajectory-v2/
├── engine/
│   ├── ITrajectoryEngine.ts      # Engine interface
│   ├── TrajectoryEngine.ts       # Engine implementation
│   ├── ImageCache.ts             # Cached image sequences
│   ├── PathBuilder.ts            # Path construction
│   ├── ValidityChecker.ts        # Validity checks
│   └── index.ts
├── geometry/
│   ├── GeometryOps.ts            # Pure functions
│   ├── types.ts                  # Geometry types
│   └── index.ts
├── systems/
│   ├── ITrajectorySystem.ts      # System interfaces
│   ├── AimingSystem.ts           # Aiming input handling
│   ├── RenderSystem.ts           # Trajectory rendering
│   ├── ArrowSystem.ts            # Arrow management
│   ├── ReachabilitySystem.ts     # GPU reachability
│   └── index.ts
├── coordinator/
│   ├── SystemCoordinator.ts      # System management
│   ├── types.ts                  # Event types
│   └── index.ts
├── types.ts                      # Shared types
└── index.ts                      # Public exports
```

---

## 7. Summary

| Aspect | Original Option C | Enhanced Architecture |
|--------|-------------------|----------------------|
| Engine boundary | Implicit | Explicit interface |
| Caching | In ImageChain | In Engine via ImageCache |
| System isolation | Partial | Full (through Coordinator) |
| System interaction | Ad-hoc | Event-based protocol |
| Testability | Good | Excellent (mock interfaces) |
| Extensibility | Moderate | High (add systems freely) |
| GPU integration | Possible | First-class (ReachabilitySystem) |

The enhanced architecture maintains all the benefits of Option C (floating-point resistance, caching, pure geometry functions) while adding the formal Engine-Systems separation required.

