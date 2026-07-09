import {
  distance,
  openingCenter,
  placeOpeningAtCenter,
  snapPointToGrid,
  snapStructuralPoint,
  wallAngle,
} from "./geometry";
import { safeGridSize } from "./model";
import { isSimplePolygon } from "./topology";
import type { Alternative, Opening, Plan, PlanPoint, Room, Wall } from "./types";
import { roomPoints } from "./utils";

export type RoomPointMoveResult = "moved" | "missing-room" | "invalid-polygon";

const minimumWallLength = 8;

function wallLength(wall: Wall) {
  return Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function openingDistanceOnWall(opening: Opening, wall: Wall) {
  const length = wallLength(wall);
  if (length < minimumWallLength) return 0;
  const center = openingCenter(opening);
  const axis = { x: (wall.x2 - wall.x) / length, y: (wall.y2 - wall.y) / length };
  return clamp((center.x - wall.x) * axis.x + (center.y - wall.y) * axis.y, 0, length);
}

function repositionOpeningOnWall(opening: Opening, wall: Wall, distanceAlongWall: number) {
  const length = wallLength(wall);
  if (length < minimumWallLength) return;
  const axis = { x: (wall.x2 - wall.x) / length, y: (wall.y2 - wall.y) / length };
  opening.width = Math.min(opening.width, length);
  const halfWidth = opening.width / 2;
  const centerDistance = clamp(distanceAlongWall, halfWidth, Math.max(halfWidth, length - halfWidth));
  placeOpeningAtCenter(
    opening,
    { x: wall.x + axis.x * centerDistance, y: wall.y + axis.y * centerDistance },
    wallAngle(wall),
  );
}

function openingDistancesOnWall(plan: Plan, wall: Wall) {
  return plan.openings
    .filter((opening) => opening.wallId === wall.id)
    .map((opening) => ({ opening, distance: openingDistanceOnWall(opening, wall) }));
}

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
  plan.openings.forEach((opening) => {
    if (opening.wallId !== wall.id) return;
    opening.x += offset.x;
    opening.y += offset.y;
  });
  return true;
}

export function rotateWallInPlan(plan: Plan, id: string, rotation: number) {
  const wall = plan.walls.find((item) => item.id === id);
  if (!wall) return false;
  const attachedOpenings = openingDistancesOnWall(plan, wall);
  const length = wallLength(wall);
  if (length < minimumWallLength) return false;
  const radians = (rotation * Math.PI) / 180;
  wall.rotation = rotation;
  wall.width = length;
  wall.x2 = wall.x + length * Math.cos(radians);
  wall.y2 = wall.y + length * Math.sin(radians);
  attachedOpenings.forEach(({ opening, distance }) => repositionOpeningOnWall(opening, wall, distance));
  return true;
}

export function resizeWallLengthInPlan(plan: Plan, id: string, length: number) {
  const wall = plan.walls.find((item) => item.id === id);
  if (!wall || length < minimumWallLength) return false;
  const radians = (wall.rotation * Math.PI) / 180;
  return resizeWallEndpointInPlan(plan, id, "end", {
    x: wall.x + length * Math.cos(radians),
    y: wall.y + length * Math.sin(radians),
  });
}

export function removePlanObjectInAlternative(alternative: Alternative, id: string) {
  const { plan } = alternative;
  const wallExists = plan.walls.some((wall) => wall.id === id);
  const roomExists = plan.rooms.some((room) => room.id === id);
  const openingExists = plan.openings.some((opening) => opening.id === id);
  const fixtureExists = plan.fixtures.some((fixture) => fixture.id === id);

  if (wallExists) {
    plan.walls = plan.walls.filter((wall) => wall.id !== id);
    plan.openings.forEach((opening) => {
      if (opening.wallId === id) opening.wallId = undefined;
    });
  }
  if (roomExists) {
    plan.rooms = plan.rooms.filter((room) => room.id !== id);
    alternative.roomBoards = alternative.roomBoards.filter((board) => board.roomId !== id);
  }
  if (openingExists) plan.openings = plan.openings.filter((opening) => opening.id !== id);
  if (fixtureExists) plan.fixtures = plan.fixtures.filter((fixture) => fixture.id !== id);
  return wallExists || roomExists || openingExists || fixtureExists;
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
  const attachedOpenings = openingDistancesOnWall(plan, wall);
  const opposite = endpoint === "start" ? { x: wall.x2, y: wall.y2 } : { x: wall.x, y: wall.y };
  if (distance(opposite, nextPoint) < minimumWallLength) return false;
  if (endpoint === "start") {
    wall.x = nextPoint.x;
    wall.y = nextPoint.y;
  } else {
    wall.x2 = nextPoint.x;
    wall.y2 = nextPoint.y;
  }
  wall.width = wallLength(wall);
  wall.rotation = wallAngle(wall);
  attachedOpenings.forEach(({ opening, distance }) => repositionOpeningOnWall(opening, wall, distance));
  return true;
}
