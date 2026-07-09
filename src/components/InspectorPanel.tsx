import { CopyPlus, PencilRuler, Trash2 } from "lucide-react";
import type { Room } from "../types";
import type { ActiveStructure, SelectablePlanObject } from "../model";

interface InspectorPanelProps {
  title: string;
  selectedRoom?: Room;
  selectedShape?: SelectablePlanObject;
  activeStructure?: ActiveStructure;
  selectedRoomWidthCentimeters: number;
  selectedRoomLengthCentimeters: number;
  selectedRoomHeightCentimeters: number;
  selectedShapeNameLabel: string;
  selectedShapeWidthLabel: string;
  selectedShapeHeightLabel: string;
  selectedShapeWidthCentimeters: number;
  selectedShapeHeightCentimeters: number;
  onUpdateSelectedName: (name: string) => void;
  onUpdateSelectedRoomDimensionCentimeters: (dimension: "width" | "height", value: number) => void;
  onUpdateSelectedRoomHeight: (value: number) => void;
  onUpdateSelectedDimensionCentimeters: (dimension: "width" | "height", value: number) => void;
  onUpdateSelectedRotation: (value: number) => void;
  onDeleteSelected: () => void;
  onUpdateActiveFloorName: (name: string) => void;
  onUpdateActiveAlternativeName: (name: string) => void;
  onAddAlternative: (propertyId: string, floorId: string) => void;
  onDeleteFloor: (floorId: string) => void;
  onDeleteAlternative: (floorId: string, alternativeId: string) => void;
}

function InspectorPanel({
  title,
  selectedRoom,
  selectedShape,
  activeStructure,
  selectedRoomWidthCentimeters,
  selectedRoomLengthCentimeters,
  selectedRoomHeightCentimeters,
  selectedShapeNameLabel,
  selectedShapeWidthLabel,
  selectedShapeHeightLabel,
  selectedShapeWidthCentimeters,
  selectedShapeHeightCentimeters,
  onUpdateSelectedName,
  onUpdateSelectedRoomDimensionCentimeters,
  onUpdateSelectedRoomHeight,
  onUpdateSelectedDimensionCentimeters,
  onUpdateSelectedRotation,
  onDeleteSelected,
  onUpdateActiveFloorName,
  onUpdateActiveAlternativeName,
  onAddAlternative,
  onDeleteFloor,
  onDeleteAlternative,
}: InspectorPanelProps) {
  return (
    <aside className="inspector">
      <h2>{title}</h2>
      {selectedRoom ? (
        <>
          <label>
            Room name
            <input value={selectedRoom.name} onChange={(event) => onUpdateSelectedName(event.target.value)} />
          </label>
          <div className="room-measure-fields">
            <label>
              Width (cm)
              <input
                type="number"
                min={1}
                step={1}
                value={Math.round(selectedRoomWidthCentimeters)}
                onChange={(event) => onUpdateSelectedRoomDimensionCentimeters("width", Number(event.target.value))}
              />
            </label>
            <label>
              Length (cm)
              <input
                type="number"
                min={1}
                step={1}
                value={Math.round(selectedRoomLengthCentimeters)}
                onChange={(event) => onUpdateSelectedRoomDimensionCentimeters("height", Number(event.target.value))}
              />
            </label>
            <label>
              Height (cm)
              <input
                type="number"
                min={10}
                step={1}
                value={Math.round(selectedRoomHeightCentimeters)}
                onChange={(event) => onUpdateSelectedRoomHeight(Number(event.target.value) / 100)}
              />
            </label>
          </div>
          <div className="inspector-actions">
            <button className="danger" onClick={onDeleteSelected}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </>
      ) : selectedShape ? (
        <>
          <label>
            {selectedShapeNameLabel}
            <input value={selectedShape.name} onChange={(event) => onUpdateSelectedName(event.target.value)} />
          </label>
          <div className="dimension-fields">
            <label>
              {selectedShapeWidthLabel} (cm)
              <input
                type="number"
                min={1}
                value={Math.round(selectedShapeWidthCentimeters)}
                onChange={(event) => onUpdateSelectedDimensionCentimeters("width", Number(event.target.value))}
              />
            </label>
            <label>
              {selectedShapeHeightLabel} (cm)
              <input
                type="number"
                min={1}
                value={Math.round(selectedShapeHeightCentimeters)}
                onChange={(event) => onUpdateSelectedDimensionCentimeters("height", Number(event.target.value))}
              />
            </label>
            <label>
              Rotation
              <input
                type="number"
                step={1}
                value={Math.round(selectedShape.rotation)}
                onChange={(event) => onUpdateSelectedRotation(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="angle-panel">
            <div className="angle-presets">
              {[0, 45, 90, 135].map((angle) => (
                <button key={angle} onClick={() => onUpdateSelectedRotation(angle)}>
                  {angle}°
                </button>
              ))}
            </div>
          </div>
          <div className="inspector-actions">
            <button className="danger" onClick={onDeleteSelected}>
              <Trash2 size={16} />
              Delete
            </button>
          </div>
        </>
      ) : activeStructure?.type === "floor" ? (
        <>
          <label>
            Floor name
            <input value={activeStructure.floor.name} onChange={(event) => onUpdateActiveFloorName(event.target.value)} />
          </label>
          <div className="stats">
            <div>
              <span>Alternatives</span>
              <strong>{activeStructure.floor.alternatives.length}</strong>
            </div>
            <div>
              <span>Level</span>
              <strong>{activeStructure.floor.level + 1}</strong>
            </div>
          </div>
          <div className="inspector-actions">
            <button onClick={() => onAddAlternative(activeStructure.property.id, activeStructure.floor.id)}>
              <CopyPlus size={16} />
              Duplicate alternative
            </button>
            <button
              className="danger"
              onClick={() => onDeleteFloor(activeStructure.floor.id)}
              disabled={activeStructure.property.floors.length <= 1}
            >
              <Trash2 size={16} />
              Delete floor
            </button>
          </div>
        </>
      ) : activeStructure?.type === "alternative" ? (
        <>
          <label>
            Alternative name
            <input
              value={activeStructure.alternative.name}
              onChange={(event) => onUpdateActiveAlternativeName(event.target.value)}
            />
          </label>
          <div className="stats">
            <div>
              <span>Rooms</span>
              <strong>{activeStructure.alternative.plan.rooms.length}</strong>
            </div>
            <div>
              <span>Fixtures</span>
              <strong>{activeStructure.alternative.plan.fixtures.length}</strong>
            </div>
          </div>
          <div className="inspector-actions">
            <button onClick={() => onAddAlternative(activeStructure.property.id, activeStructure.floor.id)}>
              <CopyPlus size={16} />
              Duplicate alternative
            </button>
            <button
              className="danger"
              onClick={() => onDeleteAlternative(activeStructure.floor.id, activeStructure.alternative.id)}
              disabled={activeStructure.floor.alternatives.length <= 1}
            >
              <Trash2 size={16} />
              Delete alternative
            </button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <PencilRuler size={30} />
          <p>Select a layout or a plan object to edit it.</p>
        </div>
      )}
    </aside>
  );
}

export default InspectorPanel;
