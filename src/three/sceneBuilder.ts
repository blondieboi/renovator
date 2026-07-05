import * as THREE from "three";
import type { Fixture, Opening, Plan } from "../types";
import { roomPoints } from "../utils";
import { createPlanToWorldTransform, type PlanToWorldTransform } from "./planToWorld";
import { buildWallElements, resolveOpeningWallId } from "./wallGeometry";

function rotatedRectCenter(rect: { x: number; y: number; width: number; height: number; rotation: number }) {
  const radians = (rect.rotation * Math.PI) / 180;
  return {
    x: rect.x + Math.cos(radians) * (rect.width / 2) - Math.sin(radians) * (rect.height / 2),
    y: rect.y + Math.sin(radians) * (rect.width / 2) + Math.cos(radians) * (rect.height / 2),
  };
}

function buildRoomFloors(root: THREE.Group, plan: Plan, transform: PlanToWorldTransform) {
  plan.rooms.forEach((room) => {
    const points = roomPoints(room);
    const shape = new THREE.Shape(
      points.map((point) => {
        const worldPoint = transform.point({ x: room.x + point.x, y: room.y + point.y });
        return new THREE.Vector2(worldPoint.x, worldPoint.z);
      }),
    );
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
    const material = new THREE.MeshStandardMaterial({ color: room.color || "#e4dac8", roughness: 0.88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0;
    root.add(mesh);
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
  mesh.position.set(pos.x, opening.kind === "door" ? wallHeight * 0.36 : wallHeight * 0.58, pos.z);
  mesh.rotation.y = transform.rotation(opening.rotation);
  root.add(mesh);
}

function buildFixture(root: THREE.Group, fixture: Fixture, transform: PlanToWorldTransform, material: THREE.Material) {
  const center = rotatedRectCenter(fixture);
  const pos = transform.point(center);
  const fixtureHeight = fixture.kind === "stairs" ? 26 : fixture.kind === "counter" ? 20 : 14;
  const geometry = new THREE.BoxGeometry(
    transform.length(fixture.width),
    fixtureHeight,
    transform.length(fixture.height),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(pos.x, fixtureHeight / 2, pos.z);
  mesh.rotation.y = transform.rotation(fixture.rotation);
  root.add(mesh);
}

export function buildPlanScene(plan: Plan) {
  const root = new THREE.Group();
  root.name = "plan-scene";

  const transform = createPlanToWorldTransform();
  const wallHeight = plan.scale.ceilingHeightMeters * 24;
  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: "#fffdf7", roughness: 0.65 }),
    door: new THREE.MeshStandardMaterial({ color: "#d8b45a", roughness: 0.52 }),
    glass: new THREE.MeshStandardMaterial({ color: "#9fc7d0", transparent: true, opacity: 0.55, roughness: 0.2 }),
    fixture: new THREE.MeshStandardMaterial({ color: "#7a8379", roughness: 0.55 }),
  };

  buildRoomFloors(root, plan, transform);

  plan.walls.forEach((wall) => {
    root.add(buildWallElements(plan, wall, transform, wallHeight, materials));
  });

  plan.openings
    .filter((opening) => !resolveOpeningWallId(plan, opening))
    .forEach((opening) => buildLooseOpeningPreview(root, opening, transform, wallHeight));

  plan.fixtures.forEach((fixture) => buildFixture(root, fixture, transform, materials.fixture));

  return root;
}
