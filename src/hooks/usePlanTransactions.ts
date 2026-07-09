import type { Dispatch, SetStateAction } from "react";
import type { StructureSelection } from "../model";
import type { Alternative, PropertyProject } from "../types";
import { nowIso } from "../utils";
import { usePlanUndoStack, type PlanUndoSnapshotBase } from "./usePlanUndoStack";
import type { ProjectRepositoryState } from "./useProjectRepository";

export type PlanUndoMode = "record" | "skip";

export type PlanUndoSnapshot = PlanUndoSnapshotBase & {
  plan: Alternative["plan"];
  selectedId: string | null;
  structureSelection: StructureSelection | null;
};

type PlanTransactionsOptions = {
  repositoryState: ProjectRepositoryState;
  setStatus: (status: string) => void;
  setProjects: Dispatch<SetStateAction<PropertyProject[]>>;
  activePropertyId: string;
  activeFloorId: string;
  activeAlternativeId: string;
  activeAlternative?: Alternative;
  selectedId: string | null;
  structureSelection: StructureSelection | null;
  onUndoRestored: (snapshot: PlanUndoSnapshot) => void;
};

function replaceActiveAlternative(
  projects: PropertyProject[],
  activePropertyId: string,
  activeFloorId: string,
  activeAlternativeId: string,
  createDraft: (alternative: Alternative) => Alternative,
  updater: (alternative: Alternative) => void,
) {
  return projects.map((property) => {
    if (property.id !== activePropertyId) return property;
    let changed = false;
    const floors = property.floors.map((floor) => {
      if (floor.id !== activeFloorId) return floor;
      const alternatives = floor.alternatives.map((alternative) => {
        if (alternative.id !== activeAlternativeId) return alternative;
        const draft = createDraft(alternative);
        updater(draft);
        changed = true;
        return draft;
      });
      return { ...floor, alternatives };
    });
    return changed ? { ...property, floors, updatedAt: nowIso() } : property;
  });
}

export function usePlanTransactions({
  repositoryState,
  setStatus,
  setProjects,
  activePropertyId,
  activeFloorId,
  activeAlternativeId,
  activeAlternative,
  selectedId,
  structureSelection,
  onUndoRestored,
}: PlanTransactionsOptions) {
  const { canUndoPlanChange, recordUndoSnapshot, undoLastSnapshot } =
    usePlanUndoStack<PlanUndoSnapshot>(activeAlternativeId);

  function recordPlanUndoSnapshot() {
    if (!activeAlternative) return;
    recordUndoSnapshot({
      plan: structuredClone(activeAlternative.plan),
      activeAlternativeId,
      selectedId,
      structureSelection: structureSelection ? { ...structureSelection } : null,
    });
  }

  function undoLastPlanChange() {
    undoLastSnapshot((snapshot) => {
      setStatus("Saving...");
      setProjects((current) =>
        replaceActiveAlternative(
          current,
          activePropertyId,
          activeFloorId,
          snapshot.activeAlternativeId,
          (alternative) => ({ ...alternative, plan: structuredClone(snapshot.plan) }),
          () => {},
        ),
      );
      onUndoRestored(snapshot);
    });
  }

  function updateAlternative(updater: (alternative: Alternative) => void, undoMode: PlanUndoMode = "record") {
    if (repositoryState !== "ready") return;
    if (undoMode === "record") recordPlanUndoSnapshot();
    setStatus("Saving...");
    setProjects((current) =>
      replaceActiveAlternative(
        current,
        activePropertyId,
        activeFloorId,
        activeAlternativeId,
        (alternative) => ({ ...alternative, plan: structuredClone(alternative.plan) }),
        updater,
      ),
    );
  }

  function updateRoomBoards(updater: (alternative: Alternative) => void) {
    if (repositoryState !== "ready") return;
    setStatus("Saving...");
    setProjects((current) =>
      replaceActiveAlternative(
        current,
        activePropertyId,
        activeFloorId,
        activeAlternativeId,
        (alternative) => ({ ...alternative, roomBoards: structuredClone(alternative.roomBoards) }),
        updater,
      ),
    );
  }

  function updateAlternativeWithRoomBoards(updater: (alternative: Alternative) => void) {
    if (repositoryState !== "ready") return;
    recordPlanUndoSnapshot();
    setStatus("Saving...");
    setProjects((current) =>
      replaceActiveAlternative(
        current,
        activePropertyId,
        activeFloorId,
        activeAlternativeId,
        (alternative) => structuredClone(alternative),
        updater,
      ),
    );
  }

  return {
    canUndoPlanChange,
    recordPlanUndoSnapshot,
    undoLastPlanChange,
    updateAlternative,
    updateRoomBoards,
    updateAlternativeWithRoomBoards,
  };
}
