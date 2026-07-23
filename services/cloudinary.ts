// Subida de imágenes a Cloudinary (unsigned upload preset). Las imágenes de
// sesión (capturas del Garmin) se guardan aquí y en Firestore solo se persiste
// la URL resultante.
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

// Sube una imagen (data URI base64) y devuelve su URL segura (https).
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!isCloudinaryConfigured) throw new Error('Cloudinary no está configurado');
  const form = new FormData();
  form.append('file', dataUrl); // Cloudinary acepta data URIs base64
  form.append('upload_preset', UPLOAD_PRESET as string);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Cloudinary ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return data.secure_url as string;
}
