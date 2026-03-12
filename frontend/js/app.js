/**
 * 📚 EstudioIA - Lógica Principal del Frontend
 * Maneja todas las interacciones de la UI y comunicación con el backend
 */

// ═══ ESTADO GLOBAL ══════════════════════════════════
let state = {
    sessionId: null,
    plan: null,
    diaActual: null,
    quizActual: null,
    timerInterval: null,
    timerSeconds: 0,
};

// ═══ UTILIDADES ═════════════════════════════════════
const API = '';

async function api(endpoint, options = {}) {
    const url = `${API}${endpoint}`;
    const config = {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    };
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }
    const res = await fetch(url, config);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(err.detail || `Error ${res.status}`);
    }
    return res.json();
}

function $(id) { return document.getElementById(id); }

function showLoading(text = 'Cargando...') {
    $('loading-text').textContent = text;
    $('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    $('loading-overlay').style.display = 'none';
}

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
}

function toast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function simpleMarkdown(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        .replace(/^/, '<p>')
        .replace(/$/, '</p>');
}

// ═══ INICIO ═════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    cargarSesiones();
    $('form-plan').addEventListener('submit', crearPlan);
});

// ═══ CARGAR SESIONES EXISTENTES ═════════════════════
async function cargarSesiones() {
    try {
        const sesiones = await api('/api/sesiones');
        if (sesiones.length > 0) {
            $('sesiones-existentes').style.display = 'block';
            const lista = $('lista-sesiones');
            lista.innerHTML = sesiones.map(s => {
                const fecha = new Date(s.creado * 1000).toLocaleDateString('es-CL');
                const totalDias = s.semanas * 7;
                const pct = Math.round((s.dias_completados / totalDias) * 100);
                return `
                    <div class="session-card" onclick="cargarSesion('${s.id}')">
                        <h4>${s.titulo}</h4>
                        <div class="meta">
                            ${s.materia} · ${s.tema} · ${s.semanas} semanas · ${s.nivel}<br>
                            Creado: ${fecha} · ${s.dias_completados}/${totalDias} días
                        </div>
                        <div class="session-progress">
                            <div class="session-progress-fill" style="width:${pct}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (e) {
        console.log('No hay sesiones previas');
    }
}

// ═══ CREAR PLAN ═════════════════════════════════════
async function crearPlan(e) {
    e.preventDefault();

    const materia = $('materia').value.trim();
    const tema = $('tema').value.trim();
    const semanas = parseInt($('semanas').value);
    const nivel = $('nivel').value;

    if (!materia || !tema) {
        toast('Completa todos los campos', 'error');
        return;
    }

    const btn = $('btn-generar');
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-loading').style.display = 'inline-flex';
    btn.disabled = true;

    showLoading('🤖 La IA está creando tu plan de estudio personalizado...');

    try {
        const data = await api('/api/plan', {
            method: 'POST',
            body: { materia, tema, tiempo_semanas: semanas, nivel },
        });

        state.sessionId = data.session_id;
        state.plan = data.plan;
        mostrarPlan(data.plan);
        toast('¡Plan creado exitosamente! 🎉', 'success');
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        hideLoading();
        btn.querySelector('.btn-text').style.display = 'inline';
        btn.querySelector('.btn-loading').style.display = 'none';
        btn.disabled = false;
    }
}

// ═══ CARGAR SESIÓN EXISTENTE ════════════════════════
async function cargarSesion(sessionId) {
    showLoading('Cargando tu plan de estudio...');
    try {
        // Obtener datos de la sesión a través del progreso
        const progreso = await api(`/api/progreso/${sessionId}`);
        // Necesitamos obtener el plan desde el backend
        // Usamos el endpoint de día para recuperar info
        state.sessionId = sessionId;

        // Buscar la sesión en las sesiones listadas
        const sesiones = await api('/api/sesiones');
        const sesion = sesiones.find(s => s.id === sessionId);

        if (sesion) {
            // Reconstruir un plan mínimo para la navegación
            const totalDias = sesion.semanas * 7;
            state.plan = {
                titulo: sesion.titulo,
                descripcion: `Plan de ${sesion.materia} - ${sesion.tema}`,
                total_dias: totalDias,
                dias: Array.from({ length: totalDias }, (_, i) => ({
                    dia: i + 1,
                    titulo: `Día ${i + 1}`,
                    tipo: 'teoria',
                    resumen: '',
                })),
                hitos: [],
            };
            mostrarPlan(state.plan);
            toast('Sesión cargada 📂', 'success');
        }
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// ═══ MOSTRAR PLAN ═══════════════════════════════════
function mostrarPlan(plan) {
    showScreen('screen-plan');

    const titulo = plan.titulo || 'Plan de Estudio';
    $('plan-titulo-nav').textContent = titulo;
    $('plan-descripcion').textContent = plan.descripcion || '';

    // Hitos
    const hitos = plan.hitos || [];
    if (hitos.length > 0) {
        $('plan-hitos').innerHTML = '<h3 style="margin-bottom:12px;">🏆 Hitos del Plan</h3>' +
            hitos.map(h => `
                <div class="hito-item">
                    <span class="hito-dia">Día ${h.dia}</span>
                    <span>${h.descripcion}</span>
                </div>
            `).join('');
    }

    // Lista de días
    const dias = plan.dias || [];
    const listaDias = $('lista-dias');
    listaDias.innerHTML = dias.map(d => {
        const tipoIcons = {
            'teoria': '📖',
            'practica': '✏️',
            'repaso': '🔄',
            'prueba': '📝',
        };
        const icon = tipoIcons[d.tipo] || '📌';
        return `
            <div class="dia-item" data-dia="${d.dia}" onclick="seleccionarDia(${d.dia})">
                <div class="dia-num">${d.dia}</div>
                <div class="dia-info">
                    <div class="dia-name">${icon} ${d.titulo || `Día ${d.dia}`}</div>
                    <div class="dia-type">${d.tipo || 'estudio'} · ${d.duracion_minutos || 45} min</div>
                </div>
            </div>
        `;
    }).join('');

    // Welcome visible
    $('welcome-plan').style.display = 'block';
    $('dia-contenido').style.display = 'none';
    $('quiz-contenido').style.display = 'none';

    actualizarBarraProgreso();
}

// ═══ SELECCIONAR DÍA ════════════════════════════════
async function seleccionarDia(dia) {
    state.diaActual = dia;

    // Actualizar sidebar
    document.querySelectorAll('.dia-item').forEach(el => {
        el.classList.remove('active');
        if (parseInt(el.dataset.dia) === dia) {
            el.classList.add('active');
        }
    });

    $('welcome-plan').style.display = 'none';
    $('quiz-contenido').style.display = 'none';
    $('dia-contenido').style.display = 'block';

    showLoading('🤖 Generando contenido del día...');

    try {
        const data = await api(`/api/dia/${state.sessionId}/${dia}`);
        mostrarContenidoDia(data.contenido, dia);
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
        $('dia-contenido').innerHTML = `<div class="card"><p>Error al cargar el contenido. Intenta de nuevo.</p></div>`;
    } finally {
        hideLoading();
    }
}

// ═══ MOSTRAR CONTENIDO DEL DÍA ═════════════════════
function mostrarContenidoDia(contenido, dia) {
    const c = contenido;

    // Resetear chatbot de la lección al cambiar de día
    resetChatbotLeccion();

    // Título
    $('dia-titulo').textContent = `Día ${dia}: ${c.titulo || ''}`;

    // Explicación
    $('dia-explicacion').innerHTML = simpleMarkdown(c.explicacion || '');

    // Conceptos clave
    const conceptos = c.conceptos_clave || [];
    $('dia-conceptos').innerHTML = conceptos.map(c =>
        `<span class="concepto-tag">${c}</span>`
    ).join('');
    $('seccion-conceptos').style.display = conceptos.length > 0 ? 'block' : 'none';

    // Ejemplos
    const ejemplos = c.ejemplos || [];
    $('dia-ejemplos').innerHTML = ejemplos.map(ej => `
        <div class="ejemplo-card">
            <h4>${ej.titulo || 'Ejemplo'}</h4>
            <div class="ejemplo-enunciado">${ej.enunciado || ''}</div>
            <div class="ejemplo-desarrollo">${ej.desarrollo || ''}</div>
            <div class="ejemplo-resultado">→ ${ej.resultado || ''}</div>
        </div>
    `).join('');
    $('seccion-ejemplos').style.display = ejemplos.length > 0 ? 'block' : 'none';

    // Ejercicios
    const ejercicios = c.ejercicios || [];
    $('dia-ejercicios').innerHTML = ejercicios.map((ej, i) => {
        const esMultiple = ej.tipo === 'opcion_multiple' && ej.opciones && ej.opciones.length > 0;

        let inputHTML;
        if (esMultiple) {
            inputHTML = `
                <div class="ejercicio-opciones" id="opciones-${i}">
                    ${ej.opciones.map((op, j) => `
                        <div class="opcion-item" onclick="seleccionarOpcion(${i}, ${j}, this)">
                            <div class="opcion-radio"></div>
                            <span>${op}</span>
                        </div>
                    `).join('')}
                </div>
                <input type="hidden" id="resp-${i}" value="">
            `;
        } else {
            inputHTML = `
                <div class="ejercicio-input-area">
                    <input type="text" id="resp-${i}" placeholder="Escribe tu respuesta..."
                           onkeypress="if(event.key==='Enter')verificarRespuesta(${i})">
                    <button class="btn btn-primary" onclick="verificarRespuesta(${i})">Verificar</button>
                </div>
            `;
        }

        return `
            <div class="ejercicio-card" id="ejercicio-${i}">
                <div class="ejercicio-num">
                    Ejercicio ${i + 1}
                    <button class="btn-pista" onclick="mostrarPista(${i})">💡 Pista</button>
                </div>
                <div class="ejercicio-enunciado">${ej.enunciado || ''}</div>
                <div class="ejercicio-pista" id="pista-${i}">${ej.pista || 'Sin pista disponible'}</div>
                ${inputHTML}
                ${esMultiple ? `<button class="btn btn-primary" style="margin-top:12px;" onclick="verificarRespuesta(${i})">Verificar</button>` : ''}
                <div class="ejercicio-feedback" id="feedback-${i}" style="display:none;"></div>
            </div>
        `;
    }).join('');
    $('seccion-ejercicios').style.display = ejercicios.length > 0 ? 'block' : 'none';

    // Dato curioso
    $('dia-dato').textContent = c.dato_curioso || '';
    $('seccion-dato').style.display = c.dato_curioso ? 'block' : 'none';

    // Scroll arriba
    $('main-content').scrollTop = 0;
}

// ═══ EJERCICIOS ═════════════════════════════════════
function seleccionarOpcion(ejercicioIdx, opcionIdx, element) {
    // Deseleccionar todas las opciones de este ejercicio
    const container = $(`opciones-${ejercicioIdx}`);
    container.querySelectorAll('.opcion-item').forEach(op => op.classList.remove('selected'));
    element.classList.add('selected');

    // Guardar respuesta
    const opciones = container.querySelectorAll('.opcion-item span');
    $(`resp-${ejercicioIdx}`).value = opciones[opcionIdx].textContent.trim();
}

function mostrarPista(idx) {
    const pista = $(`pista-${idx}`);
    pista.classList.toggle('visible');
}

async function verificarRespuesta(idx) {
    const respuesta = $(`resp-${idx}`).value.trim();
    if (!respuesta) {
        toast('Escribe una respuesta primero', 'error');
        return;
    }

    const feedbackEl = $(`feedback-${idx}`);
    const ejercicioEl = $(`ejercicio-${idx}`);
    feedbackEl.style.display = 'block';
    feedbackEl.innerHTML = '<span class="spinner"></span> Verificando...';
    feedbackEl.className = 'ejercicio-feedback';

    try {
        const resultado = await api('/api/verificar', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                dia: state.diaActual,
                ejercicio_index: idx,
                respuesta: respuesta,
            },
        });

        const correcto = resultado.correcto;
        ejercicioEl.classList.add(correcto ? 'correcto' : 'incorrecto');

        feedbackEl.className = `ejercicio-feedback ${correcto ? 'feedback-correcto' : 'feedback-incorrecto'}`;
        feedbackEl.innerHTML = `
            <strong>${correcto ? '✅ ¡Correcto!' : '❌ Incorrecto'}</strong>
            ${resultado.feedback ? `<div class="feedback-detail">${resultado.feedback}</div>` : ''}
            ${resultado.respuesta_correcta ? `<div class="feedback-detail"><strong>Respuesta correcta:</strong> ${resultado.respuesta_correcta}</div>` : ''}
            ${resultado.explicacion_paso_a_paso ? `<div class="feedback-detail"><strong>Explicación:</strong> ${resultado.explicacion_paso_a_paso}</div>` : ''}
            ${resultado.consejo ? `<div class="feedback-detail">💡 ${resultado.consejo}</div>` : ''}
        `;

        actualizarBarraProgreso();
    } catch (err) {
        feedbackEl.className = 'ejercicio-feedback feedback-incorrecto';
        feedbackEl.innerHTML = `Error al verificar: ${err.message}`;
    }
}

// ═══ QUIZ ═══════════════════════════════════════════
async function generarQuiz() {
    if (!state.sessionId || !state.diaActual) return;

    showLoading('📝 Generando mini prueba...');

    try {
        const data = await api('/api/quiz', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                dia: state.diaActual,
            },
        });

        state.quizActual = data.quiz;
        mostrarQuiz(data.quiz);
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function mostrarQuiz(quiz) {
    $('welcome-plan').style.display = 'none';
    $('dia-contenido').style.display = 'none';
    $('quiz-contenido').style.display = 'block';
    $('quiz-resultado').style.display = 'none';
    $('btn-enviar-quiz').style.display = 'block';

    $('quiz-titulo').textContent = quiz.titulo || 'Mini Prueba';

    const preguntas = quiz.preguntas || [];
    $('quiz-preguntas').innerHTML = preguntas.map((p, i) => {
        const dificultad = p.dificultad || 'media';
        return `
            <div class="quiz-pregunta" data-id="${p.id}">
                <div class="quiz-pregunta-num">Pregunta ${i + 1}</div>
                <span class="dificultad ${dificultad}">${dificultad}</span>
                <div class="quiz-pregunta-text">${p.pregunta}</div>
                <div class="ejercicio-opciones" id="quiz-opciones-${i}">
                    ${(p.opciones || []).map((op, j) => `
                        <div class="opcion-item" onclick="seleccionarQuizOpcion(${i}, ${j}, this)">
                            <div class="opcion-radio"></div>
                            <span>${op}</span>
                        </div>
                    `).join('')}
                </div>
                <input type="hidden" id="quiz-resp-${i}" value="">
            </div>
        `;
    }).join('');

    // Timer
    const tiempoMin = quiz.tiempo_limite_minutos || 15;
    iniciarTimer(tiempoMin * 60);
}

function seleccionarQuizOpcion(preguntaIdx, opcionIdx, element) {
    const container = $(`quiz-opciones-${preguntaIdx}`);
    container.querySelectorAll('.opcion-item').forEach(op => op.classList.remove('selected'));
    element.classList.add('selected');

    // Extraer solo la letra (a, b, c, d)
    const texto = element.querySelector('span').textContent.trim();
    const letra = texto.charAt(0).toLowerCase();
    $(`quiz-resp-${preguntaIdx}`).value = letra;
}

function iniciarTimer(seconds) {
    state.timerSeconds = seconds;
    const timerEl = $('quiz-timer');
    const displayEl = $('timer-display');
    timerEl.style.display = 'flex';
    timerEl.classList.remove('urgent');

    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
        state.timerSeconds--;
        const min = Math.floor(state.timerSeconds / 60);
        const sec = state.timerSeconds % 60;
        displayEl.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

        if (state.timerSeconds <= 60) {
            timerEl.classList.add('urgent');
        }

        if (state.timerSeconds <= 0) {
            clearInterval(state.timerInterval);
            toast('⏰ ¡Se acabó el tiempo!', 'error');
            enviarQuiz();
        }
    }, 1000);
}

async function enviarQuiz() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    $('quiz-timer').style.display = 'none';

    const quiz = state.quizActual;
    if (!quiz || !quiz.preguntas) return;

    const respuestas = quiz.preguntas.map((p, i) => ({
        pregunta_id: p.id,
        respuesta: $(`quiz-resp-${i}`) ? $(`quiz-resp-${i}`).value : '',
        pregunta: p.pregunta,
        respuesta_correcta: p.respuesta_correcta,
    }));

    showLoading('📊 Corrigiendo tu prueba...');

    try {
        const resultado = await api('/api/quiz/corregir', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                dia: state.diaActual,
                respuestas: respuestas,
            },
        });

        mostrarResultadoQuiz(resultado);
        actualizarBarraProgreso();
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        hideLoading();
    }
}

function mostrarResultadoQuiz(resultado) {
    $('btn-enviar-quiz').style.display = 'none';
    const resEl = $('quiz-resultado');
    resEl.style.display = 'block';

    const puntaje = resultado.puntaje_total || 0;
    const scoreClass = puntaje >= 70 ? 'bueno' : puntaje >= 40 ? 'regular' : 'malo';

    const detalle = (resultado.detalle || []).map(d => `
        <div class="quiz-detalle-item ${d.correcto ? 'correcto' : 'incorrecto'}">
            <span class="quiz-detalle-icon">${d.correcto ? '✅' : '❌'}</span>
            <span>${d.feedback || (d.correcto ? 'Correcto' : 'Incorrecto')}</span>
        </div>
    `).join('');

    const debilidades = (resultado.debilidades || []).map(d =>
        `<span class="tag-debilidad">${d}</span>`
    ).join('');

    const fortalezas = (resultado.fortalezas || []).map(f =>
        `<span class="tag-fortaleza">${f}</span>`
    ).join('');

    resEl.innerHTML = `
        <div class="card quiz-resultado-card slide-in">
            <div class="quiz-score ${scoreClass}">${puntaje}%</div>
            <p style="color:var(--text-muted);">Puntaje obtenido</p>

            <div class="quiz-stats">
                <div class="quiz-stat">
                    <div class="stat-value">${resultado.correctas || 0}</div>
                    <div class="stat-label">Correctas</div>
                </div>
                <div class="quiz-stat">
                    <div class="stat-value">${resultado.total || 0}</div>
                    <div class="stat-label">Total</div>
                </div>
            </div>

            ${resultado.recomendacion ? `<p style="color:var(--text-muted);margin:16px 0;font-style:italic;">💡 ${resultado.recomendacion}</p>` : ''}

            <div class="quiz-detalle">${detalle}</div>

            ${debilidades ? `
                <div class="quiz-debilidades">
                    <h4>⚠️ Áreas a reforzar</h4>
                    <div class="quiz-tags">${debilidades}</div>
                </div>
            ` : ''}

            ${fortalezas ? `
                <div class="quiz-fortalezas" style="margin-top:16px;">
                    <h4>💪 Fortalezas</h4>
                    <div class="quiz-tags">${fortalezas}</div>
                </div>
            ` : ''}

            <button class="btn btn-outline" style="margin-top:20px;" onclick="seleccionarDia(${state.diaActual})">
                ← Volver al contenido del día
            </button>
        </div>
    `;
}

// ═══ CHAT TUTOR ═════════════════════════════════════
function showChat() {
    $('modal-chat').classList.add('active');
    $('chat-input').focus();
}

function closeChat() {
    $('modal-chat').classList.remove('active');
}

async function enviarChat() {
    const input = $('chat-input');
    const mensaje = input.value.trim();
    if (!mensaje || !state.sessionId) return;

    input.value = '';

    const messagesEl = $('chat-messages');

    // Mensaje del usuario
    messagesEl.innerHTML += `
        <div class="chat-msg usuario">
            <div class="msg-avatar">👤</div>
            <div class="msg-bubble">${mensaje}</div>
        </div>
    `;

    // Indicador de escritura
    const typingId = 'typing-' + Date.now();
    messagesEl.innerHTML += `
        <div class="chat-msg tutor" id="${typingId}">
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble"><span class="spinner"></span> Pensando...</div>
        </div>
    `;
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
        const data = await api('/api/chat', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                mensaje: mensaje,
            },
        });

        // Reemplazar indicador con respuesta
        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            typingEl.querySelector('.msg-bubble').innerHTML = simpleMarkdown(data.respuesta);
        }
    } catch (err) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            typingEl.querySelector('.msg-bubble').innerHTML = `Error: ${err.message}`;
        }
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ═══ CHATBOT DE LECCIÓN ═════════════════════════════
function toggleChatbot() {
    const body = $('chatbot-body');
    const icon = $('chatbot-toggle-icon');
    const isOpen = body.style.display !== 'none';

    body.style.display = isOpen ? 'none' : 'block';
    icon.classList.toggle('open', !isOpen);

    if (!isOpen) {
        $('chatbot-input').focus();
    }
}

function resetChatbotLeccion() {
    const messagesEl = $('chatbot-messages');
    messagesEl.innerHTML = `
        <div class="chat-msg tutor">
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble">¡Hola! Si tienes alguna duda sobre esta lección, pregúntame lo que quieras. Estoy aquí para ayudarte 😊</div>
        </div>
    `;
    $('chatbot-body').style.display = 'none';
    $('chatbot-toggle-icon').classList.remove('open');
}

async function enviarChatLeccion() {
    const input = $('chatbot-input');
    const mensaje = input.value.trim();
    if (!mensaje || !state.sessionId) return;

    input.value = '';

    const messagesEl = $('chatbot-messages');
    const btnText = $('chatbot-btn-text');
    const btnLoading = $('chatbot-btn-loading');

    // Mensaje del usuario
    messagesEl.innerHTML += `
        <div class="chat-msg usuario">
            <div class="msg-avatar">👤</div>
            <div class="msg-bubble">${mensaje}</div>
        </div>
    `;

    // Indicador de escritura
    const typingId = 'chatbot-typing-' + Date.now();
    messagesEl.innerHTML += `
        <div class="chat-msg tutor" id="${typingId}">
            <div class="msg-avatar">🤖</div>
            <div class="msg-bubble"><span class="spinner"></span> Pensando...</div>
        </div>
    `;
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Deshabilitar input mientras responde
    input.disabled = true;
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-block';

    try {
        const contexto = state.diaActual ? ` (Estoy en el día ${state.diaActual} de la lección)` : '';
        const data = await api('/api/chat', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                mensaje: mensaje + contexto,
            },
        });

        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            typingEl.querySelector('.msg-bubble').innerHTML = simpleMarkdown(data.respuesta);
        }
    } catch (err) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) {
            typingEl.querySelector('.msg-bubble').innerHTML = `❌ Error: ${err.message}`;
        }
    }

    // Rehabilitar input
    input.disabled = false;
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    input.focus();
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ═══ PROGRESO ═══════════════════════════════════════
function showProgress() {
    $('modal-progreso').classList.add('active');
    cargarProgreso();
}

function closeProgress() {
    $('modal-progreso').classList.remove('active');
}

async function cargarProgreso() {
    if (!state.sessionId) return;

    const contenido = $('progreso-contenido');
    contenido.innerHTML = '<div style="text-align:center;padding:40px;"><span class="spinner"></span> Cargando progreso...</div>';

    try {
        const p = await api(`/api/progreso/${state.sessionId}`);

        const debilidades = (p.debilidades || []).map(d =>
            `<span class="tag-debilidad">${d}</span>`
        ).join('') || '<span style="color:var(--text-dim)">Ninguna identificada aún</span>';

        const fortalezas = (p.fortalezas || []).map(f =>
            `<span class="tag-fortaleza">${f}</span>`
        ).join('') || '<span style="color:var(--text-dim)">Ninguna identificada aún</span>';

        contenido.innerHTML = `
            <div class="progreso-header">
                <div class="dominio-circle">
                    <div class="dominio-value">${p.porcentaje_dominio || 0}%</div>
                    <div class="dominio-label">Dominio</div>
                </div>
            </div>

            <div class="progreso-section">
                <h4>📈 Avance del Plan</h4>
                <div class="progress-bar-full">
                    <div class="fill" style="width:${p.porcentaje_avance || 0}%"></div>
                </div>
            </div>

            <div class="progreso-stats">
                <div class="stat-card">
                    <div class="stat-icon">📅</div>
                    <div class="stat-value">${p.dias_completados || 0}/${p.total_dias || 0}</div>
                    <div class="stat-label">Días completados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-value">${p.precision || 0}%</div>
                    <div class="stat-label">Precisión</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div class="stat-value">${p.quizzes_realizados || 0}</div>
                    <div class="stat-label">Quizzes realizados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-value">${p.tiempo_estudio_estimado || 0}m</div>
                    <div class="stat-label">Tiempo estimado</div>
                </div>
            </div>

            <div class="progreso-stats">
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-value">${p.total_respuestas || 0}</div>
                    <div class="stat-label">Ejercicios resueltos</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🏆</div>
                    <div class="stat-value">${p.promedio_quizzes || 0}%</div>
                    <div class="stat-label">Promedio quizzes</div>
                </div>
            </div>

            <div class="progreso-section">
                <h4>⚠️ Debilidades</h4>
                <div class="quiz-tags">${debilidades}</div>
            </div>

            <div class="progreso-section" style="margin-top:16px;">
                <h4>💪 Fortalezas</h4>
                <div class="quiz-tags">${fortalezas}</div>
            </div>
        `;
    } catch (err) {
        contenido.innerHTML = `<p style="text-align:center;color:var(--danger)">Error al cargar progreso: ${err.message}</p>`;
    }
}

async function actualizarBarraProgreso() {
    if (!state.sessionId) return;
    try {
        const p = await api(`/api/progreso/${state.sessionId}`);
        const pct = p.porcentaje_avance || 0;
        $('progress-bar-mini').style.width = `${pct}%`;
        $('progress-text-mini').textContent = `${pct}%`;

        // Marcar días completados en sidebar
        const completados = p.dias_completados_lista || [];
        // También actualizar basado en días_completados count
    } catch (e) {
        // Silenciar error
    }
}

// ═══ NAVEGACIÓN ═════════════════════════════════════
function goHome() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    showScreen('screen-home');
    cargarSesiones();
    state.sessionId = null;
    state.plan = null;
    state.diaActual = null;
    state.quizActual = null;
}
