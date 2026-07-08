export type PropertyType = "Apartment" | "House";
export type ProjectOwnerId = "local-user" | string;
export type ToolMode =
  | "select"
  | "pan"
  | "calibrate"
  | "wall"
  | "room"
  | "polyRoom"
  | "door"
  | "window"
  | "fixture";
export type FixtureKind =
  | "counter"
  | "sink"
  | "toilet"
  | "shower"
  | "tub"
  | "stairs"
  | "closet"
  | "sofa"
  | "bed"
  | "table";

export interface Asset {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  createdAt: string;
}

export interface PlanPoint {
  x: number;
  y: number;
}

export interface PlanObject {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface Wall extends PlanObject {
  kind: "wall";
  x2: number;
  y2: number;
  thickness: number;
}

export interface Opening extends PlanObject {
  kind: "door" | "window";
  wallId?: string;
}

export interface Room extends PlanObject {
  kind: "room";
  color: string;
  ceilingHeightMeters?: number;
  points?: PlanPoint[];
}

export interface Fixture extends PlanObject {
  kind: FixtureKind;
}

export type RoomStyleCategory = "palette" | "material" | "fixture" | "reference";

export interface RoomStyleItem {
  id: string;
  category: RoomStyleCategory;
  name: string;
  detail: string;
  color?: string;
  createdAt: string;
}

export interface Plan {
  scale: {
    pixelsPerMeter: number;
    gridSize: number;
    ceilingHeightMeters: number;
    backgroundX?: number;
    backgroundY?: number;
    backgroundWidth?: number;
    backgroundHeight?: number;
    backgroundVisible?: boolean;
  };
  background?: Asset;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  fixtures: Fixture[];
}

export interface RoomBoard {
  roomId: string;
  photos: Asset[];
  renderOutputs: Asset[];
  referenceImages: Asset[];
  styleItems: RoomStyleItem[];
  prompts: string[];
  stylePrompt: string;
  notes: string;
  beforeAssetId?: string;
  afterAssetId?: string;
}

export interface Alternative {
  id: string;
  name: string;
  createdAt: string;
  plan: Plan;
  roomBoards: RoomBoard[];
}

export interface Floor {
  id: string;
  name: string;
  level: number;
  alternatives: Alternative[];
}

export interface PropertyProject {
  id: string;
  schemaVersion: number;
  ownerId: ProjectOwnerId;
  name: string;
  type: PropertyType;
  floors: Floor[];
  createdAt: string;
  updatedAt: string;
}
