import { Maximize2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { KonvaEventObject } from "konva/lib/Node";
import type { MutableRefObject, RefObject } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import {
  type ActiveSnap,
  constrainOpeningHandle,
  constrainedOpeningPosition,
  openingHandlePoints,
  resolveWallEndpointSnap,
} from "../geometry";
import { safeGridSize, safePixelsPerMeter } from "../model";
import type { Plan, PlanPoint, Room, ToolMode } from "../types";
import { centimetersFromPixels, flattenPoints, formatCentimeters, roomArea, roomLabelPoint, roomPoints } from "../utils";
import PlanFixtureGlyph from "./PlanFixtureGlyph";

type PlanUndoMode = "record" | "skip";

type CanvasSnapPreview = {
  openingWallId?: string;
  wallGuide?: {
    start: PlanPoint;
    end: PlanPoint;
    point: PlanPoint;
  };
};

interface PlanCanvasProps {
  plan: Plan;
  tool: ToolMode;
  structureLocked: boolean;
  selectedId: string | null;
  stageSize: { width: number; height: number };
  viewport: { x: number; y: number; scale: number };
  backgroundImage?: HTMLImageElement;
  canvasShellRef: RefObject<HTMLDivElement>;
  snappingDisabledRef: MutableRefObject<boolean>;
  activeOpeningSnapRef: MutableRefObject<ActiveSnap | undefined>;
  activeWallEndpointSnapRef: MutableRefObject<ActiveSnap | undefined>;
  snapPreview: CanvasSnapPreview;
  polygonDraft: PlanPoint[];
  calibrationPoints: PlanPoint[];
  canUndoPlanChange: boolean;
  calibrationMeasurementLabel: string;
  onUndo: () => void;
  onZoom: (nextScale: number) => void;
  onResetView: () => void;
  onStageMouseDown: (event: KonvaEventObject<MouseEvent>) => void;
  onStageMouseMove: (event: KonvaEventObject<MouseEvent>) => void;
  onStopPanning: () => void;
  onWheel: (event: KonvaEventObject<WheelEvent>) => void;
  onFinishPolygonRoom: () => void;
  onSelectPlanObject: (id: string | null) => void;
  onRecordPlanUndoSnapshot: () => void;
  onMoveRectangularObject: (id: string, x: number, y: number, snappingDisabled: boolean, undoMode?: PlanUndoMode) => void;
  onMoveRoomPoint: (
    roomId: string,
    pointIndex: number,
    absolutePoint: PlanPoint,
    snappingDisabled: boolean,
    undoMode?: PlanUndoMode,
  ) => void;
  onMoveWall: (id: string, x: number, y: number, snappingDisabled: boolean, undoMode?: PlanUndoMode) => void;
  onMoveWallEndpoint: (
    id: string,
    endpoint: "start" | "end",
    point: PlanPoint,
    snappingDisabled: boolean,
    undoMode?: PlanUndoMode,
  ) => void;
  onMoveOpening: (id: string, x: number, y: number, snappingDisabled: boolean, undoMode?: PlanUndoMode) => void;
  onResizeOpening: (
    id: string,
    endpoint: "start" | "end",
    point: PlanPoint,
    snappingDisabled: boolean,
    undoMode?: PlanUndoMode,
  ) => void;
  onClearSnapState: () => void;
}

function PlanCanvas({
  plan,
  tool,
  structureLocked,
  selectedId,
  stageSize,
  viewport,
  backgroundImage,
  canvasShellRef,
  snappingDisabledRef,
  activeOpeningSnapRef,
  activeWallEndpointSnapRef,
  snapPreview,
  polygonDraft,
  calibrationPoints,
  canUndoPlanChange,
  calibrationMeasurementLabel,
  onUndo,
  onZoom,
  onResetView,
  onStageMouseDown,
  onStageMouseMove,
  onStopPanning,
  onWheel,
  onFinishPolygonRoom,
  onSelectPlanObject,
  onRecordPlanUndoSnapshot,
  onMoveRectangularObject,
  onMoveRoomPoint,
  onMoveWall,
  onMoveWallEndpoint,
  onMoveOpening,
  onResizeOpening,
  onClearSnapState,
}: PlanCanvasProps) {
  function stagePlanPointer(event: KonvaEventObject<MouseEvent | WheelEvent | DragEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position) return;
    return {
      x: (position.x - viewport.x) / viewport.scale,
      y: (position.y - viewport.y) / viewport.scale,
    };
  }

  function planToStagePoint(point: PlanPoint): PlanPoint {
    return {
      x: point.x * viewport.scale + viewport.x,
      y: point.y * viewport.scale + viewport.y,
    };
  }

  function stageToPlanPoint(point: PlanPoint): PlanPoint {
    return {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    };
  }

  function gridLines() {
    const grid = safeGridSize(plan);
    const lines = [];
    const visibleLeft = -viewport.x / viewport.scale;
    const visibleTop = -viewport.y / viewport.scale;
    const visibleRight = (stageSize.width - viewport.x) / viewport.scale;
    const visibleBottom = (stageSize.height - viewport.y) / viewport.scale;
    const firstGridX = Math.floor(visibleLeft / grid) * grid;
    const firstGridY = Math.floor(visibleTop / grid) * grid;
    for (let x = firstGridX; x < visibleRight + grid; x += grid) {
      lines.push(
        <Line
          key={`gx-${x}`}
          points={[x, visibleTop, x, visibleBottom]}
          stroke="#dde2d9"
          strokeWidth={1}
          listening={false}
        />,
      );
    }
    for (let y = firstGridY; y < visibleBottom + grid; y += grid) {
      lines.push(
        <Line
          key={`gy-${y}`}
          points={[visibleLeft, y, visibleRight, y]}
          stroke="#dde2d9"
          strokeWidth={1}
          listening={false}
        />,
      );
    }
    return lines;
  }

  return (
    <div className="canvas-shell" ref={canvasShellRef}>
      <div className="canvas-controls">
        <button
          onClick={onUndo}
          disabled={!canUndoPlanChange}
          aria-label="Undo last plan change"
          title={canUndoPlanChange ? "Undo last plan change" : "No plan changes to undo"}
        >
          <Undo2 size={16} />
        </button>
        <i className="canvas-control-divider" aria-hidden="true" />
        <button onClick={() => onZoom(viewport.scale * 1.15)} aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => onZoom(viewport.scale / 1.15)} aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button onClick={onResetView} aria-label="Reset view">
          <Maximize2 size={16} />
        </button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <small>Scroll pan · pinch zoom · Space drag · Alt free-drag · Cmd/Ctrl Z undo</small>
      </div>
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStopPanning}
        onMouseLeave={onStopPanning}
        onWheel={onWheel}
        onDblClick={onFinishPolygonRoom}
      >
        <Layer>
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            {gridLines()}
            {backgroundImage && plan.scale.backgroundVisible !== false && (
              <KonvaImage
                image={backgroundImage}
                x={plan.scale.backgroundX ?? 20}
                y={plan.scale.backgroundY ?? 20}
                opacity={0.56}
                width={plan.scale.backgroundWidth ?? Math.min(backgroundImage.width, Math.max(320, stageSize.width - 40))}
                height={
                  plan.scale.backgroundHeight ??
                  ((Math.min(backgroundImage.width, Math.max(320, stageSize.width - 40)) / backgroundImage.width) *
                    backgroundImage.height)
                }
                listening={false}
              />
            )}
            {plan.rooms.map((room) => {
              const labelPoint = roomLabelPoint(room);
              return (
                <Group
                  key={room.id}
                  x={room.x}
                  y={room.y}
                  draggable={tool === "select" && !structureLocked}
                  listening={!structureLocked}
                  onClick={() => {
                    if (tool === "select") onSelectPlanObject(room.id);
                  }}
                  onDragStart={(event) => {
                    if (event.target === event.currentTarget) onRecordPlanUndoSnapshot();
                  }}
                  onDragEnd={(event) => {
                    if (event.target !== event.currentTarget) return;
                    onMoveRectangularObject(room.id, event.target.x(), event.target.y(), event.evt.altKey, "skip");
                  }}
                >
                  <Line
                    points={flattenPoints(roomPoints(room))}
                    closed
                    fill={room.color}
                    opacity={0.34}
                    stroke={selectedId === room.id ? "#242a27" : "#5f7f72"}
                    strokeWidth={selectedId === room.id ? 3 : 1}
                  />
                  <Text
                    x={labelPoint.x - 50}
                    y={labelPoint.y - 13}
                    width={100}
                    text={`${room.name}\n${roomArea(room, safePixelsPerMeter(plan)).toFixed(1)} m2`}
                    fontSize={12}
                    fontStyle="bold"
                    fill="#242a27"
                    align="center"
                    listening={false}
                  />
                  {selectedId === room.id &&
                    tool === "select" &&
                    !structureLocked &&
                    roomPoints(room).map((point, index) => (
                      <Circle
                        key={`${room.id}-point-${index}`}
                        x={point.x}
                        y={point.y}
                        radius={7}
                        fill="#ffffff"
                        stroke="#242a27"
                        strokeWidth={2}
                        draggable
                        onMouseDown={(event) => {
                          event.cancelBubble = true;
                        }}
                        onDragStart={(event) => {
                          event.cancelBubble = true;
                          onRecordPlanUndoSnapshot();
                        }}
                        onDragMove={(event) => {
                          event.cancelBubble = true;
                          const planPoint = stagePlanPointer(event);
                          if (!planPoint) return;
                          onMoveRoomPoint(room.id, index, planPoint, event.evt.altKey, "skip");
                        }}
                        onDragEnd={(event) => {
                          event.cancelBubble = true;
                          const planPoint = stagePlanPointer(event);
                          if (!planPoint) return;
                          onMoveRoomPoint(room.id, index, planPoint, event.evt.altKey, "skip");
                        }}
                      />
                    ))}
                </Group>
              );
            })}
            {plan.walls.map((wall) => (
              <Group
                key={wall.id}
                x={wall.x}
                y={wall.y}
                draggable={tool === "select" && !structureLocked}
                listening={!structureLocked}
                onClick={() => {
                  if (tool === "select") onSelectPlanObject(wall.id);
                }}
                onDragStart={(event) => {
                  if (event.target === event.currentTarget) onRecordPlanUndoSnapshot();
                }}
                onDragEnd={(event) => {
                  if (event.target !== event.currentTarget) return;
                  onMoveWall(wall.id, event.currentTarget.x(), event.currentTarget.y(), event.evt.altKey, "skip");
                }}
                onMouseEnter={(event) => {
                  event.target.getStage()!.container().style.cursor = "pointer";
                }}
                onMouseLeave={(event) => {
                  event.target.getStage()!.container().style.cursor = "default";
                }}
              >
                <Line
                  points={[0, 0, wall.x2 - wall.x, wall.y2 - wall.y]}
                  stroke={selectedId === wall.id ? "#242a27" : "#303732"}
                  strokeWidth={selectedId === wall.id ? wall.thickness + 4 : wall.thickness}
                  lineCap="square"
                />
                {selectedId === wall.id &&
                  tool === "select" &&
                  !structureLocked &&
                  ([
                    { endpoint: "start" as const, x: 0, y: 0 },
                    { endpoint: "end" as const, x: wall.x2 - wall.x, y: wall.y2 - wall.y },
                  ].map((handle) => (
                    <Circle
                      key={`${wall.id}-${handle.endpoint}-handle`}
                      x={handle.x}
                      y={handle.y}
                      radius={7}
                      fill="#ffffff"
                      stroke="#242a27"
                      strokeWidth={2}
                      draggable
                      dragBoundFunc={(position) => {
                        if (snappingDisabledRef.current) return position;
                        const point = stageToPlanPoint(position);
                        const origin =
                          handle.endpoint === "start" ? { x: wall.x2, y: wall.y2 } : { x: wall.x, y: wall.y };
                        const resolved = resolveWallEndpointSnap({
                          point,
                          origin,
                          walls: plan.walls,
                          gridSize: safeGridSize(plan),
                          viewportScale: viewport.scale,
                          excludeWallId: wall.id,
                          activeSnap: activeWallEndpointSnapRef.current,
                        });
                        return planToStagePoint(resolved.point);
                      }}
                      onMouseDown={(event) => {
                        event.cancelBubble = true;
                      }}
                      onDragStart={(event) => {
                        event.cancelBubble = true;
                        activeWallEndpointSnapRef.current = undefined;
                        onRecordPlanUndoSnapshot();
                      }}
                      onDragMove={(event) => {
                        event.cancelBubble = true;
                        const point = stagePlanPointer(event);
                        if (!point) return;
                        onMoveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey, "skip");
                      }}
                      onDragEnd={(event) => {
                        event.cancelBubble = true;
                        const point = stagePlanPointer(event);
                        if (!point) return;
                        onMoveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey, "skip");
                        onClearSnapState();
                      }}
                    />
                  )))}
              </Group>
            ))}
            {snapPreview.openingWallId &&
              (() => {
                const targetWall = plan.walls.find((wall) => wall.id === snapPreview.openingWallId);
                if (!targetWall) return null;
                return (
                  <Line
                    key="opening-snap-wall"
                    points={[targetWall.x, targetWall.y, targetWall.x2, targetWall.y2]}
                    stroke="#2f8f83"
                    strokeWidth={targetWall.thickness + 8}
                    opacity={0.28}
                    lineCap="square"
                    listening={false}
                  />
                );
              })()}
            {snapPreview.wallGuide && (
              <>
                <Line
                  points={[
                    snapPreview.wallGuide.start.x,
                    snapPreview.wallGuide.start.y,
                    snapPreview.wallGuide.end.x,
                    snapPreview.wallGuide.end.y,
                  ]}
                  stroke="#2f8f83"
                  strokeWidth={2}
                  dash={[8, 6]}
                  listening={false}
                />
                <Circle
                  x={snapPreview.wallGuide.point.x}
                  y={snapPreview.wallGuide.point.y}
                  radius={5}
                  fill="#2f8f83"
                  listening={false}
                />
              </>
            )}
            {plan.walls.map((wall) => {
              const length = Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
              return (
                <Text
                  key={`${wall.id}-measurement`}
                  x={(wall.x + wall.x2) / 2 - 18}
                  y={(wall.y + wall.y2) / 2 - 24}
                  text={formatCentimeters(centimetersFromPixels(length, safePixelsPerMeter(plan)))}
                  fontSize={12}
                  fill="#687068"
                  listening={false}
                />
              );
            })}
            {plan.openings.map((opening) => {
              const handles = openingHandlePoints(opening);
              return (
                <Group key={opening.id}>
                  <Rect
                    x={opening.x}
                    y={opening.y}
                    width={opening.width}
                    height={opening.height}
                    rotation={opening.rotation}
                    fill={opening.kind === "door" ? "#f2ead7" : "#d6edf1"}
                    stroke={selectedId === opening.id ? "#242a27" : "#6d7f7c"}
                    strokeWidth={2}
                    cornerRadius={2}
                    draggable={tool === "select" && !structureLocked}
                    listening={!structureLocked}
                    dragBoundFunc={(position) => {
                      if (snappingDisabledRef.current) return position;
                      const point = stageToPlanPoint(position);
                      const constrained = constrainedOpeningPosition(
                        opening,
                        point.x,
                        point.y,
                        plan,
                        false,
                        viewport.scale,
                        activeOpeningSnapRef.current,
                      );
                      return planToStagePoint({ x: constrained.x, y: constrained.y });
                    }}
                    onClick={() => {
                      if (tool === "select") onSelectPlanObject(opening.id);
                    }}
                    onDragStart={() => {
                      activeOpeningSnapRef.current = opening.wallId
                        ? { kind: "opening-wall", wallId: opening.wallId }
                        : undefined;
                      onRecordPlanUndoSnapshot();
                    }}
                    onDragMove={(event) =>
                      onMoveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey, "skip")
                    }
                    onDragEnd={(event) => {
                      onMoveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey, "skip");
                      onClearSnapState();
                    }}
                  />
                  {selectedId === opening.id &&
                    tool === "select" &&
                    !structureLocked &&
                    ([
                      { endpoint: "start" as const, point: handles.start },
                      { endpoint: "end" as const, point: handles.end },
                    ].map((handle) => (
                      <Circle
                        key={`${opening.id}-${handle.endpoint}-handle`}
                        x={handle.point.x}
                        y={handle.point.y}
                        radius={6}
                        fill="#ffffff"
                        stroke="#242a27"
                        strokeWidth={2}
                        draggable
                        dragBoundFunc={(position) => {
                          if (snappingDisabledRef.current) return position;
                          const constrained = constrainOpeningHandle(
                            opening,
                            handle.endpoint,
                            stageToPlanPoint(position),
                            plan.walls,
                            safeGridSize(plan),
                            false,
                            viewport.scale,
                            activeOpeningSnapRef.current,
                          );
                          return planToStagePoint(constrained.point);
                        }}
                        onMouseDown={(event) => {
                          event.cancelBubble = true;
                        }}
                        onDragStart={(event) => {
                          event.cancelBubble = true;
                          activeOpeningSnapRef.current = opening.wallId
                            ? { kind: "opening-wall", wallId: opening.wallId }
                            : undefined;
                          onRecordPlanUndoSnapshot();
                        }}
                        onDragMove={(event) => {
                          event.cancelBubble = true;
                          const point = stagePlanPointer(event);
                          if (!point) return;
                          onResizeOpening(opening.id, handle.endpoint, point, event.evt.altKey, "skip");
                        }}
                        onDragEnd={(event) => {
                          event.cancelBubble = true;
                          const point = stagePlanPointer(event);
                          if (!point) return;
                          onResizeOpening(opening.id, handle.endpoint, point, event.evt.altKey, "skip");
                          onClearSnapState();
                        }}
                      />
                    )))}
                </Group>
              );
            })}
            {plan.fixtures.map((fixture) => (
              <Group
                key={fixture.id}
                x={fixture.x}
                y={fixture.y}
                rotation={fixture.rotation}
                draggable={tool === "select"}
                onClick={() => {
                  if (tool === "select") onSelectPlanObject(fixture.id);
                }}
                onDragStart={(event) => {
                  if (event.target === event.currentTarget) onRecordPlanUndoSnapshot();
                }}
                onDragEnd={(event) => {
                  if (event.target !== event.currentTarget) return;
                  onMoveRectangularObject(
                    fixture.id,
                    event.currentTarget.x(),
                    event.currentTarget.y(),
                    event.evt.altKey,
                    "skip",
                  );
                }}
              >
                <PlanFixtureGlyph fixture={fixture} selected={selectedId === fixture.id} />
              </Group>
            ))}
            {polygonDraft.length > 0 && (
              <>
                <Line
                  points={flattenPoints(polygonDraft)}
                  stroke="#5f7f72"
                  strokeWidth={3}
                  dash={[8, 6]}
                  closed={polygonDraft.length > 2}
                  fill={polygonDraft.length > 2 ? "#a8c8bb" : undefined}
                  opacity={0.5}
                  listening={false}
                />
                {polygonDraft.map((point, index) => (
                  <Circle
                    key={`draft-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={5}
                    fill="#5f7f72"
                    stroke="#ffffff"
                    strokeWidth={2}
                    listening={false}
                  />
                ))}
              </>
            )}
            {calibrationPoints.length > 0 && (
              <>
                <Line
                  points={flattenPoints(calibrationPoints)}
                  stroke="#d8b45a"
                  strokeWidth={3}
                  dash={[6, 5]}
                  listening={false}
                />
                {calibrationPoints.map((point, index) => (
                  <Circle
                    key={`calibration-point-${index}`}
                    x={point.x}
                    y={point.y}
                    radius={6}
                    fill="#ffffff"
                    stroke="#d8b45a"
                    strokeWidth={3}
                    listening={false}
                  />
                ))}
                {calibrationPoints.length === 2 && (
                  <Text
                    x={(calibrationPoints[0].x + calibrationPoints[1].x) / 2 + 8}
                    y={(calibrationPoints[0].y + calibrationPoints[1].y) / 2 - 18}
                    text={calibrationMeasurementLabel}
                    fontSize={13}
                    fontStyle="bold"
                    fill="#675b35"
                    listening={false}
                  />
                )}
              </>
            )}
          </Group>
        </Layer>
      </Stage>
    </div>
  );
}

export default PlanCanvas;
