# Technical Design Document - Ricochet Arrow

## Architecture Overview

This document defines the technical architecture following the **Open-Closed Principle (OCP)**: systems are open for extension but closed for modification. New surface types, target types, and mechanics can be added without changing core code.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Game Loop                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                 │
│  │   Input     │    │   Update    │    │   Render    │                 │
│  │   Manager   │───►│   Systems   │───►│   Systems   │                 │
│  └─────────────┘    └─────────────┘    └─────────────┘                 │
│         │                  │                  │                         │
│         ▼                  ▼                  ▼                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Entity Pool                               │   │
│  │  ┌────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐            │   │
│  │  │ Player │  │ Surfaces │  │ Targets │  │ Arrows  │            │   │
│  │  └────────┘  └──────────┘  └─────────┘  └─────────┘            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Modules

### 1. Math Module (`src/math/`)

Pure functions for geometric calculations. No side effects, highly testable.

```typescript
// Vector operations
interface Vector2 {
  x: number;
  y: number;
}

// Core math functions (pure, no dependencies)
function add(a: Vector2, b: Vector2): Vector2;
function subtract(a: Vector2, b: Vector2): Vector2;
function scale(v: Vector2, scalar: number): Vector2;
function dot(a: Vector2, b: Vector2): number;
function length(v: Vector2): number;
function normalize(v: Vector2): Vector2;
function reflect(direction: Vector2, normal: Vector2): Vector2;

// Line segment representation
interface LineSegment {
  start: Vector2;
  end: Vector2;
}

// Ray for trajectory calculation
interface Ray {
  origin: Vector2;
  direction: Vector2;
}

// Intersection result
interface RaySegmentIntersection {
  hit: boolean;
  point: Vector2 | null;
  t: number; // Parameter along ray (0 = origin, 1 = one unit along direction)
  normal: Vector2 | null; // Surface normal at hit point
}

function raySegmentIntersect(ray: Ray, segment: LineSegment): RaySegmentIntersection;
function segmentNormal(segment: LineSegment): Vector2;
```

### 2. Trajectory Module (`src/trajectory/`)

Calculates arrow paths through planned surfaces.

```typescript
interface TrajectoryPoint {
  position: Vector2;
  surfaceId: string | null; // null for origin and final point
}

interface TrajectoryResult {
  points: TrajectoryPoint[];
  isValid: boolean;
  invalidReason: 'none' | 'missed_surface' | 'hit_obstacle' | 'out_of_range';
  invalidAtIndex: number; // Which planned surface was missed (-1 if valid)
}

interface TrajectoryCalculator {
  calculate(
    origin: Vector2,
    direction: Vector2,
    plannedSurfaces: Surface[],
    allSurfaces: Surface[],
    maxDistance: number
  ): TrajectoryResult;
}
```

### 3. Surface System (`src/surfaces/`)

**OCP Design:** New surface types extend the base interface without modifying existing code.

```typescript
// Hit result determines what happens to the arrow
type HitResultType = 'reflect' | 'stick' | 'pass_through' | 'destroy';

interface HitResult {
  type: HitResultType;
  reflectedDirection?: Vector2; // For 'reflect' type
  damage?: number; // For surfaces that take damage
  effects?: Effect[]; // Side effects (sounds, particles, etc.)
}

// Base surface interface - all surfaces implement this
interface Surface {
  readonly id: string;
  readonly segment: LineSegment;
  readonly surfaceType: string; // For serialization/identification
  
  // Core behavior - what happens when arrow hits
  onArrowHit(arrow: Arrow, hitPoint: Vector2, velocity: Vector2): HitResult;
  
  // Can this surface be part of a shot plan?
  isPlannable(): boolean;
  
  // Visual properties for rendering
  getVisualProperties(): SurfaceVisualProperties;
}

// Concrete implementations
class RicochetSurface implements Surface {
  readonly surfaceType = 'ricochet';
  
  onArrowHit(arrow: Arrow, hitPoint: Vector2, velocity: Vector2): HitResult {
    const normal = segmentNormal(this.segment);
    return {
      type: 'reflect',
      reflectedDirection: reflect(velocity, normal)
    };
  }
  
  isPlannable(): boolean {
    return true;
  }
}

class WallSurface implements Surface {
  readonly surfaceType = 'wall';
  
  onArrowHit(arrow: Arrow, hitPoint: Vector2, velocity: Vector2): HitResult {
    return { type: 'stick' };
  }
  
  isPlannable(): boolean {
    return false;
  }
}

class BreakableSurface implements Surface {
  readonly surfaceType = 'breakable';
  private health: number;
  
  onArrowHit(arrow: Arrow, hitPoint: Vector2, velocity: Vector2): HitResult {
    this.health--;
    if (this.health <= 0) {
      return { type: 'pass_through' }; // Surface destroyed
    }
    return { type: 'stick', damage: 1 };
  }
  
  isPlannable(): boolean {
    return false;
  }
}
```

