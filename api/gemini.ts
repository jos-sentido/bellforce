// ============================================================================
// Vercel Serverless Function: /api/gemini
// ----------------------------------------------------------------------------
// Mantiene GEMINI_API_KEY en el servidor. El cliente hace POST { model, contents }
// y recibe { text }. Configura GEMINI_API_KEY en Vercel:
//   Project → Settings → Environment Variables → GEMINI_API_KEY
// ============================================================================

export const config = { runtime: 'nodejs' };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY no configurada en el servidor' });
    return;
  }

  try {
    const { model, contents } = req.body || {};
    if (!model || !contents) {
      res.status(400).json({ error: "Faltan 'model' o 'contents'" });
      return;
    }

    // Normaliza contents: string | { parts } | array de contents
    let normalized: any;
    if (typeof contents === 'string') {
      normalized = [{ role: 'user', parts: [{ text: contents }] }];
    } else if (Array.isArray(contents)) {
      normalized = contents;
    } else if (contents.parts) {
      normalized = [{ role: 'user', parts: contents.parts }];
    } else {
      normalized = [contents];
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: normalized }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      console.error('Gemini API error:', detail);
      res.status(502).json({ error: 'Error en Gemini API', detail });
      return;
    }

    const data = await geminiRes.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    res.status(200).json({ text });
  } catch (e) {
    console.error('gemini proxy error:', e);
    res.status(500).json({ error: String(e) });
  }
}
