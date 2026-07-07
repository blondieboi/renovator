import { Eye, Footprints, Maximize2, Rotate3D } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Plan } from "./types";
import { buildPlanScene } from "./three/sceneBuilder";

type CameraMode = "orbit" | "walk";
type ViewPreset = "isometric" | "top";

function ThreePreview({
  plan,
  selectedId,
  onSelect,
}: {
  plan: Plan;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fitViewRef = useRef<((preset?: ViewPreset) => void) | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [viewPreset, setViewPreset] = useState<ViewPreset>("isometric");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f7f5ef");
    const camera = new THREE.PerspectiveCamera(54, mount.clientWidth / mount.clientHeight, 0.1, 3000);
    const eyeHeight = 56;
    const lookPitch = Math.atan2(20 - eyeHeight, 190);
    let yaw = 0;
    camera.rotation.order = "YXZ";

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.HemisphereLight("#fffdf7", "#9da79b", 1.15);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight("#fff8eb", 2.1);
    sun.position.set(130, 230, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -420;
    sun.shadow.camera.right = 420;
    sun.shadow.camera.top = 420;
    sun.shadow.camera.bottom = -420;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.00035;
    scene.add(sun);

    const builtScene = buildPlanScene(plan, selectedId ?? undefined);
    scene.add(builtScene.root);

    const orbitState = {
      target: new THREE.Vector3(),
      radius: 220,
      theta: 0,
      phi: Math.PI / 3,
      dragging: false,
      moved: false,
      lastX: 0,
      lastY: 0,
    };
    const updateOrbitCamera = () => {
      const sinPhi = Math.sin(orbitState.phi);
      camera.position.set(
        orbitState.target.x + orbitState.radius * sinPhi * Math.sin(orbitState.theta),
        orbitState.target.y + orbitState.radius * Math.cos(orbitState.phi),
        orbitState.target.z + orbitState.radius * sinPhi * Math.cos(orbitState.theta),
      );
      camera.lookAt(orbitState.target);
    };
    const setOrbitFromCamera = (target: THREE.Vector3) => {
      const offset = camera.position.clone().sub(target);
      orbitState.target.copy(target);
      orbitState.radius = Math.max(60, offset.length());
      orbitState.theta = Math.atan2(offset.x, offset.z);
      orbitState.phi = Math.max(0.08, Math.min(Math.PI / 2.05, Math.acos(offset.y / orbitState.radius)));
    };
    const setYawToward = (target: THREE.Vector3) => {
      const direction = target.clone().sub(camera.position);
      direction.y = 0;
      if (direction.lengthSq() < 0.001) return;
      direction.normalize();
      yaw = Math.atan2(-direction.x, -direction.z);
    };
    const fitWalkCamera = () => {
      const box = builtScene.bounds;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxPlanSize = Math.max(size.x, size.z, 120);
      const offset = Math.max(maxPlanSize * 0.62, 120);
      camera.up.set(0, 1, 0);
      camera.position.set(center.x, eyeHeight, center.z + offset);
      setYawToward(center);
      camera.rotation.set(lookPitch, yaw, 0);
    };

    const fitCamera = (preset: ViewPreset = viewPreset) => {
      const box = builtScene.bounds;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxPlanSize = Math.max(size.x, size.z, 120);
      const distance = Math.max(180, maxPlanSize / Math.tan((camera.fov * Math.PI) / 360));
      if (preset === "top") {
        camera.position.set(center.x, distance * 0.9, center.z + 0.01);
        camera.up.set(0, 0, -1);
      } else {
        camera.up.set(0, 1, 0);
        camera.position.set(center.x + distance * 0.46, Math.max(distance * 0.36, 125), center.z + distance * 0.62);
      }
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      setOrbitFromCamera(center);
      setYawToward(center);
    };
    fitViewRef.current = fitCamera;
    fitCamera(viewPreset);
    if (cameraMode === "walk") fitWalkCamera();

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

      if (cameraMode === "walk") {
        camera.up.set(0, 1, 0);
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
      } else {
        updateOrbitCamera();
      }

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      fitCamera(viewPreset);
    };
    window.addEventListener("resize", handleResize);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      if (cameraMode === "orbit") {
        orbitState.dragging = true;
        orbitState.moved = false;
        orbitState.lastX = event.clientX;
        orbitState.lastY = event.clientY;
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!orbitState.dragging || cameraMode !== "orbit") return;
      const dx = event.clientX - orbitState.lastX;
      const dy = event.clientY - orbitState.lastY;
      orbitState.moved = orbitState.moved || Math.abs(dx) + Math.abs(dy) > 3;
      orbitState.lastX = event.clientX;
      orbitState.lastY = event.clientY;
      orbitState.theta -= dx * 0.006;
      orbitState.phi = Math.max(0.08, Math.min(Math.PI / 2.05, orbitState.phi + dy * 0.006));
      updateOrbitCamera();
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (cameraMode === "orbit") {
        orbitState.dragging = false;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
      }
      if (orbitState.moved) return;
      if (!onSelect) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObjects(builtScene.root.children, true)
        .find((item) => item.object.userData.planObjectId);
      onSelect(hit?.object.userData.planObjectId ?? null);
    };
    const handleWheel = (event: WheelEvent) => {
      if (cameraMode !== "orbit") return;
      event.preventDefault();
      orbitState.radius = Math.max(60, Math.min(1400, orbitState.radius * (1 + event.deltaY * 0.001)));
      updateOrbitCamera();
    };
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      fitViewRef.current = null;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("wheel", handleWheel);
      const disposedMaterials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
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
  }, [cameraMode, onSelect, plan, selectedId, viewPreset]);

  function applyPreset(preset: ViewPreset) {
    setCameraMode("orbit");
    setViewPreset(preset);
    fitViewRef.current?.(preset);
  }

  function fitOrbitView() {
    setCameraMode("orbit");
    fitViewRef.current?.(viewPreset);
  }

  return (
    <div className="three-preview" ref={mountRef}>
      <div className="three-controls" aria-label="3D controls">
        <button type="button" onClick={() => applyPreset("isometric")} aria-label="Isometric view" title="Isometric view">
          <Rotate3D size={16} />
        </button>
        <button type="button" onClick={() => applyPreset("top")} aria-label="Top view" title="Top view">
          <Eye size={16} />
        </button>
        <button type="button" onClick={fitOrbitView} aria-label="Fit view" title="Fit view">
          <Maximize2 size={16} />
        </button>
        <button
          type="button"
          className={cameraMode === "walk" ? "active" : ""}
          onClick={() => setCameraMode((current) => (current === "walk" ? "orbit" : "walk"))}
          aria-label="Walk mode"
          title="Walk mode"
        >
          <Footprints size={16} />
        </button>
      </div>
    </div>
  );
}

export default ThreePreview;
