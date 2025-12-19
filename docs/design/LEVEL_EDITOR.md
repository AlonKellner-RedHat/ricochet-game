# Level Editor Specification

## Overview

The level editor is an **in-game tool** that allows toggling between Play and Edit modes. In Edit mode, the player can create, modify, and save levels without leaving the game.

---

## Mode Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        GameScene                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   currentMode: 'play' | 'edit'                              │
│                                                              │
│   ┌─────────────────┐         ┌─────────────────┐          │
│   │   Play Mode     │◄───────►│   Edit Mode     │          │
│   │                 │   [E]   │                 │          │
│   │ - Player active │         │ - Editor tools  │          │
│   │ - Physics runs  │         │ - No physics    │          │
│   │ - Arrows fly    │         │ - Free camera   │          │
│   └─────────────────┘         └─────────────────┘          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Mode Toggle

- **Key:** `E` (or button in UI)
- **Play → Edit:** Pause gameplay, show editor UI, enable tools
- **Edit → Play:** Hide editor UI, reset level, resume gameplay

---

## Editor Tools

### Tool System (OCP Design)

```typescript
interface EditorTool {
  readonly name: string;
  readonly icon: string;
  readonly shortcut: string;
  
  onActivate(): void;
  onDeactivate(): void;
  
  onMouseDown(position: Vector2, button: number): void;
  onMouseMove(position: Vector2): void;
  onMouseUp(position: Vector2, button: number): void;
  
  render(graphics: Phaser.GameObjects.Graphics): void;
}

class EditorToolManager {
  private tools: Map<string, EditorTool> = new Map();
  private activeTool: EditorTool | null = null;
  
  register(tool: EditorTool): void {
    this.tools.set(tool.name, tool);
  }
  
  setActiveTool(name: string): void {
    this.activeTool?.onDeactivate();
    this.activeTool = this.tools.get(name) ?? null;
    this.activeTool?.onActivate();
  }
  
  // Delegate input to active tool
  handleMouseDown(position: Vector2, button: number): void {
    this.activeTool?.onMouseDown(position, button);
  }
  
  handleMouseMove(position: Vector2): void {
    this.activeTool?.onMouseMove(position);
  }
  
  handleMouseUp(position: Vector2, button: number): void {
    this.activeTool?.onMouseUp(position, button);
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    this.activeTool?.render(graphics);
  }
}
```

### 1. Select Tool

**Shortcut:** `V`

Select and manipulate existing objects.

```typescript
class SelectTool implements EditorTool {
  readonly name = 'select';
  readonly icon = '◇';
  readonly shortcut = 'KeyV';
  
  private selectedObject: LevelObject | null = null;
  private dragOffset: Vector2 | null = null;
  
  onMouseDown(position: Vector2, button: number): void {
    if (button === 0) { // Left click
      // Find object under cursor
      this.selectedObject = this.findObjectAt(position);
      
      if (this.selectedObject) {
        this.dragOffset = Vec2.subtract(
          this.selectedObject.getPosition(),
          position
        );
      }
    } else if (button === 2) { // Right click
      // Delete selected object
      if (this.selectedObject) {
        this.level.removeObject(this.selectedObject);
        this.selectedObject = null;
      }
    }
  }
  
  onMouseMove(position: Vector2): void {
    if (this.selectedObject && this.dragOffset) {
      const newPos = Vec2.add(position, this.dragOffset);
      this.selectedObject.setPosition(newPos);
    }
  }
  
  onMouseUp(position: Vector2, button: number): void {
    this.dragOffset = null;
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    if (this.selectedObject) {
      // Draw selection highlight
      const bounds = this.selectedObject.getBounds();
      graphics.lineStyle(2, 0x00ffff, 1);
      graphics.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }
}
```

### 2. Surface Tool

**Shortcut:** `S`

Create line segment surfaces by click-dragging.

