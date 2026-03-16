/**
 * 📚 EstudioIA - Lógica Principal del Frontend
 * Maneja todas las interacciones de la UI y comunicación con el backend
 */

// ═══ ESTADO GLOBAL ══════════════════════════════════
let state = {
    sessionId: null,
    plan: null,
    diaActual: null,
    contenidoDia: null,
    quizActual: null,
    timerInterval: null,
    timerSeconds: 0,
    user: null,
    token: null,
};

// ═══ UTILIDADES ═════════════════════════════════════
const API = '';

async function api(endpoint, options = {}) {
    const url = `${API}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };
    // Adjuntar token de autenticación si existe
    if (state.token) {
        headers['Authorization'] = `Bearer ${state.token}`;
    }
    const config = {
        headers,
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

/**
 * Renderiza fórmulas LaTeX/KaTeX en un elemento del DOM.
 * Busca expresiones entre $...$ (inline) y $$...$$ (bloque)
 * También detecta \frac, \sqrt, etc. sueltos y los envuelve.
 */
function renderMath(element) {
    if (!element || typeof renderMathInElement !== 'function') return;
    try {
        // Pre-proceso: envolver comandos LaTeX sueltos (sin $) en delimitadores
        wrapBareLatex(element);

        renderMathInElement(element, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true },
            ],
            throwOnError: false,
            trust: true,
        });
    } catch (e) {
        console.log('KaTeX render error:', e);
    }
}

/**
 * Detecta comandos LaTeX sueltos (no envueltos en $) y los envuelve.
 * Ej: \frac{a}{b} → $\frac{a}{b}$
 */
function wrapBareLatex(element) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const nodesToReplace = [];

    while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent;
        // Detectar comandos LaTeX sueltos que no estén ya entre $
        if (/\\(?:frac|sqrt|int|sum|prod|lim|infty|partial|nabla|alpha|beta|gamma|delta|theta|pi|sigma|omega|text|mathrm|mathbf|left|right|begin|end|cdot|times|div|pm|leq|geq|neq|approx|vec|hat|bar|dot)\b/.test(text) && !(/\$/.test(text))) {
            nodesToReplace.push(node);
        }
    }

    nodesToReplace.forEach(node => {
        const text = node.textContent;
        // Envolver toda la línea con contenido LaTeX en $...$
        const wrapped = text.replace(/((?:\\[a-zA-Z]+(?:\{[^}]*\})*(?:\s*\\[a-zA-Z]+(?:\{[^}]*\})*)*(?:\s*[=+\-<>]?\s*\d*\.?\d*)*)+)/g, (match) => {
            if (/\\[a-zA-Z]/.test(match)) {
                return '$' + match.trim() + '$';
            }
            return match;
        });
        if (wrapped !== text) {
            const span = document.createElement('span');
            span.innerHTML = wrapped;
            node.parentNode.replaceChild(span, node);
        }
    });
}

/**
 * Renderiza KaTeX en todos los contenidos dinámicos de la página.
 */
function renderAllMath() {
    const targets = [
        'dia-explicacion', 'dia-ejemplos', 'dia-ejercicios',
        'dia-conceptos', 'dia-dato', 'chat-messages',
        'chatbot-messages', 'quiz-preguntas', 'quiz-resultado',
    ];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) renderMath(el);
    });
}

// ═══ INICIO ═════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    // Configurar formularios de auth
    $('form-login').addEventListener('submit', handleLogin);
    $('form-register').addEventListener('submit', handleRegister);
    $('form-plan').addEventListener('submit', crearPlan);

    // Verificar si hay sesión guardada
    checkSavedAuth();
});

// ═══ AUTENTICACIÓN ══════════════════════════════════
function switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
    $('form-login').style.display = tab === 'login' ? 'block' : 'none';
    $('form-register').style.display = tab === 'register' ? 'block' : 'none';
    $('login-error').textContent = '';
    $('register-error').textContent = '';
}

async function handleLogin(e) {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    $('login-error').textContent = '';

    try {
        const data = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const result = await data.json();

        if (!data.ok) {
            $('login-error').textContent = result.detail || 'Error al iniciar sesión';
            return;
        }

        // Guardar sesión
        state.token = result.token;
        state.user = { id: result.id, nombre: result.nombre, email: result.email };
        localStorage.setItem('estudioia_token', result.token);
        localStorage.setItem('estudioia_user', JSON.stringify(state.user));

        enterApp();
    } catch (err) {
        $('login-error').textContent = 'Error de conexión. Intenta de nuevo.';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const nombre = $('reg-nombre').value.trim();
    const email = $('reg-email').value.trim();
    const password = $('reg-password').value;
    const password2 = $('reg-password2').value;
    $('register-error').textContent = '';

    if (password !== password2) {
        $('register-error').textContent = 'Las contraseñas no coinciden';
        return;
    }

    try {
        const data = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, email, password }),
        });
        const result = await data.json();

        if (!data.ok) {
            $('register-error').textContent = result.detail || 'Error al crear cuenta';
            return;
        }

        // Auto-login después de registro
        state.token = result.token;
        state.user = { id: result.id, nombre: result.nombre, email: result.email };
        localStorage.setItem('estudioia_token', result.token);
        localStorage.setItem('estudioia_user', JSON.stringify(state.user));

        toast('¡Cuenta creada con éxito! 🎉', 'success');
        enterApp();
    } catch (err) {
        $('register-error').textContent = 'Error de conexión. Intenta de nuevo.';
    }
}

async function checkSavedAuth() {
    const savedToken = localStorage.getItem('estudioia_token');
    const savedUser = localStorage.getItem('estudioia_user');

    if (savedToken && savedUser) {
        state.token = savedToken;
        state.user = JSON.parse(savedUser);

        // Verificar que el token siga siendo válido
        try {
            const res = await fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${savedToken}` },
            });
            if (res.ok) {
                enterApp();
                return;
            }
        } catch (e) {
            // Token inválido
        }
        // Limpiar si el token es inválido
        localStorage.removeItem('estudioia_token');
        localStorage.removeItem('estudioia_user');
        state.token = null;
        state.user = null;
    }

    // Mostrar pantalla de auth
    showScreen('screen-auth');
}

