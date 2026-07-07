import { X } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import EditorSidebar from "./components/EditorSidebar";
import EditorTopbar from "./components/EditorTopbar";
import InspectorPanel from "./components/InspectorPanel";
import PlanCanvas from "./components/PlanCanvas";
import ProjectDashboard from "./components/ProjectDashboard";
import RoomMediaBoard from "./components/RoomMediaBoard";
import { loadProjects, saveProjects } from "./db";
import {
  type ActiveSnap,
  constrainOpeningHandle,
  constrainedOpeningPosition,
  normalizeAngle,
  placeOpeningBetweenHandles,
  resolveOpeningWallSnap,
  resolveWallEndpointSnap,
  snapPointToGrid,
  snapStructuralPoint,
} from "./geometry";
import { loadImage, useHtmlImage } from "./image";
import { useCanvasViewport } from "./hooks/useCanvasViewport";
import { usePlanUndoStack, type PlanUndoSnapshotBase } from "./hooks/usePlanUndoStack";
import {
  defaultFixtureSize,
  findActiveProject,
  findPlanObject,
  getOrCreateRoomBoard,
  isStructuralTool,
  roomColors,
  safeGridSize,
  safePixelsPerMeter,
  type SelectablePlanObject,
  type StructureSelection,
} from "./model";
import {
  moveRectangularObjectInPlan,
  moveRoomPointInPlan,
  moveWallInPlan,
  resizeWallEndpointInPlan,
} from "./planActions";
import { derivePlanTopology, findWallEndpointJoint, isSimplePolygon } from "./topology";
import type {
  Alternative,
  Asset,
  Fixture,
  FixtureKind,
  Floor,
  Opening,
  PlanPoint,
  PropertyProject,
  PropertyType,
  Room,
  RoomBoard,
  ToolMode,
  Wall,
} from "./types";
import {
  centimetersFromPixels,
  cloneProjectForLocal,
  createAlternative,
  createPropertyProject,
  formatCentimeters,
  fixtureLabels,
  nowIso,
  parseProjectExport,
  pixelsFromCentimeters,
  rectangleRoomPoints,
  readFileAsDataUrl,
  roomPoints,
  uid,
} from "./utils";

const ThreePreview = lazy(() => import("./ThreePreview"));

type AppScreen = "projects" | "editor";
type PlanUndoMode = "record" | "skip";
type PlanUndoSnapshot = PlanUndoSnapshotBase & {
  projects: PropertyProject[];
  activePropertyId: string;
  activeFloorId: string;
  selectedId: string | null;
  structureSelection: StructureSelection | null;
};
type CanvasSnapPreview = {
  openingWallId?: string;
  wallGuide?: {
    start: PlanPoint;
    end: PlanPoint;
    point: PlanPoint;
  };
};

function isFixtureObject(object: SelectablePlanObject): object is Fixture {
  return !("x2" in object) && object.kind !== "room" && object.kind !== "door" && object.kind !== "window";
}

function isStructuralObject(object: SelectablePlanObject) {
  return object.kind === "room" || object.kind === "wall" || object.kind === "door" || object.kind === "window";
}

function isQuarterTurn(rotation: number) {
  const angle = normalizeAngle(rotation);
  return Math.abs(angle - 90) < 0.001 || Math.abs(angle - 270) < 0.001;
}

