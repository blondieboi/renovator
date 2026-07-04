import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Plan } from "./types";
import { createPlanToWorldTransform } from "./three/planToWorld";
import { roomPoints } from "./utils";

function rotatedRectCenter(rect: { x: number; y: number; width: number; height: number; rotation: number }) {
  const radians = (rect.rotation * Math.PI) / 180;
  return {
    x: rect.x + Math.cos(radians) * (rect.width / 2) - Math.sin(radians) * (rect.height / 2),
    y: rect.y + Math.sin(radians) * (rect.width / 2) + Math.cos(radians) * (rect.height / 2),
  };
}

function ThreePreview({ plan }: { plan: Plan }) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f5ef");
    const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 1200);
    const eyeHeight = 72;
    const lookPitch = Math.atan2(20 - eyeHeight, 190);
    let yaw = 0;
    camera.rotation.order = "YXZ";
    camera.position.set(0, eyeHeight, 190);
    camera.rotation.set(lookPitch, yaw, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#fffdf7", "#9da79b", 1.4);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#ffffff", 1.2);
    sun.position.set(90, 180, 120);
    sun.castShadow = true;
    scene.add(sun);

    const height = plan.scale.ceilingHeightMeters * 24;
    const transform = createPlanToWorldTransform();

    const wallMat = new THREE.MeshStandardMaterial({ color: "#fffdf7", roughness: 0.65 });
    const fixtureMat = new THREE.MeshStandardMaterial({ color: "#7a8379", roughness: 0.55 });

    plan.rooms.forEach((room) => {
      const points = roomPoints(room);
      const shape = new THREE.Shape(
        points.map((point) => {
          const worldPoint = transform.point({ x: room.x + point.x, y: room.y + point.y });
          return new THREE.Vector2(worldPoint.x, worldPoint.z);
        }),
      );
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
      const floorMat = new THREE.MeshStandardMaterial({ color: room.color || "#e4dac8", roughness: 0.88 });
      const mesh = new THREE.Mesh(geometry, floorMat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0;
      scene.add(mesh);
    });

    plan.walls.forEach((wall) => {
      const dx = wall.x2 - wall.x;
      const dy = wall.y2 - wall.y;
      const length = transform.length(Math.hypot(dx, dy));
      const thickness = Math.max(transform.length(wall.thickness), 5);
      const geometry = new THREE.BoxGeometry(length, height, thickness);
      const mesh = new THREE.Mesh(geometry, wallMat);
      const mid = transform.point({ x: (wall.x + wall.x2) / 2, y: (wall.y + wall.y2) / 2 });
      mesh.position.set(mid.x, height / 2, mid.z);
      mesh.rotation.y = -Math.atan2(dy, dx);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });

    plan.openings.forEach((opening) => {
      const center = rotatedRectCenter(opening);
      const pos = transform.point(center);
      const geometry = new THREE.BoxGeometry(transform.length(opening.width), opening.kind === "door" ? height * 0.72 : height * 0.36, 4);
      const material = new THREE.MeshStandardMaterial({
        color: opening.kind === "door" ? "#d8b45a" : "#9fc7d0",
        transparent: opening.kind === "window",
        opacity: opening.kind === "window" ? 0.55 : 1,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pos.x, opening.kind === "door" ? height * 0.36 : height * 0.58, pos.z);
      mesh.rotation.y = transform.rotation(opening.rotation);
      scene.add(mesh);
    });

    plan.fixtures.forEach((fixture) => {
      const center = rotatedRectCenter(fixture);
      const pos = transform.point(center);
      const fixtureHeight = fixture.kind === "stairs" ? 26 : fixture.kind === "counter" ? 20 : 14;
      const geometry = new THREE.BoxGeometry(transform.length(fixture.width), fixtureHeight, transform.length(fixture.height));
      const mesh = new THREE.Mesh(geometry, fixtureMat);
      mesh.position.set(pos.x, fixtureHeight / 2, pos.z);
      mesh.rotation.y = transform.rotation(fixture.rotation);
      scene.add(mesh);
    });

    const keys = new Set<string>();
    const keyDown = (event: KeyboardEvent) => keys.add(event.key.toLowerCase());
    const keyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    let animationFrame = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const delta = clock.getDelta();
      const moveSpeed = 95 * delta;
      const turnSpeed = 1.45 * delta;

      if (keys.has("q")) yaw += turnSpeed;
      if (keys.has("e")) yaw -= turnSpeed;

      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const movement = new THREE.Vector3();
      if (keys.has("w")) movement.add(forward);
      if (keys.has("s")) movement.sub(forward);
      if (keys.has("d")) movement.add(right);
      if (keys.has("a")) movement.sub(right);
      if (movement.lengthSq() > 0) {
        movement.normalize().multiplyScalar(moveSpeed);
        camera.position.add(movement);
        camera.position.y = eyeHeight;
      }

      camera.rotation.set(lookPitch, yaw, 0);
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", handleResize);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [plan]);

  return (
    <div className="three-preview" ref={mountRef}>
      <div className="walkthrough-help">WASD move · Q/E turn</div>
    </div>
  );
}

export default ThreePreview;
