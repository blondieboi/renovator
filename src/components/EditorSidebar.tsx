import {
  AppWindow,
  BedDouble,
  ChevronDown,
  ChevronRight,
  CopyPlus,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  Hand,
  Home,
  Lock,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Pentagon,
  PencilRuler,
  Plus,
  Ruler,
  Square,
  Trash2,
  Unlock,
  Upload,
} from "lucide-react";
import type { RefObject } from "react";
import { downloadProjectJson, fixtureLabels } from "../utils";
import { fixtureKinds, isStructuralTool, type StructureSelection } from "../model";
import type { Alternative, FixtureKind, Floor, Plan, PropertyProject, ToolMode } from "../types";
import SidebarSection from "./SidebarSection";

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

interface ActiveProjectContext {
  property?: PropertyProject;
  floor?: Floor;
  alternative?: Alternative;
}

interface EditorSidebarProps {
  collapsed: boolean;
  status: string;
  active: ActiveProjectContext;
  plan?: Plan;
  structureSelection: StructureSelection | null;
  collapsedSections: Record<string, boolean>;
  isTreeNodeExpanded: (id: string) => boolean;
  tool: ToolMode;
  fixtureKind: FixtureKind;
  structureLocked: boolean;
  calibrationPointCount: number;
  calibrationMeasurementLabel: string;
  calibrationCentimeters: string;
  importRef: RefObject<HTMLInputElement>;
  jsonImportRef: RefObject<HTMLInputElement>;
  onToggleCollapsed: () => void;
  onToggleSection: (id: string) => void;
  onToggleTreeNode: (id: string) => void;
  onSelectFloor: (propertyId: string, floorId: string) => void;
  onSelectAlternative: (propertyId: string, floorId: string, alternativeId: string) => void;
  onAddFloor: (propertyId: string) => void;
  onAddAlternative: (propertyId: string, floorId: string) => void;
  onDeleteFloor: (floorId: string) => void;
  onDeleteAlternative: (floorId: string, alternativeId: string) => void;
  onToggleStructureLock: () => void;
  onSelectTool: (tool: ToolMode) => void;
  onSetFixtureKind: (kind: FixtureKind) => void;
  onToggleBackgroundVisibility: () => void;
  onUpdatePlanScaleNumber: (field: "pixelsPerMeter" | "gridSize", value: number, minimum: number) => void;
  onSetCalibrationCentimeters: (value: string) => void;
  onPickCalibrationPoints: () => void;
  onApplyCalibration: () => void;
  onBackgroundUpload: (files: FileList | null) => void;
  onJsonImport: (files: FileList | null) => void;
}

