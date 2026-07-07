import * as THREE from "three";
import type { Fixture, Opening, Plan } from "../types";
import { derivePlanTopology, type PlanTopology } from "../topology";
import { createPlanToWorldTransform, type PlanToWorldTransform } from "./planToWorld";
import { buildWallElements } from "./wallGeometry";

function rotatedRectCenter(rect: { x: number; y: number; width: number; height: number; rotation: number }) {
  const radians = (rect.rotation * Math.PI) / 180;
  return {
    x: rect.x + Math.cos(radians) * (rect.width / 2) - Math.sin(radians) * (rect.height / 2),
    y: rect.y + Math.sin(radians) * (rect.width / 2) + Math.cos(radians) * (rect.height / 2),
  };
}

export interface BuiltPlanScene {
  root: THREE.Group;
  topology: PlanTopology;
  bounds: THREE.Box3;
  selectedBounds?: THREE.Box3;
  transform: PlanToWorldTransform;
}

function applyObjectMetadata(object: THREE.Object3D, id: string, kind: string) {
  object.userData.planObjectId = id;
  object.userData.planObjectKind = kind;
}

function selectedMaterial(material: THREE.MeshStandardMaterial, selected: boolean) {
  if (!selected) return material;
  const clone = material.clone();
  clone.emissive = new THREE.Color("#d8b45a");
  clone.emissiveIntensity = 0.16;
  return clone;
}

function addOutline(root: THREE.Group, mesh: THREE.Mesh, selected = false) {
  const geometry = new THREE.EdgesGeometry(mesh.geometry, selected ? 20 : 35);
  const material = new THREE.LineBasicMaterial({
    color: selected ? "#242a27" : "#d8d2c5",
    transparent: true,
    opacity: selected ? 0.95 : 0.38,
  });
  const line = new THREE.LineSegments(geometry, material);
  line.position.copy(mesh.position);
  line.rotation.copy(mesh.rotation);
  line.scale.copy(mesh.scale);
  applyObjectMetadata(line, mesh.userData.planObjectId, "outline");
  root.add(line);
}

function buildRoomFloors(root: THREE.Group, topology: PlanTopology, transform: PlanToWorldTransform, selectedId?: string) {
  topology.rooms.forEach(({ room, points, valid }) => {
    if (points.length < 3) return;
    const shape = new THREE.Shape(
      points.map((point) => {
        const worldPoint = transform.point(point);
        return new THREE.Vector2(worldPoint.x, worldPoint.z);
      }),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: transform.meters(0.035), bevelEnabled: false });
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: valid ? room.color || "#e4dac8" : "#c97969",
      roughness: 0.82,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, selectedMaterial(baseMaterial, selectedId === room.id));
    mesh.name = room.id;
    applyObjectMetadata(mesh, room.id, "room");
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0;
    mesh.receiveShadow = true;
    root.add(mesh);
    addOutline(root, mesh, selectedId === room.id);
  });
}

