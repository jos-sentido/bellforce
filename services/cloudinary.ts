// Subida de medios (imágenes y videos) a Cloudinary con un upload preset
// unsigned. En Firestore solo se persiste la URL resultante.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

import { MediaItem } from '../types';

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);
export type { MediaItem };

// Sube una imagen a partir de un data URI base64 (usado en el flujo de fotos
// de sesión, que también corre análisis de IA sobre el base64).
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!isCloudinaryConfigured) throw new Error('Cloudinary no está configurado');
  const form = new FormData();
  form.append('file', dataUrl);
  form.append('upload_preset', UPLOAD_PRESET as string);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return data.secure_url as string;
}

// Sube un archivo (imagen o video) directamente. Detecta el tipo del resultado.
export async function uploadMedia(file: File): Promise<MediaItem> {
  if (!isCloudinaryConfigured) throw new Error('Cloudinary no está configurado');
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET as string);
  // /auto/ detecta imagen o video automáticamente.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
    method: 'POST', body: form,
  });
  if (!res.ok) throw new Error(`Cloudinary ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const type: 'image' | 'video' = data.resource_type === 'video' ? 'video' : 'image';
  return { type, url: data.secure_url as string };
}
