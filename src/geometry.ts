import type { Opening, Plan, PlanPoint, Wall } from "./types";

export type OpeningAnchor = "start" | "center" | "end";
export type SnapKind = "free" | "grid" | "endpoint" | "polar" | "wall-axis";

export interface ActiveSnap {
  kind: "opening-wall" | "wall-endpoint";
  wallId: string;
  endpoint?: "start" | "end";
}

export interface SnapCandidate {
  kind: SnapKind;
  point: PlanPoint;
  distance: number;
  wallId?: string;
  endpoint?: "start" | "end";
  angle?: number;
}

export interface SnapResult extends SnapCandidate {
  guideStart?: PlanPoint;
  guideEnd?: PlanPoint;
  activeSnap?: ActiveSnap;
}

const polarAngleStep = 45;
const endpointAngleTolerance = 3;
const openingWallSwitchMarginPx = 6;

export function snapAcquireTolerance(viewportScale: number, screenPixels = 10) {
  return screenPixels / Math.max(0.2, viewportScale);
}

export function snapReleaseTolerance(viewportScale: number, screenPixels = 16) {
  return screenPixels / Math.max(0.2, viewportScale);
}

export function snapThreshold(gridSize: number) {
  return Math.max(8, gridSize * 0.5);
}

export function distance(a: PlanPoint, b: PlanPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function wallAngle(wall: Wall) {
  return (Math.atan2(wall.y2 - wall.y, wall.x2 - wall.x) * 180) / Math.PI;
}

export function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function angleDelta(a: number, b: number) {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, 360 - delta);
}

function nearestPolarAngle(angle: number) {
  return normalizeAngle(Math.round(angle / polarAngleStep) * polarAngleStep);
}

