"""
💾 Sistema de Almacenamiento - Gestión de sesiones y progreso
Usa archivos JSON para persistencia simple
"""

import json
import os
import time
import uuid
from pathlib import Path


class Storage:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sesiones_file = self.data_dir / "sesiones.json"
        self._init_db()

    def _init_db(self):
        if not self.sesiones_file.exists():
            self._save({})

    def _load(self) -> dict:
        try:
            with open(self.sesiones_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _save(self, data: dict):
        with open(self.sesiones_file, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    # ── Crear Sesión ─────────────────────────────────
    def crear_sesion(self, materia: str, tema: str, semanas: int, nivel: str, plan: dict) -> str:
        session_id = str(uuid.uuid4())[:8]
        data = self._load()

        data[session_id] = {
            "id": session_id,
            "materia": materia,
            "tema": tema,
            "semanas": semanas,
            "nivel": nivel,
            "plan": plan,
            "progreso": {
                "dias_completados": [],
                "respuestas": {},
                "quizzes": {},
                "debilidades": [],
                "fortalezas": [],
            },
            "chat_historial": [],
            "creado": time.time(),
            "ultimo_acceso": time.time(),
        }

        self._save(data)
        return session_id

    # ── Obtener Sesión ───────────────────────────────
    def obtener_sesion(self, session_id: str) -> dict | None:
        data = self._load()
        sesion = data.get(session_id)
        if sesion:
            sesion["ultimo_acceso"] = time.time()
            self._save(data)
        return sesion

    # ── Registrar Respuesta ──────────────────────────
    def registrar_respuesta(
        self, session_id: str, dia: int, ejercicio_index: int, respuesta: str, correcto: bool
    ):
        data = self._load()
        if session_id not in data:
            return

        sesion = data[session_id]
        dia_key = str(dia)

        if dia_key not in sesion["progreso"]["respuestas"]:
            sesion["progreso"]["respuestas"][dia_key] = []

        sesion["progreso"]["respuestas"][dia_key].append({
            "ejercicio": ejercicio_index,
            "respuesta": respuesta,
            "correcto": correcto,
            "timestamp": time.time(),
        })

        if dia not in sesion["progreso"]["dias_completados"]:
            # Marcar día como completado si tiene al menos 3 respuestas
            total_resp = len(sesion["progreso"]["respuestas"][dia_key])
            if total_resp >= 3:
                sesion["progreso"]["dias_completados"].append(dia)

        self._save(data)

    # ── Registrar Quiz ───────────────────────────────
    def registrar_quiz(self, session_id: str, dia: int, resultado: dict):
        data = self._load()
        if session_id not in data:
            return

        sesion = data[session_id]
        dia_key = str(dia)
        sesion["progreso"]["quizzes"][dia_key] = {
            "resultado": resultado,
            "timestamp": time.time(),
        }

        # Actualizar debilidades y fortalezas
        if isinstance(resultado, dict):
            debilidades = resultado.get("debilidades", [])
            fortalezas = resultado.get("fortalezas", [])

            for d in debilidades:
                if d not in sesion["progreso"]["debilidades"]:
                    sesion["progreso"]["debilidades"].append(d)
                # Si era fortaleza, quitarla
                if d in sesion["progreso"]["fortalezas"]:
                    sesion["progreso"]["fortalezas"].remove(d)

            for f in fortalezas:
                if f not in sesion["progreso"]["fortalezas"]:
                    sesion["progreso"]["fortalezas"].append(f)
                # Si era debilidad y ahora es fortaleza, considerar quitarla
                # (solo si aparece como fortaleza más de una vez - simplificado)

        self._save(data)

    # ── Agregar Chat ─────────────────────────────────
    def agregar_chat(self, session_id: str, mensaje_usuario: str, respuesta_tutor: str):
        data = self._load()
        if session_id not in data:
            return

        data[session_id]["chat_historial"].append({
            "usuario": mensaje_usuario,
            "tutor": respuesta_tutor,
            "timestamp": time.time(),
        })

        # Mantener solo últimos 50 mensajes
        if len(data[session_id]["chat_historial"]) > 50:
            data[session_id]["chat_historial"] = data[session_id]["chat_historial"][-50:]

        self._save(data)

    # ── Calcular Progreso ────────────────────────────
    def calcular_progreso(self, session_id: str) -> dict:
        data = self._load()
        if session_id not in data:
            return {}

        sesion = data[session_id]
        progreso = sesion["progreso"]
        plan = sesion.get("plan", {})
        total_dias = plan.get("total_dias", 14) if isinstance(plan, dict) else 14

        # Calcular estadísticas de respuestas
        total_respuestas = 0
        total_correctas = 0
        for dia_key, resps in progreso.get("respuestas", {}).items():
            for r in resps:
                total_respuestas += 1
                if r.get("correcto"):
                    total_correctas += 1

        # Calcular estadísticas de quizzes
        quiz_scores = []
        for dia_key, quiz in progreso.get("quizzes", {}).items():
            resultado = quiz.get("resultado", {})
            if isinstance(resultado, dict):
                score = resultado.get("puntaje_total", 0)
                quiz_scores.append(score)

        porcentaje_dominio = 0
        if total_respuestas > 0:
            porcentaje_dominio = round((total_correctas / total_respuestas) * 100)

        # Si hay quizzes, promediar con ellos
        if quiz_scores:
            promedio_quiz = sum(quiz_scores) / len(quiz_scores)
            porcentaje_dominio = round((porcentaje_dominio + promedio_quiz) / 2)

        dias_completados = len(progreso.get("dias_completados", []))
        porcentaje_avance = round((dias_completados / total_dias) * 100) if total_dias > 0 else 0

        return {
            "porcentaje_dominio": min(porcentaje_dominio, 100),
            "porcentaje_avance": min(porcentaje_avance, 100),
            "dias_completados": dias_completados,
            "total_dias": total_dias,
            "total_respuestas": total_respuestas,
            "total_correctas": total_correctas,
            "precision": round((total_correctas / total_respuestas * 100)) if total_respuestas > 0 else 0,
            "quizzes_realizados": len(quiz_scores),
            "promedio_quizzes": round(sum(quiz_scores) / len(quiz_scores)) if quiz_scores else 0,
            "debilidades": progreso.get("debilidades", []),
            "fortalezas": progreso.get("fortalezas", []),
            "tiempo_estudio_estimado": dias_completados * 45,  # minutos estimados
        }

    # ── Listar Sesiones ──────────────────────────────
    def listar_sesiones(self) -> list:
        data = self._load()
        sesiones = []
        for sid, sesion in data.items():
            plan = sesion.get("plan", {})
            titulo = plan.get("titulo", f"{sesion['materia']} - {sesion['tema']}") if isinstance(plan, dict) else f"{sesion['materia']} - {sesion['tema']}"
            sesiones.append({
                "id": sid,
                "materia": sesion["materia"],
                "tema": sesion["tema"],
                "titulo": titulo,
                "semanas": sesion["semanas"],
                "nivel": sesion["nivel"],
                "creado": sesion.get("creado", 0),
                "dias_completados": len(sesion["progreso"].get("dias_completados", [])),
            })
        # Ordenar por último acceso
        sesiones.sort(key=lambda x: x.get("creado", 0), reverse=True)
        return sesiones
