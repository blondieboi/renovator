import { ImagePlus } from "lucide-react";
import type { CSSProperties } from "react";
import { safePixelsPerMeter } from "../model";
import type { Alternative, Asset, Plan, Room } from "../types";
import { createRoomBoard, roomArea } from "../utils";
import MediaUploadAction from "./MediaUploadAction";
import RoomGallery from "./RoomGallery";

interface RoomMediaBoardProps {
  plan: Plan;
  alternative: Alternative;
  activeRoom?: Room;
  activeKind: "photos" | "renderOutputs";
  onSelectRoom: (roomId: string) => void;
  onSetActiveKind: (kind: "photos" | "renderOutputs") => void;
  onAddAssets: (roomId: string, kind: "photos" | "renderOutputs", files: FileList | null) => void;
  onOpenAsset: (asset: Asset, label: string) => void;
  onRemoveAsset: (roomId: string, kind: "photos" | "renderOutputs", assetId: string) => void;
  onUpdateNotes: (roomId: string, notes: string) => void;
}

function RoomMediaBoard({
  plan,
  alternative,
  activeRoom,
  activeKind,
  onSelectRoom,
  onSetActiveKind,
  onAddAssets,
  onOpenAsset,
  onRemoveAsset,
  onUpdateNotes,
}: RoomMediaBoardProps) {
  const activeBoard = activeRoom
    ? alternative.roomBoards.find((item) => item.roomId === activeRoom.id) ?? createRoomBoard(activeRoom.id)
    : undefined;
  const activeAssets = activeBoard && activeKind === "photos" ? activeBoard.photos : activeBoard?.renderOutputs ?? [];
  const activeLabel = activeKind === "photos" ? "Raw photo" : "Render";
  const activeEmptyLabel = activeKind === "photos" ? "No raw photos yet" : "No renders yet";
  const activeUploadLabel = activeKind === "photos" ? "Add raw photos" : "Add renders";
  const pixelsPerMeter = safePixelsPerMeter(plan);

  return (
    <div className="media-board">
      {plan.rooms.length === 0 && (
        <div className="empty-wide">
          <ImagePlus size={36} />
          <h2>Add rooms in the plan view first</h2>
          <p>Each room gets a focused board for raw photos, renders, and renovation notes.</p>
        </div>
      )}
      {activeRoom && activeBoard && (
        <div className="room-workbook">
          <aside className="room-rail" aria-label="Rooms">
            <header>
              <span>Rooms</span>
              <strong>{plan.rooms.length}</strong>
            </header>
            <div className="room-rail-list">
              {plan.rooms.map((room) => {
                const board = alternative.roomBoards.find((item) => item.roomId === room.id) ?? createRoomBoard(room.id);
                const isActive = room.id === activeRoom.id;
                return (
                  <button
                    className={isActive ? "room-rail-item active" : "room-rail-item"}
                    key={room.id}
                    onClick={() => onSelectRoom(room.id)}
                  >
                    <span className="room-rail-color" style={{ background: room.color }} />
                    <span className="room-rail-copy">
                      <strong>{room.name}</strong>
                      <small>{roomArea(room, pixelsPerMeter).toFixed(1)} m2</small>
                    </span>
                    <span className="room-rail-counts">
                      <span>{board.photos.length} raw</span>
                      <span>{board.renderOutputs.length} renders</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="room-board room-board-focused" style={{ "--room-color": activeRoom.color } as CSSProperties}>
            <header>
              <div>
                <h2>{activeRoom.name}</h2>
                <p>
                  {roomArea(activeRoom, pixelsPerMeter).toFixed(1)} m2 · {activeBoard.photos.length} raw ·{" "}
                  {activeBoard.renderOutputs.length} renders
                </p>
              </div>
            </header>

            <section className="media-stage">
              <header>
                <div className="media-switcher" aria-label="Room media type">
                  <button className={activeKind === "photos" ? "active" : ""} onClick={() => onSetActiveKind("photos")} type="button">
                    Raw photos
                    <span>{activeBoard.photos.length}</span>
                  </button>
                  <button
                    className={activeKind === "renderOutputs" ? "active" : ""}
                    onClick={() => onSetActiveKind("renderOutputs")}
                    type="button"
                  >
                    Renders
                    <span>{activeBoard.renderOutputs.length}</span>
                  </button>
                </div>
                <MediaUploadAction label={activeUploadLabel} onFiles={(files) => onAddAssets(activeRoom.id, activeKind, files)} />
              </header>
              <RoomGallery
                assets={activeAssets}
                label={activeLabel}
                emptyLabel={activeEmptyLabel}
                onOpenAsset={onOpenAsset}
                onRemoveAsset={(assetId) => onRemoveAsset(activeRoom.id, activeKind, assetId)}
              />
            </section>

            <label className="notes">
              Notes
              <textarea
                value={activeBoard.notes}
                onChange={(event) => onUpdateNotes(activeRoom.id, event.target.value)}
                placeholder="Measurements, materials, things to keep, decisions to revisit..."
              />
            </label>
          </section>
        </div>
      )}
    </div>
  );
}

export default RoomMediaBoard;
