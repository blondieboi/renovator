import * as THREE from "three";
import { openingHandlePoints } from "../geometry";
import type { Opening, Plan, Wall } from "../types";
import type { OpeningInterval, PlanTopology, WallEdge, WallJoint } from "../topology";
import type { PlanToWorldTransform } from "./planToWorld";

interface WallGeometryMaterials {
  wall: THREE.Material;
  door: THREE.Material;
  glass: THREE.Material;
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
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
  mesh.name = wall.id;
  mesh.userData.planObjectId = wall.id;
  mesh.userData.planObjectKind = "wall";
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
  mesh.name = opening.id;
  mesh.userData.planObjectId = opening.id;
  mesh.userData.planObjectKind = opening.kind;
  mesh.position.set(pos.x, yCenter, pos.z);
  mesh.rotation.y = -Math.atan2(wall.y2 - wall.y, wall.x2 - wall.x);
  mesh.castShadow = true;
  group.add(mesh);
}

function addWallJointCap(
  group: THREE.Group,
  joint: WallJoint,
  topology: PlanTopology,
  transform: PlanToWorldTransform,
  material: THREE.Material,
  height: number,
) {
  if (joint.endpoints.length < 2) return;
  const walls = joint.endpoints
    .map((endpoint) => topology.edges.find((edge) => edge.wall.id === endpoint.wallId)?.wall)
    .filter((wall): wall is Wall => Boolean(wall));
  const maxThickness = Math.max(...walls.map((wall) => transform.length(wall.thickness)), 5);
  const pos = transform.point(joint.point);
  const geometry = new THREE.BoxGeometry(maxThickness, height, maxThickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = joint.id;
  mesh.userData.planObjectKind = "wall-joint";
  mesh.position.set(pos.x, height / 2, pos.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addEdgeOutline(group: THREE.Group, mesh: THREE.Mesh, color = "#d7d0c4") {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 35);
  const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42 }));
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  line.userData.planObjectId = mesh.userData.planObjectId;
  line.userData.planObjectKind = "outline";
  group.add(line);
}

export function buildWallElements(
  plan: Plan,
  edge: WallEdge,
  topology: PlanTopology,
  transform: PlanToWorldTransform,
  wallHeight: number,
  materials: WallGeometryMaterials,
) {
  const group = new THREE.Group();
  const wall = edge.wall;
  const length = wallLength(wall);
  const openings = topology.openingIntervalsByWallId.get(wall.id) ?? [];

  let cursor = 0;
  openings.forEach((interval) => {
    addWallSegment(group, wall, transform, materials.wall, cursor, interval.start, wallHeight);

    if (interval.opening.kind === "window") {
      const sillHeight = Math.min(transform.meters(0.9), wallHeight * 0.48);
      const windowHeight = Math.min(transform.meters(1.1), wallHeight - sillHeight - transform.meters(0.18));
      const headerStart = sillHeight + windowHeight;
      addWallSegment(group, wall, transform, materials.wall, interval.start, interval.end, sillHeight);
      addWallSegment(group, wall, transform, materials.wall, interval.start, interval.end, wallHeight - headerStart, headerStart);
      addOpeningPanel(group, wall, interval.opening, transform, materials.glass, windowHeight, sillHeight + windowHeight / 2);
    }

    if (interval.opening.kind === "door") {
      const doorHeight = Math.min(transform.meters(2.05), wallHeight * 0.86);
      addWallSegment(group, wall, transform, materials.wall, interval.start, interval.end, wallHeight - doorHeight, doorHeight);
      addOpeningPanel(group, wall, interval.opening, transform, materials.door, transform.meters(0.04), transform.meters(0.02));
    }

    cursor = Math.max(cursor, interval.end);
  });

  addWallSegment(group, wall, transform, materials.wall, cursor, length, wallHeight);
  [edge.startJointId, edge.endJointId].forEach((jointId) => {
    const joint = topology.joints.find((item) => item.id === jointId);
    if (joint) addWallJointCap(group, joint, topology, transform, materials.wall, wallHeight);
  });
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.userData.planObjectKind === "wall") addEdgeOutline(group, object);
  });
  return group;
}
