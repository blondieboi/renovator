import type { KonvaEventObject } from "konva/lib/Node";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  type ActiveSnap,
  constrainOpeningHandle,
  constrainedOpeningPosition,
  placeOpeningBetweenHandles,
  resolveOpeningWallSnap,
  resolveWallEndpointSnap,
  snapPointToGrid,
  snapStructuralPoint,
} from "../geometry";
import {
  defaultFixtureSize,
  findPlanObject,
  getOrCreateRoomBoard,
  isStructuralTool,
  roomColors,
  safeGridSize,
  safePixelsPerMeter,
  type SelectablePlanObject,
} from "../model";
import {
  moveRectangularObjectInPlan,
  moveRoomPointInPlan,
  moveWallInPlan,
  resizeWallEndpointInPlan,
} from "../planActions";
import { derivePlanTopology, findWallEndpointJoint, isSimplePolygon } from "../topology";
import type { Alternative, Fixture, FixtureKind, Opening, PlanPoint, Room, ToolMode, Wall } from "../types";
import { centimetersFromPixels, formatCentimeters, fixtureLabels, rectangleRoomPoints, uid } from "../utils";
import type { CanvasViewport } from "./useCanvasViewport";
import type { PlanUndoMode } from "./usePlanTransactions";

export type CanvasSnapPreview = {
  openingWallId?: string;
  wallGuide?: {
    start: PlanPoint;
    end: PlanPoint;
    point: PlanPoint;
  };
};

type PlanEditorInteractionsOptions = {
  alternative?: Alternative;
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  tool: ToolMode;
  setTool: Dispatch<SetStateAction<ToolMode>>;
  fixtureKind: FixtureKind;
  structureLocked: boolean;
  setStructureLocked: Dispatch<SetStateAction<boolean>>;
  polygonDraft: PlanPoint[];
  setPolygonDraft: Dispatch<SetStateAction<PlanPoint[]>>;
  calibrationPoints: PlanPoint[];
  setCalibrationPoints: Dispatch<SetStateAction<PlanPoint[]>>;
  calibrationCentimeters: string;
  spacePanning: boolean;
  viewport: CanvasViewport;
  startPanning: (pointer: PlanPoint | null | undefined) => void;
  setStatus: (status: string) => void;
  updateAlternative: (updater: (alternative: Alternative) => void, undoMode?: PlanUndoMode) => void;
  updateAlternativeWithRoomBoards: (updater: (alternative: Alternative) => void) => void;
  activeOpeningSnapRef: MutableRefObject<ActiveSnap | undefined>;
  activeWallEndpointSnapRef: MutableRefObject<ActiveSnap | undefined>;
  setSnapPreview: Dispatch<SetStateAction<CanvasSnapPreview>>;
};

function isStructuralObject(object: SelectablePlanObject) {
  return object.kind === "room" || object.kind === "wall" || object.kind === "door" || object.kind === "window";
}

