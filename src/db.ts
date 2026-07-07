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
    await db.projects.clear();
    await db.projects.bulkPut(normalized);
  });
}
