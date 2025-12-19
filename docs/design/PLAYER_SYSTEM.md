# Player System Specification

## Overview

The player consists of two **independent, parallel subsystems**:

1. **Movement System** - Keyboard-controlled physics-based platformer movement
2. **Aiming System** - Mouse-controlled trajectory planning and shooting

These systems run simultaneously and do not block each other. The player can aim and shoot while moving, jumping, or falling.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Player Entity                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────────┐      ┌─────────────────────┐         │
│   │   Movement System   │      │    Aiming System    │         │
│   │                     │      │                     │         │
│   │  ┌───────────────┐  │      │  ┌───────────────┐  │         │
│   │  │ State Machine │  │      │  │ Trajectory    │  │         │
│   │  │ Idle/Run/Jump │  │      │  │ Calculator    │  │         │
│   │  └───────────────┘  │      │  └───────────────┘  │         │
│   │                     │      │                     │         │
│   │  ┌───────────────┐  │      │  ┌───────────────┐  │         │
│   │  │ Physics       │  │      │  │ Shot Plan     │  │         │
│   │  │ Position/Vel  │  │      │  │ Surface List  │  │         │
│   │  └───────────────┘  │      │  └───────────────┘  │         │
│   │                     │      │                     │         │
│   └──────────┬──────────┘      └──────────┬──────────┘         │
│              │                            │                     │
│              │      ┌─────────────┐       │                     │
│              └─────►│  Position   │◄──────┘                     │
│                     │  (shared)   │                             │
│                     └─────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle:** The only shared state between systems is the player's position. Movement updates position; Aiming reads position for trajectory origin.

---

## Movement System

### States

```
┌───────────────────────────────────────────────────────────────┐
│                                                               │
│                         ┌──────┐                              │
│            ┌────────────│ Idle │────────────┐                 │
│            │            └──┬───┘            │                 │
│            │               │                │                 │
│     move input        jump input       no ground              │
│            │               │                │                 │
│            ▼               ▼                ▼                 │
│       ┌─────────┐    ┌──────────┐    ┌──────────┐            │
│       │ Running │    │ Jumping  │    │ Falling  │            │
│       └────┬────┘    └────┬─────┘    └────┬─────┘            │
│            │              │               │                   │
│            │         apex/release         │                   │
│            │              │               │                   │
│            │              ▼               │                   │
│            │         ┌──────────┐         │                   │
│            └────────►│ Falling  │◄────────┘                   │
│                      └────┬─────┘                             │
│                           │                                   │
│                      ground contact                           │
│                           │                                   │
│                           ▼                                   │
│                    ┌────────────┐                             │
│                    │ Idle/Run   │                             │
│                    └────────────┘                             │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | Entry Condition | Exit Conditions | Behavior |
|-------|-----------------|-----------------|----------|
| **Idle** | No horizontal input, on ground | Move input, Jump input, Lose ground | Apply deceleration |
| **Running** | Horizontal input, on ground | Stop input, Jump input, Lose ground | Apply acceleration toward max speed |
| **Jumping** | Jump pressed while grounded | Reach apex OR release jump early | Apply initial jump velocity, reduce gravity effect |
| **Falling** | In air, moving downward | Contact ground | Full gravity, air control reduced |

### Physics Configuration

```typescript
interface MovementConfig {
  // Horizontal movement
  maxSpeed: number;           // Maximum horizontal velocity (pixels/sec)
  acceleration: number;       // Horizontal acceleration (pixels/sec²)
  deceleration: number;       // Friction when stopping (pixels/sec²)
  airControl: number;         // Multiplier for acceleration while airborne (0-1)
  
  // Vertical movement
  jumpVelocity: number;       // Initial upward velocity when jumping
  jumpCutMultiplier: number;  // Velocity multiplier when jump released early (0-1)
  gravity: number;            // Downward acceleration (pixels/sec²)
  maxFallSpeed: number;       // Terminal velocity
  
  // Collision
  playerWidth: number;
  playerHeight: number;
  groundCheckDistance: number; // How far below to check for ground
}

// Default values (tunable)
const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  maxSpeed: 300,
  acceleration: 1500,
  deceleration: 2000,
  airControl: 0.7,
  
  jumpVelocity: 500,
  jumpCutMultiplier: 0.5,
  gravity: 1200,
  maxFallSpeed: 800,
  
  playerWidth: 32,
  playerHeight: 48,
  groundCheckDistance: 2
};
```

### Movement Input

```typescript
interface MovementInput {
  left: boolean;      // A or Left arrow held
  right: boolean;     // D or Right arrow held
  jump: boolean;      // Space/W/Up pressed this frame
  jumpHeld: boolean;  // Space/W/Up currently held
}
```

### MovementSystem Implementation

```typescript
type MovementState = 'idle' | 'running' | 'jumping' | 'falling';