export function usePlanEditorInteractions({
  alternative,
  selectedId,
  setSelectedId,
  tool,
  setTool,
  fixtureKind,
  structureLocked,
  setStructureLocked,
  polygonDraft,
  setPolygonDraft,
  calibrationPoints,
  setCalibrationPoints,
  calibrationCentimeters,
  spacePanning,
  viewport,
  startPanning,
  setStatus,
  updateAlternative,
  updateAlternativeWithRoomBoards,
  activeOpeningSnapRef,
  activeWallEndpointSnapRef,
  setSnapPreview,
}: PlanEditorInteractionsOptions) {
  function stagePlanPointer(event: KonvaEventObject<MouseEvent | WheelEvent | DragEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position || !alternative) return;
    return {
      x: (position.x - viewport.x) / viewport.scale,
      y: (position.y - viewport.y) / viewport.scale,
    };
  }

  function stagePointer(event: KonvaEventObject<MouseEvent | WheelEvent | DragEvent>, snapToGrid = true) {
    const point = stagePlanPointer(event);
    if (!point || !alternative || !snapToGrid) return point;
    return snapPointToGrid(point, safeGridSize(alternative.plan));
  }

  function clearSnapState() {
    activeOpeningSnapRef.current = undefined;
    activeWallEndpointSnapRef.current = undefined;
    setSnapPreview({});
  }

  function selectedObject(): SelectablePlanObject | undefined {
    const plan = alternative?.plan;
    if (!plan || !selectedId) return undefined;
    return findPlanObject(plan, selectedId);
  }

  function selectPlanObject(id: string | null) {
    if (!id) {
      setSelectedId(null);
      return;
    }
    const object = alternative ? findPlanObject(alternative.plan, id) : undefined;
    if (structureLocked && object && isStructuralObject(object)) return;
    setSelectedId(id);
  }

  function toggleStructureLock() {
    const nextLocked = !structureLocked;
    setStructureLocked(nextLocked);
    if (!nextLocked) return;
    const currentSelection = selectedObject();
    if (currentSelection && isStructuralObject(currentSelection)) setSelectedId(null);
    if (isStructuralTool(tool)) {
      setTool("select");
      setPolygonDraft([]);
    }
    clearSnapState();
  }

  function finishPolygonRoom(points = polygonDraft) {
    if (structureLocked || points.length < 3) return;
    if (!isSimplePolygon(points)) {
      setStatus("Room polygon needs a simple, non-overlapping outline.");
      return;
    }
    const roomId = uid("room");
    updateAlternativeWithRoomBoards((draft) => {
      const plan = draft.plan;
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxX = Math.max(...points.map((point) => point.x));
      const maxY = Math.max(...points.map((point) => point.y));
      const room: Room = {
        id: roomId,
        kind: "room",
        name: `Room ${plan.rooms.length + 1}`,
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        rotation: 0,
        color: roomColors[plan.rooms.length % roomColors.length],
        points: points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
      };
      plan.rooms.push(room);
      getOrCreateRoomBoard(draft, room.id);
    });
    setSelectedId(roomId);
    setPolygonDraft([]);
    setTool("select");
  }

  function snapOpeningToWall(opening: Opening, plan: Alternative["plan"]) {
    const nearest = resolveOpeningWallSnap({ opening, walls: plan.walls, viewportScale: viewport.scale });
    if (!nearest) {
      opening.wallId = undefined;
      return;
    }
    const constrained = constrainedOpeningPosition(opening, opening.x, opening.y, plan, false, viewport.scale);
    opening.x = constrained.x;
    opening.y = constrained.y;
    opening.rotation = constrained.rotation;
    opening.wallId = constrained.wallId;
  }

  function handleStageMouseDown(event: KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (tool === "pan" || spacePanning) {
      startPanning(pointer);
      return;
    }
    if (tool === "select") {
      if (event.target === event.target.getStage()) setSelectedId(null);
      return;
    }
    if (structureLocked && isStructuralTool(tool)) {
      setTool("select");
      setPolygonDraft([]);
      return;
    }
    const snappingDisabled = event.evt.altKey;
    const point = stagePointer(event, !snappingDisabled);
    if (tool === "calibrate") {
      const calibrationPoint = stagePlanPointer(event);
      if (!calibrationPoint) return;
      setSelectedId(null);
      setCalibrationPoints((current) => (current.length >= 2 ? [calibrationPoint] : [...current, calibrationPoint]));
      return;
    }
    if (!point) return;
    if (tool === "polyRoom") {
      const polygonPoint =
        snappingDisabled || !alternative
          ? point
          : snapStructuralPoint(point, alternative.plan.walls, safeGridSize(alternative.plan));
      if (event.evt.detail >= 2) {
        finishPolygonRoom([...polygonDraft, polygonPoint]);
        return;
      }
      setPolygonDraft((current) => [...current, polygonPoint]);
      setSelectedId(null);
      return;
    }

    const createdId =
      tool === "wall"
        ? uid("wall")
        : tool === "room"
          ? uid("room")
          : tool === "door" || tool === "window"
            ? uid(tool)
            : tool === "fixture"
              ? uid("fixture")
              : undefined;
    const applyUpdate = tool === "room" ? updateAlternativeWithRoomBoards : updateAlternative;
    applyUpdate((draft) => {
      const plan = draft.plan;
      if (tool === "wall") {
        const start = snappingDisabled ? point : snapStructuralPoint(point, plan.walls, safeGridSize(plan));
        const gridSize = safeGridSize(plan);
        const wall: Wall = {
          id: createdId ?? uid("wall"),
          kind: "wall",
          name: "Wall",
          x: start.x,
          y: start.y,
          x2: start.x + gridSize * 6,
          y2: start.y,
          width: gridSize * 6,
          height: 12,
          thickness: 12,
          rotation: 0,
        };
        plan.walls.push(wall);
      }
      if (tool === "room") {
        const gridSize = safeGridSize(plan);
        const room: Room = {
          id: createdId ?? uid("room"),
          kind: "room",
          name: `Room ${plan.rooms.length + 1}`,
          x: point.x,
          y: point.y,
          width: gridSize * 6,
          height: gridSize * 4,
          rotation: 0,
          color: roomColors[plan.rooms.length % roomColors.length],
          points: rectangleRoomPoints({ width: gridSize * 6, height: gridSize * 4 }),
        };
        plan.rooms.push(room);
        getOrCreateRoomBoard(draft, room.id);
      }
      if (tool === "door" || tool === "window") {
        const width = tool === "door" ? 52 : 78;
        const height = tool === "door" ? 12 : 10;
        const opening: Opening = {
          id: createdId ?? uid(tool),
          kind: tool,
          name: tool === "door" ? "Door" : "Window",
          x: point.x - width / 2,
          y: point.y - height / 2,
          width,
          height,
          rotation: 0,
        };
        if (!snappingDisabled) snapOpeningToWall(opening, plan);
        plan.openings.push(opening);
      }
      if (tool === "fixture") {
        const size = defaultFixtureSize(fixtureKind);
        const fixture: Fixture = {
          id: createdId ?? uid("fixture"),
          kind: fixtureKind,
          name: fixtureLabels[fixtureKind],
          x: point.x,
          y: point.y,
          width: size.width,
          height: size.height,
          rotation: 0,
        };
        plan.fixtures.push(fixture);
      }
    });
    if (createdId) setSelectedId(createdId);
    setTool("select");
  }

  function calibrationPixelDistance() {
    if (calibrationPoints.length !== 2) return 0;
    return Math.hypot(
      calibrationPoints[1].x - calibrationPoints[0].x,
      calibrationPoints[1].y - calibrationPoints[0].y,
    );
  }

  function calibrationMeasurementLabel() {
    const pixels = calibrationPixelDistance();
    const pixelsPerMeter = alternative ? safePixelsPerMeter(alternative.plan) : 52;
    return `${pixels.toFixed(0)} px · ${formatCentimeters(centimetersFromPixels(pixels, pixelsPerMeter))}`;
  }

  function applyCalibration() {
    const centimeters = Number(calibrationCentimeters);
    const pixels = calibrationPixelDistance();
    if (!Number.isFinite(centimeters) || centimeters <= 0 || pixels <= 0) return;
    const meters = centimeters / 100;
    updateAlternative((draft) => {
      draft.plan.scale.pixelsPerMeter = Math.round((pixels / meters) * 100) / 100;
    });
    setStatus(`Scale calibrated: ${(pixels / centimeters).toFixed(2)} px/cm`);
    setCalibrationPoints([]);
    setTool("select");
  }

  function moveOpening(id: string, x: number, y: number, snappingDisabled: boolean, undoMode: PlanUndoMode = "record") {
    if (structureLocked) return;
    if (snappingDisabled) clearSnapState();
    updateAlternative((draft) => {
      const opening = draft.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainedOpeningPosition(
        opening,
        x,
        y,
        draft.plan,
        snappingDisabled,
        viewport.scale,
        activeOpeningSnapRef.current,
      );
      opening.x = constrained.x;
      opening.y = constrained.y;
      opening.rotation = constrained.rotation;
      opening.wallId = constrained.wallId;
      activeOpeningSnapRef.current = constrained.activeSnap;
      setSnapPreview((current) => ({ ...current, openingWallId: constrained.wallId, wallGuide: undefined }));
    }, undoMode);
  }

  function resizeOpening(
    id: string,
    endpoint: "start" | "end",
    point: PlanPoint,
    snappingDisabled: boolean,
    undoMode: PlanUndoMode = "record",
  ) {
    if (structureLocked) return;
    if (snappingDisabled) clearSnapState();
    updateAlternative((draft) => {
      const opening = draft.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainOpeningHandle(
        opening,
        endpoint,
        point,
        draft.plan.walls,
        safeGridSize(draft.plan),
        snappingDisabled,
        viewport.scale,
        activeOpeningSnapRef.current,
      );
      opening.wallId = constrained.wallId;
      const start = endpoint === "start" ? constrained.point : constrained.fixed;
      const end = endpoint === "end" ? constrained.point : constrained.fixed;
      placeOpeningBetweenHandles(opening, start, end, constrained.rotation);
      activeOpeningSnapRef.current = constrained.activeSnap;
      setSnapPreview((current) => ({ ...current, openingWallId: constrained.wallId, wallGuide: undefined }));
    }, undoMode);
  }

  function moveWall(id: string, x: number, y: number, snappingDisabled: boolean, undoMode: PlanUndoMode = "record") {
    if (structureLocked) return;
    updateAlternative((draft) => {
      moveWallInPlan(draft.plan, id, x, y, snappingDisabled);
    }, undoMode);
  }

  function moveWallEndpoint(
    id: string,
    endpoint: "start" | "end",
    point: PlanPoint,
    snappingDisabled: boolean,
    undoMode: PlanUndoMode = "record",
  ) {
    if (structureLocked) return;
    updateAlternative((draft) => {
      const wall = draft.plan.walls.find((item) => item.id === id);
      if (!wall) return;
      const topology = derivePlanTopology(draft.plan);
      const connectedJoint = snappingDisabled ? undefined : findWallEndpointJoint(topology, id, endpoint);
      const origin = endpoint === "start" ? { x: wall.x2, y: wall.y2 } : { x: wall.x, y: wall.y };
      const resolved = resolveWallEndpointSnap({
        point,
        origin,
        walls: draft.plan.walls,
        gridSize: safeGridSize(draft.plan),
        viewportScale: viewport.scale,
        excludeWallId: wall.id,
        activeSnap: activeWallEndpointSnapRef.current,
        snappingDisabled,
      });
      activeWallEndpointSnapRef.current = resolved.activeSnap;
      setSnapPreview((current) => ({
        ...current,
        openingWallId: undefined,
        wallGuide:
          resolved.guideStart && resolved.guideEnd
            ? { start: resolved.guideStart, end: resolved.guideEnd, point: resolved.point }
            : undefined,
      }));
      const endpointsToMove = connectedJoint?.endpoints ?? [{ wallId: id, endpoint }];
      endpointsToMove.forEach((target) => {
        resizeWallEndpointInPlan(draft.plan, target.wallId, target.endpoint, resolved.point);
      });
    }, undoMode);
  }

  function moveRectangularObject(
    id: string,
    x: number,
    y: number,
    snappingDisabled: boolean,
    undoMode: PlanUndoMode = "record",
  ) {
    if (structureLocked && alternative?.plan.rooms.some((room) => room.id === id)) return;
    updateAlternative((draft) => {
      moveRectangularObjectInPlan(draft.plan, id, x, y, snappingDisabled);
    }, undoMode);
  }

  function moveRoomPoint(
    roomId: string,
    pointIndex: number,
    absolutePoint: PlanPoint,
    snappingDisabled: boolean,
    undoMode: PlanUndoMode = "record",
  ) {
    if (structureLocked) return;
    updateAlternative((draft) => {
      const result = moveRoomPointInPlan(draft.plan, roomId, pointIndex, absolutePoint, snappingDisabled);
      if (result === "invalid-polygon") setStatus("Room polygon edits cannot cross another room edge.");
    }, undoMode);
  }

  return {
    clearSnapState,
    selectPlanObject,
    toggleStructureLock,
    finishPolygonRoom,
    handleStageMouseDown,
    calibrationMeasurementLabel,
    applyCalibration,
    moveOpening,
    resizeOpening,
    moveWall,
    moveWallEndpoint,
    moveRectangularObject,
    moveRoomPoint,
  };
}