function EditorSidebar({
  collapsed,
  status,
  active,
  plan,
  structureSelection,
  collapsedSections,
  isTreeNodeExpanded,
  tool,
  fixtureKind,
  structureLocked,
  calibrationPointCount,
  calibrationMeasurementLabel,
  calibrationCentimeters,
  importRef,
  jsonImportRef,
  onToggleCollapsed,
  onToggleSection,
  onToggleTreeNode,
  onSelectFloor,
  onSelectAlternative,
  onAddFloor,
  onAddAlternative,
  onDeleteFloor,
  onDeleteAlternative,
  onToggleStructureLock,
  onSelectTool,
  onSetFixtureKind,
  onToggleBackgroundVisibility,
  onUpdatePlanScaleNumber,
  onSetCalibrationCentimeters,
  onPickCalibrationPoints,
  onApplyCalibration,
  onBackgroundUpload,
  onJsonImport,
}: EditorSidebarProps) {
  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="brand">
        <Home size={24} />
        {!collapsed && (
          <div className="brand-copy">
            <strong>Renovation Planner</strong>
            <span>{status}</span>
          </div>
        )}
        <button
          className="sidebar-toggle"
          onClick={onToggleCollapsed}
          type="button"
          aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {!collapsed && (
        <>
          <SidebarSection
            title="Layouts"
            collapsed={Boolean(collapsedSections.project)}
            onToggle={() => onToggleSection("project")}
          >
            <div className="project-tree" aria-label="Project layouts">
              {active.property?.floors.map((floor) => {
                const floorExpanded = isTreeNodeExpanded(floor.id);
                return (
                  <div className="tree-floor" key={floor.id}>
                    <div className="tree-row tree-row-floor">
                      <button
                        className="tree-disclosure"
                        onClick={() => onToggleTreeNode(floor.id)}
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
                        onClick={() => active.property && onSelectFloor(active.property.id, floor.id)}
                      >
                        <span>{floor.name}</span>
                        <small>{floor.alternatives.length} alt</small>
                      </button>
                      <button
                        className="tree-action"
                        onClick={() => active.property && onAddAlternative(active.property.id, floor.id)}
                        title={`Duplicate alternative on ${floor.name}`}
                      >
                        <CopyPlus size={15} />
                      </button>
                      <button
                        className="tree-action danger"
                        onClick={() => onDeleteFloor(floor.id)}
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
                              onClick={() =>
                                active.property && onSelectAlternative(active.property.id, floor.id, alternative.id)
                              }
                            >
                              <span>{alternative.name}</span>
                            </button>
                            <button
                              className="tree-action danger"
                              onClick={() => onDeleteAlternative(floor.id, alternative.id)}
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
              <button onClick={() => active.property && onAddFloor(active.property.id)} disabled={!active.property}>
                <Plus size={17} />
                Add floor
              </button>
            </div>
          </SidebarSection>

          <SidebarSection title="Tools" collapsed={Boolean(collapsedSections.tools)} onToggle={() => onToggleSection("tools")}>
            <button
              type="button"
              className={structureLocked ? "structure-lock-button active" : "structure-lock-button"}
              onClick={onToggleStructureLock}
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
                        onClick={() => onSelectTool(item.mode)}
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
                <select value={fixtureKind} onChange={(event) => onSetFixtureKind(event.target.value as FixtureKind)}>
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
            onToggle={() => onToggleSection("floorplan")}
          >
            <div className="file-actions">
              <button onClick={() => importRef.current?.click()}>
                <Upload size={17} />
                Upload plan
              </button>
              <button onClick={onToggleBackgroundVisibility} disabled={!plan?.background}>
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
                  onChange={(event) => onUpdatePlanScaleNumber("pixelsPerMeter", Number(event.target.value), 10)}
                />
              </label>
              <label>
                Grid size
                <input
                  type="number"
                  min={8}
                  value={plan?.scale.gridSize ?? 26}
                  onChange={(event) => onUpdatePlanScaleNumber("gridSize", Number(event.target.value), 8)}
                />
              </label>
            </div>

            <div className="calibration-panel">
              <div>
                <strong>Scale calibration</strong>
                <span>
                  {calibrationPointCount === 0
                    ? "Click two exact points on the floorplan."
                    : calibrationPointCount === 1
                      ? "Click the second point."
                      : `${calibrationMeasurementLabel} selected.`}
                </span>
              </div>
              <label>
                Known distance (cm)
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={calibrationCentimeters}
                  onChange={(event) => onSetCalibrationCentimeters(event.target.value)}
                />
              </label>
              <div className="calibration-actions">
                <button onClick={onPickCalibrationPoints}>
                  <Ruler size={16} />
                  Pick points
                </button>
                <button onClick={onApplyCalibration} disabled={calibrationPointCount !== 2}>
                  Apply
                </button>
              </div>
            </div>
          </SidebarSection>

          <SidebarSection
            title="Project File"
            collapsed={Boolean(collapsedSections.data)}
            onToggle={() => onToggleSection("data")}
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
        onChange={(event) => onBackgroundUpload(event.target.files)}
      />
      <input hidden ref={jsonImportRef} type="file" accept="application/json" onChange={(event) => onJsonImport(event.target.files)} />
    </aside>
  );
}

export default EditorSidebar;
