import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Plan } from "./types";
import { buildPlanScene } from "./three/sceneBuilder";

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

    scene.add(buildPlanScene(plan));

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
      const disposedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => {
            if (disposedMaterials.has(material)) return;
            material.dispose();
            disposedMaterials.add(material);
          });
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
