const HEIC_PATTERN = /\.(heic|heif|hif)$/i;
const prepared = new WeakMap<File, Promise<{main:Blob;thumbnail:Blob}>>();
let conversionQueue: Promise<unknown> = Promise.resolve();

async function isHeif(file:File) {
  if(HEIC_PATTERN.test(file.name)||/image\/hei[cf]/i.test(file.type))return true;
  // Some photo pickers omit or mislabel the MIME type and filename.
  const bytes=new Uint8Array(await file.slice(0,128).arrayBuffer());
  const tag=(offset:number)=>String.fromCharCode(...bytes.slice(offset,offset+4));
  if(tag(4)!=='ftyp')return false;
  for(let i=8;i+4<=bytes.length;i+=4)if(i!==12&&['heic','heix','hevc','hevx','mif1','msf1'].includes(tag(i)))return true;
  return false;
}

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
  try {
    context.drawImage(image, 0, 0, width, height);
    return await canvasBlob(canvas, quality);
  } finally { canvas.width=1;canvas.height=1; }
}

async function convertPhoto(file: File) {
  let image:HTMLImageElement;
  try { image=await loadImage(file); }
  catch(error) {
    if(!await isHeif(file))throw error;
    // Native Safari decoding first; use a current libheif only when necessary.
    const { heicTo } = await import('heic-to');
    const source=await heicTo({blob:file,type:'image/jpeg',quality:.9});
    image=await loadImage(source);
  }
  try {
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("unsupported image");

  // 2200px remains crisp on a large shared screen while substantially
  // reducing phone originals that are commonly 12–48 megapixels.
  let main = await renderJpeg(image, 2200, .82);
  if (main.size > 8 * 1024 * 1024) main = await renderJpeg(image, 2000, .75);
  if (main.size > 8 * 1024 * 1024) main = await renderJpeg(image, 1800, .68);
  if (main.size > 10 * 1024 * 1024) throw new Error("image too large");
  const thumbnail = await renderJpeg(image, 640, .72);
  return { main, thumbnail };
  } finally { image.src=''; }
}

export function preparePhoto(file:File) {
  const cached=prepared.get(file);if(cached)return cached;
  // Decoding several full-resolution iPhone photos in parallel can exhaust memory.
  const result=conversionQueue.then(()=>convertPhoto(file));
  conversionQueue=result.catch(()=>{});prepared.set(file,result);
  void result.catch(()=>{prepared.delete(file);});
  return result;
}
