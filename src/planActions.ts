import { distance, snapPointToGrid, snapStructuralPoint, wallAngle } from "./geometry";
import { safeGridSize } from "./model";
import { isSimplePolygon } from "./topology";
import type { Plan, PlanPoint, Room } from "./types";
import { roomPoints } from "./utils";

export type RoomPointMoveResult = "moved" | "missing-room" | "invalid-polygon";

export function moveWallInPlan(
  plan: Plan,
  id: string,
  x: number,
  y: number,
  snappingDisabled: boolean,
) {
  const wall = plan.walls.find((item) => item.id === id);
  if (!wall) return false;
  const dx = x - wall.x;
  const dy = y - wall.y;
  const nextStart = { x: wall.x + dx, y: wall.y + dy };
  const nextEnd = { x: wall.x2 + dx, y: wall.y2 + dy };
  let offset = { x: dx, y: dy };

  if (!snappingDisabled) {
    const gridSize = safeGridSize(plan);
    const snappedStart = snapStructuralPoint(nextStart, plan.walls, gridSize, wall.id);
    const startDistance = distance(nextStart, snappedStart);
    const snappedEnd = snapStructuralPoint(nextEnd, plan.walls, gridSize, wall.id);
    const endDistance = distance(nextEnd, snappedEnd);
    offset = startDistance <= endDistance
      ? { x: snappedStart.x - wall.x, y: snappedStart.y - wall.y }
      : { x: snappedEnd.x - wall.x2, y: snappedEnd.y - wall.y2 };
  }

  wall.x += offset.x;
  wall.y += offset.y;
  wall.x2 += offset.x;
  wall.y2 += offset.y;
  return true;
}

export function moveRectangularObjectInPlan(
  plan: Plan,
  id: string,
  x: number,
  y: number,
  snappingDisabled: boolean,
) {
  const object = [...plan.rooms, ...plan.fixtures].find((item) => item.id === id);
  if (!object) return false;
  const nextPoint = snappingDisabled ? { x, y } : snapPointToGrid({ x, y }, safeGridSize(plan));
  object.x = nextPoint.x;
  object.y = nextPoint.y;
  return true;
}

export function normalizeRoomShape(room: Room) {
  const points = roomPoints(room);
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  room.x += minX;
  room.y += minY;
  room.width = Math.max(1, maxX - minX);
  room.height = Math.max(1, maxY - minY);
  room.points = points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
}

export function moveRoomPointInPlan(
  plan: Plan,
  roomId: string,
  pointIndex: number,
  absolutePoint: PlanPoint,
  snappingDisabled: boolean,
): RoomPointMoveResult {
  const room = plan.rooms.find((item) => item.id === roomId);
  if (!room) return "missing-room";
  const points = roomPoints(room);
  const nextPoint = snappingDisabled
    ? absolutePoint
    : snapStructuralPoint(absolutePoint, plan.walls, safeGridSize(plan));
  const nextLocalPoint = { x: nextPoint.x - room.x, y: nextPoint.y - room.y };
  const nextPoints = points.map((point, index) => (index === pointIndex ? nextLocalPoint : point));
  const nextAbsolutePoints = nextPoints.map((point) => ({ x: room.x + point.x, y: room.y + point.y }));
  if (!isSimplePolygon(nextAbsolutePoints)) return "invalid-polygon";

  room.points = nextPoints;
  normalizeRoomShape(room);
  return "moved";
}

export function resizeWallEndpointInPlan(
  plan: Plan,
  wallId: string,
  endpoint: "start" | "end",
  nextPoint: PlanPoint,
) {
  const wall = plan.walls.find((item) => item.id === wallId);
  if (!wall) return false;
  if (endpoint === "start") {
    wall.x = nextPoint.x;
    wall.y = nextPoint.y;
  } else {
    wall.x2 = nextPoint.x;
    wall.y2 = nextPoint.y;
  }
  wall.width = Math.max(1, Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y));
  wall.rotation = wallAngle(wall);
  return true;
}
