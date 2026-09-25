// Browser-only helpers for user photos.

export interface StudioPhoto {
  id: string;
  dataUrl: string; // downscaled JPEG
  width: number;
  height: number;
  label: string;
}

// Slides are 1080px wide, so anything larger only costs upload time and
// model tokens.
const MAX_SIDE = 1080;
const QUALITY = 0.85;

export async function loadPhoto(file: File): Promise<StudioPhoto> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Couldn't read ${file.name}. Use a JPG, PNG or WebP image.`);
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; // JPEG has no transparency
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return {
    id: crypto.randomUUID(),
    dataUrl: canvas.toDataURL("image/jpeg", QUALITY),
    width,
    height,
    label: labelFromFilename(file.name),
  };
}

// "myburgerlab-classic.jpg" is a useful hint for the AI; "IMG_2034.jpg" isn't.
function labelFromFilename(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  const camera = /^(img|dsc|pxl|mvimg|photo|image|screenshot|whatsapp|signal|download|unnamed)\b|^\d/i;
  return camera.test(base) ? "" : base.slice(0, 100);
}

export const photoAspect = (p: StudioPhoto) => p.height / p.width;
