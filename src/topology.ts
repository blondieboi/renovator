import {
  distance,
  nearestOpeningWall,
  openingCenter,
  openingHandlePoints,
  snapThreshold,
} from "./geometry";
import type { Fixture, Opening, Plan, PlanPoint, Room, Wall } from "./types";
import { roomPoints } from "./utils";

export type TopologyIssueKind =
  | "dangling-wall-end"
  | "near-miss-wall-end"
  | "invalid-room"
  | "stale-opening"
  | "overlapping-openings"
  | "fixture-outside-room";

export interface TopologyIssue {
  kind: TopologyIssueKind;
  objectId: string;
  message: string;
}

export interface WallEndpointRef {
  wallId: string;
  endpoint: "start" | "end";
}

export interface WallJoint {
  id: string;
  point: PlanPoint;
  endpoints: WallEndpointRef[];
  dangling: boolean;
}

export interface WallEdge {
  wall: Wall;
  startJointId: string;
  endJointId: string;
  length: number;
}

export interface OpeningInterval {
  opening: Opening;
  wall: Wall;
  start: number;
  end: number;
  wallDistance: number;
}

export interface RoomTopology {
  room: Room;
  points: PlanPoint[];
  valid: boolean;
  issue?: TopologyIssue;
}

export interface PlanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PlanTopology {
  joints: WallJoint[];
  edges: WallEdge[];
  openingIntervalsByWallId: Map<string, OpeningInterval[]>;
  looseOpenings: Opening[];
  rooms: RoomTopology[];
  bounds: PlanBounds;
  issues: TopologyIssue[];
}

function safeGridSize(plan: Plan) {
  return Number.isFinite(plan.scale.gridSize) && plan.scale.gridSize >= 1 ? plan.scale.gridSize : 26;
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
}

function wallEndpointPoint(wall: Wall, endpoint: "start" | "end"): PlanPoint {
  return endpoint === "start" ? { x: wall.x, y: wall.y } : { x: wall.x2, y: wall.y2 };
}

function emptyBounds(): PlanBounds {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function expandBounds(bounds: PlanBounds | undefined, point: PlanPoint): PlanBounds {
  if (!bounds) return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

function absoluteRoomPoints(room: Room) {
  return roomPoints(room).map((point) => ({ x: room.x + point.x, y: room.y + point.y }));
}

function orientation(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.0001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: PlanPoint, b: PlanPoint, c: PlanPoint) {
  return (
    b.x <= Math.max(a.x, c.x) + 0.0001 &&
    b.x >= Math.min(a.x, c.x) - 0.0001 &&
    b.y <= Math.max(a.y, c.y) + 0.0001 &&
    b.y >= Math.min(a.y, c.y) - 0.0001
  );
}

function segmentsIntersect(a: PlanPoint, b: PlanPoint, c: PlanPoint, d: PlanPoint) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;
  return false;
}

export function isSimplePolygon(points: PlanPoint[]) {
  if (points.length < 3) return false;
  for (let index = 0; index < points.length; index += 1) {
    const nextIndex = (index + 1) % points.length;
    const start = points[index];
    const end = points[nextIndex];
    if (distance(start, end) < 1) return false;
    for (let compare = index + 1; compare < points.length; compare += 1) {
      const compareNext = (compare + 1) % points.length;
      if (index === compare || nextIndex === compare || index === compareNext) continue;
      if (segmentsIntersect(start, end, points[compare], points[compareNext])) return false;
    }
  }
  return true;
}

function pointInPolygon(point: PlanPoint, polygon: PlanPoint[]) {
  let inside = false;
  polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const intersects =
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (intersects) inside = !inside;
  });
  return inside;
}

function rotatedRectCenter(rect: { x: number; y: number; width: number; height: number; rotation: number }) {
  const radians = (rect.rotation * Math.PI) / 180;
  return {
    x: rect.x + Math.cos(radians) * (rect.width / 2) - Math.sin(radians) * (rect.height / 2),
    y: rect.y + Math.sin(radians) * (rect.width / 2) + Math.cos(radians) * (rect.height / 2),
  };
}

