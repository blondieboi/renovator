import * as THREE from "three";
import { safePixelsPerMeter } from "../model";
import type { Plan } from "../types";
import type { PlanPoint } from "../types";

export const WORLD_UNITS_PER_METER = 32;

export interface PlanToWorldTransform {
  center: PlanPoint;
  scale: number;
  point(point: PlanPoint): THREE.Vector3;
  length(value: number): number;
  meters(value: number): number;
  rotation(degrees: number): number;
}

export function createPlanToWorldTransform(plan: Plan, center: PlanPoint): PlanToWorldTransform {
  const scale = WORLD_UNITS_PER_METER / safePixelsPerMeter(plan);
  return {
    center,
    scale,
    point(point: PlanPoint) {
      return new THREE.Vector3((point.x - center.x) * scale, 0, (point.y - center.y) * scale);
    },
    length(value: number) {
      return value * scale;
    },
    meters(value: number) {
      return value * WORLD_UNITS_PER_METER;
    },
    rotation(degrees: number) {
      return -(degrees * Math.PI) / 180;
    },
  };
}