**Extension Point:** To add a new surface type:
1. Create new class implementing `Surface`
2. Register with `SurfaceFactory`
3. No changes to trajectory calculation or rendering systems

### 4. Target System (`src/targets/`)

**OCP Design:** New target types extend the base interface.

```typescript
interface Target {
  readonly id: string;
  readonly position: Vector2;
  readonly hitRadius: number;
  readonly targetType: string;
  
  // Called when arrow contacts target
  onHit(arrow: Arrow): void;
  
  // Check if target's goal is achieved
  isComplete(): boolean;
  
  // Reset to initial state (for level restart)
  reset(): void;
  
  // Visual properties
  getVisualProperties(): TargetVisualProperties;
}

class BasicTarget implements Target {
  readonly targetType = 'basic';
  private hit = false;
  
  onHit(arrow: Arrow): void {
    this.hit = true;
  }
  
  isComplete(): boolean {
    return this.hit;
  }
  
  reset(): void {
    this.hit = false;
  }
}

class MultiHitTarget implements Target {
  readonly targetType = 'multi_hit';
  private hitsRequired: number;
  private currentHits = 0;
  
  constructor(id: string, position: Vector2, hitsRequired: number) {
    this.hitsRequired = hitsRequired;
  }
  
  onHit(arrow: Arrow): void {
    this.currentHits++;
  }
  
  isComplete(): boolean {
    return this.currentHits >= this.hitsRequired;
  }
  
  reset(): void {
    this.currentHits = 0;
  }
}

class TriggerTarget implements Target {
  readonly targetType = 'trigger';
  private triggered = false;
  private action: TriggerAction;
  
  onHit(arrow: Arrow): void {
    if (!this.triggered) {
      this.triggered = true;
      this.action.execute();
    }
  }
  
  isComplete(): boolean {
    return this.triggered;
  }
  
  reset(): void {
    this.triggered = false;
    this.action.reset();
  }
}

// Trigger actions are also extensible
interface TriggerAction {
  execute(): void;
  reset(): void;
}

class ToggleSurfaceAction implements TriggerAction {
  constructor(private surfaceId: string, private level: Level) {}
  
  execute(): void {
    this.level.toggleSurface(this.surfaceId);
  }
  
  reset(): void {
    this.level.resetSurface(this.surfaceId);
  }
}
```

### 5. Player System (`src/player/`)

Two independent subsystems running in parallel.