function App() {
  const [projects, setProjects] = useState<PropertyProject[]>([]);
  const [appScreen, setAppScreen] = useState<AppScreen>("projects");
  const [activePropertyId, setActivePropertyId] = useState("");
  const [activeFloorId, setActiveFloorId] = useState("");
  const [activeAlternativeId, setActiveAlternativeId] = useState("");
  const [tool, setTool] = useState<ToolMode>("select");
  const [fixtureKind, setFixtureKind] = useState<FixtureKind>("counter");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [structureLocked, setStructureLocked] = useState(false);
  const [structureSelection, setStructureSelection] = useState<StructureSelection | null>(null);
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [view, setView] = useState<"plan" | "media" | "three">("plan");
  const [activeMediaRoomId, setActiveMediaRoomId] = useState("");
  const [activeMediaKind, setActiveMediaKind] = useState<"photos" | "renderOutputs">("photos");
  const [previewAsset, setPreviewAsset] = useState<{ asset: Asset; label: string } | null>(null);
  const [status, setStatus] = useState("Loading local workshop...");
  const [polygonDraft, setPolygonDraft] = useState<PlanPoint[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<PlanPoint[]>([]);
  const [calibrationCentimeters, setCalibrationCentimeters] = useState("100");
  const [spacePanning, setSpacePanning] = useState(false);
  const [snapPreview, setSnapPreview] = useState<CanvasSnapPreview>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    data: true,
  });
  const {
    canvasShellRef,
    stageSize,
    viewport,
    startPanning,
    stopPanning,
    movePanning,
    zoomCanvas,
    handleWheel,
    resetCanvasView,
  } = useCanvasViewport(view);
  const { canUndoPlanChange, recordUndoSnapshot, undoLastSnapshot } =
    usePlanUndoStack<PlanUndoSnapshot>(activeAlternativeId);
  const snappingDisabledRef = useRef(false);
  const activeOpeningSnapRef = useRef<ActiveSnap | undefined>(undefined);
  const activeWallEndpointSnapRef = useRef<ActiveSnap | undefined>(undefined);
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
      setAppScreen("projects");
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
    const handleKeyDown = (event: KeyboardEvent) => {
      snappingDisabledRef.current = event.altKey;
      if (event.altKey) clearSnapState();
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT";
      if (event.code === "Space" && !isTyping) {
        event.preventDefault();
        setSpacePanning(true);
      }
      if (
        appScreen === "editor" &&
        view === "plan" &&
        !isTyping &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        undoLastPlanChange();
        return;
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
      snappingDisabledRef.current = event.altKey;
      if (event.code === "Space") {
        setSpacePanning(false);
        stopPanning();
      }
    };
    const handleBlur = () => {
      snappingDisabledRef.current = false;
      clearSnapState();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [activeAlternativeId, appScreen, canUndoPlanChange, polygonDraft, tool, view]);

  useEffect(() => {
    clearSnapState();
  }, [activeAlternativeId, tool, view]);

  useEffect(() => {
    if (!previewAsset) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewAsset(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset]);

  const active = useMemo(() => {
    return findActiveProject(projects, activePropertyId, activeFloorId, activeAlternativeId);
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
    const rooms = active.alternative?.plan.rooms ?? [];
    if (rooms.length === 0) {
      if (activeMediaRoomId) setActiveMediaRoomId("");
      return;
    }
    if (!rooms.some((room) => room.id === activeMediaRoomId)) {
      setActiveMediaRoomId(rooms[0].id);
    }
  }, [active.alternative?.id, active.alternative?.plan.rooms, activeMediaRoomId]);

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
    }, "skip");
  }, [active.alternative?.id, backgroundImage, stageSize.width]);

  function updateProjects(updater: (draft: PropertyProject[]) => PropertyProject[]) {
    setStatus("Saving...");
    setProjects((current) => updater(structuredClone(current)));
  }

  function findActiveDraft(draft: PropertyProject[]) {
    return findActiveProject(draft, activePropertyId, activeFloorId, activeAlternativeId);
  }

  function recordPlanUndoSnapshot() {
    if (!active.alternative) return;
    recordUndoSnapshot({
      projects: structuredClone(projects),
      activePropertyId,
      activeFloorId,
      activeAlternativeId,
      selectedId,
      structureSelection: structureSelection ? { ...structureSelection } : null,
    });
  }

  function undoLastPlanChange() {
    undoLastSnapshot((snapshot) => {
      setStatus("Saving...");
      setProjects(structuredClone(snapshot.projects));
      setActivePropertyId(snapshot.activePropertyId);
      setActiveFloorId(snapshot.activeFloorId);
      setActiveAlternativeId(snapshot.activeAlternativeId);
      setSelectedId(snapshot.selectedId);
      setStructureSelection(snapshot.structureSelection);
      setPolygonDraft([]);
      setCalibrationPoints([]);
      setTool("select");
    });
  }

  function updateAlternative(updater: (alternative: Alternative) => void, undoMode: PlanUndoMode = "record") {
    if (undoMode === "record") recordPlanUndoSnapshot();
    updateProjects((draft) => {
      const { property, alternative } = findActiveDraft(draft);
      if (property && alternative) {
        updater(alternative);
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function updatePlanScaleNumber(field: "pixelsPerMeter" | "gridSize", value: number, minimum: number) {
    if (!Number.isFinite(value) || value < minimum) return;
    updateAlternative((alternative) => {
      alternative.plan.scale[field] = value;
    });
  }

  function updateProjectName(projectId: string, name: string) {
    updateProjects((draft) => {
      const property = draft.find((item) => item.id === projectId);
      if (property) {
        property.name = name;
        property.updatedAt = nowIso();
      }
      return draft;
    });
  }

  function updateProjectType(projectId: string, type: PropertyType) {
    updateProjects((draft) => {
      const property = draft.find((item) => item.id === projectId);
      if (property) {
        property.type = type;
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

  function activateProject(project: PropertyProject, selection: StructureSelection = { type: "project", id: project.id }) {
    const floor = project.floors[0];
    const alternative = floor?.alternatives[0];
    setActivePropertyId(project.id);
    setActiveFloorId(floor?.id ?? "");
    setActiveAlternativeId(alternative?.id ?? "");
    setSelectedId(null);
    setStructureSelection(selection);
    setExpandedTreeNodes((currentExpanded) => ({
      ...currentExpanded,
      [project.id]: true,
      ...(floor ? { [floor.id]: true } : {}),
    }));
  }

  function enterProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const floor = project.floors[0];
    const alternative = floor?.alternatives[0];
    activateProject(
      project,
      alternative
        ? { type: "alternative", id: alternative.id }
        : floor
          ? { type: "floor", id: floor.id }
          : { type: "project", id: project.id },
    );
    setSidebarCollapsed(false);
    setAppScreen("editor");
  }

  function backToProjects() {
    setSelectedId(null);
    setPolygonDraft([]);
    setCalibrationPoints([]);
    setTool("select");
    setAppScreen("projects");
  }

  function addProject() {
    updateProjects((draft) => {
      const project = createPropertyProject(`Project ${draft.length + 1}`);
      const floor = project.floors[0];
      const alternative = floor?.alternatives[0];
      draft.push(project);
      activateProject(
        project,
        alternative
          ? { type: "alternative", id: alternative.id }
          : floor
            ? { type: "floor", id: floor.id }
            : { type: "project", id: project.id },
      );
      setAppScreen("editor");
      return draft;
    });
  }

  function duplicateProject(projectId: string) {
    const source = projects.find((item) => item.id === projectId);
    if (!source) return;
    updateProjects((draft) => {
      const copy = cloneProjectForLocal(source);
      const floor = copy.floors[0];
      const alternative = floor?.alternatives[0];
      draft.push(copy);
      activateProject(
        copy,
        alternative
          ? { type: "alternative", id: alternative.id }
          : floor
            ? { type: "floor", id: floor.id }
            : { type: "project", id: copy.id },
      );
      setAppScreen("editor");
      return draft;
    });
  }

  function deleteProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project || projects.length <= 1) return;
    if (!window.confirm(`Delete "${project.name}" and all of its floors?`)) return;
    updateProjects((draft) => {
      const projectIndex = draft.findIndex((item) => item.id === projectId);
      if (projectIndex < 0 || draft.length <= 1) return draft;
      draft.splice(projectIndex, 1);
      if (activePropertyId === projectId) {
        const nextProject = draft[Math.max(0, projectIndex - 1)] ?? draft[0];
        if (nextProject) activateProject(nextProject);
        setAppScreen("projects");
      }
      return draft;
    });
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
    const asset =
      file.type === "application/pdf"
        ? await import("./pdf").then(({ pdfFileToImageAsset }) => pdfFileToImageAsset(file))
        : await readFileAsDataUrl(file);
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
    try {
      const text = await file.text();
      const imported = parseProjectExport(text).map((project) => cloneProjectForLocal(project, `${project.name} import`));
      if (imported.length === 0) throw new Error("Project export did not contain any projects.");
      updateProjects((draft) => {
        draft.push(...imported);
        activateProject(imported[0]);
        setAppScreen("projects");
        return draft;
      });
      setStatus(`Imported ${imported.length} project${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import project export");
    } finally {
      if (jsonImportRef.current) jsonImportRef.current.value = "";
    }
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
    return snapPointToGrid(point, safeGridSize(active.alternative.plan));
  }

  function clearSnapState() {
    activeOpeningSnapRef.current = undefined;
    activeWallEndpointSnapRef.current = undefined;
    setSnapPreview({});
  }

  function selectPlanObject(id: string | null) {
    if (!id) {
      setSelectedId(null);
      return;
    }
    const currentPlan = active.alternative?.plan;
    const object = currentPlan ? findPlanObject(currentPlan, id) : undefined;
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
    if (structureLocked) return;
    if (points.length < 3) return;
    if (!isSimplePolygon(points)) {
      setStatus("Room polygon needs a simple, non-overlapping outline.");
      return;
    }
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
        snappingDisabled || !active.alternative
          ? point
          : snapStructuralPoint(point, active.alternative.plan.walls, safeGridSize(active.alternative.plan));
      if (event.evt.detail >= 2) {
        finishPolygonRoom([...polygonDraft, polygonPoint]);
        return;
      }
      setPolygonDraft((current) => [...current, polygonPoint]);
      setSelectedId(null);
      return;
    }
    updateAlternative((alternative) => {
      const plan = alternative.plan;
      if (tool === "wall") {
        const start = snappingDisabled
          ? point
          : snapStructuralPoint(point, plan.walls, safeGridSize(plan));
        const gridSize = safeGridSize(plan);
        const wall: Wall = {
          id: uid("wall"),
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
        setSelectedId(wall.id);
      }
      if (tool === "room") {
        const gridSize = safeGridSize(plan);
        const room: Room = {
          id: uid("room"),
          kind: "room",
          name: `Room ${plan.rooms.length + 1}`,
          x: point.x,
          y: point.y,
          width: gridSize * 6,
          height: gridSize * 4,
          rotation: 0,
          color: roomColors[plan.rooms.length % roomColors.length],
          points: rectangleRoomPoints({
            width: gridSize * 6,
            height: gridSize * 4,
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
        const size = defaultFixtureSize(fixtureKind);
        const fixture: Fixture = {
          id: uid("fixture"),
          kind: fixtureKind,
          name: fixtureLabels[fixtureKind],
          x: point.x,
          y: point.y,
          width: size.width,
          height: size.height,
          rotation: 0,
        };
        plan.fixtures.push(fixture);
        setSelectedId(fixture.id);
      }
    });
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
    const pixelsPerMeter = active.alternative ? safePixelsPerMeter(active.alternative.plan) : 52;
    return `${pixels.toFixed(0)} px · ${formatCentimeters(centimetersFromPixels(pixels, pixelsPerMeter))}`;
  }

  function applyCalibration() {
    const centimeters = Number(calibrationCentimeters);
    const pixels = calibrationPixelDistance();
    if (!Number.isFinite(centimeters) || centimeters <= 0 || pixels <= 0) return;
    const meters = centimeters / 100;
    updateAlternative((alternative) => {
      alternative.plan.scale.pixelsPerMeter = Math.round((pixels / meters) * 100) / 100;
    });
    setStatus(`Scale calibrated: ${(pixels / centimeters).toFixed(2)} px/cm`);
    setCalibrationPoints([]);
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

  function moveOpening(id: string, x: number, y: number, snappingDisabled: boolean, undoMode: PlanUndoMode = "record") {
    if (structureLocked) return;
    if (snappingDisabled) clearSnapState();
    updateAlternative((alternative) => {
      const opening = alternative.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainedOpeningPosition(
        opening,
        x,
        y,
        alternative.plan,
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
    updateAlternative((alternative) => {
      const opening = alternative.plan.openings.find((item) => item.id === id);
      if (!opening) return;
      const constrained = constrainOpeningHandle(
        opening,
        endpoint,
        point,
        alternative.plan.walls,
        safeGridSize(alternative.plan),
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
    updateAlternative((alternative) => {
      moveWallInPlan(alternative.plan, id, x, y, snappingDisabled);
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
    updateAlternative((alternative) => {
      const wall = alternative.plan.walls.find((item) => item.id === id);
      if (!wall) return;
      const topology = derivePlanTopology(alternative.plan);
      const connectedJoint = snappingDisabled ? undefined : findWallEndpointJoint(topology, id, endpoint);
      const origin =
        endpoint === "start"
          ? { x: wall.x2, y: wall.y2 }
          : { x: wall.x, y: wall.y };
      const resolved = resolveWallEndpointSnap({
        point,
        origin,
        walls: alternative.plan.walls,
        gridSize: safeGridSize(alternative.plan),
        viewportScale: viewport.scale,
        excludeWallId: wall.id,
        activeSnap: activeWallEndpointSnapRef.current,
        snappingDisabled,
      });
      const nextPoint = resolved.point;
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
        resizeWallEndpointInPlan(alternative.plan, target.wallId, target.endpoint, nextPoint);
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
    if (structureLocked && active.alternative?.plan.rooms.some((room) => room.id === id)) return;
    updateAlternative((alternative) => {
      moveRectangularObjectInPlan(alternative.plan, id, x, y, snappingDisabled);
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
    updateAlternative((alternative) => {
      const result = moveRoomPointInPlan(alternative.plan, roomId, pointIndex, absolutePoint, snappingDisabled);
      if (result === "invalid-polygon") {
        setStatus("Room polygon edits cannot cross another room edge.");
      }
    }, undoMode);
  }

  function updateSelectedRotation(value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    if (isSelectedObjectLocked()) return;
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
    if (isSelectedObjectLocked()) return;
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

  function isSelectedObjectLocked() {
    const object = selectedObject();
    return Boolean(structureLocked && object && isStructuralObject(object));
  }

  function updateSelectedName(name: string) {
    if (!selectedId) return;
    if (isSelectedObjectLocked()) return;
    updateAlternative((alternative) => {
      const object = findPlanObject(alternative.plan, selectedId);
      if (object) object.name = name;
    });
  }

  function updateSelectedDimension(dimension: "width" | "height", value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    if (isSelectedObjectLocked()) return;
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

  function updateSelectedRoomDimensionCentimeters(dimension: "width" | "height", value: number) {
    const pixelsPerMeter = active.alternative ? safePixelsPerMeter(active.alternative.plan) : undefined;
    if (!pixelsPerMeter || Number.isNaN(value)) return;
    updateSelectedDimension(dimension, pixelsFromCentimeters(value, pixelsPerMeter));
  }

  function updateSelectedDimensionCentimeters(dimension: "width" | "height", value: number) {
    const pixelsPerMeter = active.alternative ? safePixelsPerMeter(active.alternative.plan) : undefined;
    if (!pixelsPerMeter || Number.isNaN(value)) return;
    const selected = selection;
    const targetDimension =
      selected && isFixtureObject(selected) && isQuarterTurn(selected.rotation)
        ? dimension === "width"
          ? "height"
          : "width"
        : dimension;
    updateSelectedDimension(targetDimension, pixelsFromCentimeters(value, pixelsPerMeter));
  }

  function updateSelectedRoomHeight(value: number) {
    if (!selectedId || Number.isNaN(value)) return;
    if (isSelectedObjectLocked()) return;
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
    }, "skip");
  }

  function updateBoard(roomId: string, updater: (board: RoomBoard) => void) {
    updateAlternative((alternative) => {
      const board = getOrCreateRoomBoard(alternative, roomId);
      updater(board);
    }, "skip");
  }

  function removeBoardAsset(roomId: string, kind: "photos" | "renderOutputs", assetId: string) {
    updateBoard(roomId, (board) => {
      board[kind] = board[kind].filter((asset) => asset.id !== assetId);
    });
  }

  const selection = selectedObject();
  const plan = active.alternative?.plan;
  const activeMediaRoom = plan?.rooms.find((room) => room.id === activeMediaRoomId) ?? plan?.rooms[0];
  const selectedRoom = selection && "kind" in selection && selection.kind === "room" ? (selection as Room) : undefined;
  const selectedRoomHeight = selectedRoom?.ceilingHeightMeters ?? plan?.scale.ceilingHeightMeters ?? 2.55;
  const selectedRoomHeightCentimeters = selectedRoomHeight * 100;
  const selectedRoomWidthCentimeters =
    selectedRoom && plan ? centimetersFromPixels(selectedRoom.width, safePixelsPerMeter(plan)) : 0;
  const selectedRoomLengthCentimeters =
    selectedRoom && plan ? centimetersFromPixels(selectedRoom.height, safePixelsPerMeter(plan)) : 0;
  const selectedShape = selection && !selectedRoom ? selection : undefined;
  const selectedShapeWidthLabel = selectedShape && "x2" in selectedShape ? "Length" : "Width";
  const selectedShapeHeightLabel = selectedShape && "x2" in selectedShape ? "Thickness" : "Height";
  const selectedShapeUsesVisualDimensions =
    selectedShape && isFixtureObject(selectedShape) && isQuarterTurn(selectedShape.rotation);
  const selectedShapeWidthCentimeters =
    selectedShape && plan
      ? centimetersFromPixels(
          selectedShapeUsesVisualDimensions ? selectedShape.height : selectedShape.width,
          safePixelsPerMeter(plan),
        )
      : 0;
  const selectedShapeHeightCentimeters =
    selectedShape && plan
      ? centimetersFromPixels(
          selectedShapeUsesVisualDimensions ? selectedShape.width : selectedShape.height,
          safePixelsPerMeter(plan),
        )
      : 0;
  const selectedShapeNameLabel =
    selectedShape && "kind" in selectedShape && (selectedShape.kind === "door" || selectedShape.kind === "window")
      ? `${selectedShape.kind[0].toUpperCase()}${selectedShape.kind.slice(1)} name`
      : "Shape name";
  const inspectorTitle =
    selectedRoom?.name ??
    selectedShape?.name ??
    (activeStructure?.type === "floor"
      ? activeStructure.floor.name
      : activeStructure?.type === "alternative"
        ? activeStructure.alternative.name
        : "Details");
  const isTreeNodeExpanded = (id: string) => expandedTreeNodes[id] !== false;
  const toggleTreeNode = (id: string) => {
    setExpandedTreeNodes((current) => ({ ...current, [id]: current[id] === false }));
  };
  const toggleSection = (id: string) => {
    setCollapsedSections((current) => ({ ...current, [id]: !current[id] }));
  };

  useEffect(() => {
    if (structureLocked && selection && isStructuralObject(selection)) {
      setSelectedId(null);
    }
  }, [selection, structureLocked]);

  if (appScreen === "projects") {
    return (
      <ProjectDashboard
        projects={projects}
        status={status}
        jsonImportRef={jsonImportRef}
        onAddProject={addProject}
        onOpenProject={enterProject}
        onImportProjects={handleJsonImport}
        onUpdateProjectName={updateProjectName}
        onUpdateProjectType={updateProjectType}
        onDuplicateProject={duplicateProject}
        onDeleteProject={deleteProject}
      />
    );
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <EditorSidebar
        collapsed={sidebarCollapsed}
        status={status}
        active={active}
        plan={plan}
        structureSelection={structureSelection}
        collapsedSections={collapsedSections}
        isTreeNodeExpanded={isTreeNodeExpanded}
        tool={tool}
        fixtureKind={fixtureKind}
        structureLocked={structureLocked}
        calibrationPointCount={calibrationPoints.length}
        calibrationMeasurementLabel={calibrationMeasurementLabel()}
        calibrationCentimeters={calibrationCentimeters}
        importRef={importRef}
        jsonImportRef={jsonImportRef}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onToggleSection={toggleSection}
        onToggleTreeNode={toggleTreeNode}
        onSelectFloor={selectTreeFloor}
        onSelectAlternative={selectTreeAlternative}
        onAddFloor={addFloor}
        onAddAlternative={addAlternative}
        onDeleteFloor={deleteFloor}
        onDeleteAlternative={deleteAlternative}
        onToggleStructureLock={toggleStructureLock}
        onSelectTool={(nextTool) => {
          if (structureLocked && isStructuralTool(nextTool)) return;
          if (nextTool !== "polyRoom") setPolygonDraft([]);
          if (nextTool !== "calibrate") setCalibrationPoints([]);
          setTool(nextTool);
        }}
        onSetFixtureKind={setFixtureKind}
        onToggleBackgroundVisibility={toggleBackgroundVisibility}
        onUpdatePlanScaleNumber={updatePlanScaleNumber}
        onSetCalibrationCentimeters={setCalibrationCentimeters}
        onPickCalibrationPoints={() => setTool("calibrate")}
        onApplyCalibration={applyCalibration}
        onBackgroundUpload={handleBackgroundUpload}
        onJsonImport={handleJsonImport}
      />

      <main className="workspace">
        <EditorTopbar
          property={active.property}
          floor={active.floor}
          alternative={active.alternative}
          view={view}
          onBack={backToProjects}
          onSetView={setView}
        />

        {view === "plan" && plan && (
          <div className="planner-layout">
            <PlanCanvas
              plan={plan}
              tool={tool}
              structureLocked={structureLocked}
              selectedId={selectedId}
              stageSize={stageSize}
              viewport={viewport}
              backgroundImage={backgroundImage}
              canvasShellRef={canvasShellRef}
              snappingDisabledRef={snappingDisabledRef}
              activeOpeningSnapRef={activeOpeningSnapRef}
              activeWallEndpointSnapRef={activeWallEndpointSnapRef}
              snapPreview={snapPreview}
              polygonDraft={polygonDraft}
              calibrationPoints={calibrationPoints}
              canUndoPlanChange={canUndoPlanChange}
              calibrationMeasurementLabel={calibrationMeasurementLabel()}
              onUndo={undoLastPlanChange}
              onZoom={zoomCanvas}
              onResetView={resetCanvasView}
              onStageMouseDown={handleStageMouseDown}
              onStageMouseMove={(event) => movePanning(event, tool === "pan" || spacePanning)}
              onStopPanning={stopPanning}
              onWheel={handleWheel}
              onFinishPolygonRoom={() => finishPolygonRoom()}
              onSelectPlanObject={selectPlanObject}
              onRecordPlanUndoSnapshot={recordPlanUndoSnapshot}
              onMoveRectangularObject={moveRectangularObject}
              onMoveRoomPoint={moveRoomPoint}
              onMoveWall={moveWall}
              onMoveWallEndpoint={moveWallEndpoint}
              onMoveOpening={moveOpening}
              onResizeOpening={resizeOpening}
              onClearSnapState={clearSnapState}
            />
            <InspectorPanel
              title={inspectorTitle}
              selectedRoom={selectedRoom}
              selectedShape={selectedShape}
              activeStructure={activeStructure}
              selectedRoomWidthCentimeters={selectedRoomWidthCentimeters}
              selectedRoomLengthCentimeters={selectedRoomLengthCentimeters}
              selectedRoomHeightCentimeters={selectedRoomHeightCentimeters}
              selectedShapeNameLabel={selectedShapeNameLabel}
              selectedShapeWidthLabel={selectedShapeWidthLabel}
              selectedShapeHeightLabel={selectedShapeHeightLabel}
              selectedShapeWidthCentimeters={selectedShapeWidthCentimeters}
              selectedShapeHeightCentimeters={selectedShapeHeightCentimeters}
              onUpdateSelectedName={updateSelectedName}
              onUpdateSelectedRoomDimensionCentimeters={updateSelectedRoomDimensionCentimeters}
              onUpdateSelectedRoomHeight={updateSelectedRoomHeight}
              onUpdateSelectedDimensionCentimeters={updateSelectedDimensionCentimeters}
              onUpdateSelectedRotation={updateSelectedRotation}
              onDeleteSelected={deleteSelected}
              onUpdateActiveFloorName={updateActiveFloorName}
              onUpdateActiveAlternativeName={updateActiveAlternativeName}
              onAddAlternative={addAlternative}
              onDeleteFloor={deleteFloor}
              onDeleteAlternative={deleteAlternative}
            />
          </div>
        )}

        {view === "media" && plan && active.alternative && (
          <RoomMediaBoard
            plan={plan}
            alternative={active.alternative}
            activeRoom={activeMediaRoom}
            activeKind={activeMediaKind}
            onSelectRoom={(roomId) => {
              setActiveMediaRoomId(roomId);
              selectPlanObject(roomId);
            }}
            onSetActiveKind={setActiveMediaKind}
            onAddAssets={addBoardAssets}
            onOpenAsset={(asset, label) => setPreviewAsset({ asset, label })}
            onRemoveAsset={removeBoardAsset}
            onUpdateNotes={(roomId, notes) => updateBoard(roomId, (item) => (item.notes = notes))}
          />
        )}

        {view === "three" && plan && (
          <div className="three-shell">
            <Suspense fallback={<div className="walkthrough-help">Loading 3D preview...</div>}>
              <ThreePreview plan={plan} selectedId={selectedId} onSelect={selectPlanObject} />
            </Suspense>
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

export default App;
