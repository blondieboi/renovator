import type { KonvaEventObject } from "konva/lib/Node";
import { useEffect, useRef, useState } from "react";
import type { PlanPoint } from "../types";

export interface CanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export function useCanvasViewport(measureKey: unknown) {
  const [stageSize, setStageSize] = useState({ width: 1000, height: 720 });
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const panLastRef = useRef<PlanPoint | null>(null);

  useEffect(() => {
    const measure = () => {
      const rect = canvasShellRef.current?.getBoundingClientRect();
      if (rect) setStageSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    if (canvasShellRef.current) resizeObserver.observe(canvasShellRef.current);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measureKey]);

  function startPanning(pointer: PlanPoint | null | undefined) {
    panLastRef.current = pointer ?? null;
  }

  function stopPanning() {
    panLastRef.current = null;
  }

  function movePanning(event: KonvaEventObject<MouseEvent>, enabled: boolean) {
    if (!enabled || !panLastRef.current) return;
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const dx = pointer.x - panLastRef.current.x;
    const dy = pointer.y - panLastRef.current.y;
    panLastRef.current = pointer;
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function zoomCanvas(nextScale: number, anchor = { x: stageSize.width / 2, y: stageSize.height / 2 }) {
    setViewport((current) => {
      const scale = Math.min(3, Math.max(0.35, nextScale));
      const planX = (anchor.x - current.x) / current.scale;
      const planY = (anchor.y - current.y) / current.scale;
      return {
        scale,
        x: anchor.x - planX * scale,
        y: anchor.y - planY * scale,
      };
    });
  }

  function handleWheel(event: KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const pointer = event.target.getStage()?.getPointerPosition();
    if (event.evt.ctrlKey || event.evt.metaKey) {
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const factor = direction > 0 ? 1.08 : 1 / 1.08;
      if (pointer) {
        zoomCanvas(viewport.scale * factor, pointer);
      } else {
        zoomCanvas(viewport.scale * factor);
      }
      return;
    }
    setViewport((current) => ({
      ...current,
      x: current.x - event.evt.deltaX,
      y: current.y - event.evt.deltaY,
    }));
  }

  function resetCanvasView() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  return {
    canvasShellRef,
    stageSize,
    viewport,
    startPanning,
    stopPanning,
    movePanning,
    zoomCanvas,
    handleWheel,
    resetCanvasView,
  };
}
