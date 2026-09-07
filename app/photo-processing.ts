const HEIC_PATTERN = /\.(heic|heif)$/i;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("image encoding failed")),
    "image/jpeg",
    quality,
  ));
}

async function loadImage(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    // The decoded image remains usable after its object URL is released.
    URL.revokeObjectURL(url);
  }
}

async function renderJpeg(image: HTMLImageElement, maximumDimension: number, quality: number) {
  const scale = Math.min(1, maximumDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("canvas unavailable");
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvasBlob(canvas, quality);
}

export async function preparePhoto(file: File) {
  const isHeic = ["image/heic", "image/heif"].includes(file.type.toLowerCase()) || HEIC_PATTERN.test(file.name);
  let source: Blob = file;
  if (isHeic) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: .9 });
    source = Array.isArray(converted) ? converted[0] : converted;
  }
  const image = await loadImage(source);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("unsupported image");

  // 2200px remains crisp on a large shared screen while substantially
  // reducing phone originals that are commonly 12–48 megapixels.
  let main = await renderJpeg(image, 2200, .82);
  if (main.size > 8 * 1024 * 1024) main = await renderJpeg(image, 2000, .75);
  if (main.size > 8 * 1024 * 1024) main = await renderJpeg(image, 1800, .68);
  if (main.size > 10 * 1024 * 1024) throw new Error("image too large");
  const thumbnail = await renderJpeg(image, 640, .72);
  return { main, thumbnail };
}
