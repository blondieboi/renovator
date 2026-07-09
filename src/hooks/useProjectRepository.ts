import { useCallback, useEffect, useRef, useState } from "react";
import { loadProjects, saveProjects } from "../db";
import type { PropertyProject } from "../types";

export type ProjectRepositoryState = "loading" | "ready" | "error";

function errorMessage(action: "load" | "save", error: unknown) {
  const detail = error instanceof Error && error.message ? ` ${error.message}` : "";
  return `Could not ${action} local projects.${detail}`;
}

export function useProjectRepository() {
  const [projects, setProjects] = useState<PropertyProject[]>([]);
  const [state, setState] = useState<ProjectRepositoryState>("loading");
  const [status, setStatus] = useState("Loading local workshop...");
  const initialProjectsRef = useRef<PropertyProject[] | null>(null);
  const pendingSaveRef = useRef<PropertyProject[] | null>(null);
  const saveRunningRef = useRef(false);

  const enqueueSave = useCallback(async (snapshot: PropertyProject[]) => {
    pendingSaveRef.current = snapshot;
    if (saveRunningRef.current) return;

    saveRunningRef.current = true;
    try {
      while (pendingSaveRef.current) {
        const nextSnapshot = pendingSaveRef.current;
        pendingSaveRef.current = null;
        await saveProjects(nextSnapshot);
      }
      setStatus("Saved locally");
    } catch (error) {
      pendingSaveRef.current = null;
      setStatus(errorMessage("save", error));
    } finally {
      saveRunningRef.current = false;
      const pendingSnapshot = pendingSaveRef.current;
      if (pendingSnapshot) void enqueueSave(pendingSnapshot);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadProjects()
      .then((loaded) => {
        if (cancelled) return;
        initialProjectsRef.current = loaded;
        setProjects(loaded);
        setState("ready");
        setStatus("Saved locally");
      })
      .catch((error) => {
        if (cancelled) return;
        setState("error");
        setStatus(errorMessage("load", error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state !== "ready") return;
    if (initialProjectsRef.current === projects) {
      initialProjectsRef.current = null;
      return;
    }
    const handle = window.setTimeout(() => {
      void enqueueSave(projects);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [enqueueSave, projects, state]);

  return {
    projects,
    setProjects,
    state,
    status,
    setStatus,
  };
}