function enterApp() {
    // Actualizar saludo
    $('user-greeting').textContent = `👋 ¡Hola, ${state.user.nombre}!`;
    showScreen('screen-home');
    cargarSesiones();
}

function logout() {
    state.token = null;
    state.user = null;
    state.sessionId = null;
    state.plan = null;
    localStorage.removeItem('estudioia_token');
    localStorage.removeItem('estudioia_user');
    showScreen('screen-auth');
    // Limpiar formularios
    $('login-email').value = '';
    $('login-password').value = '';
    $('reg-nombre').value = '';
    $('reg-email').value = '';
    $('reg-password').value = '';
    $('reg-password2').value = '';
    $('login-error').textContent = '';
    $('register-error').textContent = '';
    toast('Sesión cerrada', 'info');
}

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
        state.contenidoDia = data.contenido;
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
        const tipo = ej.tipo || 'abierta';
        const tipoBadge = {
            'opcion_multiple': '📋 Opción múltiple',
            'abierta': '✍️ Respuesta abierta',
            'verdadero_falso': '✅ Verdadero o Falso',
            'completar': '📝 Completar',
            'ordenar': '🔢 Ordenar',
            'dibujo': '🎨 Dibujo',
        };

        let inputHTML = renderEjercicioInput(ej, i);

        return `
            <div class="ejercicio-card" id="ejercicio-${i}">
                <div class="ejercicio-num">
                    Ejercicio ${i + 1}
                    <span class="ejercicio-tipo-badge badge-${tipo}">${tipoBadge[tipo] || tipo}</span>
                    <button class="btn-pista" onclick="mostrarPista(${i})">💡 Pista</button>
                </div>
                <div class="ejercicio-enunciado">${ej.enunciado || ''}</div>
                <div class="ejercicio-pista" id="pista-${i}">${ej.pista || 'Sin pista disponible'}</div>
                ${inputHTML}
                <button class="btn btn-primary" style="margin-top:12px;" onclick="verificarRespuesta(${i})">Verificar</button>
                <div class="ejercicio-feedback" id="feedback-${i}" style="display:none;"></div>
            </div>
        `;
    }).join('');

    // Inicializar canvases de dibujo
    ejercicios.forEach((ej, i) => {
        if (ej.tipo === 'dibujo') {
            setTimeout(() => initCanvas(i), 100);
        }
        if (ej.tipo === 'ordenar') {
            setTimeout(() => initSortable(i), 100);
        }
        // Auto-abrir teclados especiales
        if (ej.teclado_especial) {
            setTimeout(() => {
                const body = $(`teclado-body-${i}`);
                if (body) body.classList.add('visible');
            }, 100);
        }
    });

    $('seccion-ejercicios').style.display = ejercicios.length > 0 ? 'block' : 'none';

    // Dato curioso
    $('dia-dato').textContent = c.dato_curioso || '';
    $('seccion-dato').style.display = c.dato_curioso ? 'block' : 'none';

    // Renderizar fórmulas matemáticas
    setTimeout(() => renderAllMath(), 200);

    // Scroll arriba
    $('main-content').scrollTop = 0;
}

