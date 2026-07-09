import type { Alternative, FixtureKind, Floor, Plan, PropertyProject, RoomBoard, ToolMode } from "./types";
import { createRoomBoard } from "./utils";

export const fixtureKinds: FixtureKind[] = [
  "counter",
  "sink",
  "toilet",
  "shower",
  "tub",
  "stairs",
  "closet",
  "sofa",
  "bed",
  "table",
];

export const roomColors = ["#a8c8bb", "#d8c079", "#d3aaa3", "#a8bdc8", "#beb0ca", "#b9c98e"];

export type SelectablePlanObject =
  | Plan["rooms"][number]
  | Plan["openings"][number]
  | Plan["fixtures"][number]
  | Plan["walls"][number];

export type StructureSelection = { type: "project" | "floor" | "alternative"; id: string };

export type ActiveStructure =
  | { type: "project"; property: PropertyProject }
  | { type: "floor"; property: PropertyProject; floor: Floor }
  | { type: "alternative"; property: PropertyProject; floor: Floor; alternative: Alternative };

export function isStructuralTool(mode: ToolMode) {
  return mode === "wall" || mode === "room" || mode === "polyRoom" || mode === "door" || mode === "window";
}

export function isStructuralPlanObject(object: SelectablePlanObject) {
  return object.kind === "room" || object.kind === "wall" || object.kind === "door" || object.kind === "window";
}

export function defaultFixtureSize(kind: FixtureKind) {
  switch (kind) {
    case "counter":
      return { width: 132, height: 46 };
    case "sink":
      return { width: 64, height: 56 };
    case "toilet":
      return { width: 50, height: 68 };
    case "shower":
      return { width: 74, height: 74 };
    case "tub":
      return { width: 108, height: 58 };
    case "stairs":
      return { width: 116, height: 124 };
    case "closet":
      return { width: 96, height: 56 };
    case "sofa":
      return { width: 112, height: 64 };
    case "bed":
      return { width: 92, height: 128 };
    case "table":
      return { width: 84, height: 84 };
  }
}

export function safeGridSize(plan: Plan) {
  return Number.isFinite(plan.scale.gridSize) && plan.scale.gridSize >= 1 ? plan.scale.gridSize : 26;
}

export function safePixelsPerMeter(plan: Plan) {
  return Number.isFinite(plan.scale.pixelsPerMeter) && plan.scale.pixelsPerMeter > 0 ? plan.scale.pixelsPerMeter : 52;
}

export function findPlanObject(plan: Plan, id: string): SelectablePlanObject | undefined {
  return [...plan.rooms, ...plan.openings, ...plan.fixtures, ...plan.walls].find((item) => item.id === id);
}

export function getOrCreateRoomBoard(alternative: Alternative, roomId: string): RoomBoard {
  const existing = alternative.roomBoards.find((item) => item.roomId === roomId);
  if (existing) return existing;
  const board = createRoomBoard(roomId);
  alternative.roomBoards.push(board);
  return board;
}

export function findActiveProject(projects: PropertyProject[], propertyId: string, floorId: string, alternativeId: string) {
  const property = projects.find((item) => item.id === propertyId);
  const floor = property?.floors.find((item) => item.id === floorId);
  const alternative = floor?.alternatives.find((item) => item.id === alternativeId);
  return { property, floor, alternative };
}
