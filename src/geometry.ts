import type { Opening, Plan, PlanPoint, Wall } from "./types";

export type OpeningAnchor = "start" | "center" | "end";

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

export function constrainOpeningHandle(
  opening: Opening,
  endpoint: "start" | "end",
  point: PlanPoint,
  walls: Wall[],
  gridSize: number,
  snappingDisabled: boolean,
) {
  const handles = openingHandlePoints(opening);
  const fixed = endpoint === "start" ? handles.end : handles.start;
  const attachedWall = walls.find((wall) => wall.id === opening.wallId);
  const threshold = snapThreshold(gridSize);
  const resizeWall =
    !snappingDisabled && attachedWall
      ? attachedWall
      : !snappingDisabled
        ? nearestOpeningWall(opening, walls, threshold)?.wall
        : undefined;

  if (resizeWall) {
    const wallEndpoint = nearestWallEndpoint(point, [resizeWall], threshold);
    return {
      point: wallEndpoint?.point ?? projectPointToWallAxis(point, resizeWall),
      fixed: projectPointToWallAxis(fixed, resizeWall),
      rotation: wallAngle(resizeWall),
      wallId: resizeWall.id,
    };
  }
  return {
    point: projectPointToLine(point, handles.start, handles.end),
    fixed,
    rotation: opening.rotation,
    wallId: undefined,
  };
}

export function constrainedOpeningPosition(
  opening: Opening,
  x: number,
  y: number,
  plan: Plan,
  snappingDisabled: boolean,
) {
  const nextOpening = { ...opening, x, y };
  if (snappingDisabled) {
    return { x, y, rotation: nextOpening.rotation, wallId: undefined };
  }
  const nearest = nearestOpeningWall(nextOpening, plan.walls, snapThreshold(plan.scale.gridSize) * 1.5);
  if (!nearest) {
    return { x, y, rotation: nextOpening.rotation, wallId: undefined };
  }
  placeOpeningAnchorAtPoint(nextOpening, nearest.anchor, nearest.point, wallAngle(nearest.wall));
  return {
    x: nextOpening.x,
    y: nextOpening.y,
    rotation: nextOpening.rotation,
    wallId: nearest.wall.id,
  };
}
