import type {
  Alternative,
  Asset,
  FixtureKind,
  Floor,
  Plan,
  PlanPoint,
  PropertyProject,
  PropertyType,
  Room,
  RoomBoard,
  RoomStyleCategory,
  RoomStyleItem,
} from "./types";

export const LOCAL_OWNER_ID = "local-user";
export const PROJECT_SCHEMA_VERSION = 1;

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
  return {
    roomId,
    photos: [],
    renderOutputs: [],
    referenceImages: [],
    styleItems: [],
    prompts: [],
    stylePrompt: "",
    notes: "",
  };
}

export function createPropertyProject(
  name: string,
  type: PropertyType = "Apartment",
  floorName = type === "House" ? "Ground floor" : "Main floor",
): PropertyProject {
  const createdAt = nowIso();
  return {
    id: uid("property"),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ownerId: LOCAL_OWNER_ID,
    name,
    type,
    createdAt,
    updatedAt: createdAt,
    floors: [
      {
        id: uid("floor"),
        name: floorName,
        level: 0,
        alternatives: [createAlternative("Current layout")],
      },
    ],
  };
}

export function createStarterProjects(): PropertyProject[] {
  return [createPropertyProject("Apartment", "Apartment"), createPropertyProject("House", "House")];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeAsset(value: unknown): Asset | undefined {
  if (!isRecord(value)) return undefined;
  const dataUrl = stringOr(value.dataUrl, "");
  if (!dataUrl) return undefined;
  return {
    id: stringOr(value.id, uid("asset")),
    name: stringOr(value.name, "Imported asset"),
    mimeType: stringOr(value.mimeType, "application/octet-stream"),
    dataUrl,
    createdAt: stringOr(value.createdAt, nowIso()),
  };
}

const roomStyleCategories: RoomStyleCategory[] = ["palette", "material", "fixture", "reference"];

function normalizeRoomStyleItem(value: unknown): RoomStyleItem | undefined {
  if (!isRecord(value)) return undefined;
  const name = stringOr(value.name, "");
  if (!name) return undefined;
  const category = roomStyleCategories.includes(value.category as RoomStyleCategory)
    ? (value.category as RoomStyleCategory)
    : "material";
  const color = typeof value.color === "string" && value.color.trim() ? value.color : undefined;
  return {
    id: stringOr(value.id, uid("style")),
    category,
    name,
    detail: stringOr(value.detail, ""),
    color,
    createdAt: stringOr(value.createdAt, nowIso()),
  };
}

function normalizeRoomBoard(value: unknown): RoomBoard | undefined {
  if (!isRecord(value)) return undefined;
  const roomId = stringOr(value.roomId, "");
  if (!roomId) return undefined;
  return {
    roomId,
    photos: Array.isArray(value.photos) ? value.photos.map(normalizeAsset).filter((asset): asset is Asset => Boolean(asset)) : [],
    renderOutputs: Array.isArray(value.renderOutputs)
      ? value.renderOutputs.map(normalizeAsset).filter((asset): asset is Asset => Boolean(asset))
      : [],
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map(normalizeAsset).filter((asset): asset is Asset => Boolean(asset))
      : [],
    styleItems: Array.isArray(value.styleItems)
      ? value.styleItems.map(normalizeRoomStyleItem).filter((item): item is RoomStyleItem => Boolean(item))
      : [],
    prompts: Array.isArray(value.prompts) ? value.prompts.filter((prompt): prompt is string => typeof prompt === "string") : [],
    stylePrompt: stringOr(value.stylePrompt, ""),
    notes: stringOr(value.notes, ""),
    beforeAssetId: typeof value.beforeAssetId === "string" ? value.beforeAssetId : undefined,
    afterAssetId: typeof value.afterAssetId === "string" ? value.afterAssetId : undefined,
  };
}

function normalizePlan(value: unknown): Plan {
  const fallback = emptyPlan();
  if (!isRecord(value)) return fallback;
  const scale = isRecord(value.scale) ? value.scale : {};
  return {
    scale: {
      ...fallback.scale,
      ...scale,
      pixelsPerMeter:
        typeof scale.pixelsPerMeter === "number" && Number.isFinite(scale.pixelsPerMeter)
          ? scale.pixelsPerMeter
          : fallback.scale.pixelsPerMeter,
      gridSize:
        typeof scale.gridSize === "number" && Number.isFinite(scale.gridSize)
          ? scale.gridSize
          : fallback.scale.gridSize,
      ceilingHeightMeters:
        typeof scale.ceilingHeightMeters === "number" && Number.isFinite(scale.ceilingHeightMeters)
          ? scale.ceilingHeightMeters
          : fallback.scale.ceilingHeightMeters,
    },
    background: normalizeAsset(value.background),
    walls: Array.isArray(value.walls) ? (value.walls as Plan["walls"]) : [],
    openings: Array.isArray(value.openings) ? (value.openings as Plan["openings"]) : [],
    rooms: Array.isArray(value.rooms) ? (value.rooms as Plan["rooms"]) : [],
    fixtures: Array.isArray(value.fixtures) ? (value.fixtures as Plan["fixtures"]) : [],
  };
}

function normalizeAlternative(value: unknown, index: number): Alternative {
  if (!isRecord(value)) return createAlternative(index === 0 ? "Current layout" : `Alternative ${index + 1}`);
  return {
    id: stringOr(value.id, uid("alternative")),
    name: stringOr(value.name, index === 0 ? "Current layout" : `Alternative ${index + 1}`),
    createdAt: stringOr(value.createdAt, nowIso()),
    plan: normalizePlan(value.plan),
    roomBoards: Array.isArray(value.roomBoards)
      ? value.roomBoards.map(normalizeRoomBoard).filter((board): board is RoomBoard => Boolean(board))
      : [],
  };
}

function normalizeFloor(value: unknown, index: number): Floor {
  if (!isRecord(value)) {
    return {
      id: uid("floor"),
      name: index === 0 ? "Main floor" : `Floor ${index + 1}`,
      level: index,
      alternatives: [createAlternative("Current layout")],
    };
  }
  const alternatives = Array.isArray(value.alternatives)
    ? value.alternatives.map(normalizeAlternative)
    : [createAlternative("Current layout")];
  return {
    id: stringOr(value.id, uid("floor")),
    name: stringOr(value.name, index === 0 ? "Main floor" : `Floor ${index + 1}`),
    level: typeof value.level === "number" && Number.isFinite(value.level) ? value.level : index,
    alternatives: alternatives.length ? alternatives : [createAlternative("Current layout")],
  };
}

export function normalizeProject(value: unknown): PropertyProject {
  const fallback = createPropertyProject("Untitled project");
  if (!isRecord(value)) return fallback;
  const updatedAt = stringOr(value.updatedAt, nowIso());
  const floors = Array.isArray(value.floors) ? value.floors.map(normalizeFloor) : fallback.floors;
  return {
    id: stringOr(value.id, fallback.id),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ownerId: stringOr(value.ownerId, LOCAL_OWNER_ID),
    name: stringOr(value.name, fallback.name),
    type: value.type === "House" ? "House" : "Apartment",
    createdAt: stringOr(value.createdAt, updatedAt),
    updatedAt,
    floors: floors.length ? floors : fallback.floors,
  };
}

function cloneAsset(asset: Asset): Asset {
  return { ...asset, id: uid("asset") };
}

function cloneAssetsWithIdMap(assets: Asset[]) {
  const ids = new Map<string, string>();
  const cloned = assets.map((asset) => {
    const copy = cloneAsset(asset);
    ids.set(asset.id, copy.id);
    return copy;
  });
  return { cloned, ids };
}

export function cloneProjectForLocal(source: PropertyProject, name = `${source.name} copy`): PropertyProject {
  const normalized = normalizeProject(source);
  const now = nowIso();
  return {
    ...normalized,
    id: uid("property"),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    ownerId: LOCAL_OWNER_ID,
    name,
    createdAt: now,
    updatedAt: now,
    floors: normalized.floors.map((floor, floorIndex) => ({
      ...floor,
      id: uid("floor"),
      level: floorIndex,
      alternatives: floor.alternatives.map((alternative) => {
        const roomIds = new Map<string, string>();
        const wallIds = new Map<string, string>();
        const rooms = alternative.plan.rooms.map((room) => {
          const id = uid("room");
          roomIds.set(room.id, id);
          return { ...room, id };
        });
        const walls = alternative.plan.walls.map((wall) => {
          const id = uid("wall");
          wallIds.set(wall.id, id);
          return { ...wall, id };
        });
        return {
          ...alternative,
          id: uid("alternative"),
          createdAt: now,
          plan: {
            ...alternative.plan,
            background: alternative.plan.background ? cloneAsset(alternative.plan.background) : undefined,
            walls,
            openings: alternative.plan.openings.map((opening) => ({
              ...opening,
              id: uid(opening.kind),
              wallId: opening.wallId ? wallIds.get(opening.wallId) : undefined,
            })),
            rooms,
            fixtures: alternative.plan.fixtures.map((fixture) => ({ ...fixture, id: uid("fixture") })),
          },
          roomBoards: alternative.roomBoards.map((board) => {
            const photos = cloneAssetsWithIdMap(board.photos);
            const renderOutputs = cloneAssetsWithIdMap(board.renderOutputs);
            const referenceImages = cloneAssetsWithIdMap(board.referenceImages);
            return {
              ...board,
              roomId: roomIds.get(board.roomId) ?? board.roomId,
              photos: photos.cloned,
              renderOutputs: renderOutputs.cloned,
              referenceImages: referenceImages.cloned,
              styleItems: board.styleItems.map((item) => ({ ...item, id: uid("style") })),
              prompts: [...board.prompts],
              beforeAssetId: board.beforeAssetId ? photos.ids.get(board.beforeAssetId) : undefined,
              afterAssetId: board.afterAssetId ? renderOutputs.ids.get(board.afterAssetId) : undefined,
            };
          }),
        };
      }),
    })),
  };
}

export function metersFromPixels(pixels: number, pixelsPerMeter: number) {
  return pixels / pixelsPerMeter;
}

export function centimetersFromPixels(pixels: number, pixelsPerMeter: number) {
  return metersFromPixels(pixels, pixelsPerMeter) * 100;
}

export function pixelsFromCentimeters(centimeters: number, pixelsPerMeter: number) {
  return (centimeters / 100) * pixelsPerMeter;
}

export function formatCentimeters(centimeters: number) {
  return `${Math.round(centimeters)} cm`;
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

function safeFilePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

async function downloadJsonFile(payload: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function downloadProjectJson(project: PropertyProject) {
  await downloadJsonFile(
    {
      version: 2,
      kind: "renovation-planner-project",
      project: normalizeProject(project),
    },
    `renovation-planner-${safeFilePart(project.name)}.json`,
  );
}

export async function downloadProjectsJson(projects: PropertyProject[]) {
  await downloadJsonFile(
    {
      version: 2,
      kind: "renovation-planner-projects",
      projects: projects.map(normalizeProject),
    },
    `renovation-planner-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

export function parseProjectExport(text: string): PropertyProject[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed.map(normalizeProject);
  if (!isRecord(parsed)) throw new Error("Project export must be a JSON object.");
  if (Array.isArray(parsed.projects)) return parsed.projects.map(normalizeProject);
  if (isRecord(parsed.project)) return [normalizeProject(parsed.project)];
  throw new Error("Project export is missing a project or projects list.");
}