```typescript
interface SurfaceToolConfig {
  surfaceType: 'ricochet' | 'wall' | 'breakable';
  snapToGrid: boolean;
  gridSize: number;
}

class SurfaceTool implements EditorTool {
  readonly name = 'surface';
  readonly icon = '━';
  readonly shortcut = 'KeyS';
  
  private config: SurfaceToolConfig = {
    surfaceType: 'ricochet',
    snapToGrid: true,
    gridSize: 16
  };
  
  private startPoint: Vector2 | null = null;
  private endPoint: Vector2 | null = null;
  
  onMouseDown(position: Vector2, button: number): void {
    if (button === 0) {
      this.startPoint = this.snapPosition(position);
      this.endPoint = this.startPoint;
    }
  }
  
  onMouseMove(position: Vector2): void {
    if (this.startPoint) {
      this.endPoint = this.snapPosition(position);
    }
  }
  
  onMouseUp(position: Vector2, button: number): void {
    if (button === 0 && this.startPoint && this.endPoint) {
      // Create surface if length is sufficient
      const length = Vec2.distance(this.startPoint, this.endPoint);
      
      if (length >= this.config.gridSize) {
        const surface = this.createSurface(this.startPoint, this.endPoint);
        this.level.addSurface(surface);
      }
      
      this.startPoint = null;
      this.endPoint = null;
    }
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    if (this.startPoint && this.endPoint) {
      // Preview line
      const color = this.getSurfaceColor(this.config.surfaceType);
      graphics.lineStyle(3, color, 0.7);
      graphics.lineBetween(
        this.startPoint.x, this.startPoint.y,
        this.endPoint.x, this.endPoint.y
      );
    }
  }
  
  private snapPosition(position: Vector2): Vector2 {
    if (!this.config.snapToGrid) return position;
    
    return {
      x: Math.round(position.x / this.config.gridSize) * this.config.gridSize,
      y: Math.round(position.y / this.config.gridSize) * this.config.gridSize
    };
  }
  
  private createSurface(start: Vector2, end: Vector2): Surface {
    const id = generateId();
    const segment = { start, end };
    
    switch (this.config.surfaceType) {
      case 'ricochet':
        return new RicochetSurface(id, segment);
      case 'wall':
        return new WallSurface(id, segment);
      case 'breakable':
        return new BreakableSurface(id, segment, 3);
    }
  }
  
  private getSurfaceColor(type: string): number {
    switch (type) {
      case 'ricochet': return 0x00ffff; // Cyan
      case 'wall': return 0x888888;     // Gray
      case 'breakable': return 0xffaa00; // Orange
      default: return 0xffffff;
    }
  }
  
  // Called by UI
  setSurfaceType(type: 'ricochet' | 'wall' | 'breakable'): void {
    this.config.surfaceType = type;
  }
  
  toggleSnap(): void {
    this.config.snapToGrid = !this.config.snapToGrid;
  }
}
```

### 3. Target Tool

**Shortcut:** `T`

Place targets by clicking.

```typescript
interface TargetToolConfig {
  targetType: 'basic' | 'multi_hit' | 'trigger';
  hitsRequired: number; // For multi_hit
  triggerActionType: string; // For trigger
}

class TargetTool implements EditorTool {
  readonly name = 'target';
  readonly icon = '◎';
  readonly shortcut = 'KeyT';
  
  private config: TargetToolConfig = {
    targetType: 'basic',
    hitsRequired: 3,
    triggerActionType: 'toggle_surface'
  };
  
  private previewPosition: Vector2 | null = null;
  
  onMouseMove(position: Vector2): void {
    this.previewPosition = position;
  }
  
  onMouseDown(position: Vector2, button: number): void {
    if (button === 0) {
      const target = this.createTarget(position);
      this.level.addTarget(target);
    }
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    if (this.previewPosition) {
      // Preview target
      const color = this.getTargetColor(this.config.targetType);
      graphics.lineStyle(2, color, 0.7);
      graphics.strokeCircle(this.previewPosition.x, this.previewPosition.y, 16);
    }
  }
  
  private createTarget(position: Vector2): Target {
    const id = generateId();
    
    switch (this.config.targetType) {
      case 'basic':
        return new BasicTarget(id, position, 16);
      case 'multi_hit':
        return new MultiHitTarget(id, position, 16, this.config.hitsRequired);
      case 'trigger':
        return new TriggerTarget(id, position, 16, this.createTriggerAction());
    }
  }
  
  private getTargetColor(type: string): number {
    switch (type) {
      case 'basic': return 0xff0000;     // Red
      case 'multi_hit': return 0xff00ff; // Magenta
      case 'trigger': return 0xffff00;   // Yellow
      default: return 0xffffff;
    }
  }
  
  private createTriggerAction(): TriggerAction {
    // Placeholder - would be configured via properties panel
    return new NoOpAction();
  }
  
  setTargetType(type: 'basic' | 'multi_hit' | 'trigger'): void {
    this.config.targetType = type;
  }
  
  setHitsRequired(hits: number): void {
    this.config.hitsRequired = Math.max(1, hits);
  }
}
```

### 4. Spawn Tool

**Shortcut:** `P`

Set player spawn point.

```typescript
class SpawnTool implements EditorTool {
  readonly name = 'spawn';
  readonly icon = '⬤';
  readonly shortcut = 'KeyP';
  
  private previewPosition: Vector2 | null = null;
  
  onMouseMove(position: Vector2): void {
    this.previewPosition = position;
  }
  
  onMouseDown(position: Vector2, button: number): void {
    if (button === 0) {
      this.level.setSpawnPoint(position);
    }
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    // Draw current spawn point
    const spawn = this.level.spawnPoint;
    graphics.fillStyle(0x00ff00, 0.8);
    graphics.fillCircle(spawn.x, spawn.y, 8);
    
    // Draw preview if different from current
    if (this.previewPosition) {
      graphics.lineStyle(2, 0x00ff00, 0.5);
      graphics.strokeCircle(this.previewPosition.x, this.previewPosition.y, 8);
    }
  }
}
```

