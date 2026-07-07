import { ArrowLeft, Camera, Grid3X3, Layers3 } from "lucide-react";
import type { Alternative, Floor, PropertyProject } from "../types";

interface EditorTopbarProps {
  property?: PropertyProject;
  floor?: Floor;
  alternative?: Alternative;
  view: "plan" | "media" | "three";
  onBack: () => void;
  onSetView: (view: "plan" | "media" | "three") => void;
}

function EditorTopbar({ property, floor, alternative, view, onBack, onSetView }: EditorTopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <button className="back-button" type="button" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1>{property?.name ?? "Renovation Planner"}</h1>
          <p>
            {floor?.name} · {alternative?.name}
          </p>
        </div>
      </div>
      <div className="view-tabs">
        <button className={view === "plan" ? "active" : ""} onClick={() => onSetView("plan")}>
          <Grid3X3 size={17} />
          Plan
        </button>
        <button className={view === "media" ? "active" : ""} onClick={() => onSetView("media")}>
          <Camera size={17} />
          Rooms
        </button>
        <button className={view === "three" ? "active" : ""} onClick={() => onSetView("three")}>
          <Layers3 size={17} />
          3D
        </button>
      </div>
    </header>
  );
}

export default EditorTopbar;