function openingIntervalOnWall(opening: Opening, wall: Wall, gridSize: number): OpeningInterval | undefined {
  const length = wallLength(wall);
  if (length <= 0) return undefined;
  const axis = {
    x: (wall.x2 - wall.x) / length,
    y: (wall.y2 - wall.y) / length,
  };
  const center = openingCenter(opening);
  const centerProjection = (center.x - wall.x) * axis.x + (center.y - wall.y) * axis.y;
  const clampedCenterProjection = Math.max(0, Math.min(length, centerProjection));
  const projectedCenter = {
    x: wall.x + axis.x * clampedCenterProjection,
    y: wall.y + axis.y * clampedCenterProjection,
  };
  const wallDistance = distance(center, projectedCenter);
  const tolerance = Math.max(snapThreshold(gridSize) * 3, opening.height * 3, wall.thickness * 3);
  if (wallDistance > tolerance) return undefined;
  if (centerProjection < -opening.width / 2 || centerProjection > length + opening.width / 2) return undefined;

  let start = Math.max(0, centerProjection - opening.width / 2);
  let end = Math.min(length, centerProjection + opening.width / 2);
  if (end - start < 2) {
    const handles = openingHandlePoints(opening);
    const project = (point: PlanPoint) => (point.x - wall.x) * axis.x + (point.y - wall.y) * axis.y;
    start = Math.max(0, Math.min(length, Math.min(project(handles.start), project(handles.end))));
    end = Math.max(0, Math.min(length, Math.max(project(handles.start), project(handles.end))));
  }
  if (end - start < 2) return undefined;
  return { opening, wall, start, end, wallDistance };
}

function resolveOpeningInterval(plan: Plan, opening: Opening, gridSize: number) {
  const attachedWall = opening.wallId ? plan.walls.find((wall) => wall.id === opening.wallId) : undefined;
  const attachedInterval = attachedWall ? openingIntervalOnWall(opening, attachedWall, gridSize) : undefined;
  if (attachedInterval) return attachedInterval;

  return plan.walls
    .map((wall) => openingIntervalOnWall(opening, wall, gridSize))
    .filter((interval): interval is OpeningInterval => Boolean(interval))
    .sort((a, b) => a.wallDistance - b.wallDistance)[0];
}

function buildJoints(plan: Plan, gridSize: number, issues: TopologyIssue[]) {
  const jointThreshold = snapThreshold(gridSize);
  const joints: WallJoint[] = [];
  plan.walls.forEach((wall) => {
    (["start", "end"] as const).forEach((endpoint) => {
      const point = wallEndpointPoint(wall, endpoint);
      const nearest = joints
        .map((joint) => ({ joint, distance: distance(joint.point, point) }))
        .filter((item) => item.distance <= jointThreshold)
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest) {
        if (nearest.distance > 0.001) {
          issues.push({
            kind: "near-miss-wall-end",
            objectId: wall.id,
            message: "Wall endpoint is close to another endpoint but not exactly connected.",
          });
        }
        nearest.joint.endpoints.push({ wallId: wall.id, endpoint });
        const count = nearest.joint.endpoints.length;
        nearest.joint.point = {
          x: (nearest.joint.point.x * (count - 1) + point.x) / count,
          y: (nearest.joint.point.y * (count - 1) + point.y) / count,
        };
      } else {
        joints.push({
          id: `joint_${joints.length}`,
          point,
          endpoints: [{ wallId: wall.id, endpoint }],
          dangling: false,
        });
      }
    });
  });
  joints.forEach((joint) => {
    joint.dangling = joint.endpoints.length < 2;
    if (joint.dangling) {
      issues.push({
        kind: "dangling-wall-end",
        objectId: joint.endpoints[0]?.wallId ?? joint.id,
        message: "Wall endpoint is not connected to another wall endpoint.",
      });
    }
  });
  return joints;
}

function buildBounds(plan: Plan) {
  let bounds: PlanBounds | undefined;
  plan.walls.forEach((wall) => {
    bounds = expandBounds(bounds, { x: wall.x, y: wall.y });
    bounds = expandBounds(bounds, { x: wall.x2, y: wall.y2 });
  });
  plan.rooms.forEach((room) => {
    absoluteRoomPoints(room).forEach((point) => {
      bounds = expandBounds(bounds, point);
    });
  });
  plan.openings.forEach((opening) => {
    const center = rotatedRectCenter(opening);
    bounds = expandBounds(bounds, center);
  });
  plan.fixtures.forEach((fixture) => {
    bounds = expandBounds(bounds, { x: fixture.x, y: fixture.y });
    bounds = expandBounds(bounds, { x: fixture.x + fixture.width, y: fixture.y + fixture.height });
  });
  return bounds ?? emptyBounds();
}