### 5. Eraser Tool

**Shortcut:** `X`

Delete objects by clicking on them.

```typescript
class EraserTool implements EditorTool {
  readonly name = 'eraser';
  readonly icon = '✕';
  readonly shortcut = 'KeyX';
  
  private hoveredObject: LevelObject | null = null;
  
  onMouseMove(position: Vector2): void {
    this.hoveredObject = this.findObjectAt(position);
  }
  
  onMouseDown(position: Vector2, button: number): void {
    if (button === 0 && this.hoveredObject) {
      this.level.removeObject(this.hoveredObject);
      this.hoveredObject = null;
    }
  }
  
  render(graphics: Phaser.GameObjects.Graphics): void {
    if (this.hoveredObject) {
      // Highlight object to be deleted
      const bounds = this.hoveredObject.getBounds();
      graphics.fillStyle(0xff0000, 0.3);
      graphics.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  }
}
```

---

## Level Data Format

### JSON Schema

```typescript
interface LevelData {
  // Metadata
  id: string;
  name: string;
  version: number;
  
  // Level bounds
  bounds: {
    width: number;
    height: number;
  };
  
  // Player start
  spawnPoint: {
    x: number;
    y: number;
  };
  
  // Objects
  surfaces: SurfaceData[];
  targets: TargetData[];
}

interface SurfaceData {
  id: string;
  type: 'ricochet' | 'wall' | 'breakable';
  segment: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  properties?: {
    health?: number;        // For breakable
    initiallyActive?: boolean; // For toggleable surfaces
  };
}

interface TargetData {
  id: string;
  type: 'basic' | 'multi_hit' | 'trigger';
  position: { x: number; y: number };
  hitRadius: number;
  properties?: {
    hitsRequired?: number;  // For multi_hit
    triggerAction?: TriggerActionData; // For trigger
  };
}

interface TriggerActionData {
  type: string;
  params: Record<string, unknown>;
}
```

### Example Level

```json
{
  "id": "level_001",
  "name": "First Steps",
  "version": 1,
  "bounds": {
    "width": 1024,
    "height": 576
  },
  "spawnPoint": {
    "x": 100,
    "y": 400
  },
  "surfaces": [
    {
      "id": "floor_1",
      "type": "wall",
      "segment": {
        "start": { "x": 0, "y": 500 },
        "end": { "x": 1024, "y": 500 }
      }
    },
    {
      "id": "ricochet_1",
      "type": "ricochet",
      "segment": {
        "start": { "x": 400, "y": 300 },
        "end": { "x": 500, "y": 200 }
      }
    },
    {
      "id": "ricochet_2",
      "type": "ricochet",
      "segment": {
        "start": { "x": 700, "y": 200 },
        "end": { "x": 800, "y": 300 }
      }
    }
  ],
  "targets": [
    {
      "id": "target_1",
      "type": "basic",
      "position": { "x": 900, "y": 150 },
      "hitRadius": 20
    }
  ]
}
```

---

## Level Serialization

```typescript
interface LevelSerializer {
  serialize(level: Level): LevelData;
  deserialize(data: LevelData): Level;
}

class JSONLevelSerializer implements LevelSerializer {
  private surfaceFactory: SurfaceFactory;
  private targetFactory: TargetFactory;
  
  serialize(level: Level): LevelData {
    return {
      id: level.id,
      name: level.name,
      version: 1,
      bounds: { ...level.bounds },
      spawnPoint: { ...level.spawnPoint },
      surfaces: level.surfaces.map(s => this.serializeSurface(s)),
      targets: level.targets.map(t => this.serializeTarget(t))
    };
  }
  
  deserialize(data: LevelData): Level {
    const surfaces = data.surfaces.map(s => this.surfaceFactory.create(s));
    const targets = data.targets.map(t => this.targetFactory.create(t));
    
    return new Level(
      data.id,
      data.name,
      data.bounds,
      data.spawnPoint,
      surfaces,
      targets
    );
  }
  
  private serializeSurface(surface: Surface): SurfaceData {
    return {
      id: surface.id,
      type: surface.surfaceType as SurfaceData['type'],
      segment: {
        start: { ...surface.segment.start },
        end: { ...surface.segment.end }
      },
      properties: surface.getSerializableProperties?.() ?? undefined
    };
  }
  
  private serializeTarget(target: Target): TargetData {
    return {
      id: target.id,
      type: target.targetType as TargetData['type'],
      position: { ...target.position },
      hitRadius: target.hitRadius,
      properties: target.getSerializableProperties?.() ?? undefined
    };
  }
}
```

