# Bellforce MCP — Setup (Fase 1, mono-usuario)

Servidor MCP para conectar Bellforce a **ChatGPT** (Developer Mode) o **Claude**.
Deja que el asistente lea/escriba **workouts, ciclos e historial** directo en Firestore.

Endpoint: `api/mcp/[key].ts` (Streamable HTTP). Auth fase 1 = **secreto en la URL**.

## Tools disponibles
`list_workouts`, `create_workout`, `update_workout`, `list_cycles`, `create_cycle`,
`update_cycle`, `log_session`, `get_history`.

---

## Paso 1 — Service Account de Firebase (Admin SDK)

1. Firebase Console → proyecto **bellforce-57b2f** → ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. Botón **Generar nueva clave privada** → descarga un JSON.
3. Ese JSON completo será el valor de la env var `FIREBASE_SERVICE_ACCOUNT` (pega el JSON tal cual, en una sola variable).

> ⚠️ Es una credencial con acceso total al proyecto. NO la subas al repo ni la pegues en chats. Solo vive en las Environment Variables de Vercel.

## Paso 2 — Tu UID de dueño

Firebase Console → **Authentication** → pestaña **Users** → busca tu cuenta
(`alvarezcruzjoseantonio@gmail.com`) → copia el **User UID**. Ese es `BELLFORCE_OWNER_UID`.

> ⚠️ **Es el UID, NO el email.** El UID es un código tipo `sdT0kHUA1oWMzcDjdsCb3DXQuai1`
> (columna *User UID*). Si pegas el email, el MCP no verá tus ciclos/historial (la app
> identifica al dueño por UID) y lo que cree quedará con dueño equivocado.

## Paso 3 — Env vars en Vercel

Proyecto `bellforce` → Settings → Environment Variables (Production). Agrega:

| Variable | Valor |
|---|---|
| `MCP_SECRET` | `5a744cb19681894d19178d1e0ae50d3abb6ea6d1ae3654e601f18096c0ca5c3e` |
| `BELLFORCE_OWNER_UID` | (tu User UID del Paso 2) |
| `FIREBASE_SERVICE_ACCOUNT` | (el JSON completo del Paso 1) |

Luego **redeploy** (o push a `main`, que auto-despliega).

## Paso 4 — Probar el endpoint

```bash
curl -s https://bellforce.vercel.app/api/mcp/5a744cb19681894d19178d1e0ae50d3abb6ea6d1ae3654e601f18096c0ca5c3e \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head
```
Debe devolver la lista de 8 tools. Un secreto mal escrito devuelve 404.

## Paso 5 — Conectar en ChatGPT

1. ChatGPT (plan **Plus/Pro**) → Settings → **Apps & Connectors** → Advanced → activa **Developer Mode**.
2. **Create connector** (MCP):
   - **URL**: `https://bellforce.vercel.app/api/mcp/5a744cb19681894d19178d1e0ae50d3abb6ea6d1ae3654e601f18096c0ca5c3e`
   - **Auth**: *No authentication*
3. Guarda. En tu Proyecto, activa el conector. Ya puedes decir cosas como:
   - "Lista mis workouts" / "Crea un workout de swings 2×24 kg"
   - "Empieza un circuito con estos ejercicios…"
   - "Registra que hoy completé el workout X, RPE 8, me sentí fuerte"
   - "¿Cómo viene mi historial de las últimas 2 semanas?"

## En Claude Desktop / claude.ai (opcional)
Mismo endpoint remoto. En claude.ai → Settings → Connectors → Add custom connector →
pega la URL (sin auth). En Claude Desktop se agrega como remote MCP server.

---

## Seguridad y notas
- Cualquiera con la URL secreta puede operar como tú. Trátala como contraseña. Para rotarla: cambia `MCP_SECRET` en Vercel y actualiza el conector.
- El Admin SDK salta las reglas de Firestore; por eso cada acción del servidor valida propiedad contra tu UID.
- **Fase 2 (multiusuario):** reemplazar el secreto-en-URL por OAuth 2.1 y sacar el uid del token del usuario. La capa de acciones (`api/_mcp/store.ts`) se reutiliza tal cual — y también la consumirá el agente interno de la app.
