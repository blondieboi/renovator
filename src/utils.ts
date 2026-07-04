import type { Alternative, Asset, FixtureKind, Plan, PlanPoint, PropertyProject, Room, RoomBoard } from "./types";

export const fixtureLabels: Record<FixtureKind, string> = {
  counter: "Counter",
  sink: "Sink",
  toilet: "Toilet",
  shower: "Shower",
  tub: "Tub",
  stairs: "Stairs",
  closet: "Closet",
  sofa: "Sofa",
  bed: "Bed",
  table: "Table",
};

export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function emptyPlan(): Plan {
  return {
    scale: {
      pixelsPerMeter: 52,
      gridSize: 26,
      ceilingHeightMeters: 2.55,
    },
    walls: [],
    openings: [],
    rooms: [],
    fixtures: [],
  };
}

export function createAlternative(name = "Original sketch"): Alternative {
  return {
    id: uid("alternative"),
    name,
    createdAt: nowIso(),
    plan: emptyPlan(),
    roomBoards: [],
  };
}

export function createRoomBoard(roomId: string): RoomBoard {
  return { roomId, photos: [], renderOutputs: [], prompts: [], notes: "" };
}

export function createStarterProjects(): PropertyProject[] {
  return [
    {
      id: uid("property"),
      name: "Apartment",
      type: "Apartment",
      updatedAt: nowIso(),
      floors: [
        {
          id: uid("floor"),
          name: "Main floor",
          level: 0,
          alternatives: [createAlternative("Current layout")],
        },
      ],
    },
    {
      id: uid("property"),
      name: "House",
      type: "House",
      updatedAt: nowIso(),
      floors: [
        {
          id: uid("floor"),
          name: "Ground floor",
          level: 0,
          alternatives: [createAlternative("Current layout")],
        },
      ],
    },
  ];
}

export function metersFromPixels(pixels: number, pixelsPerMeter: number) {
  return pixels / pixelsPerMeter;
}

export function rectangleRoomPoints(room: { width: number; height: number }): PlanPoint[] {
  return [
    { x: 0, y: 0 },
    { x: room.width, y: 0 },
    { x: room.width, y: room.height },
    { x: 0, y: room.height },
  ];
}

export function roomPoints(room: Room): PlanPoint[] {
  return room.points?.length ? room.points : rectangleRoomPoints(room);
}

export function flattenPoints(points: PlanPoint[]) {
  return points.flatMap((point) => [point.x, point.y]);
}

export function polygonArea(points: PlanPoint[]) {
  if (points.length < 3) return 0;
  const sum = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  return Math.abs(sum) / 2;
}

function polygonCentroid(points: PlanPoint[]) {
  let signedArea = 0;
  let x = 0;
  let y = 0;

  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.y - next.x * point.y;
    signedArea += cross;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  });

  if (Math.abs(signedArea) < 0.001) return undefined;
  return { x: x / (3 * signedArea), y: y / (3 * signedArea) };
}

function isPointInsidePolygon(point: PlanPoint, points: PlanPoint[]) {
  let inside = false;
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    const intersects =
      start.y > point.y !== end.y > point.y &&
      point.x < ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x;
    if (intersects) inside = !inside;
  });
  return inside;
}

function distanceToSegment(point: PlanPoint, start: PlanPoint, end: PlanPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
    : 0;
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function distanceToPolygonEdge(point: PlanPoint, points: PlanPoint[]) {
  return points.reduce((closest, start, index) => {
    const end = points[(index + 1) % points.length];
    return Math.min(closest, distanceToSegment(point, start, end));
  }, Infinity);
}

export function roomLabelPoint(room: Room): PlanPoint {
  const points = roomPoints(room);
  if (points.length < 3) return { x: 10, y: 10 };

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const candidates = [
    polygonCentroid(points),
    { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  ].filter((point): point is PlanPoint => Boolean(point));

  const width = maxX - minX;
  const height = maxY - minY;
  const gridStep = Math.max(8, Math.min(width, height) / 10);
  for (let y = minY + gridStep / 2; y < maxY; y += gridStep) {
    for (let x = minX + gridStep / 2; x < maxX; x += gridStep) {
      candidates.push({ x, y });
    }
  }

  let best = candidates.find((point) => isPointInsidePolygon(point, points));
  let bestDistance = best ? distanceToPolygonEdge(best, points) : -1;
  candidates.forEach((point) => {
    if (!isPointInsidePolygon(point, points)) return;
    const distance = distanceToPolygonEdge(point, points);
    if (distance > bestDistance) {
      best = point;
      bestDistance = distance;
    }
  });

  if (!best) return { x: Math.max(10, minX), y: Math.max(10, minY) };

  let bestPoint = best;
  let step = gridStep / 2;
  while (step >= 1) {
    const nearby: PlanPoint[] = [
      { x: bestPoint.x - step, y: bestPoint.y },
      { x: bestPoint.x + step, y: bestPoint.y },
      { x: bestPoint.x, y: bestPoint.y - step },
      { x: bestPoint.x, y: bestPoint.y + step },
    ];
    const better = nearby.find((point) => {
      if (!isPointInsidePolygon(point, points)) return false;
      const distance = distanceToPolygonEdge(point, points);
      if (distance <= bestDistance) return false;
      bestDistance = distance;
      return true;
    });
    if (better) {
      bestPoint = better;
    } else {
      step /= 2;
    }
  }

  return bestPoint;
}

export function roomArea(room: Room, pixelsPerMeter: number) {
  return polygonArea(roomPoints(room)) / (pixelsPerMeter * pixelsPerMeter);
}

export function readFileAsDataUrl(file: File): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      resolve({
        id: uid("asset"),
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl: String(reader.result),
        createdAt: nowIso(),
      });
    };
    reader.readAsDataURL(file);
  });
}

export async function downloadJson(projects: PropertyProject[]) {
  const blob = new Blob([JSON.stringify({ version: 1, projects }, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `renovation-planner-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}