---

## Save/Load System

```typescript
interface LevelStorage {
  save(level: LevelData): Promise<void>;
  load(levelId: string): Promise<LevelData | null>;
  list(): Promise<LevelMetadata[]>;
  delete(levelId: string): Promise<void>;
}

interface LevelMetadata {
  id: string;
  name: string;
  lastModified: Date;
}

// Browser localStorage implementation
class LocalStorageLevelStorage implements LevelStorage {
  private readonly prefix = 'ricochet_level_';
  
  async save(level: LevelData): Promise<void> {
    const key = this.prefix + level.id;
    const value = JSON.stringify(level);
    localStorage.setItem(key, value);
    
    // Update metadata index
    await this.updateIndex(level.id, level.name);
  }
  
  async load(levelId: string): Promise<LevelData | null> {
    const key = this.prefix + levelId;
    const value = localStorage.getItem(key);
    
    if (!value) return null;
    
    try {
      return JSON.parse(value) as LevelData;
    } catch {
      console.error(`Failed to parse level ${levelId}`);
      return null;
    }
  }
  
  async list(): Promise<LevelMetadata[]> {
    const indexKey = this.prefix + '_index';
    const indexValue = localStorage.getItem(indexKey);
    
    if (!indexValue) return [];
    
    try {
      return JSON.parse(indexValue) as LevelMetadata[];
    } catch {
      return [];
    }
  }
  
  async delete(levelId: string): Promise<void> {
    const key = this.prefix + levelId;
    localStorage.removeItem(key);
    await this.removeFromIndex(levelId);
  }
  
  private async updateIndex(id: string, name: string): Promise<void> {
    const levels = await this.list();
    const existing = levels.find(l => l.id === id);
    
    if (existing) {
      existing.name = name;
      existing.lastModified = new Date();
    } else {
      levels.push({ id, name, lastModified: new Date() });
    }
    
    localStorage.setItem(
      this.prefix + '_index',
      JSON.stringify(levels)
    );
  }
  
  private async removeFromIndex(id: string): Promise<void> {
    const levels = await this.list();
    const filtered = levels.filter(l => l.id !== id);
    
    localStorage.setItem(
      this.prefix + '_index',
      JSON.stringify(filtered)
    );
  }
}
```

---

## Editor UI

### Tool Palette

```
┌─────────────────────────────────────┐
│  EDITOR TOOLS                       │
├─────────────────────────────────────┤
│  [V] Select   [S] Surface           │
│  [T] Target   [P] Spawn             │
│  [X] Eraser                         │
├─────────────────────────────────────┤
│  SURFACE TYPE (when Surface tool)   │
│  ○ Ricochet  ○ Wall  ○ Breakable    │
├─────────────────────────────────────┤
│  TARGET TYPE (when Target tool)     │
│  ○ Basic  ○ Multi-Hit  ○ Trigger    │
├─────────────────────────────────────┤
│  OPTIONS                            │
│  [✓] Snap to Grid                   │
│  Grid Size: [16] px                 │
├─────────────────────────────────────┤
│  LEVEL                              │
│  [Save] [Load] [New] [Test]         │
└─────────────────────────────────────┘
```

### Properties Panel (for selected object)

```
┌─────────────────────────────────────┐
│  PROPERTIES                         │
├─────────────────────────────────────┤
│  Type: Multi-Hit Target             │
│  ID: target_abc123                  │
│                                     │
│  Position                           │
│    X: [450]  Y: [200]               │
│                                     │
│  Hit Radius: [20]                   │
│  Hits Required: [3]                 │
│                                     │
│  [Delete]                           │
└─────────────────────────────────────┘
```

---

## Editor Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` | Toggle Edit mode |
| `V` | Select tool |
| `S` | Surface tool |
| `T` | Target tool |
| `P` | Spawn tool |
| `X` | Eraser tool |
| `G` | Toggle grid snap |
| `Ctrl+S` | Save level |
| `Ctrl+O` | Load level |
| `Ctrl+N` | New level |
| `Delete` | Delete selected |
| `Escape` | Deselect / Cancel |

---

## Test Scenarios

### Tool Tests
1. Surface tool creates segment on drag
2. Target tool places target on click
3. Select tool moves object on drag
4. Eraser tool removes clicked object
5. Spawn tool updates level spawn point

### Serialization Tests
1. Level serializes to valid JSON
2. Level deserializes from JSON
3. All surface types serialize correctly
4. All target types serialize correctly
5. Properties preserved through save/load

### Storage Tests
1. Level saves to localStorage
2. Level loads from localStorage
3. Level list updates on save
4. Level delete removes from storage
5. Invalid JSON handled gracefully