// ═══ RENDER EJERCICIO POR TIPO ══════════════════════
function renderEjercicioInput(ej, idx) {
    const tipo = ej.tipo || 'abierta';

    switch (tipo) {
        case 'opcion_multiple':
            return `
                <div class="ejercicio-opciones" id="opciones-${idx}">
                    ${(ej.opciones || []).map((op, j) => `
                        <div class="opcion-item" onclick="seleccionarOpcion(${idx}, ${j}, this)">
                            <div class="opcion-radio"></div>
                            <span>${op}</span>
                        </div>
                    `).join('')}
                </div>
                <input type="hidden" id="resp-${idx}" value="">
            `;

        case 'verdadero_falso':
            return `
                <div class="vf-opciones" id="vf-${idx}">
                    <button class="vf-btn vf-verdadero" onclick="seleccionarVF(${idx}, 'verdadero', this)">
                        ✅ Verdadero
                    </button>
                    <button class="vf-btn vf-falso" onclick="seleccionarVF(${idx}, 'falso', this)">
                        ❌ Falso
                    </button>
                </div>
                <input type="hidden" id="resp-${idx}" value="">
            `;

        case 'completar':
            const textoConBlancos = ej.texto_con_blancos || ej.enunciado || '';
            const partes = textoConBlancos.split('___');
            let completarHTML = '<div class="completar-texto">';
            partes.forEach((parte, j) => {
                completarHTML += parte;
                if (j < partes.length - 1) {
                    completarHTML += `<input type="text" class="blank-input" id="blank-${idx}-${j}" placeholder="..." data-ejercicio="${idx}">`;
                }
            });
            completarHTML += '</div>';
            completarHTML += `<input type="hidden" id="resp-${idx}" value="">`;
            const tecladoHTML_completar = renderTecladoEspecial(ej, idx);
            return completarHTML + tecladoHTML_completar;

        case 'ordenar':
            const items = ej.opciones || [];
            return `
                <div class="ordenar-container" id="ordenar-${idx}">
                    <div class="ordenar-items" id="ordenar-items-${idx}">
                        ${items.map((item, j) => `
                            <div class="ordenar-item" draggable="true" data-value="${item}" data-idx="${j}">
                                <span class="drag-handle">⠿</span>
                                <span class="order-num">${j + 1}</span>
                                <span class="item-text">${item}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <input type="hidden" id="resp-${idx}" value="">
            `;

        case 'dibujo':
            return `
                <div class="canvas-container" id="canvas-container-${idx}">
                    <div class="canvas-toolbar" id="canvas-toolbar-${idx}">
                        <div class="toolbar-group">
                            <label>Color:</label>
                            <button class="color-btn active" style="background:#000000" onclick="setCanvasColor(${idx}, '#000000', this)"></button>
                            <button class="color-btn" style="background:#e74c3c" onclick="setCanvasColor(${idx}, '#e74c3c', this)"></button>
                            <button class="color-btn" style="background:#3498db" onclick="setCanvasColor(${idx}, '#3498db', this)"></button>
                            <button class="color-btn" style="background:#2ecc71" onclick="setCanvasColor(${idx}, '#2ecc71', this)"></button>
                            <button class="color-btn" style="background:#f39c12" onclick="setCanvasColor(${idx}, '#f39c12', this)"></button>
                            <button class="color-btn" style="background:#9b59b6" onclick="setCanvasColor(${idx}, '#9b59b6', this)"></button>
                        </div>
                        <div class="toolbar-separator"></div>
                        <div class="toolbar-group">
                            <label>Grosor:</label>
                            <input type="range" min="1" max="20" value="3" onchange="setCanvasBrush(${idx}, this.value)">
                        </div>
                        <div class="toolbar-separator"></div>
                        <div class="toolbar-group">
                            <button class="tool-btn" onclick="setCanvasTool(${idx}, 'pen', this)">✏️ Lápiz</button>
                            <button class="tool-btn" onclick="setCanvasTool(${idx}, 'eraser', this)">🧹 Borrador</button>
                            <button class="tool-btn" onclick="clearCanvas(${idx})">🗑️ Limpiar</button>
                        </div>
                    </div>
                    <canvas class="drawing-canvas" id="canvas-${idx}" width="700" height="300"></canvas>
                    <div class="canvas-hint">🖱️ Dibuja aquí tu respuesta · La IA analizará directamente tu dibujo 🤖👁️</div>
                    <div class="canvas-describe">
                        <label for="canvas-desc-${idx}">📝 (Opcional) Describe brevemente tu dibujo para ayudar a la IA:</label>
                        <textarea id="canvas-desc-${idx}" class="canvas-desc-input" rows="2" placeholder="Ej: Dibujé un círculo dividido en 4 partes iguales y coloreé 3 de ellas..."></textarea>
                    </div>
                </div>
                <input type="hidden" id="resp-${idx}" value="">
            `;

        case 'abierta':
        default:
            const tecladoHTML_abierta = renderTecladoEspecial(ej, idx);
            return `
                <div class="ejercicio-input-area">
                    <input type="text" id="resp-${idx}" placeholder="Escribe tu respuesta..."
                           onkeypress="if(event.key==='Enter')verificarRespuesta(${idx})">
                </div>
                ${tecladoHTML_abierta}
            `;
    }
}

// ═══ TECLADO VIRTUAL ESPECIAL ═══════════════════════
/**
 * Renderiza un teclado virtual con caracteres especiales si el ejercicio lo requiere.
 * El ejercicio debe tener un campo teclado_especial: { titulo, caracteres: [[...], [...]] }
 */
function renderTecladoEspecial(ejercicio, idx) {
    const teclado = ejercicio.teclado_especial;
    if (!teclado || !teclado.caracteres || !Array.isArray(teclado.caracteres)) return '';

    const titulo = teclado.titulo || 'Teclado Especial';
    const filas = teclado.caracteres;

    let filasHTML = filas.map(fila => {
        if (!Array.isArray(fila)) return '';
        const teclas = fila.map(c => 
            `<button type="button" class="tecla-especial" onclick="insertarCaracter(${idx}, '${c.replace(/'/g, "\\'")}', '${ejercicio.tipo || 'abierta'}')">${c}</button>`
        ).join('');
        return `<div class="teclado-fila">${teclas}</div>`;
    }).join('');

    return `
        <div class="teclado-especial-container" id="teclado-${idx}">
            <div class="teclado-header" onclick="toggleTeclado(${idx})">
                <span>⌨️ ${titulo}</span>
                <span class="teclado-toggle">▼</span>
            </div>
            <div class="teclado-body" id="teclado-body-${idx}">
                <div class="teclado-filas">
                    ${filasHTML}
                </div>
                <div class="teclado-acciones">
                    <button type="button" class="btn-teclado-accion" onclick="tecladoBorrar(${idx}, '${ejercicio.tipo || 'abierta'}')">⌫ Borrar</button>
                    <button type="button" class="btn-teclado-accion" onclick="tecladoEspacio(${idx}, '${ejercicio.tipo || 'abierta'}')">␣ Espacio</button>
                    <button type="button" class="btn-teclado-accion btn-teclado-limpiar" onclick="tecladoLimpiar(${idx}, '${ejercicio.tipo || 'abierta'}')">🗑️ Limpiar</button>
                </div>
            </div>
        </div>
    `;
}

