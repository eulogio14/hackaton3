import { apiRequest } from "./api";
import { env } from "./env";
import type { Media, MediaPurpose, MediaTicket } from "./types";

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    image.src = url;
  });
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const support = canvas.toDataURL("image/webp", quality);
  if (!support.startsWith("data:image/webp")) {
    throw new Error("Este navegador no puede generar imágenes WebP. Prueba con otro navegador.");
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob && blob.type === "image/webp") resolve(blob);
        else reject(new Error("No se pudo generar el WebP."));
      },
      "image/webp",
      quality,
    );
  });
}

async function compressCanvas(
  canvas: HTMLCanvasElement,
  maxBytes: number,
): Promise<Blob> {
  let quality = 0.92;
  let blob = await canvasToWebp(canvas, quality);
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.08;
    blob = await canvasToWebp(canvas, quality);
  }
  if (blob.size > maxBytes) {
    throw new Error("La imagen sigue siendo demasiado pesada después de comprimirla.");
  }
  return blob;
}

export async function prepareIncidentImage(file: File): Promise<PreparedImage> {
  const image = await loadImageFromFile(file);
  const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);
  const target = maxDimension > 1600 ? 1600 : maxDimension < 800 ? 800 : maxDimension;
  const scale = target / maxDimension;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el lienzo.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);
  const blob = await compressCanvas(canvas, 300 * 1024);
  return { blob, width, height };
}

function xhrUpload(
  url: string,
  body: XMLHttpRequestBodyInit,
  headers: Record<string, string>,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("La subida al storage falló."));
    xhr.onabort = () => reject(new DOMException("Subida cancelada", "AbortError"));
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.onloadend = () => signal.removeEventListener("abort", onAbort);
    xhr.send(body);
  });
}

async function uploadToStorage(
  ticket: MediaTicket,
  blob: Blob,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<string> {
  if (ticket.provider === "SUPABASE") {
    if (!env.supabaseUrl || !env.supabaseKey) {
      throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY.");
    }
    if (!ticket.bucket || !ticket.objectPath) throw new Error("El ticket no trae la ruta de Supabase.");
    const url = `${env.supabaseUrl}/storage/v1/object/${ticket.bucket}/${ticket.objectPath}`;
    const response = await xhrUpload(
      url,
      blob,
      {
        Authorization: `Bearer ${env.supabaseKey}`,
        apikey: env.supabaseKey,
        "Content-Type": "image/webp",
        "x-upsert": "false",
      },
      onProgress,
      signal,
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Supabase rechazó la subida (${response.status}).`);
    }
    return `${env.supabaseUrl}/storage/v1/object/public/${ticket.bucket}/${ticket.objectPath}`;
  }

  if (!env.cloudinaryCloudName || !env.cloudinaryPreset) {
    throw new Error("Faltan VITE_CLOUDINARY_CLOUD_NAME o VITE_CLOUDINARY_UPLOAD_PRESET.");
  }
  const form = new FormData();
  form.append("file", blob, `${ticket.ticketId}.webp`);
  form.append("upload_preset", env.cloudinaryPreset);
  form.append("public_id", ticket.uploadPublicId ?? ticket.ticketId);
  const response = await xhrUpload(
    `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/image/upload`,
    form,
    {},
    onProgress,
    signal,
  );
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Cloudinary rechazó la subida (${response.status}).`);
  }
  const parsed = JSON.parse(response.text) as { secure_url?: string };
  if (!parsed.secure_url) throw new Error("Cloudinary no devolvió la URL de la imagen.");
  return parsed.secure_url;
}

export async function uploadPreparedImage(
  purpose: MediaPurpose,
  prepared: PreparedImage,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<Media> {
  const sha256 = await sha256Hex(prepared.blob);
  const ticket = await apiRequest<MediaTicket>("/media/tickets", {
    method: "POST",
    body: {
      purpose,
      contentType: "image/webp",
      bytes: prepared.blob.size,
      sha256,
      width: prepared.width,
      height: prepared.height,
    },
    signal,
  });

  if (prepared.blob.size > ticket.constraints.maxBytes) {
    throw new Error(
      `La imagen pesa ${Math.round(prepared.blob.size / 1024)} KB y el máximo es ${Math.round(
        ticket.constraints.maxBytes / 1024,
      )} KB.`,
    );
  }

  const url = await uploadToStorage(ticket, prepared.blob, onProgress, signal);
  return apiRequest<Media>(`/media/tickets/${ticket.ticketId}/confirm`, {
    method: "POST",
    body: { url },
    signal,
  });
}
