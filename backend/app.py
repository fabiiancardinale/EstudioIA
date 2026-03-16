"""
📚 EstudioIA - Aplicación de Estudio Inteligente con IA
Backend principal con FastAPI + DeepSeek
"""

from fastapi import FastAPI, HTTPException, Request
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
db = Storage()


# ── Helper: obtener usuario autenticado ──────────────
def get_current_user(request: Request) -> dict:
    """Extrae el token del header Authorization y devuelve el usuario."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token no proporcionado")
    token = auth_header[7:]
    user = db.obtener_usuario_por_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    return user


# ── Modelos ──────────────────────────────────────────
class RegisterRequest(BaseModel):
    nombre: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


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
    ejercicio_enunciado: Optional[str] = ""
    ejercicio_opciones: Optional[list[str]] = []
    ejercicio_respuesta_correcta: Optional[str] = ""
    analisis_dibujo: Optional[str] = None


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


# ── API: Registro de usuario ─────────────────────────
@app.post("/api/register")
async def register(req: RegisterRequest):
    if not req.nombre.strip() or not req.email.strip() or not req.password.strip():
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")

    result = db.registrar_usuario(req.nombre.strip(), req.email.strip(), req.password)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


# ── API: Login de usuario ────────────────────────────
@app.post("/api/login")
async def login(req: LoginRequest):
    result = db.autenticar_usuario(req.email.strip(), req.password)
    if "error" in result:
        raise HTTPException(status_code=401, detail=result["error"])
    return result


# ── API: Verificar token ────────────────────────────
@app.get("/api/me")
async def me(request: Request):
    user = get_current_user(request)
    return user


# ── API: Generar Plan de Estudio ─────────────────────
@app.post("/api/plan")
async def generar_plan(req: PlanRequest, request: Request):
    user = get_current_user(request)
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
            user_id=user.get("id", ""),
        )

        return {"session_id": session_id, "plan": plan}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── API: Obtener sesión completa (plan guardado) ─────
@app.get("/api/sesion/{session_id}")
async def obtener_sesion_completa(session_id: str, request: Request):
    user = get_current_user(request)
    sesion = db.obtener_sesion(session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if sesion.get("user_id") and sesion["user_id"] != user.get("id"):
        raise HTTPException(status_code=403, detail="No autorizado")
    return {
        "id": sesion["id"],
        "materia": sesion["materia"],
        "tema": sesion["tema"],
        "semanas": sesion["semanas"],
        "nivel": sesion["nivel"],
        "plan": sesion["plan"],
        "contenido_dias": sesion.get("contenido_dias", {}),
        "progreso": sesion.get("progreso", {}),
        "creado": sesion.get("creado"),
    }


# ── API: Obtener contenido de un día ─────────────────
@app.get("/api/dia/{session_id}/{dia}")
async def obtener_dia(session_id: str, dia: int):
    sesion = db.obtener_sesion(session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")

    # Verificar si ya existe contenido cacheado
    cached = db.obtener_contenido_dia(session_id, dia)
    if cached:
        return {"dia": dia, "contenido": cached}

    try:
        contenido = await ai.generar_contenido_dia(
            materia=sesion["materia"],
            tema=sesion["tema"],
            nivel=sesion["nivel"],
            plan=sesion["plan"],
            dia=dia,
            progreso=sesion.get("progreso", {}),
        )

        # Guardar contenido generado para no regenerarlo
        db.guardar_contenido_dia(session_id, dia, contenido)

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
        # Si hay análisis de dibujo (ejercicio de dibujo), usar verificación de dibujo
        if req.analisis_dibujo:
            resultado = await ai.verificar_dibujo(
                materia=sesion["materia"],
                tema=sesion["tema"],
                dia=req.dia,
                ejercicio_index=req.ejercicio_index,
                analisis_dibujo=req.analisis_dibujo,
                descripcion_estudiante=req.respuesta,
                ejercicio_enunciado=req.ejercicio_enunciado,
                ejercicio_respuesta_correcta=req.ejercicio_respuesta_correcta,
            )
        else:
            resultado = await ai.verificar_respuesta(
                materia=sesion["materia"],
                tema=sesion["tema"],
                dia=req.dia,
                ejercicio_index=req.ejercicio_index,
                respuesta=req.respuesta,
                plan=sesion["plan"],
                ejercicio_enunciado=req.ejercicio_enunciado,
                ejercicio_opciones=req.ejercicio_opciones,
                ejercicio_respuesta_correcta=req.ejercicio_respuesta_correcta,
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
async def listar_sesiones(request: Request):
    user = get_current_user(request)
    return db.listar_sesiones(user_id=user.get("id", ""))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
