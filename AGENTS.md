# Agent Guide

This file is for coding agents working in this repo.

## Project Intent

Renovation Planner is a local-first browser app for planning renovation layouts. Users can draw 2D floor plans, attach room photos/renders/notes, and preview the plan in 3D.

Near-term priority: make the 3D experience a core product feature while keeping the existing 2D planner stable.

Future direction: cloud save/sync, but not yet. Treat IndexedDB/local state as the current persistence layer.

## Commands

Use these from the repo root:

```bash
npm run dev
npm run build
npm run preview
```

Always run `npm run build` after code changes unless the user explicitly asks for docs-only work or time is extremely constrained.

## Important Files

- `src/App.tsx`: main orchestration; still large, so avoid adding more unrelated responsibilities here.
- `src/types.ts`: core data model types.
- `src/model.ts`: shared planner constants and model helpers.
- `src/geometry.ts`: pure 2D geometry and snapping logic.
- `src/db.ts`: local IndexedDB persistence.
- `src/pdf.ts`: PDF import helper; keep lazy-loaded from UI paths.
- `src/ThreePreview.tsx`: lazy-loaded 3D preview.
- `src/three/planToWorld.ts`: shared 2D plan to 3D transform.
- `src/components/`: reusable UI leaf components.

## Development Guidelines

- Prefer small, behavior-preserving refactors over broad rewrites.
- Keep domain math in `geometry.ts`, `model.ts`, or `src/three/*`, not inline in React views.
- Keep 3D-specific code behind `src/three/*` or `ThreePreview.tsx`.
- Keep PDF and Three.js code lazy-loaded where practical.
- Preserve local-first behavior unless explicitly working on cloud sync.
- Do not add formal migrations unless the user asks; existing local data does not need strong backward compatibility yet.
- Be careful with `gridSize` and `pixelsPerMeter`; invalid values can break canvas rendering. Use `safeGridSize` and `safePixelsPerMeter`.
- Be careful with media storage. Current data URL storage is okay for a handful of room images, but do not assume it scales to large libraries.

## UI/UX Notes

- This is a working tool, not a marketing site.
- Keep planner controls compact, clear, and stable.
- Use existing visual language in `src/styles.css`.
- Use Lucide icons when adding controls.
- Avoid adding explanatory in-app text unless it directly helps the workflow.

## 3D Notes

3D is becoming a core feature. The current preview uses simple geometry:

- rooms are extruded floor shapes
- walls are box meshes
- doors/windows are preview blocks, not true cutouts
- fixtures are simple boxes

When improving 3D, aim toward:

- a dedicated scene builder
- reusable plan-to-world transforms
- real wall/opening geometry
- better camera controls
- consistent selection between 2D and 3D
- clean Three.js resource disposal

## Testing / Verification

At minimum:

```bash
npm run build
```

For visual/canvas/3D changes, also run the app and manually verify:

- canvas pan and zoom
- grid movement
- object drag and Alt free-drag
- room media upload
- 3D view loads and moves

## Git / Safety

- Do not revert user changes.
- Keep edits scoped to the requested task.
- Avoid destructive git commands.
- If the worktree is dirty, inspect before editing overlapping files.
