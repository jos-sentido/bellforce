// ============================================================================
// Vercel Serverless Function: /api/mcp/<SECRET>
// ----------------------------------------------------------------------------
// Servidor MCP (Model Context Protocol) de Bellforce, transporte "Streamable
// HTTP", para conectar desde ChatGPT (Developer Mode) o Claude.
//
// AUTENTICACIÓN (fase 1, mono-usuario): el secreto va EN LA URL como segmento de
// ruta (ChatGPT conecta en modo "sin auth"). Solo quien tenga la URL secreta
// entra, y todo se opera como el usuario dueño (BELLFORCE_OWNER_UID).
//   ChatGPT/Claude URL:  https://bellforce.vercel.app/api/mcp/<MCP_SECRET>
//
// Env vars requeridas en Vercel:
//   MCP_SECRET             -> secreto largo aleatorio (el de la URL)
//   BELLFORCE_OWNER_UID    -> tu uid de Firebase Auth (dueño de los datos)
//   FIREBASE_SERVICE_ACCOUNT -> JSON de la service account (Admin SDK)
//
// Fase 2 (multiusuario) reemplazará este bloque por OAuth y el uid saldrá del
// token del usuario en vez de una env var fija.
// ============================================================================

import {
  listWorkouts, createWorkout, updateWorkout,
  listCycles, createCycle, updateCycle,
  logSession, getHistory,
} from '../_mcp/store';

export const config = { runtime: 'nodejs' };

const PROTOCOL_VERSION = '2025-06-18';

// --- Definición de tools (JSON Schema) -------------------------------------
const TOOLS = [
  {
    name: 'list_workouts',
    description: 'Lista los workouts (ejercicios) de la base de datos de Bellforce. Devuelve públicos y propios. Úsalo para consultar qué ejercicios existen antes de crear un circuito o registrar una sesión.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['all', 'mine', 'public'], description: 'all (default), solo míos, o solo públicos' },
        includeArchived: { type: 'boolean', description: 'incluir archivados (default false)' },
      },
    },
  },
  {
    name: 'create_workout',
    description: 'Crea un nuevo workout (ejercicio) en la base de datos de Bellforce. Queda privado del usuario salvo que isPublic sea true.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string' },
        weight: { type: 'string', description: 'peso POR pesa, ej. "24 kg"' },
        weightCount: { type: 'number', description: '1 (default) o 2 (doble pesa)' },
        type: { type: 'string', description: 'tipo de ejercicio, ej. "fuerza", "potencia"' },
        equipment: { type: 'array', items: { type: 'string', enum: ['kettlebell', 'dumbbell', 'barbell'] } },
        duration: { type: 'string', description: 'ej. "10 min" o "5 rondas"' },
        description: { type: 'string' },
        isPublic: { type: 'boolean' },
      },
    },
  },
  {
    name: 'update_workout',
    description: 'Actualiza campos de un workout existente (solo si eres el dueño). Pasa únicamente los campos a cambiar.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        weight: { type: 'string' },
        weightCount: { type: 'number' },
        type: { type: 'string' },
        equipment: { type: 'array', items: { type: 'string', enum: ['kettlebell', 'dumbbell', 'barbell'] } },
        duration: { type: 'string' },
        description: { type: 'string' },
        isArchived: { type: 'boolean' },
      },
    },
  },
  {
    name: 'list_cycles',
    description: 'Lista los ciclos (circuitos) del usuario. Opcionalmente incluye los logs de cada ciclo.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        includeArchived: { type: 'boolean' },
        withLogs: { type: 'boolean', description: 'incluir las sesiones registradas de cada ciclo' },
      },
    },
  },
  {
    name: 'create_cycle',
    description: 'Crea un ciclo/circuito nuevo para el usuario, opcionalmente con la lista de workoutIds que lo componen.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        type: { type: 'string', enum: ['circuit', 'standalone'] },
        workoutIds: { type: 'array', items: { type: 'string' } },
        workoutWeights: { type: 'object', description: 'mapa workoutId -> peso override, ej. {"3":"28 kg"}' },
      },
    },
  },
  {
    name: 'update_cycle',
    description: 'Actualiza un ciclo existente (solo si eres el dueño): cambiar estado, fechas, nombre, archivar, etc.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['active', 'paused', 'completed'] },
        endDate: { type: 'string' },
        isArchived: { type: 'boolean' },
        workoutIds: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'log_session',
    description: 'Registra una sesión de entrenamiento completada en el historial, dentro de un ciclo. Requiere cycleId y workoutId. Usa list_cycles para obtener el cycleId.',
    inputSchema: {
      type: 'object',
      required: ['cycleId', 'workoutId'],
      properties: {
        cycleId: { type: 'string' },
        workoutId: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD (default hoy)' },
        time: { type: 'string', description: 'HH:MM (default ahora)' },
        progressiveOverload: { type: 'string', description: 'qué progresión se hizo (peso/reps/series)' },
        comments: { type: 'string', description: 'cómo se sintió, notas de la sesión' },
        rpe: { type: 'number', description: 'esfuerzo percibido 1-10' },
        completed: { type: 'boolean', description: 'default true' },
      },
    },
  },
  {
    name: 'get_history',
    description: 'Devuelve el historial de sesiones completadas del usuario (a través de todos sus ciclos), más recientes primero. Úsalo para entender el progreso reciente.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'máximo de sesiones a devolver' },
        sinceDate: { type: 'string', description: 'solo desde esta fecha YYYY-MM-DD' },
      },
    },
  },
];

