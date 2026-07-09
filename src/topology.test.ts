import { derivePlanTopology, isSimplePolygon } from "./topology";
import type { Plan } from "./types";

function testPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    scale: {
      pixelsPerMeter: 50,
      gridSize: 25,
      ceilingHeightMeters: 2.5,
      ...overrides.scale,
    },
    walls: [],
    openings: [],
    rooms: [],
    fixtures: [],
    ...overrides,
  };
}

export const topologyTestCases = [
  {
    name: "groups connected wall endpoints",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          walls: [
            {
              id: "wall_a",
              kind: "wall",
              name: "Wall",
              x: 0,
              y: 0,
              x2: 100,
              y2: 0,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 0,
            },
            {
              id: "wall_b",
              kind: "wall",
              name: "Wall",
              x: 100,
              y: 0,
              x2: 100,
              y2: 100,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 90,
            },
          ],
        }),
      );
      return topology.joints.some((joint) => joint.endpoints.length === 2);
    },
  },
  {
    name: "detects near-miss endpoints",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          walls: [
            {
              id: "wall_a",
              kind: "wall",
              name: "Wall",
              x: 0,
              y: 0,
              x2: 100,
              y2: 0,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 0,
            },
            {
              id: "wall_b",
              kind: "wall",
              name: "Wall",
              x: 108,
              y: 0,
              x2: 108,
              y2: 100,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 90,
            },
          ],
        }),
      );
      return topology.issues.some((issue) => issue.kind === "near-miss-wall-end");
    },
  },
  {
    name: "does not treat near-miss endpoints as a movable shared joint",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          walls: [
            {
              id: "wall_a",
              kind: "wall",
              name: "Wall",
              x: 0,
              y: 0,
              x2: 100,
              y2: 0,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 0,
            },
            {
              id: "wall_b",
              kind: "wall",
              name: "Wall",
              x: 108,
              y: 0,
              x2: 108,
              y2: 100,
              width: 100,
              height: 12,
              thickness: 12,
              rotation: 90,
            },
          ],
        }),
      );
      return !topology.joints.some((joint) => joint.endpoints.some((item) => item.wallId === "wall_a" && item.endpoint === "end") && joint.endpoints.some((item) => item.wallId === "wall_b" && item.endpoint === "start"));
    },
  },
  {
    name: "rejects self-intersecting polygons",
    run() {
      return !isSimplePolygon([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 100, y: 0 },
      ]);
    },
  },
  {
    name: "detects stale openings",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          openings: [
            {
              id: "door_a",
              kind: "door",
              name: "Door",
              x: 200,
              y: 200,
              width: 50,
              height: 12,
              rotation: 0,
              wallId: "missing",
            },
          ],
        }),
      );
      return topology.issues.some((issue) => issue.kind === "stale-opening");
    },
  },
  {
    name: "detects overlapping openings",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          walls: [
            {
              id: "wall_a",
              kind: "wall",
              name: "Wall",
              x: 0,
              y: 0,
              x2: 180,
              y2: 0,
              width: 180,
              height: 12,
              thickness: 12,
              rotation: 0,
            },
          ],
          openings: [
            {
              id: "door_a",
              kind: "door",
              name: "Door",
              x: 50,
              y: -6,
              width: 60,
              height: 12,
              rotation: 0,
              wallId: "wall_a",
            },
            {
              id: "door_b",
              kind: "door",
              name: "Door",
              x: 80,
              y: -6,
              width: 60,
              height: 12,
              rotation: 0,
              wallId: "wall_a",
            },
          ],
        }),
      );
      return topology.issues.some((issue) => issue.kind === "overlapping-openings");
    },
  },
  {
    name: "detects fixture centers outside valid rooms",
    run() {
      const topology = derivePlanTopology(
        testPlan({
          rooms: [
            {
              id: "room_a",
              kind: "room",
              name: "Room",
              x: 0,
              y: 0,
              width: 100,
              height: 100,
              rotation: 0,
              color: "#ffffff",
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 },
              ],
            },
          ],
          fixtures: [
            {
              id: "fixture_a",
              kind: "bed",
              name: "Bed",
              x: 160,
              y: 160,
              width: 50,
              height: 70,
              rotation: 0,
            },
          ],
        }),
      );
      return topology.issues.some((issue) => issue.kind === "fixture-outside-room");
    },
  },
];
