import Dexie, { type Table } from "dexie";
import type { PropertyProject } from "./types";
import { createStarterProjects, normalizeProject } from "./utils";

class RenovationDatabase extends Dexie {
  projects!: Table<PropertyProject, string>;

  constructor() {
    super("renovation-planner");
    this.version(1).stores({
      projects: "id, name, type, updatedAt",
    });
  }
}

export const db = new RenovationDatabase();

export async function loadProjects() {
  const existing = await db.projects.toArray();
  if (existing.length > 0) {
    const normalized = existing.map(normalizeProject);
    await db.projects.bulkPut(normalized);
    return normalized;
  }
  const starters = createStarterProjects();
  await db.projects.bulkPut(starters);
  return starters;
}

export async function saveProjects(projects: PropertyProject[]) {
  const normalized = projects.map(normalizeProject);
  await db.transaction("rw", db.projects, async () => {
    const existing = await db.projects.toArray();
    const existingById = new Map(existing.map((project) => [project.id, project]));
    const changed = normalized.filter((project) => {
      const stored = existingById.get(project.id);
      return !stored || stored.updatedAt !== project.updatedAt || stored.schemaVersion !== project.schemaVersion;
    });
    const nextIds = new Set(normalized.map((project) => project.id));
    const removedIds = existing.filter((project) => !nextIds.has(project.id)).map((project) => project.id);
    if (changed.length > 0) await db.projects.bulkPut(changed);
    if (removedIds.length > 0) await db.projects.bulkDelete(removedIds);
  });
}