function toggleTeclado(idx) {
    const body = $(`teclado-body-${idx}`);
    if (body) {
        body.classList.toggle('visible');
    }
}

/** Determina el input activo para un ejercicio (soporte abierta y completar) */
function getTargetInput(idx, tipo) {
    if (tipo === 'completar') {
        // Para completar, buscar el último blank-input que tenga focus, o el primero vacío
        const blanks = document.querySelectorAll(`[id^="blank-${idx}-"]`);
        // Verificar si alguno tiene focus
        for (const b of blanks) {
            if (b === document.activeElement) return b;
        }
        // Si no, buscar el primero vacío
        for (const b of blanks) {
            if (!b.value.trim()) return b;
        }
        // Si todos llenos, devolver el último
        return blanks.length > 0 ? blanks[blanks.length - 1] : null;
    }
    return $(`resp-${idx}`);
}

function insertarCaracter(idx, caracter, tipo) {
    const input = getTargetInput(idx, tipo);
    if (!input) return;
    
    // Insertar en posición del cursor
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const val = input.value;
    input.value = val.substring(0, start) + caracter + val.substring(end);
    input.selectionStart = input.selectionEnd = start + caracter.length;
    input.focus();
}

function tecladoBorrar(idx, tipo) {
    const input = getTargetInput(idx, tipo);
    if (!input || !input.value) return;
    
    const start = input.selectionStart;
    const val = input.value;
    if (start > 0) {
        input.value = val.substring(0, start - 1) + val.substring(start);
        input.selectionStart = input.selectionEnd = start - 1;
    }
    input.focus();
}

function tecladoEspacio(idx, tipo) {
    insertarCaracter(idx, ' ', tipo);
}

function tecladoLimpiar(idx, tipo) {
    if (tipo === 'completar') {
        const blanks = document.querySelectorAll(`[id^="blank-${idx}-"]`);
        blanks.forEach(b => b.value = '');
        if (blanks.length > 0) blanks[0].focus();
    } else {
        const input = $(`resp-${idx}`);
        if (input) {
            input.value = '';
            input.focus();
        }
    }
}

