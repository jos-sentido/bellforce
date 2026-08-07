// ============================================================================
// Vercel Serverless Function: /api/claude
// ----------------------------------------------------------------------------
// Mantiene ANTHROPIC_API_KEY en el servidor. El cliente hace POST { model, messages }
// y recibe { text }. Configura ANTHROPIC_API_KEY en Vercel:
//   Project → Settings → Environment Variables → ANTHROPIC_API_KEY
// ============================================================================

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' });
    return;
  }

  try {
    const { model, prompt, imageRefs } = req.body || {};
    if (!model || !prompt) {
      res.status(400).json({ error: "Faltan 'model' y 'prompt'" });
      return;
    }

    // Construir el contenido del mensaje del usuario
    const content: any[] = [];

    // Si hay imágenes, agregarlas como bloques de imagen antes del texto
    if (Array.isArray(imageRefs)) {
      for (const ref of imageRefs as string[]) {
        try {
          if (ref.startsWith('data:')) {
            const semicolon = ref.indexOf(';');
            const comma = ref.indexOf(',');
            const mediaType = ref.slice(5, semicolon) || 'image/png';
            const data = ref.slice(comma + 1);
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data },
            });
          } else {
            // Descargar imagen desde URL y convertir a base64
            const imgRes = await fetch(ref);
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const mediaType = imgRes.headers.get('content-type') || 'image/jpeg';
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') },
            });
          }
        } catch (e) {
          console.error('No se pudo resolver imagen:', ref, e);
        }
      }
    }

    // Agregar el texto del prompt
    content.push({ type: 'text', text: prompt });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      console.error('Anthropic API error:', detail);
      res.status(502).json({ error: 'Error en Anthropic API', detail });
      return;
    }

    const data = await anthropicRes.json();
    const text = data?.content
      ?.filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('') ?? '';
    res.status(200).json({ text });
  } catch (e) {
    console.error('claude proxy error:', e);
    res.status(500).json({ error: String(e) });
  }
}
