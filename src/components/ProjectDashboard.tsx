import { CopyPlus, Download, FolderOpen, Home, Import, Plus, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import type { Plan, PropertyProject, PropertyType } from "../types";
import { downloadProjectJson, downloadProjectsJson, roomPoints } from "../utils";

interface ProjectDashboardProps {
  projects: PropertyProject[];
  status: string;
  jsonImportRef: RefObject<HTMLInputElement>;
  onAddProject: () => void;
  onOpenProject: (projectId: string) => void;
  onImportProjects: (files: FileList | null) => void;
  onUpdateProjectName: (projectId: string, name: string) => void;
  onUpdateProjectType: (projectId: string, type: PropertyType) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
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

function ProjectDashboard({
  projects,
  status,
  jsonImportRef,
  onAddProject,
  onOpenProject,
  onImportProjects,
  onUpdateProjectName,
  onUpdateProjectType,
  onDuplicateProject,
  onDeleteProject,
}: ProjectDashboardProps) {
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
          <button type="button" onClick={onAddProject}>
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
                  <button type="button" className="project-open-button" onClick={() => onOpenProject(project.id)}>
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
                      <input value={project.name} onChange={(event) => onUpdateProjectName(project.id, event.target.value)} />
                    </label>
                    <label>
                      Home type
                      <select
                        value={project.type}
                        onChange={(event) => onUpdateProjectType(project.id, event.target.value as PropertyType)}
                      >
                        <option value="Apartment">Apartment</option>
                        <option value="House">House</option>
                      </select>
                    </label>
                  </div>
                </details>

                <footer>
                  <button type="button" onClick={() => onDuplicateProject(project.id)} title={`Duplicate ${project.name}`}>
                    <CopyPlus size={17} />
                  </button>
                  <button type="button" onClick={() => downloadProjectJson(project)} title={`Export ${project.name}`}>
                    <Download size={17} />
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDeleteProject(project.id)}
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
        onChange={(event) => onImportProjects(event.target.files)}
      />
    </div>
  );
}

export default ProjectDashboard;
