import { Armchair, Images, ImagePlus, Layers3, Palette, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { safePixelsPerMeter } from "../model";
import type { Alternative, Asset, Plan, Room, RoomBoard, RoomStyleCategory } from "../types";
import { createRoomBoard, nowIso, roomArea, uid } from "../utils";
import MediaUploadAction from "./MediaUploadAction";
import RoomGallery from "./RoomGallery";

type BoardAssetKind = "photos" | "renderOutputs" | "referenceImages";
type RoomBoardTab = "photos" | "renderOutputs" | "styleBoard";

interface RoomMediaBoardProps {
  plan: Plan;
  alternative: Alternative;
  activeRoom?: Room;
  activeKind: RoomBoardTab;
  onSelectRoom: (roomId: string) => void;
  onSetActiveKind: (kind: RoomBoardTab) => void;
  onAddAssets: (roomId: string, kind: BoardAssetKind, files: FileList | null) => void;
  onOpenAsset: (asset: Asset, label: string) => void;
  onRemoveAsset: (roomId: string, kind: BoardAssetKind, assetId: string) => void;
  onUpdateBoard: (roomId: string, updater: (board: RoomBoard) => void) => void;
  onUpdateNotes: (roomId: string, notes: string) => void;
}

const styleCategoryLabels: Record<RoomStyleCategory, string> = {
  palette: "Palette",
  material: "Material",
  fixture: "Fixture",
  reference: "Reference",
};

const styleCategoryOptions: RoomStyleCategory[] = ["palette", "material", "fixture", "reference"];

function categoryIcon(category: RoomStyleCategory) {
  switch (category) {
    case "palette":
      return <Palette size={16} />;
    case "fixture":
      return <Armchair size={16} />;
    case "reference":
      return <Images size={16} />;
    case "material":
      return <Layers3 size={16} />;
  }
}

function assetOptionLabel(asset: Asset) {
  return asset.name.length > 36 ? `${asset.name.slice(0, 33)}...` : asset.name;
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
  onUpdateBoard,
  onUpdateNotes,
}: RoomMediaBoardProps) {
  const [newStyleCategory, setNewStyleCategory] = useState<RoomStyleCategory>("material");
  const [newStyleName, setNewStyleName] = useState("");
  const [newStyleDetail, setNewStyleDetail] = useState("");
  const [newStyleColor, setNewStyleColor] = useState("#a8c8bb");
  const activeBoard = activeRoom
    ? alternative.roomBoards.find((item) => item.roomId === activeRoom.id) ?? createRoomBoard(activeRoom.id)
    : undefined;
  const activeAssets = activeBoard && activeKind === "photos" ? activeBoard.photos : activeBoard?.renderOutputs ?? [];
  const activeLabel = activeKind === "photos" ? "Raw photo" : "Render";
  const activeEmptyLabel = activeKind === "photos" ? "No raw photos yet" : "No renders yet";
  const activeUploadLabel = activeKind === "photos" ? "Add raw photos" : "Add renders";
  const pixelsPerMeter = safePixelsPerMeter(plan);

  function addStyleItem() {
    if (!activeRoom) return;
    const name = newStyleName.trim();
    if (!name) return;
    onUpdateBoard(activeRoom.id, (board) => {
      board.styleItems.unshift({
        id: uid("style"),
        category: newStyleCategory,
        name,
        detail: newStyleDetail.trim(),
        color: newStyleCategory === "palette" ? newStyleColor : undefined,
        createdAt: nowIso(),
      });
    });
    setNewStyleName("");
    setNewStyleDetail("");
  }

  function removeStyleItem(itemId: string) {
    if (!activeRoom) return;
    onUpdateBoard(activeRoom.id, (board) => {
      board.styleItems = board.styleItems.filter((item) => item.id !== itemId);
    });
  }

  function updateCompareAsset(kind: "beforeAssetId" | "afterAssetId", assetId: string) {
    if (!activeRoom) return;
    onUpdateBoard(activeRoom.id, (board) => {
      board[kind] = assetId || undefined;
    });
  }

  return (
    <div className="media-board">
      {plan.rooms.length === 0 && (
        <div className="empty-wide">
          <ImagePlus size={36} />
          <h2>Add rooms in the plan view first</h2>
          <p>Each room gets a focused board for raw photos, renders, style decisions, and renovation notes.</p>
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
                      <span>{board.styleItems.length + board.referenceImages.length} board</span>
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
                  {activeBoard.renderOutputs.length} renders · {activeBoard.styleItems.length} style items
                </p>
              </div>
            </header>

            <section className="media-stage">
              <header>
                <div className="media-switcher" aria-label="Room board section">
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
                  <button
                    className={activeKind === "styleBoard" ? "active" : ""}
                    onClick={() => onSetActiveKind("styleBoard")}
                    type="button"
                  >
                    Board
                    <span>{activeBoard.styleItems.length + activeBoard.referenceImages.length}</span>
                  </button>
                </div>
                {activeKind !== "styleBoard" && (
                  <MediaUploadAction label={activeUploadLabel} onFiles={(files) => onAddAssets(activeRoom.id, activeKind, files)} />
                )}
              </header>

              {activeKind !== "styleBoard" && (
                <>
                  <RoomGallery
                    assets={activeAssets}
                    label={activeLabel}
                    emptyLabel={activeEmptyLabel}
                    onOpenAsset={onOpenAsset}
                    onRemoveAsset={(assetId) => onRemoveAsset(activeRoom.id, activeKind, assetId)}
                  />
                  {activeKind === "renderOutputs" && (
                    <section className="compare-panel" aria-label="Before and after comparison">
                      <header>
                        <div>
                          <h3>Before / after</h3>
                          <p>Pair one raw photo with one render for quick design checks.</p>
                        </div>
                      </header>
                      <div className="compare-controls">
                        <label>
                          Before
                          <select value={activeBoard.beforeAssetId ?? ""} onChange={(event) => updateCompareAsset("beforeAssetId", event.target.value)}>
                            <option value="">Pick raw photo</option>
                            {activeBoard.photos.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {assetOptionLabel(asset)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          After
                          <select value={activeBoard.afterAssetId ?? ""} onChange={(event) => updateCompareAsset("afterAssetId", event.target.value)}>
                            <option value="">Pick render</option>
                            {activeBoard.renderOutputs.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {assetOptionLabel(asset)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="compare-grid">
                        <CompareSlot
                          asset={activeBoard.photos.find((asset) => asset.id === activeBoard.beforeAssetId)}
                          emptyLabel="Choose a raw photo"
                          label="Before"
                          onOpenAsset={onOpenAsset}
                        />
                        <CompareSlot
                          asset={activeBoard.renderOutputs.find((asset) => asset.id === activeBoard.afterAssetId)}
                          emptyLabel="Choose a render"
                          label="After"
                          onOpenAsset={onOpenAsset}
                        />
                      </div>
                    </section>
                  )}
                </>
              )}

              {activeKind === "styleBoard" && (
                <section className="style-board-panel" aria-label="Room style board">
                  <div className={newStyleCategory === "palette" ? "style-board-form with-swatch" : "style-board-form"}>
                    <div className="style-board-category" aria-label="Style item category">
                      {styleCategoryOptions.map((category) => (
                        <button
                          className={newStyleCategory === category ? "active" : ""}
                          key={category}
                          onClick={() => setNewStyleCategory(category)}
                          title={styleCategoryLabels[category]}
                          type="button"
                        >
                          {categoryIcon(category)}
                        </button>
                      ))}
                    </div>
                    {newStyleCategory === "palette" && (
                      <label className="swatch-input" title="Color">
                        <input value={newStyleColor} onChange={(event) => setNewStyleColor(event.target.value)} type="color" />
                      </label>
                    )}
                    <input
                      value={newStyleName}
                      onChange={(event) => setNewStyleName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addStyleItem();
                      }}
                      placeholder={newStyleCategory === "palette" ? "Warm white" : "Oak floor, brass handles, linen sofa..."}
                    />
                    <input
                      value={newStyleDetail}
                      onChange={(event) => setNewStyleDetail(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addStyleItem();
                      }}
                      placeholder="Finish, supplier, keep/replace, or prompt wording"
                    />
                    <button className="icon-command" onClick={addStyleItem} title="Add style item" type="button">
                      <Plus size={18} />
                    </button>
                  </div>

                  <div className="style-item-grid">
                    {activeBoard.styleItems.length === 0 && (
                      <div className="style-board-empty">
                        <Sparkles size={24} />
                        <p>No style items yet</p>
                      </div>
                    )}
                    {activeBoard.styleItems.map((item) => (
                      <article className="style-item" key={item.id}>
                        <span className="style-item-icon">
                          {item.color ? <span className="style-swatch" style={{ background: item.color }} /> : categoryIcon(item.category)}
                        </span>
                        <span>
                          <small>{styleCategoryLabels[item.category]}</small>
                          <strong>{item.name}</strong>
                          {item.detail && <em>{item.detail}</em>}
                        </span>
                        <button onClick={() => removeStyleItem(item.id)} title={`Remove ${item.name}`} type="button">
                          <Trash2 size={16} />
                        </button>
                      </article>
                    ))}
                  </div>

                  <div className="board-reference-strip">
                    <header>
                      <div>
                        <h3>References</h3>
                        <p>Keep inspiration images close to the room they belong to.</p>
                      </div>
                      <MediaUploadAction label="Add references" onFiles={(files) => onAddAssets(activeRoom.id, "referenceImages", files)} />
                    </header>
                    <RoomGallery
                      assets={activeBoard.referenceImages}
                      label="Reference"
                      emptyLabel="No reference images yet"
                      onOpenAsset={onOpenAsset}
                      onRemoveAsset={(assetId) => onRemoveAsset(activeRoom.id, "referenceImages", assetId)}
                    />
                  </div>

                  <label className="notes prompt-notes">
                    Prompt context
                    <textarea
                      value={activeBoard.stylePrompt}
                      onChange={(event) => onUpdateBoard(activeRoom.id, (board) => (board.stylePrompt = event.target.value))}
                      placeholder="Style direction to reuse for future room renders..."
                    />
                  </label>
                </section>
              )}
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

function CompareSlot({
  asset,
  emptyLabel,
  label,
  onOpenAsset,
}: {
  asset?: Asset;
  emptyLabel: string;
  label: string;
  onOpenAsset: (asset: Asset, label: string) => void;
}) {
  if (!asset) {
    return (
      <div className="compare-slot empty">
        <Images size={22} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <button className="compare-slot" onClick={() => onOpenAsset(asset, label)} type="button">
      <img src={asset.dataUrl} alt={asset.name} />
      <span>{label}</span>
    </button>
  );
}

export default RoomMediaBoard;
