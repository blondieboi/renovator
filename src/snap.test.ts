import {
  constrainedOpeningPosition,
  resolveWallEndpointSnap,
  type ActiveSnap,
} from "./geometry";
import type { Opening, Plan, PlanPoint, Wall } from "./types";

function wall(overrides: Partial<Wall>): Wall {
  return {
    id: "wall",
    kind: "wall",
    name: "Wall",
    x: 0,
    y: 0,
    x2: 100,
    y2: 0,
    width: 100,
    height: 12,
    thickness: 12,
    rotation: 0,
    ...overrides,
  };
}

function opening(overrides: Partial<Opening>): Opening {
  return {
    id: "door",
    kind: "door",
    name: "Door",
    x: 20,
    y: -6,
    width: 52,
    height: 12,
    rotation: 0,
    ...overrides,
  };
}

function plan(walls: Wall[], openings: Opening[] = []): Plan {
  return {
    scale: {
      pixelsPerMeter: 50,
      gridSize: 25,
      ceilingHeightMeters: 2.5,
    },
    walls,
    openings,
    rooms: [],
    fixtures: [],
  };
}

function nearlySamePoint(a: PlanPoint, b: PlanPoint) {
  return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
}

export const snapTestCases = [
  {
    name: "opening keeps active wall in crowded wall cluster",
    run() {
      const openingSnap: ActiveSnap = { kind: "opening-wall", wallId: "wall_a" };
      const sourceOpening = opening({ wallId: "wall_a", x: 20, y: 1 });
      const result = constrainedOpeningPosition(
        sourceOpening,
        sourceOpening.x,
        sourceOpening.y,
        plan([
          wall({ id: "wall_a", y: 0, y2: 0 }),
          wall({ id: "wall_b", y: 8, y2: 8 }),
        ]),
        false,
        1,
        openingSnap,
      );
      return result.wallId === "wall_a";
    },
  },
  {
    name: "opening rotation does not flip while active wall is still in release tolerance",
    run() {
      const openingSnap: ActiveSnap = { kind: "opening-wall", wallId: "wall_a" };
      const sourceOpening = opening({ wallId: "wall_a", x: 26, y: -2 });
      const result = constrainedOpeningPosition(
        sourceOpening,
        sourceOpening.x,
        sourceOpening.y,
        plan([
          wall({ id: "wall_a", x: 0, y: 0, x2: 120, y2: 0, rotation: 0 }),
          wall({ id: "wall_b", x: 52, y: -40, x2: 52, y2: 80, rotation: 90 }),
        ]),
        false,
        1,
        openingSnap,
      );
      return result.wallId === "wall_a" && Math.abs(result.rotation) < 0.001;
    },
  },
  {
    name: "wall endpoint snaps exactly to angle-compatible endpoint",
    run() {
      const result = resolveWallEndpointSnap({
        point: { x: 98, y: 2 },
        origin: { x: 0, y: 0 },
        walls: [wall({ id: "target", x: 100, y: 0, x2: 100, y2: 100, rotation: 90 })],
        gridSize: 25,
        viewportScale: 1,
      });
      return result.kind === "endpoint" && nearlySamePoint(result.point, { x: 100, y: 0 });
    },
  },
  {
    name: "wall endpoint prefers polar guide over incompatible endpoint",
    run() {
      const result = resolveWallEndpointSnap({
        point: { x: 90, y: 40 },
        origin: { x: 0, y: 0 },
        walls: [wall({ id: "target", x: 90, y: 40, x2: 90, y2: 120, rotation: 90 })],
        gridSize: 25,
        viewportScale: 1,
      });
      return result.kind === "polar" && result.angle === 45;
    },
  },
  {
    name: "alt free-drag bypasses wall endpoint snapping",
    run() {
      const point = { x: 98, y: 2 };
      const result = resolveWallEndpointSnap({
        point,
        origin: { x: 0, y: 0 },
        walls: [wall({ id: "target", x: 100, y: 0, x2: 100, y2: 100, rotation: 90 })],
        gridSize: 25,
        viewportScale: 1,
        snappingDisabled: true,
      });
      return result.kind === "free" && nearlySamePoint(result.point, point);
    },
  },
];