function angleBetween(start: PlanPoint, end: PlanPoint) {
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function wallEndpointPoint(wall: Wall, endpoint: "start" | "end"): PlanPoint {
  return endpoint === "start" ? { x: wall.x, y: wall.y } : { x: wall.x2, y: wall.y2 };
}

function wallLength(wall: Wall) {
  return Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
}

function wallAxisProjection(point: PlanPoint, wall: Wall) {
  const length = wallLength(wall);
  if (length <= 0) {
    return {
      point: { x: wall.x, y: wall.y },
      distance: distance(point, { x: wall.x, y: wall.y }),
      along: 0,
      outsideDistance: 0,
    };
  }
  const axis = {
    x: (wall.x2 - wall.x) / length,
    y: (wall.y2 - wall.y) / length,
  };
  const along = (point.x - wall.x) * axis.x + (point.y - wall.y) * axis.y;
  const clampedAlong = Math.max(0, Math.min(length, along));
  const projected = {
    x: wall.x + axis.x * clampedAlong,
    y: wall.y + axis.y * clampedAlong,
  };
  return {
    point: projected,
    distance: distance(point, projected),
    along,
    outsideDistance: Math.max(0, -along, along - length),
  };
}

export function snapPointToGrid(point: PlanPoint, gridSize: number): PlanPoint {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function projectPointToWall(point: PlanPoint, wall: Wall): PlanPoint {
  const dx = wall.x2 - wall.x;
  const dy = wall.y2 - wall.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { x: wall.x, y: wall.y };
  const t = Math.max(0, Math.min(1, ((point.x - wall.x) * dx + (point.y - wall.y) * dy) / lengthSquared));
  return {
    x: wall.x + dx * t,
    y: wall.y + dy * t,
  };
}

export function projectPointToWallAxis(point: PlanPoint, wall: Wall): PlanPoint {
  const dx = wall.x2 - wall.x;
  const dy = wall.y2 - wall.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { x: wall.x, y: wall.y };
  const t = ((point.x - wall.x) * dx + (point.y - wall.y) * dy) / lengthSquared;
  return {
    x: wall.x + dx * t,
    y: wall.y + dy * t,
  };
}

export function nearestWallProjection(point: PlanPoint, walls: Wall[], threshold: number, excludeWallId?: string) {
  return walls.reduce<{ wall: Wall; point: PlanPoint; distance: number } | undefined>((nearest, wall) => {
    if (wall.id === excludeWallId) return nearest;
    const projected = projectPointToWall(point, wall);
    const projectedDistance = distance(point, projected);
    if (projectedDistance > threshold || (nearest && projectedDistance >= nearest.distance)) return nearest;
    return { wall, point: projected, distance: projectedDistance };
  }, undefined);
}

export function nearestWallEndpoint(point: PlanPoint, walls: Wall[], threshold: number, excludeWallId?: string) {
  return walls.reduce<{ point: PlanPoint; distance: number } | undefined>((nearest, wall) => {
    if (wall.id === excludeWallId) return nearest;
    const endpoints = [
      { x: wall.x, y: wall.y },
      { x: wall.x2, y: wall.y2 },
    ];
    endpoints.forEach((endpoint) => {
      const endpointDistance = distance(point, endpoint);
      if (endpointDistance <= threshold && (!nearest || endpointDistance < nearest.distance)) {
        nearest = { point: endpoint, distance: endpointDistance };
      }
    });
    return nearest;
  }, undefined);
}

export function snapStructuralPoint(point: PlanPoint, walls: Wall[], gridSize: number, excludeWallId?: string): PlanPoint {
  const threshold = snapThreshold(gridSize);
  const endpoint = nearestWallEndpoint(point, walls, threshold, excludeWallId);
  if (endpoint) return endpoint.point;
  const wall = nearestWallProjection(point, walls, threshold, excludeWallId);
  if (wall) return wall.point;
  return snapPointToGrid(point, gridSize);
}

function wallEndpointCandidates(point: PlanPoint, walls: Wall[], threshold: number, excludeWallId?: string) {
  return walls.flatMap((wall) => {
    if (wall.id === excludeWallId) return [];
    return (["start", "end"] as const)
      .map((endpoint) => {
        const endpointPoint = wallEndpointPoint(wall, endpoint);
        return {
          kind: "endpoint" as const,
          point: endpointPoint,
          distance: distance(point, endpointPoint),
          wallId: wall.id,
          endpoint,
        };
      })
      .filter((candidate) => candidate.distance <= threshold);
  });
}

function isAngleCompatibleEndpoint(origin: PlanPoint, target: PlanPoint) {
  const angle = angleBetween(origin, target);
  return angleDelta(angle, nearestPolarAngle(angle)) <= endpointAngleTolerance;
}

function resolveActiveEndpointSnap(
  point: PlanPoint,
  origin: PlanPoint,
  walls: Wall[],
  activeSnap: ActiveSnap | undefined,
  releaseTolerance: number,
) {
  if (!activeSnap || activeSnap.kind !== "wall-endpoint" || !activeSnap.endpoint) return;
  const wall = walls.find((item) => item.id === activeSnap.wallId);
  if (!wall) return;
  const endpointPoint = wallEndpointPoint(wall, activeSnap.endpoint);
  const endpointDistance = distance(point, endpointPoint);
  if (endpointDistance > releaseTolerance || !isAngleCompatibleEndpoint(origin, endpointPoint)) return;
  return {
    kind: "endpoint" as const,
    point: endpointPoint,
    distance: endpointDistance,
    wallId: wall.id,
    endpoint: activeSnap.endpoint,
    angle: nearestPolarAngle(angleBetween(origin, endpointPoint)),
    guideStart: origin,
    guideEnd: endpointPoint,
    activeSnap,
  };
}

export function resolveWallEndpointSnap(options: {
  point: PlanPoint;
  origin: PlanPoint;
  walls: Wall[];
  gridSize: number;
  viewportScale: number;
  excludeWallId?: string;
  activeSnap?: ActiveSnap;
  snappingDisabled?: boolean;
}): SnapResult {
  const { point, origin, walls, gridSize, viewportScale, excludeWallId, activeSnap, snappingDisabled } = options;
  if (snappingDisabled) {
    return { kind: "free", point, distance: 0 };
  }

  const releaseTolerance = snapReleaseTolerance(viewportScale);
  const activeEndpoint = resolveActiveEndpointSnap(point, origin, walls, activeSnap, releaseTolerance);
  if (activeEndpoint) return activeEndpoint;

  const acquireTolerance = snapAcquireTolerance(viewportScale);
  const compatibleEndpoint = wallEndpointCandidates(point, walls, acquireTolerance, excludeWallId)
    .filter((candidate) => isAngleCompatibleEndpoint(origin, candidate.point))
    .sort((a, b) => a.distance - b.distance)[0];
  if (compatibleEndpoint) {
    return {
      ...compatibleEndpoint,
      angle: nearestPolarAngle(angleBetween(origin, compatibleEndpoint.point)),
      guideStart: origin,
      guideEnd: compatibleEndpoint.point,
      activeSnap: {
        kind: "wall-endpoint",
        wallId: compatibleEndpoint.wallId,
        endpoint: compatibleEndpoint.endpoint,
      },
    };
  }

  const rawDistance = distance(origin, point);
  if (rawDistance > 0.001) {
    const angle = nearestPolarAngle(angleBetween(origin, point));
    const radians = (angle * Math.PI) / 180;
    const polarPoint = {
      x: origin.x + Math.cos(radians) * rawDistance,
      y: origin.y + Math.sin(radians) * rawDistance,
    };
    return {
      kind: "polar",
      point: polarPoint,
      distance: distance(point, polarPoint),
      angle,
      guideStart: origin,
      guideEnd: polarPoint,
    };
  }

  const gridPoint = snapPointToGrid(point, gridSize);
  return {
    kind: "grid",
    point: gridPoint,
    distance: distance(point, gridPoint),
  };
}

export function openingCenter(opening: Opening): PlanPoint {
  const radians = (opening.rotation * Math.PI) / 180;
  return {
    x: opening.x + Math.cos(radians) * (opening.width / 2) - Math.sin(radians) * (opening.height / 2),
    y: opening.y + Math.sin(radians) * (opening.width / 2) + Math.cos(radians) * (opening.height / 2),
  };
}

export function placeOpeningAtCenter(opening: Opening, center: PlanPoint, rotation: number) {
  const radians = (rotation * Math.PI) / 180;
  opening.rotation = normalizeAngle(rotation);
  opening.x = center.x - Math.cos(radians) * (opening.width / 2) + Math.sin(radians) * (opening.height / 2);
  opening.y = center.y - Math.sin(radians) * (opening.width / 2) - Math.cos(radians) * (opening.height / 2);
}

export function placeOpeningAnchorAtPoint(
  opening: Opening,
  anchor: OpeningAnchor,
  point: PlanPoint,
  rotation: number,
) {
  if (anchor === "center") {
    placeOpeningAtCenter(opening, point, rotation);
    return;
  }
  const radians = (rotation * Math.PI) / 180;
  const axis = { x: Math.cos(radians), y: Math.sin(radians) };
  const normal = { x: -Math.sin(radians), y: Math.cos(radians) };
  opening.rotation = normalizeAngle(rotation);
  opening.x = point.x - normal.x * (opening.height / 2) - (anchor === "end" ? axis.x * opening.width : 0);
  opening.y = point.y - normal.y * (opening.height / 2) - (anchor === "end" ? axis.y * opening.width : 0);
}

export function openingVectors(opening: Opening) {
  const radians = (opening.rotation * Math.PI) / 180;
  return {
    axis: { x: Math.cos(radians), y: Math.sin(radians) },
    normal: { x: -Math.sin(radians), y: Math.cos(radians) },
  };
}

export function openingHandlePoints(opening: Opening) {
  const { axis, normal } = openingVectors(opening);
  const start = {
    x: opening.x + normal.x * (opening.height / 2),
    y: opening.y + normal.y * (opening.height / 2),
  };
  const end = {
    x: start.x + axis.x * opening.width,
    y: start.y + axis.y * opening.width,
  };
  return { start, end };
}

export function projectPointToLine(point: PlanPoint, lineStart: PlanPoint, lineEnd: PlanPoint): PlanPoint {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return lineStart;
  const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared;
  return {
    x: lineStart.x + dx * t,
    y: lineStart.y + dy * t,
  };
}

export function placeOpeningBetweenHandles(opening: Opening, start: PlanPoint, end: PlanPoint, rotation?: number) {
  const width = Math.max(8, distance(start, end));
  opening.width = width;
  placeOpeningAtCenter(
    opening,
    {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    },
    rotation ?? (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI,
  );
}

export function nearestOpeningWall(opening: Opening, walls: Wall[], threshold: number) {
  const handles = openingHandlePoints(opening);
  const center = openingCenter(opening);
  const anchors: Array<{ anchor: OpeningAnchor; point: PlanPoint }> = [
    { anchor: "start", point: handles.start },
    { anchor: "end", point: handles.end },
    { anchor: "center", point: center },
  ];

  const nearestEndpoint = walls.reduce<{ wall: Wall; point: PlanPoint; distance: number; anchor: OpeningAnchor } | undefined>(
    (nearest, wall) => {
      const endpoints = [
        { x: wall.x, y: wall.y },
        { x: wall.x2, y: wall.y2 },
      ];
      [anchors[0], anchors[1]].forEach((sample) => {
        endpoints.forEach((endpoint) => {
          const endpointDistance = distance(sample.point, endpoint);
          if (endpointDistance <= threshold && (!nearest || endpointDistance < nearest.distance)) {
            nearest = { wall, point: endpoint, distance: endpointDistance, anchor: sample.anchor };
          }
        });
      });
      return nearest;
    },
    undefined,
  );
  if (nearestEndpoint) return nearestEndpoint;

  return walls.reduce<{ wall: Wall; point: PlanPoint; distance: number; anchor: OpeningAnchor } | undefined>((nearest, wall) => {
    const bestForWall = anchors.reduce<{ point: PlanPoint; distance: number; anchor: OpeningAnchor } | undefined>((best, sample) => {
      const projected = projectPointToWall(sample.point, wall);
      const projectedDistance = distance(sample.point, projected);
      if (projectedDistance > threshold || (best && projectedDistance >= best.distance)) return best;
      return { point: projected, distance: projectedDistance, anchor: sample.anchor };
    }, undefined);
    if (!bestForWall || (nearest && bestForWall.distance >= nearest.distance)) return nearest;
    return { wall, point: bestForWall.point, distance: bestForWall.distance, anchor: bestForWall.anchor };
  }, undefined);
}

function openingWallCandidate(opening: Opening, wall: Wall, threshold: number) {
  const center = openingCenter(opening);
  const projection = wallAxisProjection(center, wall);
  const wallPadding = Math.max(opening.width / 2, wall.thickness);
  if (projection.distance > threshold || projection.outsideDistance > wallPadding) return;
  return {
    kind: "wall-axis" as const,
    point: projection.point,
    distance: projection.distance,
    wallId: wall.id,
    angle: wallAngle(wall),
    score: projection.distance + projection.outsideDistance * 0.75,
    activeSnap: { kind: "opening-wall" as const, wallId: wall.id },
  };
}

export function resolveOpeningWallSnap(options: {
  opening: Opening;
  walls: Wall[];
  viewportScale: number;
  activeSnap?: ActiveSnap;
}) {
  const { opening, walls, viewportScale, activeSnap } = options;
  const acquireTolerance = snapAcquireTolerance(viewportScale);
  const releaseTolerance = snapReleaseTolerance(viewportScale);
  const switchMargin = snapAcquireTolerance(viewportScale, openingWallSwitchMarginPx);
  const candidates = walls
    .map((wall) => openingWallCandidate(opening, wall, releaseTolerance))
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => a.score - b.score);

  const activeCandidate =
    activeSnap?.kind === "opening-wall"
      ? candidates.find((candidate) => candidate.wallId === activeSnap.wallId)
      : opening.wallId
        ? candidates.find((candidate) => candidate.wallId === opening.wallId)
        : undefined;
  const best = candidates[0];

  if (activeCandidate && activeCandidate.distance <= releaseTolerance) {
    if (!best || best.wallId === activeCandidate.wallId || best.score + switchMargin >= activeCandidate.score) {
      return activeCandidate;
    }
  }

  if (!best || best.distance > acquireTolerance) return undefined;
  return best;
}

export function constrainOpeningHandle(
  opening: Opening,
  endpoint: "start" | "end",
  point: PlanPoint,
  walls: Wall[],
  gridSize: number,
  snappingDisabled: boolean,
  viewportScale = 1,
  activeSnap?: ActiveSnap,
) {
  const handles = openingHandlePoints(opening);
  const fixed = endpoint === "start" ? handles.end : handles.start;
  const attachedWall = walls.find((wall) => wall.id === opening.wallId);
  const threshold = snapAcquireTolerance(viewportScale);
  const resizeWall =
    !snappingDisabled && attachedWall
      ? attachedWall
      : !snappingDisabled
        ? walls.find((wall) => wall.id === resolveOpeningWallSnap({ opening, walls, viewportScale, activeSnap })?.wallId)
        : undefined;

  if (resizeWall) {
    const wallEndpoint = nearestWallEndpoint(point, [resizeWall], threshold);
    return {
      point: wallEndpoint?.point ?? projectPointToWall(point, resizeWall),
      fixed: projectPointToWall(fixed, resizeWall),
      rotation: wallAngle(resizeWall),
      wallId: resizeWall.id,
      activeSnap: { kind: "opening-wall" as const, wallId: resizeWall.id },
    };
  }
  return {
    point: projectPointToLine(point, handles.start, handles.end),
    fixed,
    rotation: opening.rotation,
    wallId: undefined,
    activeSnap: undefined,
  };
}

export function constrainedOpeningPosition(
  opening: Opening,
  x: number,
  y: number,
  plan: Plan,
  snappingDisabled: boolean,
  viewportScale = 1,
  activeSnap?: ActiveSnap,
) {
  const nextOpening = { ...opening, x, y };
  if (snappingDisabled) {
    return { x, y, rotation: nextOpening.rotation, wallId: undefined, activeSnap: undefined };
  }
  const nearest = resolveOpeningWallSnap({ opening: nextOpening, walls: plan.walls, viewportScale, activeSnap });
  if (!nearest) {
    return { x, y, rotation: nextOpening.rotation, wallId: undefined, activeSnap: undefined };
  }
  placeOpeningAtCenter(nextOpening, nearest.point, nearest.angle ?? nextOpening.rotation);
  return {
    x: nextOpening.x,
    y: nextOpening.y,
    rotation: nextOpening.rotation,
    wallId: nearest.wallId,
    activeSnap: nearest.activeSnap,
  };
}
