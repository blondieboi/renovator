import {
  AppWindow,
  ArrowLeft,
  BedDouble,
  Camera,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Grid3X3,
  Hand,
  Home,
  ImagePlus,
  Import,
  Layers3,
  Lock,
  Maximize2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pentagon,
  PencilRuler,
  Plus,
  Ruler,
  Square,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Suspense, lazy, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from "react-konva";
import MediaUploadAction from "./components/MediaUploadAction";
import PlanFixtureGlyph from "./components/PlanFixtureGlyph";
import RoomGallery from "./components/RoomGallery";
import SidebarSection from "./components/SidebarSection";
import { loadProjects, saveProjects } from "./db";
import {
  type ActiveSnap,
  constrainOpeningHandle,
  constrainedOpeningPosition,
  distance,
  normalizeAngle,
  openingHandlePoints,
  placeOpeningBetweenHandles,
  resolveOpeningWallSnap,
  resolveWallEndpointSnap,
  snapPointToGrid,
  snapStructuralPoint,
  wallAngle,
} from "./geometry";
import { loadImage, useHtmlImage } from "./image";
import {
  defaultFixtureSize,
  findActiveProject,
  findPlanObject,
  fixtureKinds,
  getOrCreateRoomBoard,
  roomColors,
  safeGridSize,
  safePixelsPerMeter,
  type SelectablePlanObject,
  type StructureSelection,
} from "./model";
import { derivePlanTopology, findWallEndpointJoint, isSimplePolygon } from "./topology";
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
  createRoomBoard,
  downloadProjectJson,
  downloadProjectsJson,
  formatCentimeters,
  fixtureLabels,
  flattenPoints,
  nowIso,
  parseProjectExport,
  pixelsFromCentimeters,
  rectangleRoomPoints,
  readFileAsDataUrl,
  roomArea,
  roomLabelPoint,
  roomPoints,
  uid,
} from "./utils";

const ThreePreview = lazy(() => import("./ThreePreview"));

