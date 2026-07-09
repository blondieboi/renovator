import {
  moveRectangularObjectInPlan,
  moveRoomPointInPlan,
  moveWallInPlan,
  removePlanObjectInAlternative,
  rotateWallInPlan,
  resizeWallLengthInPlan,
  resizeWallEndpointInPlan,
} from "./planActions";
import type { Alternative, Fixture, Opening, Plan, Room, Wall } from "./types";

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

function room(overrides: Partial<Room>): Room {
  return {
    id: "room",
    kind: "room",
    name: "Room",
    x: 10,
    y: 10,
    width: 100,
    height: 100,
    rotation: 0,
    color: "#ffffff",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    ...overrides,
  };
}

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: "fixture",
    kind: "bed",
    name: "Bed",
    x: 0,
    y: 0,
    width: 50,
    height: 70,
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
    width: 40,
    height: 12,
    rotation: 0,
    wallId: "wall",
    ...overrides,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    scale: {
      pixelsPerMeter: 50,
      gridSize: 25,
      ceilingHeightMeters: 2.5,
      ...overrides.scale,
    },
    walls: [],
    openings: [],
    rooms: [],
    fixtures: [],
    ...overrides,
  };
}

function nearlyEqual(a: number, b: number) {
  return Math.abs(a - b) < 0.001;
}

export const planActionTestCases = [
  {
    name: "moving wall snaps the closest endpoint to nearby structure",
    run() {
      const source = wall({ id: "wall_a", x: 0, y: 0, x2: 100, y2: 0 });
      const target = wall({ id: "wall_b", x: 110, y: 0, x2: 110, y2: 100, rotation: 90 });
      const sourcePlan = plan({ walls: [source, target] });
      const moved = moveWallInPlan(sourcePlan, "wall_a", 13, 2, false);
      return moved && nearlyEqual(source.x, 10) && nearlyEqual(source.y, 0) && nearlyEqual(source.x2, 110) && nearlyEqual(source.y2, 0);
    },
  },
  {
    name: "moving rectangular object uses grid snapping unless free-dragging",
    run() {
      const bed = fixture({ id: "bed" });
      const sourcePlan = plan({ fixtures: [bed] });
      const snapped = moveRectangularObjectInPlan(sourcePlan, "bed", 13, 37, false);
      const snappedPosition = bed.x === 25 && bed.y === 25;
      const free = moveRectangularObjectInPlan(sourcePlan, "bed", 13, 37, true);
      return snapped && snappedPosition && free && bed.x === 13 && bed.y === 37;
    },
  },
  {
    name: "moving room point normalizes room bounds after free-drag",
    run() {
      const sourceRoom = room({ id: "room_a" });
      const sourcePlan = plan({ rooms: [sourceRoom] });
      const result = moveRoomPointInPlan(sourcePlan, "room_a", 0, { x: 5, y: 5 }, true);
      return (
        result === "moved" &&
        sourceRoom.x === 5 &&
        sourceRoom.y === 5 &&
        sourceRoom.width === 105 &&
        sourceRoom.height === 105 &&
        sourceRoom.points?.[0]?.x === 0 &&
        sourceRoom.points?.[0]?.y === 0
      );
    },
  },
  {
    name: "moving room point rejects invalid polygon edits",
    run() {
      const sourceRoom = room({ id: "room_a" });
      const original = JSON.stringify(sourceRoom.points);
      const sourcePlan = plan({ rooms: [sourceRoom] });
      const result = moveRoomPointInPlan(sourcePlan, "room_a", 0, { x: 110, y: 110 }, true);
      return result === "invalid-polygon" && JSON.stringify(sourceRoom.points) === original;
    },
  },
  {
    name: "resizing wall endpoint updates length and rotation",
    run() {
      const sourceWall = wall({ id: "wall_a" });
      const sourcePlan = plan({ walls: [sourceWall] });
      const resized = resizeWallEndpointInPlan(sourcePlan, "wall_a", "end", { x: 0, y: 100 });
      return resized && sourceWall.width === 100 && nearlyEqual(sourceWall.rotation, 90);
    },
  },
  {
    name: "moving a wall keeps its attached openings aligned",
    run() {
      const sourceWall = wall({ id: "wall", x: 0, y: 0, x2: 100, y2: 0 });
      const door = opening({ wallId: sourceWall.id });
      const sourcePlan = plan({ walls: [sourceWall], openings: [door] });
      const moved = moveWallInPlan(sourcePlan, sourceWall.id, 25, 25, false);
      return moved && door.x === 45 && door.y === 19 && door.wallId === sourceWall.id;
    },
  },
  {
    name: "rotating a wall keeps its stored length and attached opening position in sync",
    run() {
      const sourceWall = wall({ id: "wall", x: 0, y: 0, x2: 100, y2: 0, width: 5 });
      const door = opening({ wallId: sourceWall.id });
      const sourcePlan = plan({ walls: [sourceWall], openings: [door] });
      const rotated = rotateWallInPlan(sourcePlan, sourceWall.id, 90);
      return (
        rotated &&
        nearlyEqual(sourceWall.width, 100) &&
        nearlyEqual(sourceWall.x2, 0) &&
        nearlyEqual(sourceWall.y2, 100) &&
        nearlyEqual(door.x, 6) &&
        nearlyEqual(door.y, 20)
      );
    },
  },
  {
    name: "resizing a wall repositions openings within the new wall length",
    run() {
      const sourceWall = wall({ id: "wall", x: 0, y: 0, x2: 100, y2: 0 });
      const door = opening({ wallId: sourceWall.id, x: 60, width: 40 });
      const sourcePlan = plan({ walls: [sourceWall], openings: [door] });
      const resized = resizeWallEndpointInPlan(sourcePlan, sourceWall.id, "end", { x: 50, y: 0 });
      return resized && nearlyEqual(door.width, 40) && nearlyEqual(door.x, 10) && nearlyEqual(door.y, -6);
    },
  },
  {
    name: "changing a wall length keeps attached openings within its bounds",
    run() {
      const sourceWall = wall({ id: "wall", x: 0, y: 0, x2: 100, y2: 0 });
      const door = opening({ wallId: sourceWall.id, x: 60, width: 40 });
      const sourcePlan = plan({ walls: [sourceWall], openings: [door] });
      const resized = resizeWallLengthInPlan(sourcePlan, sourceWall.id, 50);
      return resized && nearlyEqual(sourceWall.width, 50) && nearlyEqual(door.x, 10) && nearlyEqual(door.y, -6);
    },
  },
  {
    name: "deleting a wall detaches its openings instead of leaving stale references",
    run() {
      const sourceWall = wall({ id: "wall" });
      const door = opening({ wallId: sourceWall.id });
      const alternative: Alternative = {
        id: "alternative",
        name: "Current layout",
        createdAt: "2026-01-01T00:00:00.000Z",
        plan: plan({ walls: [sourceWall], openings: [door] }),
        roomBoards: [],
      };
      const removed = removePlanObjectInAlternative(alternative, sourceWall.id);
      return removed && alternative.plan.walls.length === 0 && alternative.plan.openings[0]?.wallId === undefined;
    },
  },
];
