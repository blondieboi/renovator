import * as THREE from "three";
import { distance, nearestOpeningWall, openingCenter, openingHandlePoints, snapThreshold } from "../geometry";
import type { Opening, Plan, Wall } from "../types";
import type { PlanToWorldTransform } from "./planToWorld";

interface WallGeometryMaterials {
  wall: THREE.Material;
  door: THREE.Material;
  glass: THREE.Material;
}

interface OpeningInterval {
  opening: Opening;
  start: number;
  end: number;
  wallDistance: number;
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
}

function safeGridSize(plan: Plan) {
  return Number.isFinite(plan.scale.gridSize) && plan.scale.gridSize >= 1 ? plan.scale.gridSize : 26;
}

export function resolveOpeningWallId(plan: Plan, opening: Opening) {
  const intervalMatches = plan.walls
    .map((wall) => ({ wall, interval: openingIntervalOnWall(opening, wall, safeGridSize(plan)) }))
    .filter((match): match is { wall: Wall; interval: OpeningInterval } => Boolean(match.interval))
    .sort((a, b) => {
      if (a.wall.id === opening.wallId) return -1;
      if (b.wall.id === opening.wallId) return 1;
      return a.interval.wallDistance - b.interval.wallDistance;
    });
  if (intervalMatches[0]) return intervalMatches[0].wall.id;
  return nearestOpeningWall(opening, plan.walls, snapThreshold(safeGridSize(plan)) * 3)?.wall.id;
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
    const project = (point: { x: number; y: number }) => (point.x - wall.x) * axis.x + (point.y - wall.y) * axis.y;
    start = Math.max(0, Math.min(length, Math.min(project(handles.start), project(handles.end))));
    end = Math.max(0, Math.min(length, Math.max(project(handles.start), project(handles.end))));
  }

  if (end - start < 2) return undefined;
  return { opening, start, end, wallDistance };
}

function addWallSegment(
  group: THREE.Group,
  wall: Wall,
  transform: PlanToWorldTransform,
  material: THREE.Material,
  start: number,
  end: number,
  height: number,
  yOffset = 0,
) {
  const segmentLength = end - start;
  if (segmentLength < 2 || height <= 0) return;

  const wallPlanLength = wallLength(wall);
  if (wallPlanLength <= 0) return;

  const axis = {
    x: (wall.x2 - wall.x) / wallPlanLength,
    y: (wall.y2 - wall.y) / wallPlanLength,
  };
  const midDistance = start + segmentLength / 2;
  const mid = transform.point({
    x: wall.x + axis.x * midDistance,
    y: wall.y + axis.y * midDistance,
  });
  const thickness = Math.max(transform.length(wall.thickness), 5);
  const geometry = new THREE.BoxGeometry(transform.length(segmentLength), height, thickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(mid.x, yOffset + height / 2, mid.z);
  mesh.rotation.y = -Math.atan2(wall.y2 - wall.y, wall.x2 - wall.x);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addOpeningPanel(
  group: THREE.Group,
  wall: Wall,
  opening: Opening,
  transform: PlanToWorldTransform,
  material: THREE.Material,
  height: number,
  yCenter: number,
) {
  const handles = openingHandlePoints(opening);
  const center = {
    x: (handles.start.x + handles.end.x) / 2,
    y: (handles.start.y + handles.end.y) / 2,
  };
  const pos = transform.point(center);
  const geometry = new THREE.BoxGeometry(transform.length(opening.width), height, 3);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos.x, yCenter, pos.z);
  mesh.rotation.y = -Math.atan2(wall.y2 - wall.y, wall.x2 - wall.x);
  group.add(mesh);
}

export function buildWallElements(
  plan: Plan,
  wall: Wall,
  transform: PlanToWorldTransform,
  wallHeight: number,
  materials: WallGeometryMaterials,
) {
  const group = new THREE.Group();
  const length = wallLength(wall);
  const gridSize = safeGridSize(plan);
  const openings = plan.openings
    .filter((opening) => resolveOpeningWallId(plan, opening) === wall.id)
    .map((opening) => openingIntervalOnWall(opening, wall, gridSize))
    .filter((opening): opening is OpeningInterval => Boolean(opening))
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  openings.forEach((interval) => {
    addWallSegment(group, wall, transform, materials.wall, cursor, interval.start, wallHeight);

    if (interval.opening.kind === "window") {
      const sillHeight = wallHeight * 0.4;
      const windowHeight = wallHeight * 0.36;
      const headerStart = sillHeight + windowHeight;
      addWallSegment(group, wall, transform, materials.wall, interval.start, interval.end, sillHeight);
      addWallSegment(group, wall, transform, materials.wall, interval.start, interval.end, wallHeight - headerStart, headerStart);
      addOpeningPanel(group, wall, interval.opening, transform, materials.glass, windowHeight, sillHeight + windowHeight / 2);
    }

    if (interval.opening.kind === "door") {
      addOpeningPanel(group, wall, interval.opening, transform, materials.door, 3, 1.5);
    }

    cursor = Math.max(cursor, interval.end);
  });

  addWallSegment(group, wall, transform, materials.wall, cursor, length, wallHeight);
  return group;
}
