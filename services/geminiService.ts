
import { Workout, WorkoutLog, CircuitCycle } from "../types";

// Modelos centralizados. Cambiar aquí si tu API key soporta versiones más nuevas.
const MODEL_FLASH = "gemini-2.5-flash";
const MODEL_PRO = "gemini-2.5-pro";

// Llama a Gemini a través del proxy serverless (/api/gemini), que mantiene la
// API key en el servidor. Devuelve el texto o lanza para que el caller maneje.
async function callGemini(payload: any): Promise<string> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`gemini-proxy ${res.status}: ${detail}`);
  }
  const data = await res.json();
  return data.text || "";
}

// images: lista de referencias (data URIs base64 o URLs https de Cloudinary).
// El proxy /api/gemini las resuelve a inlineData del lado del servidor.
export async function analyzeWorkoutPerformance(images: string[], workout: Workout) {
  if (images.length === 0) return "";

  try {
    const prompt = `Eres un entrenador experto de Kettlebells y analista de rendimiento deportivo.
        Analiza estas capturas de pantalla de un reloj Garmin de una misma sesión de entrenamiento.

        CONTEXTO DEL WORKOUT:
        Nombre: ${workout.name}
        Tipo: ${workout.type}
        Descripción/Rutina: ${workout.description}
        Peso utilizado: ${workout.weight}

        INSTRUCCIONES DE FORMATO (CRÍTICO):
        1. Entrega la respuesta estrictamente en FORMATO DE TEXTO PLANO (TXT).
        2. NO uses caracteres especiales de Markdown como asteriscos (**), almohadillas (#), guiones para listas (-) o cualquier otro símbolo de formato.
        3. Usa saltos de línea simples para separar párrafos o ideas si es necesario.
        4. Considera TODAS las imágenes proporcionadas para un resumen consolidado.
        5. Evalúa el rendimiento en relación a la rutina descrita.
        6. Sé conciso pero profesional.`;

    return await callGemini({ model: MODEL_FLASH, prompt, imageRefs: images });
  } catch (error) {
    console.error("Gemini Performance Analysis Error:", error);
    return "No se pudo realizar el análisis consolidado. Verifica tu conexión.";
  }
}

export async function suggestProgressiveOverload(workoutName: string, previousComments: string, previousOverload: string) {
  try {
    const prompt = `Como entrenador experto de Kettlebells, basándote en el workout "${workoutName}"
    y considerando que en la sesión anterior el usuario comentó: "${previousComments}"
    y el plan de sobrecarga fue: "${previousOverload}",
    ¿qué sugerencia específica de Progressive Overload darías para la siguiente sesión?
    Responde estrictamente en TEXTO PLANO sin usar asteriscos ni símbolos de formato Markdown. Sé breve y motivador.`;

    return await callGemini({ model: MODEL_FLASH, contents: prompt });
  } catch (error) {
    console.error("Gemini Suggestion Error:", error);
    return "Mantén el peso actual y enfócate en la técnica.";
  }
}

export async function analyzeGlobalPerformance(logs: (WorkoutLog & { workoutName: string, workoutWeight: string })[], rangeLabel: string) {
  try {
    const logSummary = logs.map(l =>
      `- Fecha: ${new Date(l.date).toLocaleDateString()}, Workout: ${l.workoutName}, Peso: ${l.workoutWeight}, Análisis individual: ${l.aiAnalysisText || 'Sin análisis'}, Comentarios: ${l.comments}`
    ).join('\n');

    const prompt = `Eres un analista de alto rendimiento para atletas de Kettlebell.
    Analiza el desempeño global del usuario durante el periodo: ${rangeLabel}.

    DATOS DEL PERIODO:
    Total de sesiones completadas: ${logs.length}
    Resumen de entrenamientos:
    ${logSummary}

    INSTRUCCIONES:
    1. Genera un REPORTE DE RENDIMIENTO GLOBAL profesional.
    2. Analiza tendencias de frecuencia (¿entrena seguido?), consistencia de carga y eficiencia cardiovascular (basado en los análisis individuales).
    3. Identifica fortalezas y áreas de oportunidad.
    4. Prohibido usar Markdown (** o #). Usa texto plano con saltos de línea claros.
    5. Sé motivador pero basado en datos reales.`;

    return await callGemini({ model: MODEL_PRO, contents: prompt });
  } catch (error) {
    console.error("Gemini Global Analysis Error:", error);
    return "Error al generar el análisis global. Asegúrate de tener entrenamientos con análisis IA en este periodo.";
  }
}

export async function analyzeComparativePerformance(
  currentCycle: CircuitCycle,
  previousCycles: CircuitCycle[],
  workouts: Workout[]
) {
  try {
    const formatCycle = (c: CircuitCycle, label: string) => {
      const completedLogs = c.logs.filter(l => l.completed);
      const avgWeight = completedLogs.length > 0
        ? completedLogs.reduce((acc, log) => {
            const w = workouts.find(work => work.id === log.workoutId);
            return acc + (parseFloat(w?.weight.replace(/[^0-9.]/g, '') || '0'));
          }, 0) / completedLogs.length
        : 0;

      return `
        CIRCUITO: ${label}
        Inicio: ${new Date(c.startDate).toLocaleDateString()}
        Estado: ${c.status === 'active' ? 'En progreso' : 'Finalizado'}
        Sesiones completadas: ${completedLogs.length}
        Peso promedio: ${avgWeight.toFixed(1)}kg
        Comentarios clave: ${completedLogs.map(l => l.comments).join(' | ').substring(0, 300)}...
      `;
    };

    const prevSummary = previousCycles
      .slice(-3)
      .map((c, i) => formatCycle(c, `Historial #${i+1}`))
      .join('\n');

    const currSummary = formatCycle(currentCycle, 'CICLO ACTUAL');

    const prompt = `Eres un sistema de inteligencia deportiva avanzada.
    Analiza y COMPARATIVA del rendimiento del usuario entre su ciclo actual y sus ciclos anteriores.

    HISTORIAL PREVIO:
    ${prevSummary}

    CICLO ACTUAL:
    ${currSummary}

    REQUERIMIENTOS DEL ANÁLISIS:
    1. Comparar frecuencia de entrenamiento (días entre sesiones).
    2. Comparar progresión de cargas (pesos utilizados).
    3. Evaluar la calidad de los comentarios y sensaciones reportadas.
    4. Proyectar resultados si se mantiene el ritmo actual.

    FORMATO:
    - Responde en TEXTO PLANO.
    - NO USES ASTERISCOS (**) NI ALMOHADILLAS (#).
    - Usa saltos de línea claros para separar secciones como: FRECUENCIA, CARGAS, SENSACIONES y VERDICTO.
    - Sé directo y profesional.`;

    return await callGemini({ model: MODEL_PRO, contents: prompt });
  } catch (error) {
    console.error("Gemini Comparative Analysis Error:", error);
    return "No se pudo generar la comparativa en este momento. Sigue entrenando para acumular más datos.";
  }
}