interface MovementSystem {
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly state: MovementState;
  readonly isGrounded: boolean;
  
  update(delta: number, input: MovementInput, surfaces: readonly Surface[]): void;
  setPosition(position: Vector2): void;
}

class PlayerMovementSystem implements MovementSystem {
  private _position: Vector2;
  private _velocity: Vector2 = { x: 0, y: 0 };
  private _state: MovementState = 'idle';
  private _isGrounded: boolean = false;
  private config: MovementConfig;
  
  constructor(startPosition: Vector2, config: MovementConfig = DEFAULT_MOVEMENT_CONFIG) {
    this._position = { ...startPosition };
    this.config = config;
  }
  
  get position(): Vector2 { return { ...this._position }; }
  get velocity(): Vector2 { return { ...this._velocity }; }
  get state(): MovementState { return this._state; }
  get isGrounded(): boolean { return this._isGrounded; }
  
  update(delta: number, input: MovementInput, surfaces: readonly Surface[]): void {
    // 1. Apply horizontal input
    this.handleHorizontalInput(delta, input);
    
    // 2. Handle jumping
    this.handleJumpInput(input);
    
    // 3. Apply gravity
    this.applyGravity(delta);
    
    // 4. Apply velocity to position
    this._position = Vec2.add(this._position, Vec2.scale(this._velocity, delta));
    
    // 5. Handle collisions
    this.handleCollisions(surfaces);
    
    // 6. Update state
    this.updateState(input);
  }
  
  private handleHorizontalInput(delta: number, input: MovementInput): void {
    const accel = this._isGrounded ? this.config.acceleration : 
                                     this.config.acceleration * this.config.airControl;
    
    if (input.left && !input.right) {
      this._velocity.x = Math.max(
        this._velocity.x - accel * delta,
        -this.config.maxSpeed
      );
    } else if (input.right && !input.left) {
      this._velocity.x = Math.min(
        this._velocity.x + accel * delta,
        this.config.maxSpeed
      );
    } else {
      // Decelerate
      const decel = this._isGrounded ? this.config.deceleration : 
                                       this.config.deceleration * this.config.airControl;
      if (this._velocity.x > 0) {
        this._velocity.x = Math.max(0, this._velocity.x - decel * delta);
      } else if (this._velocity.x < 0) {
        this._velocity.x = Math.min(0, this._velocity.x + decel * delta);
      }
    }
  }
  
  private handleJumpInput(input: MovementInput): void {
    // Start jump
    if (input.jump && this._isGrounded) {
      this._velocity.y = -this.config.jumpVelocity;
      this._isGrounded = false;
      this._state = 'jumping';
    }
    
    // Jump cut (early release)
    if (this._state === 'jumping' && !input.jumpHeld && this._velocity.y < 0) {
      this._velocity.y *= this.config.jumpCutMultiplier;
      this._state = 'falling';
    }
  }
  
  private applyGravity(delta: number): void {
    if (!this._isGrounded) {
      this._velocity.y = Math.min(
        this._velocity.y + this.config.gravity * delta,
        this.config.maxFallSpeed
      );
      
      // Transition from jumping to falling at apex
      if (this._state === 'jumping' && this._velocity.y >= 0) {
        this._state = 'falling';
      }
    }
  }
  
  private handleCollisions(surfaces: readonly Surface[]): void {
    // Simplified collision - check feet for ground
    const feetY = this._position.y + this.config.playerHeight / 2;
    const checkY = feetY + this.config.groundCheckDistance;
    
    this._isGrounded = false;
    
    for (const surface of surfaces) {
      // Check horizontal surfaces (platforms)
      if (this.isHorizontalSurface(surface)) {
        const surfaceY = surface.segment.start.y;
        
        if (surfaceY >= feetY && surfaceY <= checkY) {
          // Check X overlap
          const minX = Math.min(surface.segment.start.x, surface.segment.end.x);
          const maxX = Math.max(surface.segment.start.x, surface.segment.end.x);
          
          if (this._position.x >= minX && this._position.x <= maxX) {
            if (this._velocity.y >= 0) {
              this._isGrounded = true;
              this._velocity.y = 0;
              this._position.y = surfaceY - this.config.playerHeight / 2;
            }
          }
        }
      }
    }
  }
  
  private isHorizontalSurface(surface: Surface): boolean {
    const dy = Math.abs(surface.segment.end.y - surface.segment.start.y);
    return dy < 1; // Nearly horizontal
  }
  
  private updateState(input: MovementInput): void {
    if (this._isGrounded) {
      if (input.left || input.right) {
        this._state = 'running';
      } else {
        this._state = 'idle';
      }
    }
    // Airborne states handled in jump/gravity logic
  }
  