```typescript
// Movement subsystem - keyboard controlled
interface MovementSystem {
  readonly state: MovementState;
  readonly velocity: Vector2;
  readonly position: Vector2;
  
  update(delta: number, input: MovementInput): void;
  applyGravity(delta: number): void;
  handleCollisions(surfaces: Surface[]): void;
}

type MovementState = 'idle' | 'running' | 'jumping' | 'falling';

interface MovementInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  jumpHeld: boolean; // For variable jump height
}

interface MovementConfig {
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  jumpVelocity: number;
  jumpCutMultiplier: number; // Velocity reduction when jump released early
  gravity: number;
}

// Aiming subsystem - mouse controlled, always active
interface AimingSystem {
  readonly aimDirection: Vector2;
  readonly plannedSurfaces: Surface[];
  readonly trajectoryResult: TrajectoryResult;
  
  update(mousePosition: Vector2, playerPosition: Vector2): void;
  addSurfaceToPlan(surface: Surface): void;
  removeSurfaceFromPlan(surface: Surface): void;
  clearPlan(): void;
  shoot(): Arrow | null;
}

// Player entity composes both systems
class Player {
  private movementSystem: MovementSystem;
  private aimingSystem: AimingSystem;
  
  update(delta: number, input: GameInput): void {
    // Both systems update independently
    this.movementSystem.update(delta, input.movement);
    this.aimingSystem.update(input.mousePosition, this.movementSystem.position);
  }
  
  // Shooting works in any movement state
  tryShoot(input: GameInput): Arrow | null {
    if (input.shoot) {
      return this.aimingSystem.shoot();
    }
    return null;
  }
}
```

### 6. Arrow System (`src/arrow/`)

```typescript
type ArrowState = 'flying' | 'exhausted' | 'stuck';

interface Arrow {
  readonly id: string;
  position: Vector2;
  velocity: Vector2;
  state: ArrowState;
  
  distanceTraveled: number;
  maxDistance: number;
  
  update(delta: number): void;
  checkCollisions(surfaces: Surface[], targets: Target[]): void;
  stick(position: Vector2, surface: Surface | null): void;
}

class ArrowEntity implements Arrow {
  update(delta: number): void {
    if (this.state === 'stuck') return;
    
    // Apply movement
    const movement = scale(this.velocity, delta);
    this.position = add(this.position, movement);
    this.distanceTraveled += length(movement);
    
    // Check for exhaustion
    if (this.state === 'flying' && this.distanceTraveled > this.maxDistance) {
      this.state = 'exhausted';
    }
    
    // Apply gravity when exhausted
    if (this.state === 'exhausted') {
      this.velocity = add(this.velocity, scale(GRAVITY, delta));
    }
  }
}
```

### 7. Level System (`src/level/`)

```typescript
interface Level {
  readonly id: string;
  readonly name: string;
  readonly bounds: { width: number; height: number };
  readonly spawnPoint: Vector2;
  
  surfaces: Surface[];
  targets: Target[];
  
  isComplete(): boolean;
  reset(): void;
  
  // For trigger actions
  toggleSurface(surfaceId: string): void;
  resetSurface(surfaceId: string): void;
}

interface LevelData {
  id: string;
  name: string;
  bounds: { width: number; height: number };
  spawnPoint: Vector2;
  surfaces: SurfaceData[];
  targets: TargetData[];
}

interface SurfaceData {
  id: string;
  type: string;
  segment: { start: Vector2; end: Vector2 };
  properties?: Record<string, unknown>; // Type-specific properties
}

interface TargetData {
  id: string;
  type: string;
  position: Vector2;
  hitRadius: number;
  properties?: Record<string, unknown>;
}
```

---

## Factory Pattern for Extensibility

```typescript
// Surface factory - register new types without modifying
class SurfaceFactory {
  private creators: Map<string, SurfaceCreator> = new Map();
  
  register(type: string, creator: SurfaceCreator): void {
    this.creators.set(type, creator);
  }
  
  create(data: SurfaceData): Surface {
    const creator = this.creators.get(data.type);
    if (!creator) throw new Error(`Unknown surface type: ${data.type}`);
    return creator(data);
  }
}

type SurfaceCreator = (data: SurfaceData) => Surface;

// Usage
const factory = new SurfaceFactory();
factory.register('ricochet', (data) => new RicochetSurface(data.id, data.segment));
factory.register('wall', (data) => new WallSurface(data.id, data.segment));
factory.register('breakable', (data) => new BreakableSurface(data.id, data.segment, data.properties?.health as number ?? 3));

// Adding new type requires no changes to factory code
factory.register('portal', (data) => new PortalSurface(data.id, data.segment, data.properties?.targetId as string));
```

---

## Scene Structure

