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

        system = """Eres un tutor experto que explica conceptos de forma clara y simple.
Adaptas tu explicación al nivel del estudiante.
Responde SOLO con JSON válido."""

        user = f"""Genera el contenido de estudio para:
- Materia: {materia}
- Tema: {tema}
- Nivel: {nivel}
- Día {dia}: {json.dumps(dia_info, ensure_ascii=False) if dia_info else f"Día {dia} del plan"}
- Debilidades del estudiante: {debilidades_str}

Responde con este JSON:
{{
    "titulo": "Título de la lección del día",
    "explicacion": "Explicación detallada y clara del tema del día. Usa ejemplos simples. Puede ser largo y detallado. Usa markdown para formato.",
    "conceptos_clave": ["concepto 1", "concepto 2"],
    "ejemplos": [
        {{
            "titulo": "Ejemplo 1",
            "enunciado": "Descripción del ejemplo",
            "desarrollo": "Paso a paso de la resolución",
            "resultado": "Resultado final"
        }}
    ],
    "ejercicios": [
        {{
            "id": 0,
            "enunciado": "Enunciado del ejercicio",
            "pista": "Una pista para resolver el ejercicio",
            "tipo": "abierta|opcion_multiple",
            "opciones": ["a) opción 1", "b) opción 2", "c) opción 3", "d) opción 4"],
            "respuesta_correcta": "La respuesta correcta"
        }}
    ],
    "dato_curioso": "Un dato interesante relacionado con el tema"
}}

Genera 3-5 ejercicios variados. Si hay debilidades, enfoca algunos ejercicios en reforzarlas.
Las explicaciones deben ser claras como para alguien de nivel {nivel}."""

        raw = await self._chat(system, user)
        return self._parse_json(raw)

    # ── Verificar Respuesta ──────────────────────────
    async def verificar_respuesta(
        self, materia: str, tema: str, dia: int, ejercicio_index: int, respuesta: str, plan: dict
    ) -> dict:
        system = """Eres un corrector educativo justo y motivador.
Evalúa respuestas de estudiantes con explicaciones claras.
Responde SOLO con JSON válido."""

        user = f"""Evalúa esta respuesta de un estudiante:
- Materia: {materia}
- Tema: {tema}
- Día: {dia}
- Ejercicio número: {ejercicio_index + 1}
- Respuesta del estudiante: "{respuesta}"

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
Responde SOLO con JSON válido."""

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
Responde SOLO con JSON válido."""

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