  setPosition(position: Vector2): void {
    this._position = { ...position };
  }
}
```

---

## Aiming System

### Core Responsibilities

1. Track mouse position for aim direction
2. Manage the list of planned surfaces
3. Calculate trajectory in real-time
4. Handle shooting

### Aiming State

```typescript
interface AimingState {
  readonly mousePosition: Vector2;
  readonly aimDirection: Vector2;
  readonly plannedSurfaces: readonly Surface[];
  readonly trajectoryResult: TrajectoryResult;
}
```

### AimingSystem Implementation

```typescript
interface AimingSystem {
  readonly aimDirection: Vector2;
  readonly plannedSurfaces: readonly Surface[];
  readonly trajectoryResult: TrajectoryResult;
  
  update(mousePosition: Vector2, playerPosition: Vector2, allSurfaces: readonly Surface[]): void;
  
  toggleSurfaceInPlan(surface: Surface): void;
  clearPlan(): void;
  
  canShoot(): boolean;
  shoot(playerPosition: Vector2): Arrow | null;
}

interface AimingConfig {
  maxArrowDistance: number;   // How far arrow can travel before exhaustion
  shootCooldown: number;      // Minimum time between shots (seconds)
}

const DEFAULT_AIMING_CONFIG: AimingConfig = {
  maxArrowDistance: 2000,
  shootCooldown: 0.3
};

class PlayerAimingSystem implements AimingSystem {
  private _aimDirection: Vector2 = { x: 1, y: 0 };
  private _plannedSurfaces: Surface[] = [];
  private _trajectoryResult: TrajectoryResult;
  private trajectoryCalculator: TrajectoryCalculator;
  private config: AimingConfig;
  private lastShotTime: number = -Infinity;
  
  constructor(
    trajectoryCalculator: TrajectoryCalculator,
    config: AimingConfig = DEFAULT_AIMING_CONFIG
  ) {
    this.trajectoryCalculator = trajectoryCalculator;
    this.config = config;
    this._trajectoryResult = {
      points: [],
      status: 'valid',
      failedAtPlanIndex: -1,
      totalDistance: 0
    };
  }
  
  get aimDirection(): Vector2 { return { ...this._aimDirection }; }
  get plannedSurfaces(): readonly Surface[] { return [...this._plannedSurfaces]; }
  get trajectoryResult(): TrajectoryResult { return this._trajectoryResult; }
  
  update(
    mousePosition: Vector2,
    playerPosition: Vector2,
    allSurfaces: readonly Surface[]
  ): void {
    // Calculate aim direction from player to mouse
    this._aimDirection = Vec2.direction(playerPosition, mousePosition);
    
    // Recalculate trajectory
    this._trajectoryResult = this.trajectoryCalculator.calculate(
      playerPosition,
      mousePosition,
      this._plannedSurfaces,
      allSurfaces,
      this.config.maxArrowDistance
    );
  }
  
  toggleSurfaceInPlan(surface: Surface): void {
    if (!surface.isPlannable()) return;
    
    const index = this._plannedSurfaces.findIndex(s => s.id === surface.id);
    
    if (index >= 0) {
      // Remove from plan
      this._plannedSurfaces.splice(index, 1);
    } else {
      // Add to plan
      this._plannedSurfaces.push(surface);
    }
  }
  
  clearPlan(): void {
    this._plannedSurfaces = [];
  }
  
  canShoot(): boolean {
    const now = performance.now() / 1000;
    return now - this.lastShotTime >= this.config.shootCooldown;
  }
  
  shoot(playerPosition: Vector2): Arrow | null {
    if (!this.canShoot()) return null;
    
    this.lastShotTime = performance.now() / 1000;
    
    // Create arrow with current trajectory
    const arrow = new ArrowEntity(
      generateId(),
      playerPosition,
      Vec2.scale(this._aimDirection, ARROW_SPEED),
      this.config.maxArrowDistance,
      [...this._plannedSurfaces] // Copy plan to arrow
    );
    
    // Clear plan after shooting
    this.clearPlan();
    
    return arrow;
  }
}
```

---

## Player Entity (Composition)

```typescript
interface Player {
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly movementState: MovementState;
  readonly aimDirection: Vector2;
  readonly plannedSurfaces: readonly Surface[];
  readonly trajectoryResult: TrajectoryResult;
  
  update(delta: number, input: GameInput, surfaces: readonly Surface[]): void;
  handleClick(mousePosition: Vector2, surfaces: readonly Surface[]): Arrow | null;
  reset(spawnPoint: Vector2): void;
}

interface GameInput {
  movement: MovementInput;
  mousePosition: Vector2;
  click: boolean;
}