// ═══ EJERCICIOS - INTERACCIONES ═════════════════════
function seleccionarOpcion(ejercicioIdx, opcionIdx, element) {
    const container = $(`opciones-${ejercicioIdx}`);
    container.querySelectorAll('.opcion-item').forEach(op => op.classList.remove('selected'));
    element.classList.add('selected');
    const opciones = container.querySelectorAll('.opcion-item span');
    $(`resp-${ejercicioIdx}`).value = opciones[opcionIdx].textContent.trim();
}

function seleccionarVF(ejercicioIdx, valor, element) {
    const container = $(`vf-${ejercicioIdx}`);
    container.querySelectorAll('.vf-btn').forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
    $(`resp-${ejercicioIdx}`).value = valor;
}

function recogerCompletarRespuesta(idx) {
    const blanks = document.querySelectorAll(`[id^="blank-${idx}-"]`);
    const valores = [];
    blanks.forEach(b => valores.push(b.value.trim()));
    return valores.join(', ');
}

function mostrarPista(idx) {
    const pista = $(`pista-${idx}`);
    pista.classList.toggle('visible');
}

// ═══ CANVAS DE DIBUJO ═══════════════════════════════
const canvasStates = {};

function initCanvas(idx) {
    const canvas = $(`canvas-${idx}`);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Ajustar tamaño real del canvas
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = 300;

    // Fondo blanco
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    canvasStates[idx] = {
        drawing: false,
        color: '#000000',
        brushSize: 3,
        tool: 'pen',
        ctx: ctx,
        canvas: canvas,
        lastX: 0,
        lastY: 0,
        hasDrawn: false,
        strokes: [],        // Array de trazos completos
        currentStroke: null, // Trazo en progreso
    };

    // Eventos de dibujo
    canvas.addEventListener('pointerdown', (e) => startDrawing(idx, e));
    canvas.addEventListener('pointermove', (e) => draw(idx, e));
    canvas.addEventListener('pointerup', () => stopDrawing(idx));
    canvas.addEventListener('pointerleave', () => stopDrawing(idx));
}

function getCanvasPos(idx, e) {
    const rect = canvasStates[idx].canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
    };
}

function startDrawing(idx, e) {
    const state = canvasStates[idx];
    state.drawing = true;
    state.hasDrawn = true;
    const pos = getCanvasPos(idx, e);
    state.lastX = pos.x;
    state.lastY = pos.y;

    // Iniciar nuevo trazo
    state.currentStroke = {
        points: [{ x: pos.x, y: pos.y }],
        color: state.tool === 'eraser' ? 'borrador' : state.color,
        tool: state.tool,
        brushSize: state.brushSize,
    };

    // Dibujar punto
    state.ctx.beginPath();
    state.ctx.arc(pos.x, pos.y, state.brushSize / 2, 0, Math.PI * 2);
    state.ctx.fillStyle = state.tool === 'eraser' ? '#ffffff' : state.color;
    state.ctx.fill();
}

function draw(idx, e) {
    const st = canvasStates[idx];
    if (!st.drawing) return;

    const pos = getCanvasPos(idx, e);

    // Registrar punto en trazo actual
    if (st.currentStroke) {
        st.currentStroke.points.push({ x: pos.x, y: pos.y });
    }

    st.ctx.beginPath();
    st.ctx.moveTo(st.lastX, st.lastY);
    st.ctx.lineTo(pos.x, pos.y);
    st.ctx.strokeStyle = st.tool === 'eraser' ? '#ffffff' : st.color;
    st.ctx.lineWidth = st.brushSize;
    st.ctx.lineCap = 'round';
    st.ctx.lineJoin = 'round';
    st.ctx.stroke();

    st.lastX = pos.x;
    st.lastY = pos.y;
}

function stopDrawing(idx) {
    if (canvasStates[idx]) {
        const st = canvasStates[idx];
        st.drawing = false;
        // Guardar trazo finalizado
        if (st.currentStroke && st.currentStroke.points.length > 0) {
            st.strokes.push(st.currentStroke);
            st.currentStroke = null;
        }
    }
}

function setCanvasColor(idx, color, btn) {
    canvasStates[idx].color = color;
    canvasStates[idx].tool = 'pen';
    // Actualizar UI
    const toolbar = $(`canvas-toolbar-${idx}`);
    toolbar.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
}

function setCanvasBrush(idx, size) {
    canvasStates[idx].brushSize = parseInt(size);
}

