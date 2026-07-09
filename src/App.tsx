import { X } from "lucide-react";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import type { KonvaEventObject } from "konva/lib/Node";
import EditorSidebar from "./components/EditorSidebar";
import EditorTopbar from "./components/EditorTopbar";
import InspectorPanel from "./components/InspectorPanel";
import PlanCanvas from "./components/PlanCanvas";
import ProjectDashboard from "./components/ProjectDashboard";
import RoomMediaBoard from "./components/RoomMediaBoard";
import { type ActiveSnap } from "./geometry";
import { loadImage, useHtmlImage } from "./image";
import { useCanvasViewport } from "./hooks/useCanvasViewport";
import { useInspectorSelection } from "./hooks/useInspectorSelection";
import { usePlanEditorInteractions, type CanvasSnapPreview } from "./hooks/usePlanEditorInteractions";
import { usePlanTransactions } from "./hooks/usePlanTransactions";
import { useProjectWorkspace } from "./hooks/useProjectWorkspace";
import { getOrCreateRoomBoard, isStructuralTool } from "./model";
import type {
  Asset,
  FixtureKind,
  PlanPoint,
  RoomBoard,
  ToolMode,
} from "./types";
import { parseProjectExport, readFileAsDataUrl } from "./utils";

const ThreePreview = lazy(() => import("./ThreePreview"));

type RoomBoardTab = "photos" | "renderOutputs" | "styleBoard";
function App() {
  const {
    projects,
    setProjects,
    repositoryState,
    status,
    setStatus,
    appScreen,
    setAppScreen,
    activePropertyId,
    activeFloorId,
    activeAlternativeId,
    selectedId,
    setSelectedId,
    structureSelection,
    setStructureSelection,
    expandedTreeNodes,
    setExpandedTreeNodes,
    sidebarCollapsed,
    setSidebarCollapsed,
    active,
    activeStructure,
    updateProjectName,
    updateProjectType,
    updateActiveFloorName,
    updateActiveAlternativeName,
    selectTreeFloor,
    selectTreeAlternative,
    enterProject,
    addProject,
    duplicateProject,
    deleteProject,
    addAlternative,
    addFloor,
    deleteFloor,
    deleteAlternative,
    addImportedProjects,
  } = useProjectWorkspace();
  const [tool, setTool] = useState<ToolMode>("select");
  const [fixtureKind, setFixtureKind] = useState<FixtureKind>("counter");
  const [structureLocked, setStructureLocked] = useState(false);
  const [view, setView] = useState<"plan" | "media" | "three">("plan");
  const [activeMediaRoomId, setActiveMediaRoomId] = useState("");
  const [activeMediaKind, setActiveMediaKind] = useState<RoomBoardTab>("photos");
  const [previewAsset, setPreviewAsset] = useState<{ asset: Asset; label: string } | null>(null);
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
  const {
    canUndoPlanChange,
    recordPlanUndoSnapshot,
    undoLastPlanChange,
    updateAlternative,
    updateRoomBoards,
    updateAlternativeWithRoomBoards,
  } = usePlanTransactions({
    repositoryState,
    setStatus,
    setProjects,
    activePropertyId,
    activeFloorId,
    activeAlternativeId,
    activeAlternative: active.alternative,
    selectedId,
    structureSelection,
    onUndoRestored: (snapshot) => {
      setSelectedId(snapshot.selectedId);
      setStructureSelection(snapshot.structureSelection);
      setPolygonDraft([]);
      setCalibrationPoints([]);
      setTool("select");
    },
  });
  const snappingDisabledRef = useRef(false);
  const activeOpeningSnapRef = useRef<ActiveSnap | undefined>(undefined);
  const activeWallEndpointSnapRef = useRef<ActiveSnap | undefined>(undefined);
  const importRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const {
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
  } = usePlanEditorInteractions({
    alternative: active.alternative,
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
  });
  const {
    plan,
    selectedRoom,
    selectedShape,
    inspectorTitle,
    selectedRoomWidthCentimeters,
    selectedRoomLengthCentimeters,
    selectedRoomHeightCentimeters,
    selectedShapeNameLabel,
    selectedShapeWidthLabel,
    selectedShapeHeightLabel,
    selectedShapeWidthCentimeters,
    selectedShapeHeightCentimeters,
    updateSelectedRotation,
    deleteSelected,
    updateSelectedName,
    updateSelectedRoomDimensionCentimeters,
    updateSelectedDimensionCentimeters,
    updateSelectedRoomHeight,
  } = useInspectorSelection({
    alternative: active.alternative,
    activeStructure,
    selectedId,
    setSelectedId,
    structureLocked,
    updateAlternative,
    updateAlternativeWithRoomBoards,
  });

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

  function updatePlanScaleNumber(field: "pixelsPerMeter" | "gridSize", value: number, minimum: number) {
    if (!Number.isFinite(value) || value < minimum) return;
    updateAlternative((alternative) => {
      alternative.plan.scale[field] = value;
    });
  }

  function backToProjects() {
    setSelectedId(null);
    setPolygonDraft([]);
    setCalibrationPoints([]);
    setTool("select");
    setAppScreen("projects");
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
      const imported = parseProjectExport(text);
      if (imported.length === 0) throw new Error("Project export did not contain any projects.");
      addImportedProjects(imported);
      setStatus(`Imported ${imported.length} project${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not import project export");
    } finally {
      if (jsonImportRef.current) jsonImportRef.current.value = "";
    }
  }

  async function addBoardAssets(roomId: string, kind: "photos" | "renderOutputs" | "referenceImages", files: FileList | null) {
    if (!files) return;
    const assets = await Promise.all([...files].map(readFileAsDataUrl));
    updateRoomBoards((alternative) => {
      const board = getOrCreateRoomBoard(alternative, roomId);
      board[kind].push(...assets);
    });
  }

  function updateBoard(roomId: string, updater: (board: RoomBoard) => void) {
    updateRoomBoards((alternative) => {
      const board = getOrCreateRoomBoard(alternative, roomId);
      updater(board);
    });
  }

  function removeBoardAsset(roomId: string, kind: "photos" | "renderOutputs" | "referenceImages", assetId: string) {
    updateBoard(roomId, (board) => {
      board[kind] = board[kind].filter((asset) => asset.id !== assetId);
      if (kind === "photos" && board.beforeAssetId === assetId) board.beforeAssetId = undefined;
      if (kind === "renderOutputs" && board.afterAssetId === assetId) board.afterAssetId = undefined;
    });
  }

  const activeMediaRoom = plan?.rooms.find((room) => room.id === activeMediaRoomId) ?? plan?.rooms[0];
  const isTreeNodeExpanded = (id: string) => expandedTreeNodes[id] !== false;
  const toggleTreeNode = (id: string) => {
    setExpandedTreeNodes((current) => ({ ...current, [id]: current[id] === false }));
  };
  const toggleSection = (id: string) => {
    setCollapsedSections((current) => ({ ...current, [id]: !current[id] }));
  };


  if (repositoryState === "loading") {
    return <div className="project-dashboard" role="status">Loading local workshop...</div>;
  }

  if (repositoryState === "error") {
    return <div className="project-dashboard" role="alert">{status}</div>;
  }

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
            onUpdateBoard={updateBoard}
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
