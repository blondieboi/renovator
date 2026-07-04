import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { Asset } from "./types";
import { nowIso, uid } from "./utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function pdfFileToImageAsset(file: File): Promise<Asset> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a PDF canvas.");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  return {
    id: uid("asset"),
    name: `${file.name} - page 1`,
    mimeType: "image/png",
    dataUrl: canvas.toDataURL("image/png"),
    createdAt: nowIso(),
  };
}
