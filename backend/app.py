"""
📚 EstudioIA - Aplicación de Estudio Inteligente con IA
Backend principal con FastAPI + DeepSeek
"""

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import os
import time
from pathlib import Path

from ai_engine import AIEngine
from storage import Storage

# ── App ──────────────────────────────────────────────
app = FastAPI(title="EstudioIA", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"

app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")

ai = AIEngine()
db = Storage(DATA_DIR)


# ── Modelos ──────────────────────────────────────────
class PlanRequest(BaseModel):
    materia: str
    tema: str
    tiempo_semanas: int
    nivel: Optional[str] = "intermedio"


class AnswerRequest(BaseModel):
    session_id: str
    dia: int
    ejercicio_index: int
    respuesta: str


class ChatRequest(BaseModel):
    session_id: str
    mensaje: str


class QuizRequest(BaseModel):
    session_id: str
    dia: int


class QuizAnswerRequest(BaseModel):
    session_id: str
    dia: int
    respuestas: list[dict]


# ── Rutas Frontend ───────────────────────────────────
@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "index.html")


# ── API: Generar Plan de Estudio ─────────────────────
@app.post("/api/plan")
async def generar_plan(req: PlanRequest):
    try:
        plan = await ai.generar_plan(
            materia=req.materia,
            tema=req.tema,
            semanas=req.tiempo_semanas,
            nivel=req.nivel,
        )

        session_id = db.crear_sesion(
            materia=req.materia,
            tema=req.tema,
            semanas=req.tiempo_semanas,
            nivel=req.nivel,
            plan=plan,
        )

        return {"session_id": session_id, "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Obtener contenido de un día ─────────────────
@app.get("/api/dia/{session_id}/{dia}")
async def obtener_dia(session_id: str, dia: int):
    sesion = db.obtener_sesion(session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        contenido = await ai.generar_contenido_dia(
            materia=sesion["materia"],
            tema=sesion["tema"],
            nivel=sesion["nivel"],
            plan=sesion["plan"],
            dia=dia,
            progreso=sesion.get("progreso", {}),
        )
        return {"dia": dia, "contenido": contenido}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Verificar respuesta de ejercicio ────────────
@app.post("/api/verificar")
async def verificar_respuesta(req: AnswerRequest):
    sesion = db.obtener_sesion(req.session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        resultado = await ai.verificar_respuesta(
            materia=sesion["materia"],
            tema=sesion["tema"],
            dia=req.dia,
            ejercicio_index=req.ejercicio_index,
            respuesta=req.respuesta,
            plan=sesion["plan"],
        )

        db.registrar_respuesta(
            session_id=req.session_id,
            dia=req.dia,
            ejercicio_index=req.ejercicio_index,
            respuesta=req.respuesta,
            correcto=resultado.get("correcto", False),
        )

        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Mini prueba ────────────────────────────────
@app.post("/api/quiz")
async def generar_quiz(req: QuizRequest):
    sesion = db.obtener_sesion(req.session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        quiz = await ai.generar_quiz(
            materia=sesion["materia"],
            tema=sesion["tema"],
            nivel=sesion["nivel"],
            dia=req.dia,
            plan=sesion["plan"],
            progreso=sesion.get("progreso", {}),
        )
        return {"quiz": quiz}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Corregir quiz ──────────────────────────────
@app.post("/api/quiz/corregir")
async def corregir_quiz(req: QuizAnswerRequest):
    sesion = db.obtener_sesion(req.session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        resultado = await ai.corregir_quiz(
            materia=sesion["materia"],
            tema=sesion["tema"],
            respuestas=req.respuestas,
        )

        db.registrar_quiz(
            session_id=req.session_id,
            dia=req.dia,
            resultado=resultado,
        )

        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Chat tutor ─────────────────────────────────
@app.post("/api/chat")
async def chat_tutor(req: ChatRequest):
    sesion = db.obtener_sesion(req.session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        respuesta = await ai.chat_tutor(
            materia=sesion["materia"],
            tema=sesion["tema"],
            nivel=sesion["nivel"],
            mensaje=req.mensaje,
            historial=sesion.get("chat_historial", []),
        )

        db.agregar_chat(req.session_id, req.mensaje, respuesta)

        return {"respuesta": respuesta}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Progreso ────────────────────────────────────
@app.get("/api/progreso/{session_id}")
async def obtener_progreso(session_id: str):
    sesion = db.obtener_sesion(session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    progreso = db.calcular_progreso(session_id)
    return progreso


# ── API: Recomendaciones ─────────────────────────────
@app.get("/api/recomendaciones/{session_id}")
async def obtener_recomendaciones(session_id: str):
    sesion = db.obtener_sesion(session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    try:
        progreso = db.calcular_progreso(session_id)
        recomendaciones = await ai.generar_recomendaciones(
            materia=sesion["materia"],
            tema=sesion["tema"],
            progreso=progreso,
        )
        return {"recomendaciones": recomendaciones}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Listar sesiones ────────────────────────────
@app.get("/api/sesiones")
async def listar_sesiones():
    return db.listar_sesiones()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
