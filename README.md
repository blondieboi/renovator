# Renovation Planner

A local-first renovation planning app for drawing floor plans, organizing room media, and previewing layouts in 3D.

The app currently runs fully in the browser with IndexedDB persistence. Cloud save/sync is planned later, but local state is the source of truth for now.

## Features

- Project tree with properties, floors, and alternative layouts
- 2D floor plan canvas with rooms, polygon rooms, walls, doors, windows, and fixtures
- Floor plan image/PDF import
- Scale calibration and measurement display
- Room media boards for raw photos, renders, and notes
- Lazy-loaded 3D walkthrough preview
- JSON import/export for project data

## Tech Stack

- React 18
- TypeScript
- Vite
- React Konva / Konva for the 2D planner canvas
- Three.js for 3D preview
- Dexie / IndexedDB for local persistence
- pdf.js for PDF floor plan import
- Lucide React icons

## Getting Started

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Deployment

The app is configured for GitHub Pages at:

```text
https://blondieboi.github.io/renovator/
```

Pushing to `main` runs the GitHub Pages workflow and publishes the production build from `dist`.

In the repository settings on GitHub, set Pages to use **GitHub Actions** as the build and deployment source.

## Project Structure

```text
src/
  App.tsx                 Main app orchestration and current planner workflows
  db.ts                   IndexedDB setup and project persistence
  geometry.ts             2D geometry, snapping, wall/opening helpers
  image.ts                Browser image loading helpers
  model.ts                Shared planner model helpers and constants
  pdf.ts                  PDF-to-image import helper, lazy-loaded
  ThreePreview.tsx        Lazy-loaded 3D preview component
  three/
    planToWorld.ts        Shared 2D plan to 3D world transform
    sceneBuilder.ts       Converts planner data into a Three.js scene graph
    wallGeometry.ts       Builds wall segments, door gaps, and window panes
  components/
    MediaUploadAction.tsx
    PlanFixtureGlyph.tsx
    RoomGallery.tsx
    SidebarSection.tsx
```

## Current Architecture Notes

`App.tsx` is still large and owns most app state, but the repo has started moving toward clearer boundaries:

- `model.ts` owns shared domain helpers and safe scale accessors.
- `geometry.ts` owns pure 2D plan geometry.
- `three/` contains the first dedicated 3D boundary: transform math, scene assembly, and wall/opening geometry.
- PDF and 3D code are lazy-loaded to keep the initial app bundle smaller.

The next useful refactor is to split planner state/actions and canvas rendering into smaller modules before adding heavier 3D features.

## 3D Direction

The current 3D view is a preview, not yet a full geometry engine. The intended direction is:

- centralize plan-to-world conversion
- keep scene construction in a dedicated scene builder
- replace simple door/window preview blocks with real wall/opening geometry
- support richer room, fixture, camera, and selection behavior in 3D

## Persistence

Projects are saved locally in IndexedDB. Media assets are currently stored as data URLs inside project data. That is acceptable for small room boards, but a future cloud or larger-media implementation should separate assets into their own storage layer and reference them by ID.

## Known Caveats

- No formal test suite yet
- JSON import has minimal validation
- Large PDF worker chunk is expected
- 3D preview geometry is intentionally simple
- Cloud sync is not implemented yet