```typescript
// Main game scene
class GameScene extends Phaser.Scene {
  private level: Level;
  private player: Player;
  private arrows: Arrow[] = [];
  private trajectoryRenderer: TrajectoryRenderer;
  private inputManager: InputManager;
  private editMode: boolean = false;
  private levelEditor: LevelEditor | null = null;
  
  update(time: number, delta: number): void {
    if (this.editMode) {
      this.levelEditor?.update(delta, this.inputManager);
    } else {
      this.updateGameplay(delta);
    }
  }
  
  private updateGameplay(delta: number): void {
    // Update player (both movement and aiming)
    this.player.update(delta, this.inputManager.getGameInput());
    
    // Handle shooting
    const newArrow = this.player.tryShoot(this.inputManager.getGameInput());
    if (newArrow) this.arrows.push(newArrow);
    
    // Update arrows
    for (const arrow of this.arrows) {
      arrow.update(delta);
      arrow.checkCollisions(this.level.surfaces, this.level.targets);
    }
    
    // Check level completion
    if (this.level.isComplete()) {
      this.onLevelComplete();
    }
  }
  
  toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.levelEditor = new LevelEditor(this, this.level);
    } else {
      this.levelEditor = null;
    }
  }
}
```

---

## File Structure

```
src/
├── main.ts
├── config/
│   └── gameConfig.ts
├── math/
│   ├── index.ts
│   ├── Vector2.ts
│   ├── LineSegment.ts
│   ├── Ray.ts
│   └── intersections.ts
├── trajectory/
│   ├── index.ts
│   ├── TrajectoryCalculator.ts
│   ├── PathValidator.ts
│   └── TrajectoryRenderer.ts
├── surfaces/
│   ├── index.ts
│   ├── Surface.ts              # Interface
│   ├── RicochetSurface.ts
│   ├── WallSurface.ts
│   ├── BreakableSurface.ts
│   └── SurfaceFactory.ts
├── targets/
│   ├── index.ts
│   ├── Target.ts               # Interface
│   ├── BasicTarget.ts
│   ├── MultiHitTarget.ts
│   ├── TriggerTarget.ts
│   ├── actions/
│   │   ├── TriggerAction.ts    # Interface
│   │   └── ToggleSurfaceAction.ts
│   └── TargetFactory.ts
├── player/
│   ├── index.ts
│   ├── Player.ts
│   ├── MovementSystem.ts
│   └── AimingSystem.ts
├── arrow/
│   ├── index.ts
│   └── Arrow.ts
├── level/
│   ├── index.ts
│   ├── Level.ts
│   └── LevelLoader.ts
├── editor/
│   ├── index.ts
│   ├── LevelEditor.ts
│   ├── tools/
│   │   ├── EditorTool.ts       # Interface
│   │   ├── SurfaceTool.ts
│   │   ├── TargetTool.ts
│   │   └── SelectTool.ts
│   └── EditorUI.ts
├── scenes/
│   ├── index.ts
│   ├── GameScene.ts
│   └── MenuScene.ts
├── core/
│   ├── index.ts
│   ├── InputManager.ts
│   ├── DebugView.ts
│   └── Grid.ts
└── types/
    └── index.ts
```

---

## Dependency Rules

1. **Math module** has no dependencies (pure functions)
2. **Trajectory module** depends only on Math
3. **Surface/Target modules** depend on Math and their own interfaces
4. **Player module** depends on Math, Trajectory, Surfaces
5. **Level module** depends on Surfaces, Targets
6. **Editor module** depends on Level, Surfaces, Targets
7. **Scenes** depend on all game modules

```
┌─────────┐
│  Math   │  ◄── No dependencies
└────┬────┘
     │
     ▼
┌────────────┐
│ Trajectory │
└─────┬──────┘
      │
      ▼
┌──────────────────────────────┐
│  Surfaces  │  Targets        │
└──────┬─────┴───────┬─────────┘
       │             │
       ▼             ▼
┌──────────────────────────────┐
│  Player    │  Arrow          │
└──────┬─────┴───────┬─────────┘
       │             │
       ▼             ▼
┌─────────────────────────────┐
│          Level              │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│     Editor  │  Scenes       │
└─────────────────────────────┘
```

