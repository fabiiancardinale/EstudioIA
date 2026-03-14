"""
🤖 Motor de IA - Conexión con DeepSeek
Genera planes, contenido, ejercicios, quizzes y chat tutor
"""

from openai import AsyncOpenAI
import json
import re

DEEPSEEK_API_KEY = "sk-6248423cf0d743c2a7fb2ddf8f5a851e"
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
MODEL = "deepseek-chat"


class AIEngine:
    def __init__(self):
        self.client = AsyncOpenAI(
            api_key=DEEPSEEK_API_KEY,
            base_url=DEEPSEEK_BASE_URL,
        )

    async def _chat(self, system: str, user: str, temperature: float = 0.7) -> str:
        """Enviar mensaje a DeepSeek y obtener respuesta."""
        response = await self.client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=4096,
        )
        return response.choices[0].message.content

    def _parse_json(self, text: str) -> dict | list:
        """Extraer JSON de la respuesta de la IA."""
        # Intentar parsear directamente
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Buscar bloques ```json ... ```
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass

        # Buscar cualquier estructura JSON
        match = re.search(r"[\[{][\s\S]*[\]}]", text)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        return {"raw": text}

    # ── Generar Plan de Estudio ──────────────────────
    async def generar_plan(self, materia: str, tema: str, semanas: int, nivel: str) -> dict:
        total_dias = semanas * 7
        system = """Eres un experto educador que crea planes de estudio personalizados.
Responde SOLO con JSON válido, sin texto adicional."""

        user = f"""Crea un plan de estudio detallado con estos datos:
- Materia: {materia}
- Tema: {tema}
- Duración: {semanas} semanas ({total_dias} días)
- Nivel del estudiante: {nivel}

El JSON debe tener esta estructura exacta:
{{
    "titulo": "Plan de estudio de [tema]",
    "descripcion": "Descripción breve del plan",
    "total_dias": {total_dias},
    "dias": [
        {{
            "dia": 1,
            "titulo": "Título del día",
            "objetivos": ["objetivo 1", "objetivo 2"],
            "tipo": "teoria|practica|repaso|prueba",
            "duracion_minutos": 45,
            "resumen": "Breve descripción de lo que se estudiará"
        }}
    ],
    "hitos": [
        {{
            "dia": 7,
            "descripcion": "Primera evaluación parcial"
        }}
    ]
}}

Incluye días de teoría, práctica, repaso y mini pruebas distribuidos inteligentemente.
Los días de descanso pueden tener actividades ligeras.
Asegúrate de que haya {total_dias} días en el plan."""

        raw = await self._chat(system, user, temperature=0.5)
        return self._parse_json(raw)

    # ── Generar Contenido de un Día ──────────────────
    async def generar_contenido_dia(
        self, materia: str, tema: str, nivel: str, plan: dict, dia: int, progreso: dict
    ) -> dict:
        dia_info = None
        if isinstance(plan, dict) and "dias" in plan:
            for d in plan["dias"]:
                if d.get("dia") == dia:
                    dia_info = d
                    break

        debilidades = progreso.get("debilidades", [])
        debilidades_str = ", ".join(debilidades) if debilidades else "ninguna identificada aún"

        system = """Eres un tutor experto que crea lecciones completas, detalladas y pedagógicamente excelentes.
Tus explicaciones son claras, con muchos ejemplos y analogías del mundo real.
Adaptas todo al nivel del estudiante.
IMPORTANTE para fórmulas matemáticas: usa delimitadores KaTeX con signo de dólar:
- Inline: $f(x) = x^2$ (un $ a cada lado)
- Bloque: $$\\int_0^1 f(x)\\,dx$$ (doble $$ a cada lado)
- NUNCA uses \\frac, \\sqrt u otros comandos LaTeX sueltos sin envolver en $...$
Responde SOLO con JSON válido."""

        user = f"""Genera una lección COMPLETA y DETALLADA de estudio para:
- Materia: {materia}
- Tema: {tema}
- Nivel: {nivel}
- Día {dia}: {json.dumps(dia_info, ensure_ascii=False) if dia_info else f"Día {dia} del plan"}
- Debilidades del estudiante: {debilidades_str}

IMPORTANTE - La lección debe ser MUY COMPLETA:
1. La explicación debe cubrir TODOS los puntos del tema del día de forma exhaustiva
2. Usa analogías cotidianas para que sea fácil de entender
3. Incluye fórmulas, reglas o definiciones importantes
4. Los ejemplos deben ser paso a paso, detallados

IMPORTANTE - Los ejercicios deben ser VARIADOS y DINÁMICOS. Usa estos tipos:
- "opcion_multiple": Preguntas con 4 opciones (a, b, c, d)
- "abierta": El estudiante escribe su respuesta (para cálculos, definiciones)
- "verdadero_falso": Afirmaciones donde el estudiante elige V o F
- "completar": Texto con espacios en blanco que el estudiante debe rellenar (usa ___ para los blancos)
- "ordenar": El estudiante debe ordenar elementos en el orden correcto
- "dibujo": El estudiante dibuja en un canvas (para representaciones gráficas, diagramas, fracciones visuales, etc.)

Responde con este JSON:
{{
    "titulo": "Título descriptivo de la lección del día",
    "explicacion": "Explicación MUY DETALLADA y COMPLETA del tema. Debe cubrir: introducción al concepto, definiciones formales, explicación intuitiva con analogías, reglas y propiedades importantes. MÍNIMO 400 palabras. Usa markdown: **negritas** para conceptos clave, listas con -, ejemplos inline. Estructura con subtítulos ## para cada sección.",
    "conceptos_clave": ["concepto 1", "concepto 2", "concepto 3", "concepto 4"],
    "ejemplos": [
        {{
            "titulo": "Ejemplo 1 - Nombre descriptivo",
            "enunciado": "Planteamiento claro del ejemplo",
            "desarrollo": "Resolución PASO A PASO detallada:\\nPaso 1: ...\\nPaso 2: ...\\nPaso 3: ...",
            "resultado": "Resultado final con explicación"
        }}
    ],
    "ejercicios": [
        {{
            "id": 0,
            "enunciado": "Enunciado claro y completo del ejercicio",
            "pista": "Una pista útil",
            "tipo": "opcion_multiple",
            "opciones": ["a) opción 1", "b) opción 2", "c) opción 3", "d) opción 4"],
            "respuesta_correcta": "b) opción 2"
        }},
        {{
            "id": 1,
            "enunciado": "Verdadero o Falso: [afirmación]",
            "pista": "Pista para pensar",
            "tipo": "verdadero_falso",
            "opciones": [],
            "respuesta_correcta": "verdadero"
        }},
        {{
            "id": 2,
            "enunciado": "Calcula el resultado de...",
            "pista": "Recuerda que...",
            "tipo": "abierta",
            "opciones": [],
            "respuesta_correcta": "42"
        }},
        {{
            "id": 3,
            "enunciado": "Completa: El ___ es igual a ___ dividido entre ___",
            "pista": "Piensa en la definición",
            "tipo": "completar",
            "opciones": [],
            "respuesta_correcta": "cociente, dividendo, divisor",
            "texto_con_blancos": "El ___ es igual a ___ dividido entre ___"
        }},
        {{
            "id": 4,
            "enunciado": "Dibuja un círculo que represente la fracción 3/4 (divide en partes iguales y colorea las que correspondan)",
            "pista": "El denominador te dice en cuántas partes dividir, el numerador cuántas colorear",
            "tipo": "dibujo",
            "opciones": [],
            "respuesta_correcta": "Un círculo dividido en 4 partes iguales con 3 partes coloreadas"
        }},
        {{
            "id": 5,
            "enunciado": "Ordena de menor a mayor las siguientes fracciones",
            "pista": "Convierte a un denominador común",
            "tipo": "ordenar",
            "opciones": ["3/4", "1/2", "1/4", "2/3"],
            "respuesta_correcta": "1/4, 1/2, 2/3, 3/4"
        }}
    ],
    "dato_curioso": "Un dato interesante y sorprendente relacionado con el tema"
}}

REGLAS CRÍTICAS:
- Genera MÍNIMO 5 ejercicios y MÁXIMO 7
- USA AL MENOS 3 TIPOS DIFERENTES de ejercicios
- Si el tema permite representación visual, INCLUYE al menos 1 ejercicio de tipo "dibujo"
- Para "opcion_multiple", la respuesta_correcta debe ser el texto completo de la opción correcta (ej: "b) 3/4")
- Para "verdadero_falso", la respuesta_correcta es "verdadero" o "falso"
- Para "completar", incluye el campo "texto_con_blancos" con ___ donde van los blancos
- Para "ordenar", las opciones son los items desordenados y respuesta_correcta es el orden correcto separado por comas
- Para "dibujo", el enunciado debe explicar EXACTAMENTE qué dibujar y la respuesta_correcta describe lo esperado
- La explicación debe ser EXTENSA, clara y completa como una clase real
- Los ejemplos deben tener desarrollo paso a paso
- Si hay debilidades, refuerza esas áreas
- Las explicaciones deben ser apropiadas para nivel {nivel}"""

        raw = await self._chat(system, user)
        return self._parse_json(raw)

    # ── Verificar Respuesta ──────────────────────────
    async def verificar_respuesta(
        self, materia: str, tema: str, dia: int, ejercicio_index: int, respuesta: str, plan: dict,
        ejercicio_enunciado: str = "", ejercicio_opciones: list = None, ejercicio_respuesta_correcta: str = ""
    ) -> dict:
        # Construir contexto del ejercicio
        contexto_ejercicio = ""
        if ejercicio_enunciado:
            contexto_ejercicio += f"\n- Enunciado del ejercicio: \"{ejercicio_enunciado}\""
        if ejercicio_opciones:
            contexto_ejercicio += f"\n- Opciones: {', '.join(ejercicio_opciones)}"
        if ejercicio_respuesta_correcta:
            contexto_ejercicio += f"\n- Respuesta correcta esperada: \"{ejercicio_respuesta_correcta}\""

        system = """Eres un corrector educativo justo y motivador.
Evalúa respuestas comparándolas con la respuesta correcta proporcionada.
IMPORTANTE: Si se proporciona la respuesta correcta esperada, úsala como referencia principal para evaluar.
Para fórmulas matemáticas en tu explicación, usa delimitadores KaTeX: $f(x)$ para inline, $$f(x)$$ para bloque. Nunca uses \\frac suelto sin $...$
Para ejercicios de verdadero/falso, la respuesta será "verdadero" o "falso".
Para ejercicios de completar, la respuesta será las palabras separadas por comas.
Para ejercicios de ordenar, la respuesta será los elementos en el orden dado por el estudiante, separados por comas.
Para ejercicios de DIBUJO, el estudiante describe lo que dibujó en texto. Evalúa si la descripción coincide con lo que se pedía:
  - Compara los elementos clave mencionados en la descripción del estudiante vs la respuesta esperada
  - Si la descripción menciona los elementos principales del dibujo esperado, marca como correcto
  - Si la descripción es vaga, incompleta o no coincide con lo pedido, marca como incorrecto y explica qué falta
  - Sé específico sobre qué elementos incluyó bien y cuáles le faltan
Responde SOLO con JSON válido."""

        user = f"""Evalúa esta respuesta de un estudiante:
- Materia: {materia}
- Tema: {tema}
- Día: {dia}
- Ejercicio número: {ejercicio_index + 1}{contexto_ejercicio}
- Respuesta del estudiante: "{respuesta}"

Compara la respuesta del estudiante con la respuesta correcta esperada.
Si la respuesta del estudiante es equivalente o sustancialmente correcta, márcala como correcta.
Para opción múltiple, compara si eligió la opción correcta (puede que el formato varíe ligeramente).

Responde con este JSON:
{{
    "correcto": true/false,
    "puntuacion": 0-100,
    "feedback": "Explicación detallada de por qué está bien o mal",
    "respuesta_correcta": "La respuesta correcta completa",
    "explicacion_paso_a_paso": "Cómo se resuelve paso a paso",
    "consejo": "Un consejo para mejorar"
}}

Sé motivador incluso si la respuesta es incorrecta."""

        raw = await self._chat(system, user)
        return self._parse_json(raw)

    # ── Generar Quiz ─────────────────────────────────
    async def generar_quiz(
        self, materia: str, tema: str, nivel: str, dia: int, plan: dict, progreso: dict
    ) -> dict:
        temas_cubiertos = []
        if isinstance(plan, dict) and "dias" in plan:
            for d in plan["dias"]:
                if d.get("dia", 0) <= dia:
                    temas_cubiertos.append(d.get("titulo", ""))

        system = """Eres un experto en evaluación educativa.
Creas pruebas justas que miden comprensión real.
Responde SOLO con JSON válido.
IMPORTANTE para fórmulas matemáticas: usa delimitadores KaTeX:
- Inline: $f(x) = x^2$ (un signo de dólar a cada lado)
- Bloque: $$\\int_0^1 f(x)\\,dx$$ (doble signo de dólar)
- NUNCA uses \\frac, \\sqrt sueltos sin $ alrededor."""

        user = f"""Genera una mini prueba para evaluar al estudiante:
- Materia: {materia}
- Tema: {tema}
- Nivel: {nivel}
- Día actual: {dia}
- Temas cubiertos hasta ahora: {json.dumps(temas_cubiertos, ensure_ascii=False)}

Responde con este JSON:
{{
    "titulo": "Mini Prueba - Día {dia}",
    "tiempo_limite_minutos": 15,
    "preguntas": [
        {{
            "id": 0,
            "pregunta": "Enunciado de la pregunta",
            "tipo": "opcion_multiple",
            "opciones": ["a) opción 1", "b) opción 2", "c) opción 3", "d) opción 4"],
            "respuesta_correcta": "a",
            "explicacion": "Por qué esta es la respuesta correcta",
            "dificultad": "facil|media|dificil"
        }}
    ]
}}

Genera 5 preguntas de opción múltiple con dificultad variada."""

        raw = await self._chat(system, user, temperature=0.6)
        return self._parse_json(raw)

    # ── Corregir Quiz ────────────────────────────────
    async def corregir_quiz(self, materia: str, tema: str, respuestas: list) -> dict:
        system = """Eres un corrector educativo. Evalúa las respuestas de un quiz.
Responde SOLO con JSON válido.
IMPORTANTE para fórmulas matemáticas: usa delimitadores KaTeX:
- Inline: $f(x) = x^2$ (un signo de dólar a cada lado)
- Bloque: $$\\int_0^1 f(x)\\,dx$$ (doble signo de dólar)
- NUNCA uses \\frac, \\sqrt sueltos sin $ alrededor."""

        user = f"""Corrige este quiz:
- Materia: {materia}
- Tema: {tema}
- Respuestas del estudiante: {json.dumps(respuestas, ensure_ascii=False)}

Cada respuesta tiene: {{"pregunta_id": 0, "respuesta": "a", "pregunta": "...", "respuesta_correcta": "a"}}

Responde con este JSON:
{{
    "puntaje_total": 80,
    "correctas": 4,
    "total": 5,
    "detalle": [
        {{
            "pregunta_id": 0,
            "correcto": true,
            "feedback": "Explicación breve"
        }}
    ],
    "debilidades": ["tema donde falló"],
    "fortalezas": ["tema donde acertó"],
    "recomendacion": "Consejo general para mejorar"
}}"""

        raw = await self._chat(system, user)
        return self._parse_json(raw)

    # ── Chat Tutor ───────────────────────────────────
    async def chat_tutor(
        self, materia: str, tema: str, nivel: str, mensaje: str, historial: list
    ) -> str:
        historial_str = ""
        for h in historial[-10:]:  # Últimos 10 mensajes
            historial_str += f"Estudiante: {h.get('usuario', '')}\nTutor: {h.get('tutor', '')}\n\n"

        system = f"""Eres un tutor amigable y experto en {materia}, específicamente en {tema}.
El estudiante tiene nivel {nivel}.

Reglas:
- Explica de forma simple y clara
- Usa ejemplos cotidianos
- Si te piden "explica como si tuviera 12 años", simplifica al máximo
- Si te piden ejercicios, dáselos
- Sé motivador y paciente
- Usa emojis ocasionalmente para ser más amigable
- Responde en español
- IMPORTANTE para fórmulas matemáticas: usa delimitadores KaTeX:
  * Fórmulas inline: $f(x) = x^2$ (un solo signo de dólar a cada lado)
  * Fórmulas en bloque: $$\\int_0^1 f(x)\\,dx$$ (doble signo de dólar a cada lado)
  * NUNCA uses \\( \\) ni \\[ \\] ni \\frac sueltos sin delimitadores $
  * Ejemplos correctos: $\\frac{{a}}{{b}}$, $x^2 + y^2 = r^2$, $$\\sum_{{i=1}}^n i = \\frac{{n(n+1)}}{{2}}$$

Historial de conversación:
{historial_str}"""

        response = await self.client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": mensaje},
            ],
            temperature=0.7,
            max_tokens=2048,
        )
        return response.choices[0].message.content

    # ── Generar Recomendaciones ──────────────────────
    async def generar_recomendaciones(self, materia: str, tema: str, progreso: dict) -> list:
        system = """Eres un consejero educativo que da recomendaciones personalizadas.
Responde SOLO con JSON válido (una lista)."""

        user = f"""Basándote en el progreso del estudiante, da recomendaciones:
- Materia: {materia}
- Tema: {tema}
- Progreso: {json.dumps(progreso, ensure_ascii=False)}

Responde con una lista JSON:
[
    {{
        "tipo": "refuerzo|avance|practica|descanso",
        "titulo": "Título de la recomendación",
        "descripcion": "Descripción detallada",
        "prioridad": "alta|media|baja"
    }}
]

Da 3-5 recomendaciones específicas y accionables."""

        raw = await self._chat(system, user)
        result = self._parse_json(raw)
        return result if isinstance(result, list) else [result]
