import { useEffect, useMemo, useState } from "react";
import { findActiveProject, type StructureSelection } from "../model";
import type { Floor, PropertyProject, PropertyType } from "../types";
import { cloneProjectForLocal, createAlternative, createPropertyProject, nowIso, uid } from "../utils";
import { useProjectRepository } from "./useProjectRepository";

export type AppScreen = "projects" | "editor";

function defaultProjectSelection(project: PropertyProject): StructureSelection {
  const floor = project.floors[0];
  const alternative = floor?.alternatives[0];
  if (alternative) return { type: "alternative", id: alternative.id };
  if (floor) return { type: "floor", id: floor.id };
  return { type: "project", id: project.id };
}

export function useProjectWorkspace() {
  const {
    projects,
    setProjects,
    state: repositoryState,
    status,
    setStatus,
  } = useProjectRepository();
  const [appScreen, setAppScreen] = useState<AppScreen>("projects");
  const [activePropertyId, setActivePropertyId] = useState("");
  const [activeFloorId, setActiveFloorId] = useState("");
  const [activeAlternativeId, setActiveAlternativeId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [structureSelection, setStructureSelection] = useState<StructureSelection | null>(null);
  const [expandedTreeNodes, setExpandedTreeNodes] = useState<Record<string, boolean>>({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (repositoryState !== "ready" || activePropertyId) return;
    const property = projects[0];
    const floor = property?.floors[0];
    const alternative = floor?.alternatives[0];
    setActivePropertyId(property?.id ?? "");
    setActiveFloorId(floor?.id ?? "");
    setActiveAlternativeId(alternative?.id ?? "");
    setStructureSelection(alternative ? { type: "alternative", id: alternative.id } : null);
    setAppScreen("projects");
  }, [activePropertyId, projects, repositoryState]);

  const active = useMemo(
    () => findActiveProject(projects, activePropertyId, activeFloorId, activeAlternativeId),
    [activeAlternativeId, activeFloorId, activePropertyId, projects],
  );

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

  function updateProjects(updater: (draft: PropertyProject[]) => PropertyProject[]) {
    if (repositoryState !== "ready") return;
    setStatus("Saving...");
    setProjects((current) => updater(structuredClone(current)));
  }

  function findActiveDraft(draft: PropertyProject[]) {
    return findActiveProject(draft, activePropertyId, activeFloorId, activeAlternativeId);
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

  function activateProject(project: PropertyProject, selection = defaultProjectSelection(project)) {
    const floor = project.floors[0];
    const alternative = floor?.alternatives[0];
    setActivePropertyId(project.id);
    setActiveFloorId(floor?.id ?? "");
    setActiveAlternativeId(alternative?.id ?? "");
    setSelectedId(null);
    setStructureSelection(selection);
    setExpandedTreeNodes((current) => ({
      ...current,
      [project.id]: true,
      ...(floor ? { [floor.id]: true } : {}),
    }));
  }

  function enterProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    activateProject(project);
    setSidebarCollapsed(false);
    setAppScreen("editor");
  }

  function addProject() {
    const project = createPropertyProject(`Project ${projects.length + 1}`);
    updateProjects((draft) => [...draft, project]);
    activateProject(project);
    setAppScreen("editor");
  }

  function duplicateProject(projectId: string) {
    const source = projects.find((item) => item.id === projectId);
    if (!source) return;
    const copy = cloneProjectForLocal(source);
    updateProjects((draft) => [...draft, copy]);
    activateProject(copy);
    setAppScreen("editor");
  }

  function deleteProject(projectId: string) {
    const projectIndex = projects.findIndex((item) => item.id === projectId);
    const project = projects[projectIndex];
    if (!project || projects.length <= 1) return;
    if (!window.confirm(`Delete "${project.name}" and all of its floors?`)) return;
    const nextProject = projects.filter((item) => item.id !== projectId)[Math.max(0, projectIndex - 1)] ?? projects[0];
    updateProjects((draft) => draft.filter((item) => item.id !== projectId));
    if (activePropertyId === projectId && nextProject) {
      activateProject(nextProject);
      setAppScreen("projects");
    }
  }

  function addAlternative(propertyId = activePropertyId, floorId = activeFloorId) {
    const property = projects.find((item) => item.id === propertyId);
    const floor = property?.floors.find((item) => item.id === floorId);
    if (!property || !floor) return;
    const alternative = createAlternative(`Alternative ${floor.alternatives.length + 1}`);
    const current = floor.alternatives.find((item) => item.id === activeAlternativeId);
    if (current) {
      alternative.plan = structuredClone(current.plan);
      alternative.roomBoards = structuredClone(current.roomBoards);
    }
    updateProjects((draft) => {
      const draftFloor = draft.find((item) => item.id === propertyId)?.floors.find((item) => item.id === floorId);
      if (draftFloor) draftFloor.alternatives.push(alternative);
      return draft;
    });
    setActivePropertyId(property.id);
    setActiveFloorId(floor.id);
    setActiveAlternativeId(alternative.id);
    setSelectedId(null);
    setStructureSelection({ type: "alternative", id: alternative.id });
    setExpandedTreeNodes((current) => ({ ...current, [property.id]: true, [floor.id]: true }));
  }

  function addFloor(propertyId = activePropertyId) {
    const property = projects.find((item) => item.id === propertyId);
    if (!property) return;
    const floor: Floor = {
      id: uid("floor"),
      name: `Floor ${property.floors.length + 1}`,
      level: property.floors.length,
      alternatives: [createAlternative("Current layout")],
    };
    updateProjects((draft) => {
      const draftProperty = draft.find((item) => item.id === propertyId);
      if (draftProperty) {
        draftProperty.floors.push(floor);
        draftProperty.updatedAt = nowIso();
      }
      return draft;
    });
    setActivePropertyId(property.id);
    setActiveFloorId(floor.id);
    setActiveAlternativeId(floor.alternatives[0]?.id ?? "");
    setSelectedId(null);
    setStructureSelection({ type: "floor", id: floor.id });
    setExpandedTreeNodes((current) => ({ ...current, [property.id]: true, [floor.id]: true }));
  }

  function deleteFloor(floorId: string) {
    const property = projects.find((item) => item.floors.some((floor) => floor.id === floorId));
    const floorIndex = property?.floors.findIndex((item) => item.id === floorId) ?? -1;
    const floor = floorIndex >= 0 ? property?.floors[floorIndex] : undefined;
    if (!property || !floor || property.floors.length <= 1) return;
    if (!window.confirm(`Delete "${floor.name}" and all of its alternatives?`)) return;
    const remainingFloors = property.floors.filter((item) => item.id !== floorId);
    const nextFloor = remainingFloors[Math.max(0, floorIndex - 1)] ?? remainingFloors[0];
    const nextAlternative = nextFloor?.alternatives[0];
    updateProjects((draft) => {
      const draftProperty = draft.find((item) => item.id === property.id);
      if (!draftProperty) return draft;
      draftProperty.floors = draftProperty.floors.filter((item) => item.id !== floorId);
      draftProperty.floors.forEach((item, index) => {
        item.level = index;
      });
      draftProperty.updatedAt = nowIso();
      return draft;
    });
    if (activeFloorId === floorId) {
      setActivePropertyId(property.id);
      setActiveFloorId(nextFloor?.id ?? "");
      setActiveAlternativeId(nextAlternative?.id ?? "");
      setSelectedId(null);
      setStructureSelection(
        nextAlternative
          ? { type: "alternative", id: nextAlternative.id }
          : nextFloor
            ? { type: "floor", id: nextFloor.id }
            : { type: "project", id: property.id },
      );
    }
  }

  function deleteAlternative(floorId: string, alternativeId: string) {
    const property = projects.find((item) => item.floors.some((floor) => floor.id === floorId));
    const floor = property?.floors.find((item) => item.id === floorId);
    const alternativeIndex = floor?.alternatives.findIndex((item) => item.id === alternativeId) ?? -1;
    const alternative = alternativeIndex >= 0 ? floor?.alternatives[alternativeIndex] : undefined;
    if (!property || !floor || !alternative || floor.alternatives.length <= 1) return;
    if (!window.confirm(`Delete "${alternative.name}"?`)) return;
    const remainingAlternatives = floor.alternatives.filter((item) => item.id !== alternativeId);
    const nextAlternative = remainingAlternatives[Math.max(0, alternativeIndex - 1)] ?? remainingAlternatives[0];
    updateProjects((draft) => {
      const draftProperty = draft.find((item) => item.id === property.id);
      const draftFloor = draftProperty?.floors.find((item) => item.id === floorId);
      if (!draftProperty || !draftFloor) return draft;
      draftFloor.alternatives = draftFloor.alternatives.filter((item) => item.id !== alternativeId);
      draftProperty.updatedAt = nowIso();
      return draft;
    });
    if (activeAlternativeId === alternativeId) {
      setActivePropertyId(property.id);
      setActiveFloorId(floor.id);
      setActiveAlternativeId(nextAlternative?.id ?? "");
      setSelectedId(null);
      setStructureSelection(
        nextAlternative ? { type: "alternative", id: nextAlternative.id } : { type: "floor", id: floor.id },
      );
    }
  }

  function addImportedProjects(imported: PropertyProject[]) {
    if (imported.length === 0) return;
    const localCopies = imported.map((project) => cloneProjectForLocal(project, `${project.name} import`));
    updateProjects((draft) => [...draft, ...localCopies]);
    activateProject(localCopies[0]);
    setSidebarCollapsed(false);
    setAppScreen("editor");
  }

  return {
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
    updateProjects,
    findActiveDraft,
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
  };
}