function fixtureCenter(fixture: Fixture) {
  return rotatedRectCenter(fixture);
}

export function findWallEndpointJoint(topology: PlanTopology, wallId: string, endpoint: "start" | "end") {
  return topology.joints.find((joint) =>
    joint.endpoints.some((item) => item.wallId === wallId && item.endpoint === endpoint),
  );
}

export function derivePlanTopology(plan: Plan): PlanTopology {
  const gridSize = safeGridSize(plan);
  const issues: TopologyIssue[] = [];
  const joints = buildJoints(plan, gridSize, issues);
  const edgeByWallId = new Map<string, WallEdge>();
  plan.walls.forEach((wall) => {
    const startJoint = joints.find((joint) =>
      joint.endpoints.some((endpoint) => endpoint.wallId === wall.id && endpoint.endpoint === "start"),
    );
    const endJoint = joints.find((joint) =>
      joint.endpoints.some((endpoint) => endpoint.wallId === wall.id && endpoint.endpoint === "end"),
    );
    if (!startJoint || !endJoint) return;
    edgeByWallId.set(wall.id, {
      wall,
      startJointId: startJoint.id,
      endJointId: endJoint.id,
      length: wallLength(wall),
    });
  });

  const openingIntervalsByWallId = new Map<string, OpeningInterval[]>();
  const looseOpenings: Opening[] = [];
  plan.openings.forEach((opening) => {
    const interval = resolveOpeningInterval(plan, opening, gridSize);
    if (!interval) {
      looseOpenings.push(opening);
      issues.push({
        kind: "stale-opening",
        objectId: opening.id,
        message: "Opening is not attached to a wall.",
      });
      return;
    }
    if (opening.wallId && opening.wallId !== interval.wall.id) {
      issues.push({
        kind: "stale-opening",
        objectId: opening.id,
        message: "Opening wall reference does not match the nearest valid wall interval.",
      });
    }
    const intervals = openingIntervalsByWallId.get(interval.wall.id) ?? [];
    intervals.push(interval);
    openingIntervalsByWallId.set(interval.wall.id, intervals);
  });

  openingIntervalsByWallId.forEach((intervals) => {
    intervals.sort((a, b) => a.start - b.start);
    intervals.forEach((interval, index) => {
      const previous = intervals[index - 1];
      if (previous && interval.start < previous.end) {
        issues.push({
          kind: "overlapping-openings",
          objectId: interval.opening.id,
          message: "Opening overlaps another opening on the same wall.",
        });
      }
    });
  });

  const rooms = plan.rooms.map<RoomTopology>((room) => {
    const points = absoluteRoomPoints(room);
    const valid = isSimplePolygon(points);
    const issue = valid
      ? undefined
      : {
          kind: "invalid-room" as const,
          objectId: room.id,
          message: "Room polygon is too small or self-intersecting.",
        };
    if (issue) issues.push(issue);
    return { room, points, valid, issue };
  });

  plan.fixtures.forEach((fixture) => {
    const center = fixtureCenter(fixture);
    if (rooms.length > 0 && !rooms.some((room) => room.valid && pointInPolygon(center, room.points))) {
      issues.push({
        kind: "fixture-outside-room",
        objectId: fixture.id,
        message: "Fixture center is outside every valid room.",
      });
    }
  });

  return {
    joints,
    edges: [...edgeByWallId.values()],
    openingIntervalsByWallId,
    looseOpenings,
    rooms,
    bounds: buildBounds(plan),
    issues,
  };
}

export function resolveOpeningWallIdFromTopology(topology: PlanTopology, opening: Opening) {
  for (const [wallId, intervals] of topology.openingIntervalsByWallId.entries()) {
    if (intervals.some((interval) => interval.opening.id === opening.id)) return wallId;
  }
  return undefined;
}

export function openingWallFallback(plan: Plan, opening: Opening) {
  return nearestOpeningWall(opening, plan.walls, snapThreshold(safeGridSize(plan)) * 3)?.wall.id;
}