function setCanvasTool(idx, tool, btn) {
    canvasStates[idx].tool = tool;
    const toolbar = $(`canvas-toolbar-${idx}`);
    toolbar.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function clearCanvas(idx) {
    const st = canvasStates[idx];
    st.ctx.fillStyle = '#ffffff';
    st.ctx.fillRect(0, 0, st.canvas.width, st.canvas.height);
    st.hasDrawn = false;
    st.strokes = [];
    st.currentStroke = null;
}

// ═══ ANÁLISIS DE CANVAS PARA IA ═════════════════════

function analizarCanvas(canvas, strokes) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    let analysis = '';
    analysis += `Canvas: ${W}x${H} px\n`;

    // ═══ PARTE 1: ANÁLISIS DE TRAZOS (más importante) ═══
    // Filtrar trazos del borrador
    const realStrokes = (strokes || []).filter(s => s.tool !== 'eraser' && s.points.length >= 2);
    analysis += `Total de trazos dibujados: ${realStrokes.length}\n\n`;

    if (realStrokes.length > 0) {
        analysis += 'DETALLE DE CADA TRAZO (en orden cronológico):\n';
        analysis += '─'.repeat(60) + '\n';

        for (let i = 0; i < realStrokes.length; i++) {
            const s = realStrokes[i];
            const pts = s.points;
            const first = pts[0];
            const last = pts[pts.length - 1];

            // Normalizar coordenadas a porcentaje del canvas
            const x1 = (first.x / W * 100).toFixed(0);
            const y1 = (first.y / H * 100).toFixed(0);
            const x2 = (last.x / W * 100).toFixed(0);
            const y2 = (last.y / H * 100).toFixed(0);

            // Bounding box del trazo
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            const bboxW = ((maxX - minX) / W * 100).toFixed(0);
            const bboxH = ((maxY - minY) / H * 100).toFixed(0);

            // Longitud total del trazo
            let length = 0;
            for (let j = 1; j < pts.length; j++) {
                const dx = pts[j].x - pts[j - 1].x;
                const dy = pts[j].y - pts[j - 1].y;
                length += Math.sqrt(dx * dx + dy * dy);
            }

            // Clasificar forma del trazo
            const dx = last.x - first.x;
            const dy = last.y - first.y;
            const directDist = Math.sqrt(dx * dx + dy * dy);
            const sinuosity = directDist > 5 ? (length / directDist) : (length > 10 ? 99 : 1);

            let shape = '';
            if (pts.length <= 3 || length < 8) {
                shape = 'punto';
            } else if (sinuosity < 1.3) {
                // Línea recta - determinar dirección
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                if (Math.abs(angle) < 20 || Math.abs(angle) > 160) shape = 'línea horizontal';
                else if (Math.abs(Math.abs(angle) - 90) < 20) shape = dy > 0 ? 'línea vertical (↓)' : 'línea vertical (↑)';
                else if (angle > 20 && angle < 70) shape = 'línea diagonal (↘)';
                else if (angle > -70 && angle < -20) shape = 'línea diagonal (↗)';
                else if (angle > 110 && angle < 160) shape = 'línea diagonal (↙)';
                else shape = 'línea diagonal (↖)';
            } else if (sinuosity > 3) {
                // Muy sinuoso - posible bucle o curva cerrada
                const closeDist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
                if (closeDist < length * 0.15) shape = 'forma cerrada/circular';
                else shape = 'curva compleja/zigzag';
            } else {
                // Curva suave
                // Determinar dirección de la curva
                const mid = pts[Math.floor(pts.length / 2)];
                const midOffsetX = mid.x - (first.x + last.x) / 2;
                const midOffsetY = mid.y - (first.y + last.y) / 2;
                if (Math.abs(midOffsetX) > Math.abs(midOffsetY)) {
                    shape = midOffsetX > 0 ? 'curva hacia la derecha' : 'curva hacia la izquierda';
                } else {
                    shape = midOffsetY > 0 ? 'curva hacia abajo' : 'curva hacia arriba';
                }
            }

            // Detectar ganchos (cambio brusco de dirección al final)
            if (pts.length > 10) {
                const lastQuarter = pts.slice(Math.floor(pts.length * 0.75));
                if (lastQuarter.length > 3) {
                    const endDx = lastQuarter[lastQuarter.length - 1].x - lastQuarter[0].x;
                    const endDy = lastQuarter[lastQuarter.length - 1].y - lastQuarter[0].y;
                    const mainDx = pts[Math.floor(pts.length * 0.75)].x - pts[0].x;
                    const mainDy = pts[Math.floor(pts.length * 0.75)].y - pts[0].y;
                    const mainAngle = Math.atan2(mainDy, mainDx);
                    const endAngle = Math.atan2(endDy, endDx);
                    const angleDiff = Math.abs(mainAngle - endAngle) * 180 / Math.PI;
                    if (angleDiff > 60 && angleDiff < 300) {
                        shape += ' + gancho al final';
                    }
                }
            }

            // Posición relativa en canvas
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            let posicion = '';
            if (centerX < W * 0.33) posicion += 'izquierda';
            else if (centerX > W * 0.66) posicion += 'derecha';
            else posicion += 'centro';
            if (centerY < H * 0.33) posicion += '-arriba';
            else if (centerY > H * 0.66) posicion += '-abajo';
            else posicion += '-medio';

            const colorLabel = s.color === '#000000' ? 'negro' : s.color;
            analysis += `Trazo ${i + 1}: ${shape}\n`;
            analysis += `  Inicio: (${x1}%, ${y1}%) → Fin: (${x2}%, ${y2}%)\n`;
            analysis += `  Zona: ${posicion} | Color: ${colorLabel} | Tamaño: ${bboxW}%x${bboxH}%\n`;
            analysis += `  Longitud: ${length.toFixed(0)}px | Puntos: ${pts.length}\n`;

            // Describir trayectoria simplificada (samplear puntos clave)
            if (pts.length > 5) {
                const keyPoints = [];
                const step = Math.max(1, Math.floor(pts.length / 8));
                for (let k = 0; k < pts.length; k += step) {
                    keyPoints.push(`(${(pts[k].x / W * 100).toFixed(0)}%,${(pts[k].y / H * 100).toFixed(0)}%)`);
                }
                keyPoints.push(`(${(last.x / W * 100).toFixed(0)}%,${(last.y / H * 100).toFixed(0)}%)`);
                analysis += `  Trayectoria: ${keyPoints.join(' → ')}\n`;
            }
            analysis += '\n';
        }
    }

    // ═══ PARTE 2: MAPA VISUAL (alta resolución) ═══
    const imageData = ctx.getImageData(0, 0, W, H);
    const pixels = imageData.data;

    const gridRows = 30;
    const gridCols = 50;
    const cellW = Math.floor(W / gridCols);
    const cellH = Math.floor(H / gridRows);
    let grid = [];
    let totalPx = 0;
    let drawnPx = 0;

    for (let row = 0; row < gridRows; row++) {
        let gridRow = [];
        for (let col = 0; col < gridCols; col++) {
            let drawn = 0;
            let total = 0;
            const yS = row * cellH;
            const yE = Math.min((row + 1) * cellH, H);
            const xS = col * cellW;
            const xE = Math.min((col + 1) * cellW, W);

            for (let y = yS; y < yE; y++) {
                for (let x = xS; x < xE; x++) {
                    const i = (y * W + x) * 4;
                    total++;
                    totalPx++;
                    if (pixels[i] < 235 || pixels[i + 1] < 235 || pixels[i + 2] < 235) {
                        drawn++;
                        drawnPx++;
                    }
                }
            }
            const d = total > 0 ? drawn / total : 0;
            if (d > 0.5) gridRow.push('█');
            else if (d > 0.25) gridRow.push('▓');
            else if (d > 0.08) gridRow.push('░');
            else if (d > 0.015) gridRow.push('·');
            else gridRow.push(' ');
        }
        grid.push(gridRow.join(''));
    }

    const cob = totalPx > 0 ? (drawnPx / totalPx * 100).toFixed(1) : '0';
    analysis += `Cobertura total: ${cob}%\n\n`;
    analysis += 'MAPA VISUAL (50x30 celdas, █=denso ▓=medio ░=ligero ·=mínimo):\n';
    analysis += '┌' + '─'.repeat(gridCols) + '┐\n';
    for (const row of grid) {
        analysis += '│' + row + '│\n';
    }
    analysis += '└' + '─'.repeat(gridCols) + '┘\n';

    return analysis;
}

