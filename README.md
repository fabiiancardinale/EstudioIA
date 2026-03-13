# 📚 EstudioIA - Tu Tutor Inteligente con IA

Aplicación web de estudio personalizado que utiliza inteligencia artificial (DeepSeek) para generar planes de estudio, contenido educativo, ejercicios con corrección automática, quizzes y un chat tutor en tiempo real.

---

## 🛠️ Tecnologías y Herramientas

| Componente | Tecnología |
|---|---|
| **Lenguaje backend** | Python 3.10+ |
| **Framework backend** | FastAPI |
| **Servidor ASGI** | Uvicorn |
| **IA / LLM** | DeepSeek (API compatible con OpenAI) |
| **Cliente IA** | openai (SDK de Python) |
| **Validación de datos** | Pydantic |
| **Frontend** | HTML5, CSS3, JavaScript (Vanilla) |
| **Almacenamiento** | JSON (archivo local `data/sesiones.json`) |
| **Fuentes** | Google Fonts (Inter) |

---

## 📁 Estructura del Proyecto

```
EstudioIA/
├── backend/
│   ├── app.py          # Servidor FastAPI - rutas y API REST
│   ├── ai_engine.py    # Motor de IA - conexión con DeepSeek
│   └── storage.py      # Almacenamiento - gestión de sesiones (JSON)
├── frontend/
│   ├── index.html      # Interfaz principal (SPA)
│   ├── css/
│   │   └── style.css   # Estilos de la aplicación
│   └── js/
│       └── app.js      # Lógica del frontend
├── data/
│   └── sesiones.json   # Base de datos local (se crea automáticamente)
├── requirements.txt    # Dependencias de Python
└── README.md           # Este archivo
```

---

## ⚡ Requisitos Previos

- **Python 3.10** o superior
- **pip** (gestor de paquetes de Python)
- Conexión a internet (para la API de DeepSeek)

---

## 🚀 Guía de Instalación y Ejecución

### 1. Clonar o descargar el proyecto

```bash
cd EstudioIA
```

### 2. Crear un entorno virtual (recomendado)

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### 3. Instalar dependencias

```bash
pip install -r requirements.txt
```

### 4. Ejecutar la aplicación

```bash
cd backend
python app.py
```

O alternativamente con Uvicorn directamente:

```bash
cd backend
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 5. Abrir en el navegador

Ir a: **http://localhost:8000**

---

## 🔌 Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Página principal (frontend) |
| `POST` | `/api/plan` | Generar un plan de estudio con IA |
| `GET` | `/api/dia/{session_id}/{dia}` | Obtener contenido de un día específico |
| `POST` | `/api/verificar` | Verificar respuesta de un ejercicio |
| `POST` | `/api/quiz` | Generar mini prueba (quiz) |
| `POST` | `/api/quiz/corregir` | Corregir respuestas del quiz |
| `POST` | `/api/chat` | Chat con el tutor IA |
| `GET` | `/api/progreso/{session_id}` | Ver progreso de una sesión |
| `GET` | `/api/recomendaciones/{session_id}` | Obtener recomendaciones personalizadas |
| `GET` | `/api/sesiones` | Listar todas las sesiones |

---

## 📖 ¿Cómo funciona?

1. **Crear un plan**: Ingresa la materia, tema, duración y tu nivel. La IA genera un plan día a día.
2. **Estudiar**: Navega por cada día del plan. La IA genera contenido teórico, explicaciones y ejercicios prácticos.
3. **Practicar**: Resuelve ejercicios y la IA corrige tus respuestas con retroalimentación detallada.
4. **Evaluar**: Realiza quizzes al final de cada sección para medir tu aprendizaje.
5. **Chat tutor**: Pregunta cualquier duda al tutor IA, que conoce tu plan y progreso.
6. **Progreso**: Consulta estadísticas de tu avance, fortalezas y debilidades.

---

## ⚙️ Configuración

La API key de DeepSeek se encuentra en [backend/ai_engine.py](backend/ai_engine.py). Si necesitas cambiarla, modifica la variable `DEEPSEEK_API_KEY`.

---

## 📦 Dependencias

```
fastapi==0.115.0
uvicorn==0.30.6
openai>=1.68.0
pydantic==2.9.2
jinja2==3.1.4
python-multipart==0.0.12
aiofiles==24.1.0
```

---

## 📝 Notas

- Los datos de sesiones se almacenan localmente en `data/sesiones.json`.
- La aplicación funciona como una SPA (Single Page Application) servida desde FastAPI.
- El modo `--reload` en desarrollo reinicia el servidor automáticamente al detectar cambios en el código.