import {
  AppWindow,
  BedDouble,
  Camera,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  Grid3X3,
  Hand,
  Home,
  ImagePlus,
  Import,
  Layers3,
  Maximize2,
  MousePointer2,
  Pentagon,
  PencilRuler,
  Plus,
  Ruler,
  Square,
  Trash2,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import { db, loadProjects, saveProjects } from "./db";
import {
  constrainOpeningHandle,
  constrainedOpeningPosition,
  distance,
  nearestOpeningWall,
  normalizeAngle,
  openingHandlePoints,
  placeOpeningAnchorAtPoint,
  placeOpeningBetweenHandles,
  snapPointToGrid,
  snapStructuralPoint,
  snapThreshold,
  wallAngle,
} from "./geometry";
import { pdfFileToImageAsset } from "./pdf";
import type {
  Alternative,
  Asset,
  Fixture,
  FixtureKind,
  Floor,
  Opening,
  Plan,
  PlanPoint,
  PropertyProject,
  Room,
  RoomBoard,
  ToolMode,
  Wall,
} from "./types";
import {
  createAlternative,
  createRoomBoard,
  downloadJson,
  fixtureLabels,
  flattenPoints,
  metersFromPixels,
  nowIso,
  rectangleRoomPoints,
  readFileAsDataUrl,
  roomArea,
  roomLabelPoint,
  roomPoints,
  uid,
} from "./utils";
import ThreePreview from "./ThreePreview";

const toolGroups: Array<{
  title: string;
  items: Array<{ mode: ToolMode; label: string; icon: JSX.Element }>;
}> = [
  {
    title: "Edit",
    items: [
      { mode: "select", label: "Select", icon: <MousePointer2 size={18} /> },
      { mode: "pan", label: "Pan", icon: <Hand size={18} /> },
      { mode: "calibrate", label: "Scale", icon: <Ruler size={18} /> },
    ],
  },
  {
    title: "Structure",
    items: [
      { mode: "wall", label: "Wall", icon: <PencilRuler size={18} /> },
      { mode: "room", label: "Room", icon: <Square size={18} /> },
      { mode: "polyRoom", label: "Polygon", icon: <Pentagon size={18} /> },
    ],
  },
  {
    title: "Openings",
    items: [
      { mode: "door", label: "Door", icon: <DoorOpen size={18} /> },
      { mode: "window", label: "Window", icon: <AppWindow size={18} /> },
    ],
  },
  {
    title: "Objects",
    items: [{ mode: "fixture", label: "Fixture", icon: <BedDouble size={18} /> }],
  },
];

const fixtureKinds: FixtureKind[] = [
  "counter",
  "sink",
  "toilet",
  "shower",
  "tub",
  "stairs",
  "closet",
  "sofa",
  "bed",
  "table",
];

const roomColors = ["#a8c8bb", "#d8c079", "#d3aaa3", "#a8bdc8", "#beb0ca", "#b9c98e"];

type SelectablePlanObject = Plan["rooms"][number] | Plan["openings"][number] | Plan["fixtures"][number] | Plan["walls"][number];
type StructureSelection = { type: "project" | "floor" | "alternative"; id: string };

function useHtmlImage(src?: string) {
  const [image, setImage] = useState<HTMLImageElement | undefined>();
  useEffect(() => {
    if (!src) {
      setImage(undefined);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.src = src;
  }, [src]);
  return image;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function findPlanObject(plan: Plan, id: string): SelectablePlanObject | undefined {
  return [...plan.rooms, ...plan.openings, ...plan.fixtures, ...plan.walls].find((item) => item.id === id);
}

function getOrCreateRoomBoard(alternative: Alternative, roomId: string): RoomBoard {
  const existing = alternative.roomBoards.find((item) => item.roomId === roomId);
  if (existing) return existing;
  const board = createRoomBoard(roomId);
  alternative.roomBoards.push(board);
  return board;
}

function App() {
  const [projects, setProjects] = useState<PropertyProject[]>([]);
  const [activePropertyId, setActivePropertyId] = useState("");
  const [activeFloorId, setActiveFloorId] = useState("");
  const [activeAlternativeId, setActiveAlternativeId] = useState("");
  const [tool, setTool] = useState<ToolMode>("select");
  const [fixtureKind, setFixtureKind] = useState<FixtureKind>("counter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [structureSelection, setStructureSelection] = useState<StructureSelection | null>(null);
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"plan" | "media" | "three">("plan");
  const [draftPrompts, setDraftPrompts] = useState<Record<string, string>>({});
  const [previewAsset, setPreviewAsset] = useState<{ asset: Asset; label: string } | null>(null);
  const [status, setStatus] = useState("Loading local workshop...");
  const [stageSize, setStageSize] = useState({ width: 1000, height: 720 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [polygonDraft, setPolygonDraft] = useState<PlanPoint[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<PlanPoint[]>([]);
  const [calibrationMeters, setCalibrationMeters] = useState("1");
  const [spacePanning, setSpacePanning] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    data: true,
  });
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects().then((loaded) => {
      const property = loaded[0];
      const floor = property?.floors[0];
      const alternative = floor?.alternatives[0];
      setProjects(loaded);
      setActivePropertyId(property?.id ?? "");
      setActiveFloorId(floor?.id ?? "");
      setActiveAlternativeId(alternative?.id ?? "");
      setStructureSelection(alternative ? { type: "alternative", id: alternative.id } : null);
      setStatus("Saved locally");
    });
  }, []);

  useEffect(() => {
    if (projects.length === 0) return;
    const handle = window.setTimeout(() => {
      saveProjects(projects).then(() => setStatus("Saved locally"));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [projects]);

  useEffect(() => {
    const measure = () => {
      const rect = canvasShellRef.current?.getBoundingClientRect();
      if (rect) setStageSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [view]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (event.code === "Space" && !isTyping) {
        event.preventDefault();
        setSpacePanning(true);
      }
      if (tool !== "polyRoom") return;
      if (event.key === "Enter") {
        event.preventDefault();
        finishPolygonRoom();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setPolygonDraft([]);
        setTool("select");
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        setSpacePanning(false);
        stopPanning();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [polygonDraft, tool]);

  useEffect(() => {
    if (!previewAsset) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset]);

  const active = useMemo(() => {
    const property = projects.find((item) => item.id === activePropertyId);
    const floor = property?.floors.find((item) => item.id === activeFloorId);
    const alternative = floor?.alternatives.find((item) => item.id === activeAlternativeId);
    return { property, floor, alternative };
  }, [activeAlternativeId, activeFloorId, activePropertyId, projects]);

  const activeStructure = useMemo(() => {
    if (!structureSelection) return undefined;
    for (const property of projects) {
      if (structureSelection.type === "project" && property.id === structureSelection.id) {
        return { type: "project" as const, property };
      }
      for (const floor of property.floors) {
        if (structureSelection.type === "floor" && floor.id === structureSelection.id) {
          return { type: "floor" as const, property, floor };
        }
        const alternative = floor.alternatives.find((item) => item.id === structureSelection.id);
        if (structureSelection.type === "alternative" && alternative) {
          return { type: "alternative" as const, property, floor, alternative };
        }
      }
    }
    return undefined;
  }, [projects, structureSelection]);

  const backgroundImage = useHtmlImage(active.alternative?.plan.background?.dataUrl);

  useEffect(() => {
    if (!backgroundImage || !active.alternative?.plan.background) return;
    if (active.alternative.plan.scale.backgroundWidth && active.alternative.plan.scale.backgroundHeight) return;
    const width = Math.min(backgroundImage.width, Math.max(320, stageSize.width - 40));
    const height = (width / backgroundImage.width) * backgroundImage.height;
    updateAlternative((alternative) => {
      alternative.plan.scale.backgroundX = 20;
      alternative.plan.scale.backgroundY = 20;
      alternative.plan.scale.backgroundWidth = width;
      alternative.plan.scale.backgroundHeight = height;
    });
  }, [active.alternative?.id, backgroundImage, stageSize.width]);

  function updateProjects(updater: (draft: PropertyProject[]) => PropertyProject[]) {
    setStatus("Saving...");
    setProjects((current) => updater(structuredClone(current)));
  }

  function findActiveDraft(draft: PropertyProject[]) {
    const property = draft.find((item) => item.id === activePropertyId);
    const floor = property?.floors.find((item) => item.id === activeFloorId);
    const alternative = floor?.alternatives.find((item) => item.id === activeAlternativeId);
    return { property, floor, alternative };
  }

  function updateAlternative(updater: (alternative: Alternative) => void) {
    updateProjects((draft) => {
      const { property, alternative } = findActiveDraft(draft);
      if (property && alternative) {
        updater(alternative);
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function updateActiveProjectName(name: string) {
    updateProjects((draft) => {
      const { property } = findActiveDraft(draft);
      if (property) {
        property.name = name;
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function updateActiveFloorName(name: string) {
    updateProjects((draft) => {
      const { property, floor } = findActiveDraft(draft);
      if (property && floor) {
        floor.name = name;
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function updateActiveAlternativeName(name: string) {
    updateProjects((draft) => {
      const { property, alternative } = findActiveDraft(draft);
      if (property && alternative) {
        alternative.name = name;
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function selectProperty(id: string, selectionType: StructureSelection["type"] = "project") {
    const property = projects.find((item) => item.id === id);
    const floor = property?.floors[0];
    const alternative = floor?.alternatives[0];
    setActivePropertyId(id);
    setActiveFloorId(floor?.id ?? "");
    setActiveAlternativeId(alternative?.id ?? "");
    setSelectedId(null);
    setStructureSelection({ type: selectionType, id });
  }

  function selectFloor(id: string) {
    const floor = active.property?.floors.find((item) => item.id === id);
    setActiveFloorId(id);
    setActiveAlternativeId(floor?.alternatives[0]?.id ?? "");
    setSelectedId(null);
    setStructureSelection({ type: "floor", id });
  }

  function selectTreeFloor(propertyId: string, floorId: string) {
    const property = projects.find((item) => item.id === propertyId);
    const floor = property?.floors.find((item) => item.id === floorId);
    setActivePropertyId(propertyId);
    setActiveFloorId(floorId);
    setActiveAlternativeId(floor?.alternatives[0]?.id ?? "");
    setSelectedId(null);
    setStructureSelection({ type: "floor", id: floorId });
  }

  function selectTreeAlternative(propertyId: string, floorId: string, alternativeId: string) {
    setActivePropertyId(propertyId);
    setActiveFloorId(floorId);
    setActiveAlternativeId(alternativeId);
    setSelectedId(null);
    setStructureSelection({ type: "alternative", id: alternativeId });
  }

  function addAlternative(propertyId = activePropertyId, floorId = activeFloorId) {
    updateProjects((draft) => {
      const property = draft.find((item) => item.id === propertyId);
      const floor = property?.floors.find((item) => item.id === floorId);
      if (!property || !floor) return draft;
      const alternative = createAlternative(`Alternative ${floor.alternatives.length + 1}`);
      const current = floor.alternatives.find((item) => item.id === activeAlternativeId);
      if (current) {
        alternative.plan = structuredClone(current.plan);
        alternative.roomBoards = structuredClone(current.roomBoards);
      }
      floor.alternatives.push(alternative);
      property.updatedAt = nowIso();
      setActivePropertyId(property.id);
      setActiveFloorId(floor.id);
      setActiveAlternativeId(alternative.id);
      setSelectedId(null);
      setStructureSelection({ type: "alternative", id: alternative.id });
      setExpandedTreeNodes((currentExpanded) => ({ ...currentExpanded, [property.id]: true, [floor.id]: true }));
      return draft;
    });
  }

  function addFloor(propertyId = activePropertyId) {
    updateProjects((draft) => {
      const property = draft.find((item) => item.id === propertyId);
      if (!property) return draft;
      const floor: Floor = {
        id: uid("floor"),
        name: `Floor ${property.floors.length + 1}`,
        level: property.floors.length,
        alternatives: [createAlternative("Current layout")],
      };
      property.floors.push(floor);
      property.updatedAt = nowIso();
      setActivePropertyId(property.id);
      setActiveFloorId(floor.id);
      setActiveAlternativeId(floor.alternatives[0].id);
      setSelectedId(null);
      setStructureSelection({ type: "floor", id: floor.id });
      setExpandedTreeNodes((currentExpanded) => ({ ...currentExpanded, [property.id]: true, [floor.id]: true }));
      return draft;
    });
  }

  function deleteFloor(floorId: string) {
    const property = projects.find((item) => item.floors.some((floor) => floor.id === floorId));
    const floor = property?.floors.find((item) => item.id === floorId);
    if (!property || !floor || property.floors.length <= 1) return;
    if (!window.confirm(`Delete "${floor.name}" and all of its alternatives?`)) return;
    updateProjects((draft) => {
      const draftProperty = draft.find((item) => item.id === property.id);
      if (!draftProperty || draftProperty.floors.length <= 1) return draft;
      const floorIndex = draftProperty.floors.findIndex((item) => item.id === floorId);
      if (floorIndex < 0) return draft;
      draftProperty.floors.splice(floorIndex, 1);
      draftProperty.floors.forEach((item, index) => {
        item.level = index;
      });
      draftProperty.updatedAt = nowIso();

      if (activeFloorId === floorId) {
        const nextFloor = draftProperty.floors[Math.max(0, floorIndex - 1)] ?? draftProperty.floors[0];
        const nextAlternative = nextFloor?.alternatives[0];
        setActivePropertyId(draftProperty.id);
        setActiveFloorId(nextFloor?.id ?? "");
        setActiveAlternativeId(nextAlternative?.id ?? "");
        setSelectedId(null);
        setStructureSelection(
          nextAlternative
            ? { type: "alternative", id: nextAlternative.id }
            : nextFloor
              ? { type: "floor", id: nextFloor.id }
              : { type: "project", id: draftProperty.id },
        );
      }
      return draft;
    });
  }

  function deleteAlternative(floorId: string, alternativeId: string) {
    const property = projects.find((item) => item.floors.some((floor) => floor.id === floorId));
    const floor = property?.floors.find((item) => item.id === floorId);
    const alternative = floor?.alternatives.find((item) => item.id === alternativeId);
    if (!property || !floor || !alternative || floor.alternatives.length <= 1) return;
    if (!window.confirm(`Delete "${alternative.name}"?`)) return;
    updateProjects((draft) => {
      const draftProperty = draft.find((item) => item.id === property.id);
      const draftFloor = draftProperty?.floors.find((item) => item.id === floorId);
      if (!draftProperty || !draftFloor || draftFloor.alternatives.length <= 1) return draft;
      const alternativeIndex = draftFloor.alternatives.findIndex((item) => item.id === alternativeId);
      if (alternativeIndex < 0) return draft;
      draftFloor.alternatives.splice(alternativeIndex, 1);
      draftProperty.updatedAt = nowIso();

      if (activeAlternativeId === alternativeId) {
        const nextAlternative =
          draftFloor.alternatives[Math.max(0, alternativeIndex - 1)] ?? draftFloor.alternatives[0];
        setActivePropertyId(draftProperty.id);
        setActiveFloorId(draftFloor.id);
        setActiveAlternativeId(nextAlternative?.id ?? "");
        setSelectedId(null);
        setStructureSelection(
          nextAlternative ? { type: "alternative", id: nextAlternative.id } : { type: "floor", id: draftFloor.id },
        );
      }
      return draft;
    });
  }

  async function handleBackgroundUpload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setStatus("Importing floorplan...");
    const asset = file.type === "application/pdf" ? await pdfFileToImageAsset(file) : await readFileAsDataUrl(file);
    const image = await loadImage(asset.dataUrl);
    const width = Math.min(image.width, Math.max(320, stageSize.width - 40));
    const height = (width / image.width) * image.height;
    updateAlternative((alternative) => {
      alternative.plan.background = asset;
      alternative.plan.scale.backgroundX = 20;
      alternative.plan.scale.backgroundY = 20;
      alternative.plan.scale.backgroundWidth = width;
      alternative.plan.scale.backgroundHeight = height;
      alternative.plan.scale.backgroundVisible = true;
    });
  }

  function toggleBackgroundVisibility() {
    updateAlternative((alternative) => {
      alternative.plan.scale.backgroundVisible = alternative.plan.scale.backgroundVisible === false;
    });
  }

  async function handleJsonImport(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as { projects?: PropertyProject[] };
    if (!Array.isArray(parsed.projects)) throw new Error("Project export is missing projects.");
    await db.projects.clear();
    await db.projects.bulkPut(parsed.projects);
    setProjects(parsed.projects);
    const property = parsed.projects[0];
    const floor = property?.floors[0];
    const alternative = floor?.alternatives[0];
    setActivePropertyId(property?.id ?? "");
    setActiveFloorId(floor?.id ?? "");
    setActiveAlternativeId(alternative?.id ?? "");
    setSelectedId(null);
    setStructureSelection(alternative ? { type: "alternative", id: alternative.id } : null);
    setStatus("Imported project export");
  }

  function gridLines() {
    const grid = active.alternative?.plan.scale.gridSize ?? 26;
    const lines = [];
    const left = -viewport.x / viewport.scale - grid;
    const top = -viewport.y / viewport.scale - grid;
    const right = (stageSize.width - viewport.x) / viewport.scale + grid;
    const bottom = (stageSize.height - viewport.y) / viewport.scale + grid;
    const firstX = Math.floor(left / grid) * grid;
    const firstY = Math.floor(top / grid) * grid;
    for (let x = firstX; x < right; x += grid) {
      lines.push(
        <Line key={`gx-${x}`} points={[x, top, x, bottom]} stroke="#dde2d9" strokeWidth={1} listening={false} />,
      );
    }
    for (let y = firstY; y < bottom; y += grid) {
      lines.push(
        <Line key={`gy-${y}`} points={[left, y, right, y]} stroke="#dde2d9" strokeWidth={1} listening={false} />,
      );
    }
    return lines;
  }

  function stagePlanPointer(event: KonvaEventObject<MouseEvent | WheelEvent | DragEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position || !active.alternative) return;
    return {
      x: (position.x - viewport.x) / viewport.scale,
      y: (position.y - viewport.y) / viewport.scale,
    };
  }

  function stagePointer(event: KonvaEventObject<MouseEvent | WheelEvent | DragEvent>, snapToGrid = true) {
    const point = stagePlanPointer(event);
    if (!point || !active.alternative || !snapToGrid) return point;
    return snapPointToGrid(point, active.alternative.plan.scale.gridSize);
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

  function finishPolygonRoom(points = polygonDraft) {
    if (points.length < 3) return;
    updateAlternative((alternative) => {
      const plan = alternative.plan;
      const minX = Math.min(...points.map((point) => point.x));
      const minY = Math.min(...points.map((point) => point.y));
      const maxX = Math.max(...points.map((point) => point.x));
      const maxY = Math.max(...points.map((point) => point.y));
      const room: Room = {
        id: uid("room"),
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
      getOrCreateRoomBoard(alternative, room.id);
      setSelectedId(room.id);
    });
    setPolygonDraft([]);
    setTool("select");
  }

  function handleStageMouseDown(event: KonvaEventObject<MouseEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (tool === "pan" || spacePanning) {
      panLastRef.current = pointer ?? null;
      return;
    }
    if (tool === "select") {
      if (event.target === event.target.getStage()) setSelectedId(null);
      return;
    }
    const snappingDisabled = event.evt.altKey;
    const point = stagePointer(event, !snappingDisabled);
    if (!point) return;
    if (tool === "calibrate") {
      setSelectedId(null);
      setCalibrationPoints((current) => (current.length >= 2 ? [point] : [...current, point]));
      return;
    }
    if (tool === "polyRoom") {
      if (event.evt.detail >= 2) {
        finishPolygonRoom([...polygonDraft, point]);
        return;
      }
      setPolygonDraft((current) => [...current, point]);
      setSelectedId(null);
      return;
    }
    updateAlternative((alternative) => {
      const plan = alternative.plan;
      if (tool === "wall") {
        const start = snappingDisabled
          ? point
          : snapStructuralPoint(point, plan.walls, plan.scale.gridSize);
        const wall: Wall = {
          id: uid("wall"),
          kind: "wall",
          name: "Wall",
          x: start.x,
          y: start.y,
          x2: start.x + plan.scale.gridSize * 6,
          y2: start.y,
          width: plan.scale.gridSize * 6,
          height: 12,
          thickness: 12,
          rotation: 0,
        };
        plan.walls.push(wall);
        setSelectedId(wall.id);
      }
      if (tool === "room") {
        const room: Room = {
          id: uid("room"),
          kind: "room",
          name: `Room ${plan.rooms.length + 1}`,
          x: point.x,
          y: point.y,
          width: plan.scale.gridSize * 6,
          height: plan.scale.gridSize * 4,
          rotation: 0,
          color: roomColors[plan.rooms.length % roomColors.length],
          points: rectangleRoomPoints({
            width: plan.scale.gridSize * 6,
            height: plan.scale.gridSize * 4,
          }),
        };
        plan.rooms.push(room);
        getOrCreateRoomBoard(alternative, room.id);
        setSelectedId(room.id);
      }
      if (tool === "door" || tool === "window") {
        const width = tool === "door" ? 52 : 78;
        const height = tool === "door" ? 12 : 10;
        const opening: Opening = {
          id: uid(tool),
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
        setSelectedId(opening.id);
      }
      if (tool === "fixture") {
        const fixture: Fixture = {
          id: uid("fixture"),
          kind: fixtureKind,
          name: fixtureLabels[fixtureKind],
          x: point.x,
          y: point.y,
          width: fixtureKind === "counter" ? 130 : 64,
          height: fixtureKind === "stairs" ? 130 : 52,
          rotation: 0,
        };
        plan.fixtures.push(fixture);
        setSelectedId(fixture.id);
      }
    });
    setTool("select");
  }

  function handleStageMouseMove(event: KonvaEventObject<MouseEvent>) {
    if (!(tool === "pan" || spacePanning) || !panLastRef.current) return;
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const dx = pointer.x - panLastRef.current.x;
    const dy = pointer.y - panLastRef.current.y;
    panLastRef.current = pointer;
    setViewport((current) => ({ ...current, x: current.x + dx, y: current.y + dy }));
  }

  function stopPanning() {
    panLastRef.current = null;
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

  function calibrationPixelDistance() {
    if (calibrationPoints.length !== 2) return 0;
    return Math.hypot(
      calibrationPoints[1].x - calibrationPoints[0].x,
      calibrationPoints[1].y - calibrationPoints[0].y,
    );
  }

  function applyCalibration() {
    const meters = Number(calibrationMeters);
    const pixels = calibrationPixelDistance();
    if (!Number.isFinite(meters) || meters <= 0 || pixels <= 0) return;
    updateAlternative((alternative) => {
      alternative.plan.scale.pixelsPerMeter = Math.round((pixels / meters) * 100) / 100;
    });
    setStatus(`Scale calibrated: ${(pixels / meters).toFixed(2)} px/m`);
    setCalibrationPoints([]);
    setTool("select");
  }

  function snapOpeningToWall(opening: Opening, plan: Alternative["plan"]) {
    const nearest = nearestOpeningWall(opening, plan.walls, snapThreshold(plan.scale.gridSize) * 1.5);
    if (!nearest) {
      opening.wallId = undefined;
      return;
    }
    opening.wallId = nearest.wall.id;
    placeOpeningAnchorAtPoint(opening, nearest.anchor, nearest.point, wallAngle(nearest.wall));
  }

  function moveOpening(id: string, x: number, y: number, snappingDisabled: boolean) {
    updateAlternative((alternative) => {
      const opening = alternative.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainedOpeningPosition(opening, x, y, alternative.plan, snappingDisabled);
      opening.x = constrained.x;
      opening.y = constrained.y;
      opening.rotation = constrained.rotation;
      opening.wallId = constrained.wallId;
    });
  }

  function resizeOpening(id: string, endpoint: "start" | "end", point: PlanPoint, snappingDisabled: boolean) {
    updateAlternative((alternative) => {
      const opening = alternative.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainOpeningHandle(
        opening,
        endpoint,
        point,
        alternative.plan.walls,
        alternative.plan.scale.gridSize,
        snappingDisabled,
      );

      opening.wallId = constrained.wallId;
      const start = endpoint === "start" ? constrained.point : constrained.fixed;
      const end = endpoint === "end" ? constrained.point : constrained.fixed;
      placeOpeningBetweenHandles(opening, start, end, constrained.rotation);
    });
  }

  function moveWall(id: string, x: number, y: number, snappingDisabled: boolean) {
    updateAlternative((alternative) => {
      const wall = alternative.plan.walls.find((item) => item.id === id);
      if (!wall) return;
      const dx = x - wall.x;
      const dy = y - wall.y;
      const nextStart = { x: wall.x + dx, y: wall.y + dy };
      const nextEnd = { x: wall.x2 + dx, y: wall.y2 + dy };
      let offset = { x: dx, y: dy };

      if (!snappingDisabled) {
        const snappedStart = snapStructuralPoint(nextStart, alternative.plan.walls, alternative.plan.scale.gridSize, wall.id);
        const startDistance = distance(nextStart, snappedStart);
        const snappedEnd = snapStructuralPoint(nextEnd, alternative.plan.walls, alternative.plan.scale.gridSize, wall.id);
        const endDistance = distance(nextEnd, snappedEnd);
        if (startDistance <= endDistance) {
          offset = { x: snappedStart.x - wall.x, y: snappedStart.y - wall.y };
        } else {
          offset = { x: snappedEnd.x - wall.x2, y: snappedEnd.y - wall.y2 };
        }
      }

      wall.x += offset.x;
      wall.y += offset.y;
      wall.x2 += offset.x;
      wall.y2 += offset.y;
    });
  }

  function moveWallEndpoint(id: string, endpoint: "start" | "end", point: PlanPoint, snappingDisabled: boolean) {
    updateAlternative((alternative) => {
      const wall = alternative.plan.walls.find((item) => item.id === id);
      if (!wall) return;
      const nextPoint = snappingDisabled
        ? point
        : snapStructuralPoint(point, alternative.plan.walls, alternative.plan.scale.gridSize, wall.id);
      if (endpoint === "start") {
        wall.x = nextPoint.x;
        wall.y = nextPoint.y;
      } else {
        wall.x2 = nextPoint.x;
        wall.y2 = nextPoint.y;
      }
      const width = Math.max(1, Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y));
      wall.width = width;
      wall.rotation = wallAngle(wall);
    });
  }

  function moveRectangularObject(id: string, x: number, y: number, snappingDisabled: boolean) {
    updateAlternative((alternative) => {
      const object = [...alternative.plan.rooms, ...alternative.plan.fixtures].find((item) => item.id === id);
      if (!object) return;
      const nextPoint = snappingDisabled ? { x, y } : snapPointToGrid({ x, y }, alternative.plan.scale.gridSize);
      object.x = nextPoint.x;
      object.y = nextPoint.y;
    });
  }

  function normalizeRoom(room: Room) {
    const points = roomPoints(room);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    room.x += minX;
    room.y += minY;
    room.width = Math.max(1, maxX - minX);
    room.height = Math.max(1, maxY - minY);
    room.points = points.map((point) => ({ x: point.x - minX, y: point.y - minY }));
  }

  function moveRoomPoint(roomId: string, pointIndex: number, point: PlanPoint) {
    updateAlternative((alternative) => {
      const room = alternative.plan.rooms.find((item) => item.id === roomId);
      if (!room) return;
      const points = roomPoints(room);
      points[pointIndex] = point;
      room.points = points;
      normalizeRoom(room);
    });
  }

  function moveRoomPointFromPointer(room: Room, pointIndex: number, event: KonvaEventObject<DragEvent>) {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const planPoint = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    moveRoomPoint(room.id, pointIndex, {
      x: planPoint.x - room.x,
      y: planPoint.y - room.y,
    });
  }

  function updateSelectedRotation(value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    updateAlternative((alternative) => {
      const object = findPlanObject(alternative.plan, selectedId);
      if (!object) return;
      const rotation = normalizeAngle(value);
      if ("x2" in object) {
        const length = Math.hypot(object.x2 - object.x, object.y2 - object.y);
        object.rotation = rotation;
        object.x2 = object.x + length * Math.cos((rotation * Math.PI) / 180);
        object.y2 = object.y + length * Math.sin((rotation * Math.PI) / 180);
        return;
      }
      object.rotation = rotation;
    });
  }

  function deleteSelected() {
    if (!selectedId) return;
    updateAlternative((alternative) => {
      const plan = alternative.plan;
      plan.walls = plan.walls.filter((item) => item.id !== selectedId);
      plan.openings = plan.openings.filter((item) => item.id !== selectedId);
      plan.fixtures = plan.fixtures.filter((item) => item.id !== selectedId);
      plan.rooms = plan.rooms.filter((item) => item.id !== selectedId);
      alternative.roomBoards = alternative.roomBoards.filter((item) => item.roomId !== selectedId);
    });
    setSelectedId(null);
  }

  function selectedObject(): SelectablePlanObject | undefined {
    const plan = active.alternative?.plan;
    if (!plan || !selectedId) return undefined;
    return findPlanObject(plan, selectedId);
  }

  function updateSelectedName(name: string) {
    if (!selectedId) return;
    updateAlternative((alternative) => {
      const object = findPlanObject(alternative.plan, selectedId);
      if (object) object.name = name;
    });
  }

  function updateSelectedDimension(dimension: "width" | "height", value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    updateAlternative((alternative) => {
      const object = findPlanObject(alternative.plan, selectedId);
      if (!object) return;

      const nextValue = Math.max(1, value);
      if ("x2" in object) {
        if (dimension === "width") {
          object.width = nextValue;
          object.x2 = object.x + nextValue * Math.cos((object.rotation * Math.PI) / 180);
          object.y2 = object.y + nextValue * Math.sin((object.rotation * Math.PI) / 180);
        } else {
          object.height = nextValue;
          object.thickness = nextValue;
        }
        return;
      }

      if ("kind" in object && object.kind === "room") {
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

  function updateSelectedRoomDimensionMeters(dimension: "width" | "height", value: number) {
    const pixelsPerMeter = active.alternative?.plan.scale.pixelsPerMeter;
    if (!pixelsPerMeter || Number.isNaN(value)) return;
    updateSelectedDimension(dimension, value * pixelsPerMeter);
  }

  function updateSelectedRoomHeight(value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    updateAlternative((alternative) => {
      const room = alternative.plan.rooms.find((item) => item.id === selectedId);
      if (room) room.ceilingHeightMeters = Math.max(0.1, value);
    });
  }

  async function addBoardAssets(roomId: string, kind: "photos" | "renderOutputs", files: FileList | null) {
    if (!files) return;
    const assets = await Promise.all([...files].map(readFileAsDataUrl));
    updateAlternative((alternative) => {
      const board = getOrCreateRoomBoard(alternative, roomId);
      board[kind].push(...assets);
    });
  }

  function updateBoard(roomId: string, updater: (board: RoomBoard) => void) {
    updateAlternative((alternative) => {
      const board = getOrCreateRoomBoard(alternative, roomId);
      updater(board);
    });
  }

  function removeBoardAsset(roomId: string, kind: "photos" | "renderOutputs", assetId: string) {
    updateBoard(roomId, (board) => {
      board[kind] = board[kind].filter((asset) => asset.id !== assetId);
    });
  }

  function removeBoardPrompt(roomId: string, promptIndex: number) {
    updateBoard(roomId, (board) => {
      board.prompts = board.prompts.filter((_, index) => index !== promptIndex);
    });
  }

  const selection = selectedObject();
  const plan = active.alternative?.plan;
  const selectedRoom = selection && "kind" in selection && selection.kind === "room" ? (selection as Room) : undefined;
  const selectedRoomHeight = selectedRoom?.ceilingHeightMeters ?? plan?.scale.ceilingHeightMeters ?? 2.55;
  const selectedRoomWidthMeters =
    selectedRoom && plan ? metersFromPixels(selectedRoom.width, plan.scale.pixelsPerMeter) : 0;
  const selectedRoomLengthMeters =
    selectedRoom && plan ? metersFromPixels(selectedRoom.height, plan.scale.pixelsPerMeter) : 0;
  const selectedShape = selection && !selectedRoom ? selection : undefined;
  const selectedShapeWidthLabel = selectedShape && "x2" in selectedShape ? "Length" : "Width";
  const selectedShapeHeightLabel = selectedShape && "x2" in selectedShape ? "Thickness" : "Height";
  const selectedShapeNameLabel =
    selectedShape && "kind" in selectedShape && (selectedShape.kind === "door" || selectedShape.kind === "window")
      ? `${selectedShape.kind[0].toUpperCase()}${selectedShape.kind.slice(1)} name`
      : "Shape name";
  const isTreeNodeExpanded = (id: string) => expandedTreeNodes[id] !== false;
  const toggleTreeNode = (id: string) => {
    setExpandedTreeNodes((current) => ({ ...current, [id]: current[id] === false }));
  };
  const toggleSection = (id: string) => {
    setCollapsedSections((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Home size={24} />
          <div>
            <strong>Renovation Planner</strong>
            <span>{status}</span>
          </div>
        </div>

        <SidebarSection
          title="Project"
          collapsed={Boolean(collapsedSections.project)}
          onToggle={() => toggleSection("project")}
        >
          <div className="project-tree" aria-label="Project structure">
            {projects.map((project) => {
              const projectExpanded = isTreeNodeExpanded(project.id);
              return (
                <div className="tree-project" key={project.id}>
                  <div className="tree-row tree-row-project">
                    <button
                      className="tree-disclosure"
                      onClick={() => toggleTreeNode(project.id)}
                      title={projectExpanded ? `Collapse ${project.name}` : `Expand ${project.name}`}
                      aria-expanded={projectExpanded}
                    >
                      {projectExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <button
                      className={
                        structureSelection?.type === "project" && structureSelection.id === project.id
                          ? "tree-node active"
                          : "tree-node"
                      }
                      onClick={() => selectProperty(project.id)}
                    >
                      <span>{project.name}</span>
                      <small>{project.type}</small>
                    </button>
                    <button
                      className="tree-action"
                      onClick={() => addFloor(project.id)}
                      title={`Add floor to ${project.name}`}
                    >
                      <Plus size={15} />
                    </button>
                  </div>

                  {projectExpanded && (
                    <div className="tree-children">
                      {project.floors.map((floor) => {
                        const floorExpanded = isTreeNodeExpanded(floor.id);
                        return (
                          <div className="tree-floor" key={floor.id}>
                            <div className="tree-row tree-row-floor">
                              <button
                                className="tree-disclosure"
                                onClick={() => toggleTreeNode(floor.id)}
                                title={floorExpanded ? `Collapse ${floor.name}` : `Expand ${floor.name}`}
                                aria-expanded={floorExpanded}
                              >
                                {floorExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <button
                                className={
                                  structureSelection?.type === "floor" && structureSelection.id === floor.id
                                    ? "tree-node active"
                                    : "tree-node"
                                }
                                onClick={() => selectTreeFloor(project.id, floor.id)}
                              >
                                <span>{floor.name}</span>
                                <small>{floor.alternatives.length} alt</small>
                              </button>
                              <button
                                className="tree-action"
                                onClick={() => addAlternative(project.id, floor.id)}
                                title={`Duplicate alternative on ${floor.name}`}
                              >
                                <CopyPlus size={15} />
                              </button>
                              <button
                                className="tree-action danger"
                                onClick={() => deleteFloor(floor.id)}
                                disabled={project.floors.length <= 1}
                                title={
                                  project.floors.length <= 1
                                    ? "A project needs at least one floor"
                                    : `Delete ${floor.name}`
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>

                            {floorExpanded && (
                              <div className="tree-children tree-children-alternatives">
                                {floor.alternatives.map((alternative) => (
                                  <div className="tree-row tree-row-alternative" key={alternative.id}>
                                    <button
                                      className={
                                        structureSelection?.type === "alternative" &&
                                        structureSelection.id === alternative.id
                                          ? "tree-node active"
                                          : "tree-node"
                                      }
                                      onClick={() => selectTreeAlternative(project.id, floor.id, alternative.id)}
                                    >
                                      <span>{alternative.name}</span>
                                    </button>
                                    <button
                                      className="tree-action danger"
                                      onClick={() => deleteAlternative(floor.id, alternative.id)}
                                      disabled={floor.alternatives.length <= 1}
                                      title={
                                        floor.alternatives.length <= 1
                                          ? "A floor needs at least one alternative"
                                          : `Delete ${alternative.name}`
                                      }
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SidebarSection>

        <SidebarSection title="Tools" collapsed={Boolean(collapsedSections.tools)} onToggle={() => toggleSection("tools")}>
          <div className="tool-stack">
            {toolGroups.map((group) => (
              <div className="tool-section" key={group.title}>
                <div className="tool-section-title">{group.title}</div>
                <div className="tool-grid">
                  {group.items.map((item) => (
                    <button
                      key={item.mode}
                      className={tool === item.mode ? "tool active" : "tool"}
                      onClick={() => {
                        if (item.mode !== "polyRoom") setPolygonDraft([]);
                        if (item.mode !== "calibrate") setCalibrationPoints([]);
                        setTool(item.mode);
                      }}
                      title={item.label}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {tool === "fixture" && (
            <div className="field">
              <label>Fixture</label>
              <select value={fixtureKind} onChange={(event) => setFixtureKind(event.target.value as FixtureKind)}>
                {fixtureKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {fixtureLabels[kind]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </SidebarSection>

        <SidebarSection
          title="Floorplan"
          collapsed={Boolean(collapsedSections.floorplan)}
          onToggle={() => toggleSection("floorplan")}
        >
          <div className="file-actions">
            <button onClick={() => importRef.current?.click()}>
              <Upload size={17} />
              Upload plan
            </button>
            <button onClick={toggleBackgroundVisibility} disabled={!plan?.background}>
              {plan?.scale.backgroundVisible === false ? <Eye size={17} /> : <EyeOff size={17} />}
              {plan?.scale.backgroundVisible === false ? "Show plan" : "Hide plan"}
            </button>
          </div>

          <div className="scale-panel">
            <label>
              Pixels / meter
              <input
                type="number"
                min={10}
                value={plan?.scale.pixelsPerMeter ?? 52}
                onChange={(event) =>
                  updateAlternative((alternative) => {
                    alternative.plan.scale.pixelsPerMeter = Number(event.target.value);
                  })
                }
              />
            </label>
            <label>
              Grid size
              <input
                type="number"
                min={8}
                value={plan?.scale.gridSize ?? 26}
                onChange={(event) =>
                  updateAlternative((alternative) => {
                    alternative.plan.scale.gridSize = Number(event.target.value);
                  })
                }
              />
            </label>
          </div>

          <div className="calibration-panel">
            <div>
              <strong>Scale calibration</strong>
              <span>
                {calibrationPoints.length === 0
                  ? "Click two known points on the floorplan."
                  : calibrationPoints.length === 1
                    ? "Click the second point."
                    : `${calibrationPixelDistance().toFixed(0)} px selected.`}
              </span>
            </div>
            <label>
              Known distance (m)
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={calibrationMeters}
                onChange={(event) => setCalibrationMeters(event.target.value)}
              />
            </label>
            <div className="calibration-actions">
              <button onClick={() => setTool("calibrate")}>
                <Ruler size={16} />
                Pick points
              </button>
              <button onClick={applyCalibration} disabled={calibrationPoints.length !== 2}>
                Apply
              </button>
            </div>
          </div>
        </SidebarSection>

        <SidebarSection
          title="Project Data"
          collapsed={Boolean(collapsedSections.data)}
          onToggle={() => toggleSection("data")}
        >
          <div className="file-actions">
            <button onClick={() => downloadJson(projects)}>
              <Download size={17} />
              Export
            </button>
            <button onClick={() => jsonImportRef.current?.click()}>
              <Import size={17} />
              Import
            </button>
          </div>
        </SidebarSection>
        <input
          hidden
          ref={importRef}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          onChange={(event) => handleBackgroundUpload(event.target.files)}
        />
        <input
          hidden
          ref={jsonImportRef}
          type="file"
          accept="application/json"
          onChange={(event) => handleJsonImport(event.target.files)}
        />
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>{active.property?.name ?? "Renovation Planner"}</h1>
            <p>
              {active.floor?.name} · {active.alternative?.name}
            </p>
          </div>
          <div className="view-tabs">
            <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>
              <Grid3X3 size={17} />
              Plan
            </button>
            <button className={view === "media" ? "active" : ""} onClick={() => setView("media")}>
              <Camera size={17} />
              Rooms
            </button>
            <button className={view === "three" ? "active" : ""} onClick={() => setView("three")}>
              <Layers3 size={17} />
              3D
            </button>
          </div>
        </header>

        {view === "plan" && plan && (
          <div className="planner-layout">
            <div className="canvas-shell" ref={canvasShellRef}>
              <div className="canvas-controls">
                <button onClick={() => zoomCanvas(viewport.scale * 1.15)} title="Zoom in">
                  <ZoomIn size={16} />
                </button>
                <button onClick={() => zoomCanvas(viewport.scale / 1.15)} title="Zoom out">
                  <ZoomOut size={16} />
                </button>
                <button onClick={resetCanvasView} title="Reset view">
                  <Maximize2 size={16} />
                </button>
                <span>{Math.round(viewport.scale * 100)}%</span>
                <small>Scroll pan · pinch zoom · Space drag · Alt free-drag</small>
              </div>
              <Stage
                width={stageSize.width}
                height={stageSize.height}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={stopPanning}
                onMouseLeave={stopPanning}
                onWheel={handleWheel}
                onDblClick={() => finishPolygonRoom()}
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
                        draggable={tool === "select"}
                        onClick={() => {
                          if (tool === "select") setSelectedId(room.id);
                        }}
                        onDragEnd={(event) => {
                          if (event.target !== event.currentTarget) return;
                          moveRectangularObject(room.id, event.target.x(), event.target.y(), event.evt.altKey);
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
                          text={`${room.name}\n${roomArea(room, plan.scale.pixelsPerMeter).toFixed(1)} m2`}
                          fontSize={12}
                          fontStyle="bold"
                          fill="#242a27"
                          align="center"
                          listening={false}
                        />
                        {selectedId === room.id &&
                          tool === "select" &&
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
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                moveRoomPointFromPointer(room, index, event);
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                moveRoomPointFromPointer(room, index, event);
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
                        draggable={tool === "select"}
                        onClick={() => {
                          if (tool === "select") setSelectedId(wall.id);
                        }}
                        onDragEnd={(event) => {
                          if (event.target !== event.currentTarget) return;
                          moveWall(wall.id, event.currentTarget.x(), event.currentTarget.y(), event.evt.altKey);
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
                                const point = stageToPlanPoint(position);
                                const constrained = snapStructuralPoint(point, plan.walls, plan.scale.gridSize, wall.id);
                                return planToStagePoint(constrained);
                              }}
                              onMouseDown={(event) => {
                                event.cancelBubble = true;
                              }}
                              onDragStart={(event) => {
                                event.cancelBubble = true;
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                moveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey);
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                moveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey);
                              }}
                            />
                          )))}
                      </Group>
                    ))}
                  {plan.walls.map((wall) => {
                    const length = Math.hypot(wall.x2 - wall.x, wall.y2 - wall.y);
                    return (
                      <Text
                        key={`${wall.id}-measurement`}
                        x={(wall.x + wall.x2) / 2 - 18}
                        y={(wall.y + wall.y2) / 2 - 24}
                        text={`${metersFromPixels(length, plan.scale.pixelsPerMeter).toFixed(2)} m`}
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
                          draggable={tool === "select"}
                          dragBoundFunc={(position) => {
                            const point = stageToPlanPoint(position);
                            const constrained = constrainedOpeningPosition(opening, point.x, point.y, plan, false);
                            return planToStagePoint({ x: constrained.x, y: constrained.y });
                          }}
                          onClick={() => {
                            if (tool === "select") setSelectedId(opening.id);
                          }}
                          onDragMove={(event) =>
                            moveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey)
                          }
                          onDragEnd={(event) =>
                            moveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey)
                          }
                        />
                        {selectedId === opening.id &&
                          tool === "select" &&
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
                                const constrained = constrainOpeningHandle(
                                  opening,
                                  handle.endpoint,
                                  stageToPlanPoint(position),
                                  plan.walls,
                                  plan.scale.gridSize,
                                  false,
                                );
                                return planToStagePoint(constrained.point);
                              }}
                              onMouseDown={(event) => {
                                event.cancelBubble = true;
                              }}
                              onDragStart={(event) => {
                                event.cancelBubble = true;
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                resizeOpening(opening.id, handle.endpoint, point, event.evt.altKey);
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                resizeOpening(opening.id, handle.endpoint, point, event.evt.altKey);
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
                        if (tool === "select") setSelectedId(fixture.id);
                      }}
                      onDragEnd={(event) => {
                        if (event.target !== event.currentTarget) return;
                        moveRectangularObject(fixture.id, event.currentTarget.x(), event.currentTarget.y(), event.evt.altKey);
                      }}
                    >
                      <Rect
                        width={fixture.width}
                        height={fixture.height}
                        fill="#fffdf7"
                        stroke={selectedId === fixture.id ? "#242a27" : "#7a8379"}
                        strokeWidth={selectedId === fixture.id ? 3 : 1.5}
                        cornerRadius={fixture.kind === "sink" || fixture.kind === "toilet" ? 16 : 4}
                      />
                      <Text
                        x={8}
                        y={8}
                        text={fixtureLabels[fixture.kind]}
                        fontSize={12}
                        fill="#303732"
                        listening={false}
                      />
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
                          text={`${calibrationPixelDistance().toFixed(0)} px`}
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
            <aside className="inspector">
              <h2>Inspector</h2>
              {selectedRoom && plan ? (
                <>
                  <label>
                    Room name
                    <input value={selectedRoom.name} onChange={(event) => updateSelectedName(event.target.value)} />
                  </label>
                  <div className="room-measure-fields">
                    <label>
                      Width (m)
                      <input
                        type="number"
                        min={0.1}
                        step={0.01}
                        value={selectedRoomWidthMeters.toFixed(2)}
                        onChange={(event) => updateSelectedRoomDimensionMeters("width", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Length (m)
                      <input
                        type="number"
                        min={0.1}
                        step={0.01}
                        value={selectedRoomLengthMeters.toFixed(2)}
                        onChange={(event) => updateSelectedRoomDimensionMeters("height", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Height (m)
                      <input
                        type="number"
                        min={0.1}
                        step={0.01}
                        value={selectedRoomHeight.toFixed(2)}
                        onChange={(event) => updateSelectedRoomHeight(Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Rotation
                      <input
                        type="number"
                        step={1}
                        value={Math.round(selectedRoom.rotation)}
                        onChange={(event) => updateSelectedRotation(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="angle-panel">
                    <div className="angle-presets">
                      {[0, 45, 90, 135].map((angle) => (
                        <button key={angle} onClick={() => updateSelectedRotation(angle)}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="inspector-actions">
                    <button className="danger" onClick={deleteSelected}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </>
              ) : selectedShape ? (
                <>
                  <label>
                    {selectedShapeNameLabel}
                    <input value={selectedShape.name} onChange={(event) => updateSelectedName(event.target.value)} />
                  </label>
                  <div className="dimension-fields">
                    <label>
                      {selectedShapeWidthLabel}
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.width)}
                        onChange={(event) => updateSelectedDimension("width", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      {selectedShapeHeightLabel}
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShape.height)}
                        onChange={(event) => updateSelectedDimension("height", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Rotation
                      <input
                        type="number"
                        step={1}
                        value={Math.round(selectedShape.rotation)}
                        onChange={(event) => updateSelectedRotation(Number(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="angle-panel">
                    <div className="angle-presets">
                      {[0, 45, 90, 135].map((angle) => (
                        <button key={angle} onClick={() => updateSelectedRotation(angle)}>
                          {angle}°
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="inspector-actions">
                    <button className="danger" onClick={deleteSelected}>
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </>
              ) : activeStructure?.type === "project" ? (
                <>
                  <label>
                    Project name
                    <input
                      value={activeStructure.property.name}
                      onChange={(event) => updateActiveProjectName(event.target.value)}
                    />
                  </label>
                  <div className="stats">
                    <div>
                      <span>Floors</span>
                      <strong>{activeStructure.property.floors.length}</strong>
                    </div>
                    <div>
                      <span>Alternatives</span>
                      <strong>
                        {activeStructure.property.floors.reduce(
                          (total, floor) => total + floor.alternatives.length,
                          0,
                        )}
                      </strong>
                    </div>
                  </div>
                  <div className="inspector-actions">
                    <button onClick={() => addFloor(activeStructure.property.id)}>
                      <Plus size={16} />
                      Add floor
                    </button>
                  </div>
                </>
              ) : activeStructure?.type === "floor" ? (
                <>
                  <label>
                    Floor name
                    <input
                      value={activeStructure.floor.name}
                      onChange={(event) => updateActiveFloorName(event.target.value)}
                    />
                  </label>
                  <div className="stats">
                    <div>
                      <span>Alternatives</span>
                      <strong>{activeStructure.floor.alternatives.length}</strong>
                    </div>
                    <div>
                      <span>Level</span>
                      <strong>{activeStructure.floor.level + 1}</strong>
                    </div>
                  </div>
                  <div className="inspector-actions">
                    <button onClick={() => addAlternative(activeStructure.property.id, activeStructure.floor.id)}>
                      <CopyPlus size={16} />
                      Duplicate alternative
                    </button>
                    <button
                      className="danger"
                      onClick={() => deleteFloor(activeStructure.floor.id)}
                      disabled={activeStructure.property.floors.length <= 1}
                    >
                      <Trash2 size={16} />
                      Delete floor
                    </button>
                  </div>
                </>
              ) : activeStructure?.type === "alternative" ? (
                <>
                  <label>
                    Alternative name
                    <input
                      value={activeStructure.alternative.name}
                      onChange={(event) => updateActiveAlternativeName(event.target.value)}
                    />
                  </label>
                  <div className="stats">
                    <div>
                      <span>Rooms</span>
                      <strong>{activeStructure.alternative.plan.rooms.length}</strong>
                    </div>
                    <div>
                      <span>Fixtures</span>
                      <strong>{activeStructure.alternative.plan.fixtures.length}</strong>
                    </div>
                  </div>
                  <div className="inspector-actions">
                    <button onClick={() => addAlternative(activeStructure.property.id, activeStructure.floor.id)}>
                      <CopyPlus size={16} />
                      Duplicate alternative
                    </button>
                    <button
                      className="danger"
                      onClick={() => deleteAlternative(activeStructure.floor.id, activeStructure.alternative.id)}
                      disabled={activeStructure.floor.alternatives.length <= 1}
                    >
                      <Trash2 size={16} />
                      Delete alternative
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <PencilRuler size={30} />
                  <p>Select a project item or a plan object to edit it.</p>
                </div>
              )}
            </aside>
          </div>
        )}

        {view === "media" && plan && active.alternative && (
          <div className="media-board">
            {plan.rooms.length === 0 && (
              <div className="empty-wide">
                <ImagePlus size={36} />
                <h2>Add rooms in the plan view first</h2>
                <p>Each room gets a board for original photos, generated renders, prompts, and renovation notes.</p>
              </div>
            )}
            {plan.rooms.map((room) => {
              const board = active.alternative!.roomBoards.find((item) => item.roomId === room.id) ?? createRoomBoard(room.id);
              const draftPrompt = draftPrompts[room.id] ?? "";
              return (
                <section className="room-board" key={room.id}>
                  <header>
                    <div>
                      <h2>{room.name}</h2>
                      <p>{roomArea(room, plan.scale.pixelsPerMeter).toFixed(1)} m2</p>
                    </div>
                    <span style={{ background: room.color }} />
                  </header>
                  <div className="room-board-tools">
                    <MediaUpload
                      title="Add photos"
                      count={board.photos.length}
                      onFiles={(files) => addBoardAssets(room.id, "photos", files)}
                    />
                    <MediaUpload
                      title="Add renders"
                      count={board.renderOutputs.length}
                      onFiles={(files) => addBoardAssets(room.id, "renderOutputs", files)}
                    />
                  </div>
                  <RoomGallery
                    photos={board.photos}
                    renderOutputs={board.renderOutputs}
                    onOpenAsset={(asset, label) => setPreviewAsset({ asset, label })}
                    onRemovePhoto={(assetId) => removeBoardAsset(room.id, "photos", assetId)}
                    onRemoveRender={(assetId) => removeBoardAsset(room.id, "renderOutputs", assetId)}
                  />
                  <div className="prompt-panel">
                    <label>
                      Prompt ideas
                      <textarea
                        value={draftPrompt}
                        placeholder="Example: brighten this kitchen, keep the same layout, add warm oak cabinets..."
                        onChange={(event) =>
                          setDraftPrompts((current) => ({ ...current, [room.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      onClick={() => {
                        if (!draftPrompt.trim()) return;
                        updateBoard(room.id, (item) => item.prompts.unshift(draftPrompt.trim()));
                        setDraftPrompts((current) => ({ ...current, [room.id]: "" }));
                      }}
                    >
                      <WandSparkles size={17} />
                      Save prompt
                    </button>
                    <div className="prompt-list">
                      {board.prompts.map((prompt, index) => (
                        <div className="prompt-item" key={`${room.id}-prompt-${index}`}>
                          <p>{prompt}</p>
                          <button onClick={() => removeBoardPrompt(room.id, index)} title="Remove prompt">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <label className="notes">
                    Notes
                    <textarea
                      value={board.notes}
                      onChange={(event) => updateBoard(room.id, (item) => (item.notes = event.target.value))}
                      placeholder="Materials, things to keep, measurements to check, shopping ideas..."
                    />
                  </label>
                </section>
              );
            })}
          </div>
        )}

        {view === "three" && plan && (
          <div className="three-shell">
            <ThreePreview plan={plan} />
          </div>
        )}
      </main>
      {previewAsset && (
        <div className="image-modal" role="dialog" aria-modal="true" aria-label={`${previewAsset.label} preview`} onClick={() => setPreviewAsset(null)}>
          <div className="image-modal-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>{previewAsset.label}</span>
                <h2>{previewAsset.asset.name}</h2>
              </div>
              <button onClick={() => setPreviewAsset(null)} title="Close preview">
                <X size={18} />
              </button>
            </header>
            <img src={previewAsset.asset.dataUrl} alt={previewAsset.asset.name} />
          </div>
        </div>
      )}
    </div>
  );
}

function MediaUpload({
  title,
  count,
  onFiles,
}: {
  title: string;
  count: number;
  onFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="media-upload">
      <header>
        <div>
          <h3>{title}</h3>
          <p>{count} saved</p>
        </div>
        <button onClick={() => inputRef.current?.click()}>
          <ImagePlus size={16} />
          Add
        </button>
      </header>
      <input
        hidden
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function RoomGallery({
  photos,
  renderOutputs,
  onOpenAsset,
  onRemovePhoto,
  onRemoveRender,
}: {
  photos: Asset[];
  renderOutputs: Asset[];
  onOpenAsset: (asset: Asset, label: string) => void;
  onRemovePhoto: (assetId: string) => void;
  onRemoveRender: (assetId: string) => void;
}) {
  const galleryItems = [
    ...photos.map((asset) => ({ asset, label: "Photo", onRemove: onRemovePhoto })),
    ...renderOutputs.map((asset) => ({ asset, label: "Render", onRemove: onRemoveRender })),
  ];

  if (galleryItems.length === 0) {
    return (
      <div className="gallery-empty">
        <Camera size={24} />
        <p>No room pictures yet</p>
      </div>
    );
  }

  return (
    <div className="room-gallery">
      {galleryItems.map(({ asset, label, onRemove }, index) => (
        <figure
          className={index === 0 ? "gallery-card featured" : "gallery-card"}
          key={asset.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset(asset, label)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenAsset(asset, label);
          }}
        >
          <img src={asset.dataUrl} alt={asset.name} />
          <figcaption>
            <span>{label}</span>
            <strong>{asset.name}</strong>
          </figcaption>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRemove(asset.id);
            }}
            title={`Remove ${asset.name}`}
          >
            <Trash2 size={16} />
          </button>
        </figure>
      ))}
    </div>
  );
}

function SidebarSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="sidebar-section">
      <button className="sidebar-section-header" onClick={onToggle} type="button">
        <span>{title}</span>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      {!collapsed && <div className="sidebar-section-body">{children}</div>}
    </section>
  );
}

export default App;
