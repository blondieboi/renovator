import { cloneProjectForLocal, createPropertyProject, createRoomBoard, parseProjectExport } from "./utils";

export const utilsTestCases = [
  {
    name: "rejects exports that contain invalid project entries",
    run() {
      try {
        parseProjectExport(JSON.stringify({ projects: [null] }));
        return false;
      } catch (error) {
        return error instanceof Error && error.message === "Project export contains an invalid project.";
      }
    },
  },
  {
    name: "normalizes nested imported plan data before it reaches the editor",
    run() {
      const [project] = parseProjectExport(
        JSON.stringify({
          project: {
            id: "project",
            name: "Imported",
            floors: [
              {
                id: "floor",
                name: "Main",
                alternatives: [
                  {
                    id: "alternative",
                    name: "Layout",
                    plan: {
                      scale: { pixelsPerMeter: -10, gridSize: 0, ceilingHeightMeters: -2 },
                      walls: [
                        null,
                        {
                          id: "wall",
                          kind: "wall",
                          name: "Wall",
                          x: 0,
                          y: 0,
                          x2: 100,
                          y2: 0,
                          width: 1,
                          height: 12,
                          thickness: 12,
                          rotation: 72,
                        },
                      ],
                      openings: [
                        {
                          id: "opening",
                          kind: "door",
                          name: "Door",
                          x: 20,
                          y: -6,
                          width: 40,
                          height: 12,
                          rotation: 0,
                          wallId: "missing-wall",
                        },
                      ],
                      rooms: [{ id: "room", kind: "room", name: "Room", x: 0, y: 0, width: 100, height: 80, rotation: 0 }],
                      fixtures: [{ id: "bad", kind: "not-a-fixture", x: 0, y: 0, width: 10, height: 10, rotation: 0 }],
                    },
                    roomBoards: [{ roomId: "missing-room" }],
                  },
                ],
              },
            ],
          },
        }),
      );
      const alternative = project?.floors[0]?.alternatives[0];
      const plan = alternative?.plan;
      return (
        Boolean(plan) &&
        plan.walls.length === 1 &&
        plan.walls[0]?.width === 100 &&
        plan.walls[0]?.rotation === 0 &&
        plan.openings[0]?.wallId === undefined &&
        plan.rooms[0]?.points?.length === 4 &&
        plan.fixtures.length === 0 &&
        plan.scale.pixelsPerMeter === 52 &&
        plan.scale.gridSize === 26 &&
        plan.scale.ceilingHeightMeters === 2.55 &&
        alternative?.roomBoards.length === 0
      );
    },
  },
  {
    name: "creates collision-free local copies for imported projects",
    run() {
      const source = createPropertyProject("Imported source");
      const alternative = source.floors[0]?.alternatives[0];
      if (!alternative) return false;
      alternative.plan.rooms.push({
        id: "room",
        kind: "room",
        name: "Kitchen",
        x: 0,
        y: 0,
        width: 120,
        height: 100,
        rotation: 0,
        color: "#ffffff",
      });
      alternative.plan.walls.push({
        id: "wall",
        kind: "wall",
        name: "Wall",
        x: 0,
        y: 0,
        x2: 120,
        y2: 0,
        width: 120,
        height: 12,
        thickness: 12,
        rotation: 0,
      });
      alternative.plan.openings.push({
        id: "door",
        kind: "door",
        name: "Door",
        x: 40,
        y: -6,
        width: 40,
        height: 12,
        rotation: 0,
        wallId: "wall",
      });
      alternative.roomBoards.push(createRoomBoard("room"));

      const copy = cloneProjectForLocal(source, "Imported copy");
      const copyAlternative = copy.floors[0]?.alternatives[0];
      return (
        copy.id !== source.id &&
        copy.name === "Imported copy" &&
        copy.floors[0]?.id !== source.floors[0]?.id &&
        copyAlternative?.id !== alternative.id &&
        copyAlternative?.plan.rooms[0]?.id !== "room" &&
        copyAlternative?.plan.walls[0]?.id !== "wall" &&
        copyAlternative?.plan.openings[0]?.wallId === copyAlternative?.plan.walls[0]?.id &&
        copyAlternative?.roomBoards[0]?.roomId === copyAlternative?.plan.rooms[0]?.id
      );
    },
  },
];
