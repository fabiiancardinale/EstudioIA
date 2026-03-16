"""
💾 Sistema de Almacenamiento - PostgreSQL
Gestión de usuarios, sesiones y progreso usando PostgreSQL
"""

import hashlib
import json
import time
import uuid

import psycopg2
import psycopg2.extras


# ── Configuración de conexión ────────────────────────
DB_CONFIG = {
    "host": "72.61.35.137",
    "port": 5432,
    "user": "fabian",
    "password": "Fabian.sb12",
    "dbname": "estudioia",
}
SCHEMA = "app"


class Storage:
    def __init__(self, data_dir=None):
        """Inicializa la conexión a PostgreSQL (data_dir se ignora, mantenido por compatibilidad)."""
        self._conn = None
        self._ensure_tables()

    # ── Conexión ─────────────────────────────────────
    def _get_conn(self):
        """Obtiene una conexión activa a PostgreSQL, reconectando si es necesario."""
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(**DB_CONFIG)
            self._conn.autocommit = False
        try:
            with self._conn.cursor() as cur:
                cur.execute("SELECT 1")
        except Exception:
            self._conn = psycopg2.connect(**DB_CONFIG)
            self._conn.autocommit = False
        return self._conn

    def _execute(self, query, params=None, fetch=None):
        """Ejecuta una query con manejo automático de conexión y transacción."""
        conn = self._get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(f"SET search_path TO {SCHEMA};")
                cur.execute(query, params)
                result = None
                if fetch == "one":
                    result = cur.fetchone()
                elif fetch == "all":
                    result = cur.fetchall()
                conn.commit()
                return result
        except Exception:
            conn.rollback()
            raise

    def _ensure_tables(self):
        """Crea las tablas si no existen."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA};")
                cur.execute(f"""
                    CREATE TABLE IF NOT EXISTS {SCHEMA}.usuarios (
                        id VARCHAR(8) PRIMARY KEY,
                        nombre VARCHAR(255) NOT NULL,
                        email VARCHAR(255) UNIQUE NOT NULL,
                        password_hash VARCHAR(64) NOT NULL,
                        token VARCHAR(36),
                        creado DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
                    );
                    CREATE TABLE IF NOT EXISTS {SCHEMA}.sesiones (
                        id VARCHAR(8) PRIMARY KEY,
                        user_id VARCHAR(8) REFERENCES {SCHEMA}.usuarios(id) ON DELETE CASCADE,
                        materia VARCHAR(255) NOT NULL,
                        tema VARCHAR(500) NOT NULL,
                        semanas INTEGER NOT NULL,
                        nivel VARCHAR(50) NOT NULL,
                        plan JSONB DEFAULT '{{}}'::jsonb,
                        contenido_dias JSONB DEFAULT '{{}}'::jsonb,
                        progreso JSONB DEFAULT '{{"dias_completados":[],"respuestas":{{}},"quizzes":{{}},"debilidades":[],"fortalezas":[]}}'::jsonb,
                        chat_historial JSONB DEFAULT '[]'::jsonb,
                        creado DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW()),
                        ultimo_acceso DOUBLE PRECISION DEFAULT EXTRACT(EPOCH FROM NOW())
                    );
                    CREATE INDEX IF NOT EXISTS idx_sesiones_user_id ON {SCHEMA}.sesiones(user_id);
                    CREATE INDEX IF NOT EXISTS idx_usuarios_email ON {SCHEMA}.usuarios(email);
                    CREATE INDEX IF NOT EXISTS idx_usuarios_token ON {SCHEMA}.usuarios(token);
                """)
            conn.commit()
            print("✅ PostgreSQL conectado: estudioia @ 72.61.35.137")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Error creando tablas: {e}")
            raise

    @staticmethod
    def _hash_password(password: str) -> str:
        return hashlib.sha256(password.encode("utf-8")).hexdigest()

    # ── Registrar Usuario ────────────────────────────
    def registrar_usuario(self, nombre: str, email: str, password: str) -> dict:
        existing = self._execute(
            "SELECT id FROM usuarios WHERE LOWER(email) = LOWER(%s)",
            (email,),
            fetch="one",
        )
        if existing:
            return {"error": "Ya existe una cuenta con ese email"}

        user_id = str(uuid.uuid4())[:8]
        token = str(uuid.uuid4())

        self._execute(
            """INSERT INTO usuarios (id, nombre, email, password_hash, token, creado)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            (user_id, nombre, email.lower(), self._hash_password(password), token, time.time()),
        )
        return {"id": user_id, "nombre": nombre, "email": email.lower(), "token": token}

    # ── Autenticar Usuario ───────────────────────────
    def autenticar_usuario(self, email: str, password: str) -> dict:
        pw_hash = self._hash_password(password)
        user = self._execute(
            "SELECT id, nombre, email FROM usuarios WHERE LOWER(email) = LOWER(%s) AND password_hash = %s",
            (email, pw_hash),
            fetch="one",
        )
        if not user:
            return {"error": "Email o contraseña incorrectos"}

        token = str(uuid.uuid4())
        self._execute(
            "UPDATE usuarios SET token = %s WHERE id = %s",
            (token, user["id"]),
        )
        return {"id": user["id"], "nombre": user["nombre"], "email": user["email"], "token": token}

    # ── Obtener usuario por token ────────────────────
    def obtener_usuario_por_token(self, token: str) -> dict | None:
        user = self._execute(
            "SELECT id, nombre, email FROM usuarios WHERE token = %s",
            (token,),
            fetch="one",
        )
        if user:
            return dict(user)
        return None

    # ── Crear Sesión ─────────────────────────────────
    def crear_sesion(self, materia: str, tema: str, semanas: int, nivel: str, plan: dict, user_id: str = "") -> str:
        session_id = str(uuid.uuid4())[:8]
        progreso = {
            "dias_completados": [],
            "respuestas": {},
            "quizzes": {},
            "debilidades": [],
            "fortalezas": [],
        }
        now = time.time()

        self._execute(
            """INSERT INTO sesiones (id, user_id, materia, tema, semanas, nivel, plan, contenido_dias, progreso, chat_historial, creado, ultimo_acceso)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                session_id,
                user_id or None,
                materia,
                tema,
                semanas,
                nivel,
                json.dumps(plan, ensure_ascii=False),
                json.dumps({}),
                json.dumps(progreso, ensure_ascii=False),
                json.dumps([]),
                now,
                now,
            ),
        )
        return session_id

    # ── Obtener Sesión ───────────────────────────────
    def obtener_sesion(self, session_id: str) -> dict | None:
        row = self._execute(
            "SELECT * FROM sesiones WHERE id = %s",
            (session_id,),
            fetch="one",
        )
        if not row:
            return None

        self._execute(
            "UPDATE sesiones SET ultimo_acceso = %s WHERE id = %s",
            (time.time(), session_id),
        )

        sesion = dict(row)
        for campo in ("plan", "contenido_dias", "progreso", "chat_historial"):
            val = sesion.get(campo)
            if isinstance(val, str):
                sesion[campo] = json.loads(val)
        if sesion.get("contenido_dias") is None:
            sesion["contenido_dias"] = {}
        return sesion

    # ── Guardar contenido de un día (cache) ──────────
    def guardar_contenido_dia(self, session_id: str, dia: int, contenido: dict):
        """Guarda el contenido generado de un día para no regenerarlo."""
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return
        dias_cache = sesion.get("contenido_dias", {})
        dias_cache[str(dia)] = contenido
        self._execute(
            "UPDATE sesiones SET contenido_dias = %s WHERE id = %s",
            (json.dumps(dias_cache, ensure_ascii=False), session_id),
        )

    # ── Obtener contenido cacheado de un día ────────
    def obtener_contenido_dia(self, session_id: str, dia: int) -> dict | None:
        """Retorna el contenido cacheado de un día, o None si no existe."""
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return None
        dias_cache = sesion.get("contenido_dias", {})
        return dias_cache.get(str(dia))

    # ── Registrar Respuesta ──────────────────────────
    def registrar_respuesta(
        self, session_id: str, dia: int, ejercicio_index: int, respuesta: str, correcto: bool
    ):
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return

        progreso = sesion["progreso"]
        dia_key = str(dia)

        if dia_key not in progreso["respuestas"]:
            progreso["respuestas"][dia_key] = []

        progreso["respuestas"][dia_key].append({
            "ejercicio": ejercicio_index,
            "respuesta": respuesta,
            "correcto": correcto,
            "timestamp": time.time(),
        })

        if dia not in progreso["dias_completados"]:
            total_resp = len(progreso["respuestas"][dia_key])
            if total_resp >= 3:
                progreso["dias_completados"].append(dia)

        self._execute(
            "UPDATE sesiones SET progreso = %s WHERE id = %s",
            (json.dumps(progreso, ensure_ascii=False), session_id),
        )

    # ── Registrar Quiz ───────────────────────────────
    def registrar_quiz(self, session_id: str, dia: int, resultado: dict):
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return

        progreso = sesion["progreso"]
        dia_key = str(dia)
        progreso["quizzes"][dia_key] = {
            "resultado": resultado,
            "timestamp": time.time(),
        }

        if isinstance(resultado, dict):
            debilidades = resultado.get("debilidades", [])
            fortalezas = resultado.get("fortalezas", [])

            for d in debilidades:
                if d not in progreso["debilidades"]:
                    progreso["debilidades"].append(d)
                if d in progreso["fortalezas"]:
                    progreso["fortalezas"].remove(d)

            for f in fortalezas:
                if f not in progreso["fortalezas"]:
                    progreso["fortalezas"].append(f)

        self._execute(
            "UPDATE sesiones SET progreso = %s WHERE id = %s",
            (json.dumps(progreso, ensure_ascii=False), session_id),
        )

    # ── Agregar Chat ─────────────────────────────────
    def agregar_chat(self, session_id: str, mensaje_usuario: str, respuesta_tutor: str):
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return

        historial = sesion.get("chat_historial", [])
        historial.append({
            "usuario": mensaje_usuario,
            "tutor": respuesta_tutor,
            "timestamp": time.time(),
        })

        if len(historial) > 50:
            historial = historial[-50:]

        self._execute(
            "UPDATE sesiones SET chat_historial = %s WHERE id = %s",
            (json.dumps(historial, ensure_ascii=False), session_id),
        )

    # ── Calcular Progreso ────────────────────────────
    def calcular_progreso(self, session_id: str) -> dict:
        sesion = self.obtener_sesion(session_id)
        if not sesion:
            return {}

        progreso = sesion["progreso"]
        plan = sesion.get("plan", {})
        total_dias = plan.get("total_dias", 14) if isinstance(plan, dict) else 14

        total_respuestas = 0
        total_correctas = 0
        for dia_key, resps in progreso.get("respuestas", {}).items():
            for r in resps:
                total_respuestas += 1
                if r.get("correcto"):
                    total_correctas += 1

        quiz_scores = []
        for dia_key, quiz in progreso.get("quizzes", {}).items():
            resultado = quiz.get("resultado", {})
            if isinstance(resultado, dict):
                score = resultado.get("puntaje_total", 0)
                quiz_scores.append(score)

        porcentaje_dominio = 0
        if total_respuestas > 0:
            porcentaje_dominio = round((total_correctas / total_respuestas) * 100)

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
            "tiempo_estudio_estimado": dias_completados * 45,
        }

    # ── Listar Sesiones ──────────────────────────────
    def listar_sesiones(self, user_id: str = "") -> list:
        if user_id:
            rows = self._execute(
                "SELECT * FROM sesiones WHERE user_id = %s ORDER BY creado DESC",
                (user_id,),
                fetch="all",
            )
        else:
            rows = self._execute(
                "SELECT * FROM sesiones ORDER BY creado DESC",
                fetch="all",
            )

        sesiones = []
        for row in rows or []:
            sesion = dict(row)
            plan = sesion.get("plan", {})
            if isinstance(plan, str):
                plan = json.loads(plan)
            progreso = sesion.get("progreso", {})
            if isinstance(progreso, str):
                progreso = json.loads(progreso)

            titulo = plan.get("titulo", f"{sesion['materia']} - {sesion['tema']}") if isinstance(plan, dict) else f"{sesion['materia']} - {sesion['tema']}"
            sesiones.append({
                "id": sesion["id"],
                "materia": sesion["materia"],
                "tema": sesion["tema"],
                "titulo": titulo,
                "semanas": sesion["semanas"],
                "nivel": sesion["nivel"],
                "creado": sesion.get("creado", 0),
                "dias_completados": len(progreso.get("dias_completados", [])),
            })
        return sesiones
