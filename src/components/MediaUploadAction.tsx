import { useRef } from "react";
import { ImagePlus } from "lucide-react";

function MediaUploadAction({ label, onFiles }: { label: string; onFiles: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="media-upload-action" onClick={() => inputRef.current?.click()} type="button">
        <ImagePlus size={16} />
        {label}
      </button>
      <input
        hidden
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}

export default MediaUploadAction;