// ═══ ORDENAR (DRAG & DROP) ══════════════════════════
function initSortable(idx) {
    const container = $(`ordenar-items-${idx}`);
    if (!container) return;

    let draggedItem = null;

    container.querySelectorAll('.ordenar-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            updateOrderNumbers(idx);
            updateOrderResponse(idx);
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggedItem);
            } else {
                container.insertBefore(draggedItem, afterElement);
            }
        });
    });

    updateOrderResponse(idx);
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.ordenar-item:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function updateOrderNumbers(idx) {
    const container = $(`ordenar-items-${idx}`);
    container.querySelectorAll('.ordenar-item').forEach((item, i) => {
        item.querySelector('.order-num').textContent = i + 1;
    });
}

function updateOrderResponse(idx) {
    const container = $(`ordenar-items-${idx}`);
    const items = container.querySelectorAll('.ordenar-item');
    const order = [...items].map(item => item.dataset.value);
    $(`resp-${idx}`).value = order.join(', ');
}

// ═══ VERIFICAR RESPUESTA ════════════════════════════
async function verificarRespuesta(idx) {
    const ejercicio = (state.contenidoDia && state.contenidoDia.ejercicios) ? state.contenidoDia.ejercicios[idx] : null;
    const tipo = ejercicio ? (ejercicio.tipo || 'abierta') : 'abierta';

    // Recoger respuesta según tipo
    let respuesta = '';
    if (tipo === 'completar') {
        respuesta = recogerCompletarRespuesta(idx);
        $(`resp-${idx}`).value = respuesta;
    } else if (tipo === 'dibujo') {
        // Para dibujo, capturamos la imagen del canvas
        const st = canvasStates[idx];
        if (!st || !st.hasDrawn) {
            toast('Dibuja tu respuesta primero', 'error');
            return;
        }
        const descEl = $(`canvas-desc-${idx}`);
        const descripcion = descEl ? descEl.value.trim() : '';
        respuesta = descripcion || '[dibujo enviado]';
    } else {
        respuesta = $(`resp-${idx}`).value.trim();
    }

    if (!respuesta) {
        toast('Completa tu respuesta primero', 'error');
        return;
    }

    const feedbackEl = $(`feedback-${idx}`);
    const ejercicioEl = $(`ejercicio-${idx}`);
    feedbackEl.style.display = 'block';
    feedbackEl.innerHTML = '<span class="spinner"></span> Verificando...';
    feedbackEl.className = 'ejercicio-feedback';

    try {
        // Para ejercicios de dibujo, analizar el canvas y enviar análisis estructural
        if (tipo === 'dibujo') {
            const canvas = $(`canvas-${idx}`);
            
            // Generar análisis visual detallado del canvas
            feedbackEl.innerHTML = '<span class="spinner"></span> 🔍 Analizando tu dibujo...';
            const strokeData = canvasStates[idx] ? canvasStates[idx].strokes : [];
            const analisisDibujo = analizarCanvas(canvas, strokeData);
            
            feedbackEl.innerHTML = '<span class="spinner"></span> 🤖 La IA está evaluando tu dibujo...';

            const resultado = await api('/api/verificar', {
                method: 'POST',
                body: {
                    session_id: state.sessionId,
                    dia: state.diaActual,
                    ejercicio_index: idx,
                    respuesta: respuesta,
                    ejercicio_enunciado: ejercicio ? ejercicio.enunciado : '',
                    ejercicio_opciones: [],
                    ejercicio_respuesta_correcta: ejercicio ? (ejercicio.respuesta_correcta || '') : '',
                    analisis_dibujo: analisisDibujo,
                },
            });

            const correcto = resultado.correcto;
            ejercicioEl.classList.add(correcto ? 'correcto' : 'incorrecto');

            feedbackEl.className = `ejercicio-feedback ${correcto ? 'feedback-correcto' : 'feedback-incorrecto'}`;
            feedbackEl.innerHTML = `
                <strong>${correcto ? '✅ ¡Correcto!' : '❌ Tu dibujo necesita ajustes'}</strong>
                ${resultado.feedback ? `<div class="feedback-detail">${resultado.feedback}</div>` : ''}
                ${resultado.respuesta_correcta ? `<div class="feedback-detail"><strong>Lo esperado:</strong> ${resultado.respuesta_correcta}</div>` : ''}
                ${resultado.explicacion_paso_a_paso ? `<div class="feedback-detail"><strong>Explicación:</strong> ${resultado.explicacion_paso_a_paso}</div>` : ''}
                ${resultado.consejo ? `<div class="feedback-detail">💡 ${resultado.consejo}</div>` : ''}
                ${!correcto ? `<div class="feedback-detail">🎨 Puedes limpiar el canvas, corregir tu dibujo y verificar de nuevo.</div>` : ''}
            `;

            renderMath(feedbackEl);
            actualizarBarraProgreso();
            return;
        }

        const resultado = await api('/api/verificar', {
            method: 'POST',
            body: {
                session_id: state.sessionId,
                dia: state.diaActual,
                ejercicio_index: idx,
                respuesta: respuesta,
                ejercicio_enunciado: ejercicio ? ejercicio.enunciado : '',
                ejercicio_opciones: ejercicio ? (ejercicio.opciones || []) : [],
                ejercicio_respuesta_correcta: ejercicio ? (ejercicio.respuesta_correcta || '') : '',
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

        renderMath(feedbackEl);
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

    // Renderizar fórmulas en quiz
    setTimeout(() => renderMath($('quiz-preguntas')), 200);
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

    // Renderizar fórmulas en resultado del quiz
    setTimeout(() => renderMath($('quiz-resultado')), 200);
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
            renderMath(typingEl);
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
            renderMath(typingEl);
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
    state.contenidoDia = null;
    state.quizActual = null;
    // Mantener user y token
}
