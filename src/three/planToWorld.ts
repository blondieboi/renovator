import * as THREE from "three";
import type { PlanPoint } from "../types";

const DEFAULT_CENTER = { x: 500, y: 360 };
const DEFAULT_SCALE = 0.5;

export interface PlanToWorldTransform {
  point(point: PlanPoint): THREE.Vector3;
  length(value: number): number;
  rotation(degrees: number): number;
}

export function createPlanToWorldTransform(center = DEFAULT_CENTER, scale = DEFAULT_SCALE): PlanToWorldTransform {
  return {
    point(point: PlanPoint) {
      return new THREE.Vector3((point.x - center.x) * scale, 0, (point.y - center.y) * scale);
    },
    length(value: number) {
      return value * scale;
    },
    rotation(degrees: number) {
      return -(degrees * Math.PI) / 180;
    },
  };
}
