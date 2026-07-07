import {
  moveRectangularObjectInPlan,
  moveRoomPointInPlan,
  moveWallInPlan,
  resizeWallEndpointInPlan,
} from "./planActions";
import type { Fixture, Plan, Room, Wall } from "./types";

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
];