class PlayerEntity implements Player {
  private movementSystem: MovementSystem;
  private aimingSystem: AimingSystem;
  
  constructor(
    spawnPoint: Vector2,
    trajectoryCalculator: TrajectoryCalculator,
    movementConfig?: MovementConfig,
    aimingConfig?: AimingConfig
  ) {
    this.movementSystem = new PlayerMovementSystem(spawnPoint, movementConfig);
    this.aimingSystem = new PlayerAimingSystem(trajectoryCalculator, aimingConfig);
  }
  
  // Delegate position to movement system
  get position(): Vector2 { return this.movementSystem.position; }
  get velocity(): Vector2 { return this.movementSystem.velocity; }
  get movementState(): MovementState { return this.movementSystem.state; }
  
  // Delegate aiming to aiming system
  get aimDirection(): Vector2 { return this.aimingSystem.aimDirection; }
  get plannedSurfaces(): readonly Surface[] { return this.aimingSystem.plannedSurfaces; }
  get trajectoryResult(): TrajectoryResult { return this.aimingSystem.trajectoryResult; }
  
  update(delta: number, input: GameInput, surfaces: readonly Surface[]): void {
    // Update both systems - they are independent
    this.movementSystem.update(delta, input.movement, surfaces);
    this.aimingSystem.update(input.mousePosition, this.position, surfaces);
  }
  
  handleClick(mousePosition: Vector2, surfaces: readonly Surface[]): Arrow | null {
    // Check if clicking on a plannable surface
    const clickedSurface = this.findClickedSurface(mousePosition, surfaces);
    
    if (clickedSurface && clickedSurface.isPlannable()) {
      // Toggle surface in plan
      this.aimingSystem.toggleSurfaceInPlan(clickedSurface);
      return null;
    } else {
      // Shoot arrow
      return this.aimingSystem.shoot(this.position);
    }
  }
  
  private findClickedSurface(mousePosition: Vector2, surfaces: readonly Surface[]): Surface | null {
    const CLICK_THRESHOLD = 10; // Pixels
    
    for (const surface of surfaces) {
      const distance = pointToSegmentDistance(mousePosition, surface.segment);
      if (distance < CLICK_THRESHOLD) {
        return surface;
      }
    }
    
    return null;
  }
  
  reset(spawnPoint: Vector2): void {
    this.movementSystem.setPosition(spawnPoint);
    this.aimingSystem.clearPlan();
  }
}

// Helper: Distance from point to line segment
function pointToSegmentDistance(point: Vector2, segment: LineSegment): number {
  const v = Vec2.subtract(segment.end, segment.start);
  const w = Vec2.subtract(point, segment.start);
  
  const c1 = Vec2.dot(w, v);
  if (c1 <= 0) return Vec2.distance(point, segment.start);
  
  const c2 = Vec2.dot(v, v);
  if (c2 <= c1) return Vec2.distance(point, segment.end);
  
  const t = c1 / c2;
  const projection = Vec2.add(segment.start, Vec2.scale(v, t));
  return Vec2.distance(point, projection);
}
```

---

## Integration with Input Manager

```typescript
class InputManager {
  // ... existing code ...
  
  getGameInput(): GameInput {
    return {
      movement: {
        left: this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft'),
        right: this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight'),
        jump: this.wasKeyPressed('Space') || this.wasKeyPressed('KeyW') || this.wasKeyPressed('ArrowUp'),
        jumpHeld: this.isKeyDown('Space') || this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')
      },
      mousePosition: this.getPointerPosition(),
      click: this.wasPointerClicked()
    };
  }
  
  // Track single-frame events
  private clickedThisFrame = false;
  private pressedThisFrame = new Set<string>();
  
  wasKeyPressed(keyCode: string): boolean {
    return this.pressedThisFrame.has(keyCode);
  }
  
  wasPointerClicked(): boolean {
    return this.clickedThisFrame;
  }
  
  // Call at end of frame
  clearFrameEvents(): void {
    this.clickedThisFrame = false;
    this.pressedThisFrame.clear();
  }
}
```

---

## Test Scenarios

### Movement Tests
1. Acceleration reaches max speed
2. Deceleration stops player
3. Jump height varies with hold duration
4. Gravity applies when airborne
5. Ground collision stops fall
6. Air control is reduced

### Aiming Tests
1. Aim direction updates with mouse
2. Surface added to plan on click
3. Surface removed from plan on second click
4. Non-plannable surfaces cannot be added
5. Plan clears after shooting
6. Trajectory recalculates on player movement

### Integration Tests
1. Player can shoot while running
2. Player can shoot while jumping
3. Player can shoot while falling
4. Trajectory origin follows player position
5. Plan persists across movement states