async function dispatch(uid: string, name: string, args: any) {
  switch (name) {
    case 'list_workouts': return listWorkouts(uid, args || {});
    case 'create_workout': return createWorkout(uid, args || {});
    case 'update_workout': return updateWorkout(uid, args.id, args || {});
    case 'list_cycles': return listCycles(uid, args || {});
    case 'create_cycle': return createCycle(uid, args || {});
    case 'update_cycle': return updateCycle(uid, args.id, args || {});
    case 'log_session': return logSession(uid, args || {});
    case 'get_history': return getHistory(uid, args || {});
    default: throw new Error(`Tool desconocida: ${name}`);
  }
}

// --- Handler MCP (JSON-RPC 2.0 sobre HTTP) ---------------------------------
export default async function handler(req: any, res: any) {
  // Secreto en la ruta: /api/mcp/<key>
  const key = req.query?.key;
  const expected = process.env.MCP_SECRET;
  if (!expected || key !== expected) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  // El transporte Streamable HTTP usa POST para todo. GET (stream server→cliente)
  // no lo soportamos: respondemos 405.
  if (req.method === 'GET') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const uid = process.env.BELLFORCE_OWNER_UID;
  if (!uid) {
    res.status(500).json({ error: 'BELLFORCE_OWNER_UID no configurada' });
    return;
  }

  const body = req.body || {};
  const { id, method, params } = body;
  const rpc = (result: any) => res.status(200).json({ jsonrpc: '2.0', id, result });
  const rpcErr = (code: number, message: string) =>
    res.status(200).json({ jsonrpc: '2.0', id, error: { code, message } });

  try {
    switch (method) {
      case 'initialize':
        return rpc({
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'bellforce', version: '1.0.0' },
        });

      // Notificaciones (sin id): no llevan respuesta JSON-RPC.
      case 'notifications/initialized':
      case 'notifications/cancelled':
        res.status(202).end();
        return;

      case 'ping':
        return rpc({});

      case 'tools/list':
        return rpc({ tools: TOOLS });

      case 'tools/call': {
        const toolName = params?.name;
        const args = params?.arguments || {};
        try {
          const data = await dispatch(uid, toolName, args);
          return rpc({
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
            structuredContent: { result: data },
          });
        } catch (toolErr: any) {
          // Errores de la tool van como isError (no como error de protocolo).
          return rpc({
            content: [{ type: 'text', text: `Error: ${toolErr?.message || String(toolErr)}` }],
            isError: true,
          });
        }
      }

      default:
        return rpcErr(-32601, `Método no soportado: ${method}`);
    }
  } catch (e: any) {
    console.error('MCP handler error:', e);
    return rpcErr(-32603, e?.message || String(e));
  }
}
