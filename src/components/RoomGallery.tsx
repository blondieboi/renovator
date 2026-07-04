import { Camera, Trash2 } from "lucide-react";
import type { Asset } from "../types";

function RoomGallery({
  assets,
  label,
  emptyLabel,
  onOpenAsset,
  onRemoveAsset,
}: {
  assets: Asset[];
  label: string;
  emptyLabel: string;
  onOpenAsset: (asset: Asset, label: string) => void;
  onRemoveAsset: (assetId: string) => void;
}) {
  if (assets.length === 0) {
    return (
      <div className="gallery-empty">
        <Camera size={24} />
        <p>{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="room-gallery">
      {assets.map((asset, index) => (
        <figure
          className={index === 0 ? "gallery-card featured" : "gallery-card"}
          key={asset.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset(asset, label)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenAsset(asset, label);
          }}
        >
          <img src={asset.dataUrl} alt={asset.name} />
          <figcaption>
            <span>{label}</span>
            <strong>{asset.name}</strong>
          </figcaption>
          <button
            onClick={(event) => {
              event.stopPropagation();
              onRemoveAsset(asset.id);
            }}
            title={`Remove ${asset.name}`}
          >
            <Trash2 size={16} />
          </button>
        </figure>
      ))}
    </div>
  );
}

export default RoomGallery;