function buildLooseOpeningPreview(root: THREE.Group, opening: Opening, transform: PlanToWorldTransform, wallHeight: number) {
  const center = rotatedRectCenter(opening);
  const pos = transform.point(center);
  const geometry = new THREE.BoxGeometry(
    transform.length(opening.width),
    opening.kind === "door" ? wallHeight * 0.72 : wallHeight * 0.36,
    4,
  );
  const material = new THREE.MeshStandardMaterial({
    color: opening.kind === "door" ? "#d8b45a" : "#9fc7d0",
    transparent: opening.kind === "window",
    opacity: opening.kind === "window" ? 0.55 : 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = opening.id;
  applyObjectMetadata(mesh, opening.id, opening.kind);
  mesh.position.set(pos.x, opening.kind === "door" ? wallHeight * 0.36 : wallHeight * 0.58, pos.z);
  mesh.rotation.y = transform.rotation(opening.rotation);
  mesh.castShadow = true;
  root.add(mesh);
}

function addFixtureBox(
  group: THREE.Group,
  width: number,
  height: number,
  depth: number,
  y: number,
  material: THREE.Material,
  x = 0,
  z = 0,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + height / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function addFixtureCylinder(
  group: THREE.Group,
  radius: number,
  height: number,
  y: number,
  material: THREE.Material,
  x = 0,
  z = 0,
  scaleZ = 1,
) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y + height / 2, z);
  mesh.scale.z = scaleZ;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function buildFixture(root: THREE.Group, fixture: Fixture, transform: PlanToWorldTransform, material: THREE.Material, selectedId?: string) {
  const center = rotatedRectCenter(fixture);
  const pos = transform.point(center);
  const group = new THREE.Group();
  group.name = fixture.id;
  applyObjectMetadata(group, fixture.id, fixture.kind);
  const width = transform.length(fixture.width);
  const depth = transform.length(fixture.height);
  const low = transform.meters(0.18);
  const mid = transform.meters(0.45);
  const counter = transform.meters(0.9);
  const fixtureMaterial = selectedMaterial(material as THREE.MeshStandardMaterial, selectedId === fixture.id);

  switch (fixture.kind) {
    case "bed":
      addFixtureBox(group, width, low, depth, 0, fixtureMaterial);
      addFixtureBox(group, width * 0.82, transform.meters(0.12), depth * 0.2, low, fixtureMaterial, 0, -depth * 0.32);
      break;
    case "sofa":
      addFixtureBox(group, width, transform.meters(0.28), depth * 0.72, 0, fixtureMaterial, 0, depth * 0.08);
      addFixtureBox(group, width, transform.meters(0.45), depth * 0.14, 0, fixtureMaterial, 0, -depth * 0.36);
      break;
    case "table":
      addFixtureCylinder(group, Math.min(width, depth) * 0.34, transform.meters(0.08), mid, fixtureMaterial, 0, 0, depth / Math.max(width, 1));
      addFixtureCylinder(group, Math.min(width, depth) * 0.06, mid, 0, fixtureMaterial);
      break;
    case "sink":
      addFixtureBox(group, width, transform.meters(0.16), depth, counter - transform.meters(0.16), fixtureMaterial);
      addFixtureCylinder(group, Math.min(width, depth) * 0.22, transform.meters(0.06), counter, fixtureMaterial, 0, 0, depth / Math.max(width, 1));
      break;
    case "toilet":
      addFixtureBox(group, width * 0.62, transform.meters(0.34), depth * 0.22, 0, fixtureMaterial, 0, -depth * 0.34);
      addFixtureCylinder(group, Math.min(width, depth) * 0.24, transform.meters(0.34), 0, fixtureMaterial, 0, depth * 0.1, 1.35);
      break;
    case "shower":
      addFixtureBox(group, width, transform.meters(0.08), depth, 0, fixtureMaterial);
      addFixtureBox(group, transform.meters(0.05), transform.meters(1.9), depth, 0, fixtureMaterial, -width / 2, 0);
      break;
    case "tub":
      addFixtureBox(group, width, transform.meters(0.42), depth, 0, fixtureMaterial);
      addFixtureBox(group, width * 0.82, transform.meters(0.04), depth * 0.68, transform.meters(0.42), fixtureMaterial);
      break;
    case "stairs": {
      const steps = 6;
      for (let index = 0; index < steps; index += 1) {
        addFixtureBox(
          group,
          width,
          transform.meters(0.08) * (index + 1),
          depth / steps,
          0,
          fixtureMaterial,
          0,
          -depth / 2 + (index + 0.5) * (depth / steps),
        );
      }
      break;
    }
    case "counter":
    case "closet":
    default:
      addFixtureBox(group, width, fixture.kind === "closet" ? transform.meters(1.9) : counter, depth, 0, fixtureMaterial);
      break;
  }

  group.position.set(pos.x, 0, pos.z);
  group.rotation.y = transform.rotation(fixture.rotation);
  group.traverse((object) => {
    applyObjectMetadata(object, fixture.id, fixture.kind);
  });
  root.add(group);
  group.children.forEach((child) => {
    if (child instanceof THREE.Mesh) addOutline(group, child, selectedId === fixture.id);
  });
}

function planCenter(topology: PlanTopology) {
  const { bounds } = topology;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

function buildGroundPlane(root: THREE.Group, topology: PlanTopology, transform: PlanToWorldTransform) {
  const { bounds } = topology;
  const width = Math.max(transform.length(bounds.maxX - bounds.minX) + transform.meters(3), transform.meters(6));
  const depth = Math.max(transform.length(bounds.maxY - bounds.minY) + transform.meters(3), transform.meters(6));
  const geometry = new THREE.PlaneGeometry(width, depth);
  const material = new THREE.MeshStandardMaterial({ color: "#efede5", roughness: 0.92 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -transform.meters(0.025);
  mesh.receiveShadow = true;
  mesh.userData.ignoreForFit = true;
  root.add(mesh);

  const grid = new THREE.GridHelper(Math.max(width, depth), 24, "#c8d0c5", "#dfe3dc");
  grid.position.y = -transform.meters(0.02);
  grid.material.opacity = 0.32;
  grid.material.transparent = true;
  grid.userData.ignoreForFit = true;
  root.add(grid);
}

export function buildPlanScene(plan: Plan, selectedId?: string): BuiltPlanScene {
  const root = new THREE.Group();
  root.name = "plan-scene";

  const topology = derivePlanTopology(plan);
  const transform = createPlanToWorldTransform(plan, planCenter(topology));
  const wallHeight = transform.meters(plan.scale.ceilingHeightMeters);
  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: "#fbfaf4", roughness: 0.72 }),
    door: new THREE.MeshStandardMaterial({ color: "#c79b4d", roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({
      color: "#9fc7d0",
      transparent: true,
      opacity: 0.5,
      roughness: 0.08,
      metalness: 0.02,
    }),
    fixture: new THREE.MeshStandardMaterial({ color: "#738074", roughness: 0.58 }),
  };

  buildGroundPlane(root, topology, transform);
  buildRoomFloors(root, topology, transform, selectedId);

  topology.edges.forEach((edge) => {
    const group = buildWallElements(plan, edge, topology, transform, wallHeight, materials);
    if (selectedId === edge.wall.id) {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) {
          object.material = selectedMaterial(object.material, true);
        }
      });
    }
    root.add(group);
  });

  topology.looseOpenings.forEach((opening) => buildLooseOpeningPreview(root, opening, transform, wallHeight));

  plan.fixtures.forEach((fixture) => buildFixture(root, fixture, transform, materials.fixture, selectedId));

  const bounds = new THREE.Box3();
  const selectedBounds = selectedId ? new THREE.Box3() : undefined;
  root.traverse((object) => {
    if (object.userData.ignoreForFit) return;
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      bounds.expandByObject(object);
      if (selectedBounds && object.userData.planObjectId === selectedId) {
        selectedBounds.expandByObject(object);
      }
    }
  });
  if (bounds.isEmpty()) bounds.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(180, 80, 180));

  return {
    root,
    topology,
    bounds,
    selectedBounds: selectedBounds && !selectedBounds.isEmpty() ? selectedBounds : undefined,
    transform,
  };
}
