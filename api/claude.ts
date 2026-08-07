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

    // Convierte una referencia de imagen (data URI o URL http) a un bloque
    // de imagen de Anthropic (source base64).
    async function toImageBlock(ref: string): Promise<any | null> {
      try {
        if (ref.startsWith('data:')) {
          const semicolon = ref.indexOf(';');
          const comma = ref.indexOf(',');
          const mediaType = ref.slice(5, semicolon) || 'image/png';
          return { type: 'image', source: { type: 'base64', media_type: mediaType, data: ref.slice(comma + 1) } };
        }
        const imgRes = await fetch(ref);
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mediaType = imgRes.headers.get('content-type') || 'image/jpeg';
        return { type: 'image', source: { type: 'base64', media_type: mediaType, data: buf.toString('base64') } };
      } catch (e) {
        console.error('No se pudo resolver imagen:', ref, e);
        return null;
      }
    }

    const { model, prompt, imageRefs, system, messages, maxTokens } = req.body || {};
    if (!model || (!prompt && !Array.isArray(messages))) {
      res.status(400).json({ error: "Faltan 'model' y ('prompt' o 'messages')" });
      return;
    }

    // ---- Modo conversación: system + messages (Anthropic nativo) ----
    // Cada message.content puede ser string o traer message.imageRefs (URLs) que
    // resolvemos a bloques de imagen del lado del servidor.
    let anthropicMessages: any[];
    if (Array.isArray(messages)) {
      anthropicMessages = [];
      for (const m of messages) {
        const parts: any[] = [];
        if (Array.isArray(m.imageRefs)) {
          for (const ref of m.imageRefs as string[]) {
            const block = await toImageBlock(ref);
            if (block) parts.push(block);
          }
        }
        const textVal = typeof m.content === 'string' ? m.content : (m.text || '');
        if (textVal) parts.push({ type: 'text', text: textVal });
        anthropicMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: parts.length ? parts : m.content });
      }
    } else {
      // ---- Modo prompt único (análisis existentes) ----
      const content: any[] = [];
      if (Array.isArray(imageRefs)) {
        for (const ref of imageRefs as string[]) {
          const block = await toImageBlock(ref);
          if (block) content.push(block);
        }
      }
      content.push({ type: 'text', text: prompt });
      anthropicMessages = [{ role: 'user', content }];
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: typeof maxTokens === 'number' ? maxTokens : 4096,
        ...(typeof system === 'string' && system ? { system } : {}),
        messages: anthropicMessages,
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
