import { useState } from "react";

const planUndoLimit = 50;

export interface PlanUndoSnapshotBase {
  activeAlternativeId: string;
}

export function usePlanUndoStack<Snapshot extends PlanUndoSnapshotBase>(activeAlternativeId: string) {
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const canUndoPlanChange = undoStack[undoStack.length - 1]?.activeAlternativeId === activeAlternativeId;

  function recordUndoSnapshot(snapshot: Snapshot) {
    setUndoStack((current) => [...current.slice(-(planUndoLimit - 1)), snapshot]);
  }

  function undoLastSnapshot(applySnapshot: (snapshot: Snapshot) => void) {
    const snapshot = undoStack[undoStack.length - 1];
    if (!snapshot || snapshot.activeAlternativeId !== activeAlternativeId) return;
    setUndoStack((current) => current.slice(0, -1));
    applySnapshot(snapshot);
  }

  return {
    canUndoPlanChange,
    recordUndoSnapshot,
    undoLastSnapshot,
  };
}
