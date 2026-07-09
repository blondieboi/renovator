import { useEffect } from "react";
import { normalizeAngle } from "../geometry";
import {
  findPlanObject,
  isStructuralPlanObject,
  safePixelsPerMeter,
  type ActiveStructure,
  type SelectablePlanObject,
} from "../model";
import { removePlanObjectInAlternative, resizeWallLengthInPlan, rotateWallInPlan } from "../planActions";
import type { Alternative, Fixture, Room } from "../types";
import { centimetersFromPixels, pixelsFromCentimeters, roomPoints } from "../utils";
import type { PlanUndoMode } from "./usePlanTransactions";

type InspectorSelectionOptions = {
  alternative?: Alternative;
  activeStructure?: ActiveStructure;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  structureLocked: boolean;
  updateAlternative: (updater: (alternative: Alternative) => void, undoMode?: PlanUndoMode) => void;
  updateAlternativeWithRoomBoards: (updater: (alternative: Alternative) => void) => void;
};

function isFixtureObject(object: SelectablePlanObject): object is Fixture {
  return !("x2" in object) && object.kind !== "room" && object.kind !== "door" && object.kind !== "window";
}

function isQuarterTurn(rotation: number) {
  const angle = normalizeAngle(rotation);
  return Math.abs(angle - 90) < 0.001 || Math.abs(angle - 270) < 0.001;
}

export function useInspectorSelection({
  alternative,
  activeStructure,
  selectedId,
  setSelectedId,
  structureLocked,
  updateAlternative,
  updateAlternativeWithRoomBoards,
}: InspectorSelectionOptions) {
  const plan = alternative?.plan;
  const selection = plan && selectedId ? findPlanObject(plan, selectedId) : undefined;
  const selectedRoom = selection?.kind === "room" ? selection : undefined;
  const selectedShape = selection && !selectedRoom ? selection : undefined;
  const isSelectedObjectLocked = Boolean(structureLocked && selection && isStructuralPlanObject(selection));

  useEffect(() => {
    if (isSelectedObjectLocked) setSelectedId(null);
  }, [isSelectedObjectLocked, setSelectedId]);

  function updateSelectedRotation(value: number) {
    if (!selectedId || Number.isNaN(value) || isSelectedObjectLocked) return;
    updateAlternative((draft) => {
      const object = findPlanObject(draft.plan, selectedId);
      if (!object) return;
      const rotation = normalizeAngle(value);
      if ("x2" in object) {
        rotateWallInPlan(draft.plan, object.id, rotation);
        return;
      }
      object.rotation = rotation;
    });
  }

  function deleteSelected() {
    if (!selectedId || isSelectedObjectLocked) return;
    updateAlternativeWithRoomBoards((draft) => {
      removePlanObjectInAlternative(draft, selectedId);
    });
    setSelectedId(null);
  }

  function updateSelectedName(name: string) {
    if (!selectedId || isSelectedObjectLocked) return;
    updateAlternative((draft) => {
      const object = findPlanObject(draft.plan, selectedId);
      if (object) object.name = name;
    });
  }

  function updateSelectedDimension(dimension: "width" | "height", value: number) {
    if (!selectedId || Number.isNaN(value) || isSelectedObjectLocked) return;
    updateAlternative((draft) => {
      const object = findPlanObject(draft.plan, selectedId);
      if (!object) return;
      const nextValue = Math.max(1, value);
      if ("x2" in object) {
        if (dimension === "width") {
          resizeWallLengthInPlan(draft.plan, object.id, nextValue);
        } else {
          object.height = nextValue;
          object.thickness = nextValue;
        }
        return;
      }
      if (object.kind === "room") {
        const room = object as Room;
        const currentSize = Math.max(1, dimension === "width" ? room.width : room.height);
        const scale = nextValue / currentSize;
        room.points = roomPoints(room).map((point) => ({
          x: dimension === "width" ? point.x * scale : point.x,
          y: dimension === "height" ? point.y * scale : point.y,
        }));
      }
      object[dimension] = nextValue;
    });
  }

  function updateSelectedRoomDimensionCentimeters(dimension: "width" | "height", value: number) {
    const pixelsPerMeter = plan ? safePixelsPerMeter(plan) : undefined;
    if (!pixelsPerMeter || Number.isNaN(value)) return;
    updateSelectedDimension(dimension, pixelsFromCentimeters(value, pixelsPerMeter));
  }

  function updateSelectedDimensionCentimeters(dimension: "width" | "height", value: number) {
    const pixelsPerMeter = plan ? safePixelsPerMeter(plan) : undefined;
    if (!pixelsPerMeter || Number.isNaN(value)) return;
    const targetDimension =
      selectedShape && isFixtureObject(selectedShape) && isQuarterTurn(selectedShape.rotation)
        ? dimension === "width"
          ? "height"
          : "width"
        : dimension;
    updateSelectedDimension(targetDimension, pixelsFromCentimeters(value, pixelsPerMeter));
  }

  function updateSelectedRoomHeight(value: number) {
    if (!selectedId || Number.isNaN(value) || isSelectedObjectLocked) return;
    updateAlternative((draft) => {
      const room = draft.plan.rooms.find((item) => item.id === selectedId);
      if (room) room.ceilingHeightMeters = Math.max(0.1, value);
    });
  }

  const selectedRoomHeight = selectedRoom?.ceilingHeightMeters ?? plan?.scale.ceilingHeightMeters ?? 2.55;
  const selectedShapeUsesVisualDimensions =
    selectedShape && isFixtureObject(selectedShape) && isQuarterTurn(selectedShape.rotation);
  const inspectorTitle =
    selectedRoom?.name ??
    selectedShape?.name ??
    (activeStructure?.type === "floor"
      ? activeStructure.floor.name
      : activeStructure?.type === "alternative"
        ? activeStructure.alternative.name
        : "Details");

  return {
    plan,
    selection,
    selectedRoom,
    selectedShape,
    inspectorTitle,
    selectedRoomWidthCentimeters:
      selectedRoom && plan ? centimetersFromPixels(selectedRoom.width, safePixelsPerMeter(plan)) : 0,
    selectedRoomLengthCentimeters:
      selectedRoom && plan ? centimetersFromPixels(selectedRoom.height, safePixelsPerMeter(plan)) : 0,
    selectedRoomHeightCentimeters: selectedRoomHeight * 100,
    selectedShapeNameLabel:
      selectedShape?.kind === "door" || selectedShape?.kind === "window"
        ? `${selectedShape.kind[0].toUpperCase()}${selectedShape.kind.slice(1)} name`
        : "Shape name",
    selectedShapeWidthLabel: selectedShape && "x2" in selectedShape ? "Length" : "Width",
    selectedShapeHeightLabel: selectedShape && "x2" in selectedShape ? "Thickness" : "Height",
    selectedShapeWidthCentimeters:
      selectedShape && plan
        ? centimetersFromPixels(
            selectedShapeUsesVisualDimensions ? selectedShape.height : selectedShape.width,
            safePixelsPerMeter(plan),
          )
        : 0,
    selectedShapeHeightCentimeters:
      selectedShape && plan
        ? centimetersFromPixels(
            selectedShapeUsesVisualDimensions ? selectedShape.width : selectedShape.height,
            safePixelsPerMeter(plan),
          )
        : 0,
    updateSelectedRotation,
    deleteSelected,
    updateSelectedName,
    updateSelectedRoomDimensionCentimeters,
    updateSelectedDimensionCentimeters,
    updateSelectedRoomHeight,
  };
}