type AppScreen = "projects" | "editor";
type PlanUndoMode = "record" | "skip";
type PlanUndoSnapshot = {
  projects: PropertyProject[];
  activePropertyId: string;
  activeFloorId: string;
  activeAlternativeId: string;
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

const planUndoLimit = 50;

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

function isFixtureObject(object: SelectablePlanObject): object is Fixture {
  return !("x2" in object) && object.kind !== "room" && object.kind !== "door" && object.kind !== "window";
}

function isStructuralObject(object: SelectablePlanObject) {
  return object.kind === "room" || object.kind === "wall" || object.kind === "door" || object.kind === "window";
}

function isStructuralTool(mode: ToolMode) {
  return mode === "wall" || mode === "room" || mode === "polyRoom" || mode === "door" || mode === "window";
}

function isQuarterTurn(rotation: number) {
  const angle = normalizeAngle(rotation);
  return Math.abs(angle - 90) < 0.001 || Math.abs(angle - 270) < 0.001;
}

function projectStats(project: PropertyProject) {
  const alternatives = project.floors.flatMap((floor) => floor.alternatives);
  return {
    floors: project.floors.length,
    alternatives: alternatives.length,
    rooms: alternatives.reduce((total, alternative) => total + alternative.plan.rooms.length, 0),
    fixtures: alternatives.reduce((total, alternative) => total + alternative.plan.fixtures.length, 0),
  };
}

function firstProjectPlan(project: PropertyProject): Plan | undefined {
  return project.floors[0]?.alternatives[0]?.plan;
}

function ProjectPreview({ project }: { project: PropertyProject }) {
  const plan = firstProjectPlan(project);
  const rooms = plan?.rooms ?? [];
  const walls = plan?.walls ?? [];
  const points = [
    ...rooms.flatMap((room) => roomPoints(room).map((point) => ({ x: room.x + point.x, y: room.y + point.y }))),
    ...walls.flatMap((wall) => [
      { x: wall.x, y: wall.y },
      { x: wall.x2, y: wall.y2 },
    ]),
  ];

  if (!plan || points.length === 0) {
    return (
      <div className="project-preview empty">
        <Home size={24} />
        <span>No sketch yet</span>
      </div>
    );
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = Math.max(24, Math.max(maxX - minX, maxY - minY) * 0.08);
  const viewBox = `${minX - padding} ${minY - padding} ${Math.max(1, maxX - minX + padding * 2)} ${Math.max(
    1,
    maxY - minY + padding * 2,
  )}`;

  return (
    <div className="project-preview">
      <svg viewBox={viewBox} role="img" aria-label={`${project.name} preview`} preserveAspectRatio="xMidYMid meet">
        {rooms.map((room) => (
          <polygon
            key={room.id}
            points={roomPoints(room)
              .map((point) => `${room.x + point.x},${room.y + point.y}`)
              .join(" ")}
            fill={room.color}
          />
        ))}
        {walls.map((wall) => (
          <line
            key={wall.id}
            x1={wall.x}
            y1={wall.y}
            x2={wall.x2}
            y2={wall.y2}
            strokeWidth={Math.max(8, wall.thickness)}
          />
        ))}
      </svg>
    </div>
  );
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
  const [stageSize, setStageSize] = useState({ width: 1000, height: 720 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [polygonDraft, setPolygonDraft] = useState<PlanPoint[]>([]);
  const [calibrationPoints, setCalibrationPoints] = useState<PlanPoint[]>([]);
  const [calibrationCentimeters, setCalibrationCentimeters] = useState("100");
  const [spacePanning, setSpacePanning] = useState(false);
  const [planUndoStack, setPlanUndoStack] = useState<PlanUndoSnapshot[]>([]);
  const [snapPreview, setSnapPreview] = useState<CanvasSnapPreview>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    project: false,
    data: true,
  });
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const panLastRef = useRef<{ x: number; y: number } | null>(null);
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
  }, [view]);

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
  }, [activeAlternativeId, appScreen, planUndoStack, polygonDraft, tool, view]);

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
    const snapshot: PlanUndoSnapshot = {
      projects: structuredClone(projects),
      activePropertyId,
      activeFloorId,
      activeAlternativeId,
      selectedId,
      structureSelection: structureSelection ? { ...structureSelection } : null,
    };
    setPlanUndoStack((current) => [...current.slice(-(planUndoLimit - 1)), snapshot]);
  }

  function undoLastPlanChange() {
    const snapshot = planUndoStack[planUndoStack.length - 1];
    if (!snapshot || snapshot.activeAlternativeId !== activeAlternativeId) return;
    setPlanUndoStack((current) => current.slice(0, -1));
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

  function gridLines() {
    const grid = active.alternative ? safeGridSize(active.alternative.plan) : 26;
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
      panLastRef.current = pointer ?? null;
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
      const wall = alternative.plan.walls.find((item) => item.id === id);
      if (!wall) return;
      const dx = x - wall.x;
      const dy = y - wall.y;
      const nextStart = { x: wall.x + dx, y: wall.y + dy };
      const nextEnd = { x: wall.x2 + dx, y: wall.y2 + dy };
      let offset = { x: dx, y: dy };

      if (!snappingDisabled) {
        const gridSize = safeGridSize(alternative.plan);
        const snappedStart = snapStructuralPoint(nextStart, alternative.plan.walls, gridSize, wall.id);
        const startDistance = distance(nextStart, snappedStart);
        const snappedEnd = snapStructuralPoint(nextEnd, alternative.plan.walls, gridSize, wall.id);
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
        const targetWall = alternative.plan.walls.find((item) => item.id === target.wallId);
        if (!targetWall) return;
        if (target.endpoint === "start") {
          targetWall.x = nextPoint.x;
          targetWall.y = nextPoint.y;
        } else {
          targetWall.x2 = nextPoint.x;
          targetWall.y2 = nextPoint.y;
        }
        const width = Math.max(1, Math.hypot(targetWall.x2 - targetWall.x, targetWall.y2 - targetWall.y));
        targetWall.width = width;
        targetWall.rotation = wallAngle(targetWall);
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
      const object = [...alternative.plan.rooms, ...alternative.plan.fixtures].find((item) => item.id === id);
      if (!object) return;
      const nextPoint = snappingDisabled ? { x, y } : snapPointToGrid({ x, y }, safeGridSize(alternative.plan));
      object.x = nextPoint.x;
      object.y = nextPoint.y;
    }, undoMode);
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

  function moveRoomPoint(
    roomId: string,
    pointIndex: number,
    absolutePoint: PlanPoint,
    snappingDisabled: boolean,
    undoMode: PlanUndoMode = "record",
  ) {
    if (structureLocked) return;
    updateAlternative((alternative) => {
      const room = alternative.plan.rooms.find((item) => item.id === roomId);
      if (!room) return;
      const points = roomPoints(room);
      const nextPoint = snappingDisabled
        ? absolutePoint
        : snapStructuralPoint(absolutePoint, alternative.plan.walls, safeGridSize(alternative.plan));
      const nextLocalPoint = { x: nextPoint.x - room.x, y: nextPoint.y - room.y };
      const nextPoints = points.map((point, index) => (index === pointIndex ? nextLocalPoint : point));
      const nextAbsolutePoints = nextPoints.map((point) => ({ x: room.x + point.x, y: room.y + point.y }));
      if (!isSimplePolygon(nextAbsolutePoints)) {
        setStatus("Room polygon edits cannot cross another room edge.");
        return;
      }
      room.points = nextPoints;
      normalizeRoom(room);
    }, undoMode);
  }

  function moveRoomPointFromPointer(
    room: Room,
    pointIndex: number,
    event: KonvaEventObject<DragEvent>,
    undoMode: PlanUndoMode = "record",
  ) {
    const pointer = event.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    const planPoint = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale,
    };
    moveRoomPoint(room.id, pointIndex, planPoint, event.evt.altKey, undoMode);
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
  const activeMediaBoard =
    active.alternative && activeMediaRoom
      ? active.alternative.roomBoards.find((item) => item.roomId === activeMediaRoom.id) ??
        createRoomBoard(activeMediaRoom.id)
      : undefined;
  const activeMediaAssets =
    activeMediaBoard && activeMediaKind === "photos" ? activeMediaBoard.photos : activeMediaBoard?.renderOutputs ?? [];
  const activeMediaLabel = activeMediaKind === "photos" ? "Raw photo" : "Render";
  const activeMediaEmptyLabel = activeMediaKind === "photos" ? "No raw photos yet" : "No renders yet";
  const activeMediaUploadLabel = activeMediaKind === "photos" ? "Add raw photos" : "Add renders";
  const canUndoPlanChange = planUndoStack[planUndoStack.length - 1]?.activeAlternativeId === activeAlternativeId;
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
      <div className="project-dashboard">
        <header className="project-dashboard-top">
          <div className="dashboard-brand">
            <Home size={28} />
            <div>
              <strong>Renovation Planner</strong>
              <span>{status}</span>
            </div>
          </div>
          <div className="dashboard-actions">
            <button type="button" onClick={addProject}>
              <Plus size={17} />
              New project
            </button>
            <button type="button" onClick={() => jsonImportRef.current?.click()}>
              <Import size={17} />
              Import
            </button>
            <button type="button" onClick={() => downloadProjectsJson(projects)} disabled={projects.length === 0}>
              <Download size={17} />
              Export all
            </button>
          </div>
        </header>

        <main className="project-dashboard-main">
          <section className="project-dashboard-heading">
            <div>
              <h1>Your renovation projects</h1>
              <p>Pick up a room plan, duplicate an idea, or start a fresh sketch.</p>
            </div>
            <div className="dashboard-summary">
              <span>Projects</span>
              <strong>{projects.length}</strong>
            </div>
          </section>

          <section className="project-card-grid" aria-label="Projects">
            {projects.map((project) => {
              const stats = projectStats(project);
              return (
                <article className="project-card" key={project.id}>
                  <header>
                    <div className="project-card-title">
                      <h2>{project.name}</h2>
                      <span>{project.type}</span>
                    </div>
                    <button type="button" className="project-open-button" onClick={() => enterProject(project.id)}>
                      <FolderOpen size={16} />
                      Open
                    </button>
                  </header>

                  <ProjectPreview project={project} />

                  <div className="project-card-stats">
                    <div>
                      <span>Floors</span>
                      <strong>{stats.floors}</strong>
                    </div>
                    <div>
                      <span>Layouts</span>
                      <strong>{stats.alternatives}</strong>
                    </div>
                    <div>
                      <span>Rooms</span>
                      <strong>{stats.rooms}</strong>
                    </div>
                    <div>
                      <span>Objects</span>
                      <strong>{stats.fixtures}</strong>
                    </div>
                  </div>

                  <details className="project-card-edit">
                    <summary>Edit details</summary>
                    <div>
                      <label>
                        Name
                        <input
                          value={project.name}
                          onChange={(event) => updateProjectName(project.id, event.target.value)}
                        />
                      </label>
                      <label>
                        Home type
                        <select
                          value={project.type}
                          onChange={(event) => updateProjectType(project.id, event.target.value as PropertyType)}
                        >
                          <option value="Apartment">Apartment</option>
                          <option value="House">House</option>
                        </select>
                      </label>
                    </div>
                  </details>

                  <footer>
                    <button type="button" onClick={() => duplicateProject(project.id)} title={`Duplicate ${project.name}`}>
                      <CopyPlus size={17} />
                    </button>
                    <button type="button" onClick={() => downloadProjectJson(project)} title={`Export ${project.name}`}>
                      <Download size={17} />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => deleteProject(project.id)}
                      disabled={projects.length <= 1}
                      title={projects.length <= 1 ? "Keep at least one project" : `Delete ${project.name}`}
                    >
                      <Trash2 size={17} />
                    </button>
                  </footer>
                </article>
              );
            })}
          </section>
        </main>

        <input
          hidden
          ref={jsonImportRef}
          type="file"
          accept="application/json"
          onChange={(event) => handleJsonImport(event.target.files)}
        />
      </div>
    );
  }

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <aside className={sidebarCollapsed ? "sidebar collapsed" : "sidebar"}>
        <div className="brand">
          <Home size={24} />
          {!sidebarCollapsed && (
            <div className="brand-copy">
              <strong>Renovation Planner</strong>
              <span>{status}</span>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            type="button"
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <SidebarSection
              title="Layouts"
              collapsed={Boolean(collapsedSections.project)}
              onToggle={() => toggleSection("project")}
            >
              <div className="project-tree" aria-label="Project layouts">
                {active.property?.floors.map((floor) => {
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
                          onClick={() => selectTreeFloor(active.property!.id, floor.id)}
                        >
                          <span>{floor.name}</span>
                          <small>{floor.alternatives.length} alt</small>
                        </button>
                        <button
                          className="tree-action"
                          onClick={() => addAlternative(active.property!.id, floor.id)}
                          title={`Duplicate alternative on ${floor.name}`}
                        >
                          <CopyPlus size={15} />
                        </button>
                        <button
                          className="tree-action danger"
                          onClick={() => deleteFloor(floor.id)}
                          disabled={(active.property?.floors.length ?? 0) <= 1}
                          title={
                            (active.property?.floors.length ?? 0) <= 1
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
                                onClick={() => selectTreeAlternative(active.property!.id, floor.id, alternative.id)}
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
              <div className="file-actions">
                <button onClick={() => active.property && addFloor(active.property.id)} disabled={!active.property}>
                  <Plus size={17} />
                  Add floor
                </button>
              </div>
            </SidebarSection>

            <SidebarSection title="Tools" collapsed={Boolean(collapsedSections.tools)} onToggle={() => toggleSection("tools")}>
              <button
                type="button"
                className={structureLocked ? "structure-lock-button active" : "structure-lock-button"}
                onClick={toggleStructureLock}
                aria-pressed={structureLocked}
                title={structureLocked ? "Unlock rooms, walls, doors, and windows" : "Lock rooms, walls, doors, and windows"}
              >
                {structureLocked ? <Lock size={16} /> : <Unlock size={16} />}
                <span>{structureLocked ? "Structure locked" : "Lock structure"}</span>
              </button>
              <div className="tool-stack">
                {toolGroups.map((group) => (
                  <div className="tool-section" key={group.title}>
                    <div className="tool-section-title">{group.title}</div>
                    <div className="tool-grid">
                      {group.items.map((item) => (
                        <button
                          key={item.mode}
                          className={tool === item.mode ? "tool active" : "tool"}
                          disabled={structureLocked && isStructuralTool(item.mode)}
                          onClick={() => {
                            if (structureLocked && isStructuralTool(item.mode)) return;
                            if (item.mode !== "polyRoom") setPolygonDraft([]);
                            if (item.mode !== "calibrate") setCalibrationPoints([]);
                            setTool(item.mode);
                          }}
                          title={
                            structureLocked && isStructuralTool(item.mode)
                              ? "Unlock structure to use this tool"
                              : item.label
                          }
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
                  Pixels / 100 cm
                  <input
                    type="number"
                    min={10}
                    value={plan?.scale.pixelsPerMeter ?? 52}
                    onChange={(event) => updatePlanScaleNumber("pixelsPerMeter", Number(event.target.value), 10)}
                  />
                </label>
                <label>
                  Grid size
                  <input
                    type="number"
                    min={8}
                    value={plan?.scale.gridSize ?? 26}
                    onChange={(event) => updatePlanScaleNumber("gridSize", Number(event.target.value), 8)}
                  />
                </label>
              </div>

              <div className="calibration-panel">
                <div>
                  <strong>Scale calibration</strong>
                  <span>
                    {calibrationPoints.length === 0
                      ? "Click two exact points on the floorplan."
                      : calibrationPoints.length === 1
                        ? "Click the second point."
                        : `${calibrationMeasurementLabel()} selected.`}
                  </span>
                </div>
                <label>
                  Known distance (cm)
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={calibrationCentimeters}
                    onChange={(event) => setCalibrationCentimeters(event.target.value)}
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
              title="Project File"
              collapsed={Boolean(collapsedSections.data)}
              onToggle={() => toggleSection("data")}
            >
              <div className="file-actions">
                <button onClick={() => active.property && downloadProjectJson(active.property)} disabled={!active.property}>
                  <Download size={17} />
                  Export project
                </button>
              </div>
            </SidebarSection>
          </>
        )}
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
          <div className="topbar-title">
            <button className="back-button" type="button" onClick={backToProjects} aria-label="Back to projects">
              <ArrowLeft size={17} />
            </button>
            <div>
              <h1>{active.property?.name ?? "Renovation Planner"}</h1>
              <p>
                {active.floor?.name} · {active.alternative?.name}
              </p>
            </div>
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
                <button
                  onClick={undoLastPlanChange}
                  disabled={!canUndoPlanChange}
                  aria-label="Undo last plan change"
                  title={canUndoPlanChange ? "Undo last plan change" : "No plan changes to undo"}
                >
                  <Undo2 size={16} />
                </button>
                <i className="canvas-control-divider" aria-hidden="true" />
                <button onClick={() => zoomCanvas(viewport.scale * 1.15)} aria-label="Zoom in">
                  <ZoomIn size={16} />
                </button>
                <button onClick={() => zoomCanvas(viewport.scale / 1.15)} aria-label="Zoom out">
                  <ZoomOut size={16} />
                </button>
                <button onClick={resetCanvasView} aria-label="Reset view">
                  <Maximize2 size={16} />
                </button>
                <span>{Math.round(viewport.scale * 100)}%</span>
                <small>Scroll pan · pinch zoom · Space drag · Alt free-drag · Cmd/Ctrl Z undo</small>
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
                        draggable={tool === "select" && !structureLocked}
                        listening={!structureLocked}
                        onClick={() => {
                          if (tool === "select") selectPlanObject(room.id);
                        }}
                        onDragStart={(event) => {
                          if (event.target === event.currentTarget) recordPlanUndoSnapshot();
                        }}
                        onDragEnd={(event) => {
                          if (event.target !== event.currentTarget) return;
                          moveRectangularObject(room.id, event.target.x(), event.target.y(), event.evt.altKey, "skip");
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
                                recordPlanUndoSnapshot();
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                moveRoomPointFromPointer(room, index, event, "skip");
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                moveRoomPointFromPointer(room, index, event, "skip");
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
                          if (tool === "select") selectPlanObject(wall.id);
                        }}
                        onDragStart={(event) => {
                          if (event.target === event.currentTarget) recordPlanUndoSnapshot();
                        }}
                        onDragEnd={(event) => {
                          if (event.target !== event.currentTarget) return;
                          moveWall(wall.id, event.currentTarget.x(), event.currentTarget.y(), event.evt.altKey, "skip");
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
                                  handle.endpoint === "start"
                                    ? { x: wall.x2, y: wall.y2 }
                                    : { x: wall.x, y: wall.y };
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
                                recordPlanUndoSnapshot();
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                moveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey, "skip");
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                moveWallEndpoint(wall.id, handle.endpoint, point, event.evt.altKey, "skip");
                                clearSnapState();
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
                            if (tool === "select") selectPlanObject(opening.id);
                          }}
                          onDragStart={() => {
                            activeOpeningSnapRef.current = opening.wallId
                              ? { kind: "opening-wall", wallId: opening.wallId }
                              : undefined;
                            recordPlanUndoSnapshot();
                          }}
                          onDragMove={(event) =>
                            moveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey, "skip")
                          }
                          onDragEnd={(event) => {
                            moveOpening(opening.id, event.target.x(), event.target.y(), event.evt.altKey, "skip");
                            clearSnapState();
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
                                recordPlanUndoSnapshot();
                              }}
                              onDragMove={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                resizeOpening(opening.id, handle.endpoint, point, event.evt.altKey, "skip");
                              }}
                              onDragEnd={(event) => {
                                event.cancelBubble = true;
                                const point = stagePlanPointer(event);
                                if (!point) return;
                                resizeOpening(opening.id, handle.endpoint, point, event.evt.altKey, "skip");
                                clearSnapState();
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
                        if (tool === "select") selectPlanObject(fixture.id);
                      }}
                      onDragStart={(event) => {
                        if (event.target === event.currentTarget) recordPlanUndoSnapshot();
                      }}
                      onDragEnd={(event) => {
                        if (event.target !== event.currentTarget) return;
                        moveRectangularObject(
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
                          text={calibrationMeasurementLabel()}
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
              <h2>{inspectorTitle}</h2>
              {selectedRoom && plan ? (
                <>
                  <label>
                    Room name
                    <input value={selectedRoom.name} onChange={(event) => updateSelectedName(event.target.value)} />
                  </label>
                  <div className="room-measure-fields">
                    <label>
                      Width (cm)
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={Math.round(selectedRoomWidthCentimeters)}
                        onChange={(event) => updateSelectedRoomDimensionCentimeters("width", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Length (cm)
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={Math.round(selectedRoomLengthCentimeters)}
                        onChange={(event) => updateSelectedRoomDimensionCentimeters("height", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Height (cm)
                      <input
                        type="number"
                        min={10}
                        step={1}
                        value={Math.round(selectedRoomHeightCentimeters)}
                        onChange={(event) => updateSelectedRoomHeight(Number(event.target.value) / 100)}
                      />
                    </label>
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
                      {selectedShapeWidthLabel} (cm)
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShapeWidthCentimeters)}
                        onChange={(event) => updateSelectedDimensionCentimeters("width", Number(event.target.value))}
                      />
                    </label>
                    <label>
                      {selectedShapeHeightLabel} (cm)
                      <input
                        type="number"
                        min={1}
                        value={Math.round(selectedShapeHeightCentimeters)}
                        onChange={(event) => updateSelectedDimensionCentimeters("height", Number(event.target.value))}
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
                  <p>Select a layout or a plan object to edit it.</p>
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
                <p>Each room gets a focused board for raw photos, renders, and renovation notes.</p>
              </div>
            )}
            {activeMediaRoom && activeMediaBoard && (
              <div className="room-workbook">
                <aside className="room-rail" aria-label="Rooms">
                  <header>
                    <span>Rooms</span>
                    <strong>{plan.rooms.length}</strong>
                  </header>
                  <div className="room-rail-list">
                    {plan.rooms.map((room) => {
                      const board =
                        active.alternative!.roomBoards.find((item) => item.roomId === room.id) ??
                        createRoomBoard(room.id);
                      const isActive = room.id === activeMediaRoom.id;
                      return (
                        <button
                          className={isActive ? "room-rail-item active" : "room-rail-item"}
                          key={room.id}
                          onClick={() => {
                            setActiveMediaRoomId(room.id);
                            selectPlanObject(room.id);
                          }}
                        >
                          <span className="room-rail-color" style={{ background: room.color }} />
                          <span className="room-rail-copy">
                            <strong>{room.name}</strong>
                            <small>{roomArea(room, safePixelsPerMeter(plan)).toFixed(1)} m2</small>
                          </span>
                          <span className="room-rail-counts">
                            <span>{board.photos.length} raw</span>
                            <span>{board.renderOutputs.length} renders</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <section
                  className="room-board room-board-focused"
                  style={{ "--room-color": activeMediaRoom.color } as CSSProperties}
                >
                  <header>
                    <div>
                      <h2>{activeMediaRoom.name}</h2>
                      <p>
                        {roomArea(activeMediaRoom, safePixelsPerMeter(plan)).toFixed(1)} m2 ·{" "}
                        {activeMediaBoard.photos.length} raw · {activeMediaBoard.renderOutputs.length} renders
                      </p>
                    </div>
                  </header>

                  <section className="media-stage">
                    <header>
                      <div className="media-switcher" aria-label="Room media type">
                        <button
                          className={activeMediaKind === "photos" ? "active" : ""}
                          onClick={() => setActiveMediaKind("photos")}
                          type="button"
                        >
                          Raw photos
                          <span>{activeMediaBoard.photos.length}</span>
                        </button>
                        <button
                          className={activeMediaKind === "renderOutputs" ? "active" : ""}
                          onClick={() => setActiveMediaKind("renderOutputs")}
                          type="button"
                        >
                          Renders
                          <span>{activeMediaBoard.renderOutputs.length}</span>
                        </button>
                      </div>
                      <MediaUploadAction
                        label={activeMediaUploadLabel}
                        onFiles={(files) => addBoardAssets(activeMediaRoom.id, activeMediaKind, files)}
                      />
                    </header>
                    <RoomGallery
                      assets={activeMediaAssets}
                      label={activeMediaLabel}
                      emptyLabel={activeMediaEmptyLabel}
                      onOpenAsset={(asset, label) => setPreviewAsset({ asset, label })}
                      onRemoveAsset={(assetId) => removeBoardAsset(activeMediaRoom.id, activeMediaKind, assetId)}
                    />
                  </section>

                  <label className="notes">
                    Notes
                    <textarea
                      value={activeMediaBoard.notes}
                      onChange={(event) => updateBoard(activeMediaRoom.id, (item) => (item.notes = event.target.value))}
                      placeholder="Measurements, materials, things to keep, decisions to revisit..."
                    />
                  </label>
                </section>
              </div>
            )}
          </div>
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
