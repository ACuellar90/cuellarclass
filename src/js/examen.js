// ============================================================
// CuellarClass — examen.js
// Sala de examen: banco aleatorio, timer, autocorreccion
// ============================================================

let SESSION = null;
let EXAMEN = null;
let INTENTO = null;
let PREGUNTAS = [];       // preguntas del snapshot asignado
let TIMER_INTERVAL = null;
let SEGUNDOS_RESTANTES = 0;
let RESPUESTAS = {};      // { pregunta_id: { opcion_id, texto } }

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = requireAuth(['alumno']);
  if (!SESSION) return;

  const params = new URLSearchParams(window.location.search);
  const examenId = params.get('id');
  if (!examenId) { window.location.href = '/dashboard.html'; return; }

  showLoading();
  try {
    await inicializarExamen(examenId);
  } catch (err) {
    console.error(err);
    showToast('Error al cargar el examen', 'error');
    setTimeout(() => window.location.href = '/dashboard.html', 2000);
  } finally {
    hideLoading();
  }
});

// ── INICIALIZAR ────────────────────────────────────────────
async function inicializarExamen(examenId) {
  // 1. Cargar examen
  const { data: examen, error: exErr } = await db
    .from('examenes')
    .select('*')
    .eq('id', examenId)
    .eq('activo', true)
    .single();

  if (exErr || !examen) throw new Error('Examen no encontrado o inactivo');
  EXAMEN = examen;

  // 2. Verificar intentos disponibles
  const { data: intentosAnteriores } = await db
    .from('intentos_examen')
    .select('id, completado, numero_intento, preguntas_snapshot')
    .eq('examen_id', examenId)
    .eq('alumno_id', SESSION.id)
    .order('numero_intento', { ascending: false });

  const numIntentos = intentosAnteriores?.length || 0;

  // Buscar intento en curso (no completado)
  const intentoEnCurso = intentosAnteriores?.find(i => !i.completado);

  if (!intentoEnCurso && numIntentos >= examen.intentos_max) {
    // Sin intentos disponibles, mostrar resultados
    mostrarResultadoFinal(intentosAnteriores[0]);
    return;
  }

  // 3. Crear o retomar intento
  if (intentoEnCurso) {
    INTENTO = intentoEnCurso;
    // Cargar respuestas ya guardadas
    const { data: respGuardadas } = await db
      .from('respuestas_intento')
      .select('*')
      .eq('intento_id', INTENTO.id);
    (respGuardadas || []).forEach(r => {
      RESPUESTAS[r.pregunta_id] = { opcion_id: r.opcion_id, texto: r.texto_respuesta };
    });
  } else {
    // Crear nuevo intento con snapshot aleatorio del banco
    const { data: todasPreguntas } = await db
      .from('preguntas')
      .select('id')
      .eq('examen_id', examenId);

    const shuffled = shuffle(todasPreguntas || []);
    const seleccionadas = shuffled.slice(0, examen.preguntas_por_intento);
    const snapshot = seleccionadas.map(p => p.id);

    const { data: nuevoIntento, error: intentoErr } = await db
      .from('intentos_examen')
      .insert({
        examen_id: examenId,
        alumno_id: SESSION.id,
        preguntas_snapshot: snapshot,
        numero_intento: numIntentos + 1,
      })
      .select()
      .single();

    if (intentoErr) throw intentoErr;
    INTENTO = nuevoIntento;
  }

  // 4. Cargar preguntas completas del snapshot
  const snapshotIds = INTENTO.preguntas_snapshot;
  const { data: preguntas } = await db
    .from('preguntas')
    .select('*, opciones(*), respuestas_correctas(*)')
    .in('id', snapshotIds);

  // Ordenar segun snapshot
  PREGUNTAS = snapshotIds.map(id => preguntas.find(p => p.id === id)).filter(Boolean);

  // 5. Renderizar examen
  renderExamen();

  // 6. Iniciar timer si aplica
  if (examen.tiempo_limite) {
    const transcurrido = Math.floor((Date.now() - new Date(INTENTO.fecha_inicio).getTime()) / 1000);
    SEGUNDOS_RESTANTES = Math.max(0, examen.tiempo_limite * 60 - transcurrido);
    if (SEGUNDOS_RESTANTES <= 0) { await finalizarExamen(); return; }
    iniciarTimer();
  }
}

// ── RENDER EXAMEN ──────────────────────────────────────────
function renderExamen() {
  document.getElementById('examen-titulo').textContent = EXAMEN.titulo;
  document.getElementById('alumno-nombre').textContent = SESSION.nombre;

  if (!EXAMEN.tiempo_limite) {
    document.getElementById('timer-wrap').style.display = 'none';
  }

  const container = document.getElementById('preguntas-container');
  container.innerHTML = PREGUNTAS.map((p, i) => renderPregunta(p, i)).join('');

  actualizarProgreso();
}

function renderPregunta(p, i) {
  const respActual = RESPUESTAS[p.id];
  let opcionesHtml = '';

  if (p.tipo === 'opcion_multiple') {
    const opts = [...(p.opciones || [])].sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const letras = ['A', 'B', 'C', 'D', 'E'];
    opcionesHtml = `<div class="option-list">
      ${opts.map((o, idx) => `
        <label class="option-item ${respActual?.opcion_id === o.id ? 'selected' : ''}" onclick="seleccionarOpcion('${p.id}','${o.id}',this)">
          <input type="radio" name="q_${p.id}" value="${o.id}" ${respActual?.opcion_id === o.id ? 'checked' : ''} style="display:none">
          <span class="badge badge-navy">${letras[idx] || idx+1}</span>
          ${o.texto}
        </label>`).join('')}
    </div>`;
  } else if (p.tipo === 'verdadero_falso') {
    const opts = p.opciones || [];
    opcionesHtml = `<div class="option-list" style="flex-direction:row">
      ${opts.map(o => `
        <label class="option-item ${respActual?.opcion_id === o.id ? 'selected' : ''}" style="flex:1;justify-content:center" onclick="seleccionarOpcion('${p.id}','${o.id}',this)">
          <input type="radio" name="q_${p.id}" value="${o.id}" ${respActual?.opcion_id === o.id ? 'checked' : ''} style="display:none">
          ${o.texto}
        </label>`).join('')}
    </div>`;
  } else if (p.tipo === 'respuesta_corta') {
    opcionesHtml = `<input type="text" class="form-input" id="rc_${p.id}" placeholder="Escribe tu respuesta aqui..."
      value="${respActual?.texto || ''}"
      oninput="guardarRespuestaCorta('${p.id}', this.value)"
      style="margin-top:8px">`;
  }

  const respondida = !!(respActual?.opcion_id || respActual?.texto);
  const tipoBadge = { opcion_multiple: 'Opcion multiple', verdadero_falso: 'Verdadero / Falso', respuesta_corta: 'Respuesta corta' };

  return `
    <div class="question-card ${respondida ? 'answered' : ''}" id="qcard_${p.id}">
      <div class="question-number">Pregunta ${i+1} de ${PREGUNTAS.length} — <span class="text-gray">${tipoBadge[p.tipo] || p.tipo}</span></div>
      <div class="question-text">${p.enunciado}</div>
      ${opcionesHtml}
    </div>
  `;
}

// ── INTERACCION ────────────────────────────────────────────
function seleccionarOpcion(preguntaId, opcionId, labelEl) {
  // Deseleccionar otros
  const card = document.getElementById(`qcard_${preguntaId}`);
  card.querySelectorAll('.option-item').forEach(el => el.classList.remove('selected'));
  labelEl.classList.add('selected');
  card.classList.add('answered');

  RESPUESTAS[preguntaId] = { opcion_id: opcionId, texto: null };
  actualizarProgreso();
  guardarRespuestaDB(preguntaId);
}

function guardarRespuestaCorta(preguntaId, valor) {
  const trimmed = valor.trim();
  RESPUESTAS[preguntaId] = { opcion_id: null, texto: trimmed };
  const card = document.getElementById(`qcard_${preguntaId}`);
  if (trimmed) card.classList.add('answered'); else card.classList.remove('answered');
  actualizarProgreso();
  clearTimeout(window._rcTimeout);
  window._rcTimeout = setTimeout(() => guardarRespuestaDB(preguntaId), 800);
}

async function guardarRespuestaDB(preguntaId) {
  const r = RESPUESTAS[preguntaId];
  if (!r) return;
  await db.from('respuestas_intento').upsert({
    intento_id: INTENTO.id,
    pregunta_id: preguntaId,
    opcion_id: r.opcion_id || null,
    texto_respuesta: r.texto || null,
  }, { onConflict: 'intento_id,pregunta_id' });
}

function actualizarProgreso() {
  const respondidas = Object.keys(RESPUESTAS).filter(id => {
    const r = RESPUESTAS[id];
    return r?.opcion_id || r?.texto;
  }).length;
  const pct = PREGUNTAS.length > 0 ? (respondidas / PREGUNTAS.length) * 100 : 0;
  document.getElementById('progress-fill').style.width = `${pct}%`;
  document.getElementById('progress-text').textContent = `${respondidas}/${PREGUNTAS.length} respondidas`;
}

// ── TIMER ─────────────────────────────────────────────────
function iniciarTimer() {
  actualizarDisplay();
  TIMER_INTERVAL = setInterval(async () => {
    SEGUNDOS_RESTANTES--;
    actualizarDisplay();
    if (SEGUNDOS_RESTANTES <= 0) {
      clearInterval(TIMER_INTERVAL);
      showToast('Tiempo agotado. Entregando examen...', 'error');
      await finalizarExamen();
    }
  }, 1000);
}

function actualizarDisplay() {
  const m = Math.floor(SEGUNDOS_RESTANTES / 60);
  const s = SEGUNDOS_RESTANTES % 60;
  const display = document.getElementById('timer-display');
  const wrap = document.getElementById('exam-timer');
  display.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  wrap.classList.toggle('warning', SEGUNDOS_RESTANTES <= 300 && SEGUNDOS_RESTANTES > 60);
  wrap.classList.toggle('danger',  SEGUNDOS_RESTANTES <= 60);
}

// ── FINALIZAR EXAMEN ───────────────────────────────────────
async function confirmarEntrega() {
  const respondidas = Object.values(RESPUESTAS).filter(r => r?.opcion_id || r?.texto).length;
  const sinResponder = PREGUNTAS.length - respondidas;
  if (sinResponder > 0) {
    if (!confirm(`Tienes ${sinResponder} pregunta(s) sin responder. ¿Entregar de todas formas?`)) return;
  }
  await finalizarExamen();
}

async function finalizarExamen() {
  if (TIMER_INTERVAL) clearInterval(TIMER_INTERVAL);
  showLoading();

  try {
    // Calcular nota
    let puntajeTotal = 0;
    let puntajeMax = 0;
    const updates = [];

    for (const p of PREGUNTAS) {
      puntajeMax += p.puntaje || 1;
      const r = RESPUESTAS[p.id];
      let esCorrecta = false;
      let puntajeObtenido = 0;

      if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
        if (r?.opcion_id) {
          const opcion = p.opciones?.find(o => o.id === r.opcion_id);
          esCorrecta = opcion?.es_correcta || false;
          if (esCorrecta) puntajeObtenido = p.puntaje || 1;
        }
      } else if (p.tipo === 'respuesta_corta') {
        if (r?.texto && p.respuestas_correctas?.length > 0) {
          const textoAlumno = r.texto.trim().toLowerCase();
          for (const rc of p.respuestas_correctas) {
            if (rc.es_exacta) {
              esCorrecta = textoAlumno === rc.texto.toLowerCase();
            } else {
              esCorrecta = textoAlumno.includes(rc.texto.toLowerCase());
            }
            if (esCorrecta) break;
          }
          if (esCorrecta) puntajeObtenido = p.puntaje || 1;
        }
      }

      puntajeTotal += puntajeObtenido;
      updates.push({
        intento_id: INTENTO.id,
        pregunta_id: p.id,
        opcion_id: r?.opcion_id || null,
        texto_respuesta: r?.texto || null,
        es_correcta: esCorrecta,
        puntaje_obtenido: puntajeObtenido,
      });
    }

    // Nota final escalada a nota_maxima
    const notaFinal = puntajeMax > 0
      ? parseFloat(((puntajeTotal / puntajeMax) * EXAMEN.nota_maxima).toFixed(2))
      : 0;

    // Guardar respuestas
    await db.from('respuestas_intento').upsert(updates, { onConflict: 'intento_id,pregunta_id' });

    // Actualizar intento
    await db.from('intentos_examen').update({
      fecha_fin: new Date().toISOString(),
      nota: notaFinal,
      completado: true,
    }).eq('id', INTENTO.id);

    hideLoading();
    mostrarResultadoFinal({ nota: notaFinal, puntajeTotal, puntajeMax }, updates);
  } catch (err) {
    console.error(err);
    hideLoading();
    showToast('Error al calcular nota', 'error');
  }
}

function mostrarResultadoFinal(datos, updates = []) {
  const nota = datos.nota;
  const nc = notaColor(nota, EXAMEN.nota_maxima);
  const correctas = updates.filter(u => u.es_correcta).length;

  document.getElementById('sala-examen').classList.add('hidden');
  document.getElementById('resultado-final').classList.remove('hidden');

  document.getElementById('resultado-body').innerHTML = `
    <div style="text-align:center;padding:32px 0">
      <div style="font-size:48px;margin-bottom:8px">
        ${nc === 'alta' ? '🎉' : nc === 'media' ? '👍' : '📚'}
      </div>
      <h2 style="font-family:var(--font-display);margin-bottom:8px">${EXAMEN.titulo}</h2>
      <div class="nota-circle ${nc}" style="width:100px;height:100px;font-size:2rem;margin:20px auto">
        ${nota}
      </div>
      <div style="font-size:18px;color:var(--gray-500);margin-bottom:8px">sobre ${EXAMEN.nota_maxima}</div>
      ${updates.length > 0
        ? `<div class="badge badge-${nc === 'alta' ? 'green' : nc === 'media' ? 'gold' : 'red'}" style="font-size:14px;padding:6px 16px;margin-bottom:20px">
            ${correctas} de ${PREGUNTAS.length} correctas
           </div>`
        : ''
      }
      <p style="color:var(--gray-500);font-size:14px">El examen ha sido enviado y calificado automaticamente.</p>
    </div>

    ${updates.length > 0 ? `
    <div style="border-top:1px solid var(--gray-100);padding-top:20px">
      <div class="label mb-3">Detalle de respuestas</div>
      ${PREGUNTAS.map((p, i) => {
        const u = updates.find(x => x.pregunta_id === p.id);
        if (!u) return '';
        const icon = u.es_correcta ? '✓' : '✕';
        const color = u.es_correcta ? 'var(--success)' : 'var(--danger)';
        let respuestaTexto = '';
        if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
          const opt = p.opciones?.find(o => o.id === u.opcion_id);
          respuestaTexto = opt?.texto || 'Sin respuesta';
          if (!u.es_correcta) {
            const correcta = p.opciones?.find(o => o.es_correcta);
            respuestaTexto += ` <span style="color:var(--success)">→ ${correcta?.texto || ''}</span>`;
          }
        } else {
          respuestaTexto = u.texto_respuesta || 'Sin respuesta';
          if (!u.es_correcta && p.respuestas_correctas?.[0]) {
            respuestaTexto += ` <span style="color:var(--success)">→ ${p.respuestas_correctas[0].texto}</span>`;
          }
        }
        return `
          <div style="padding:12px 0;border-bottom:1px solid var(--gray-100)">
            <div class="flex gap-1" style="align-items:flex-start">
              <span style="color:${color};font-weight:700;font-size:16px;flex-shrink:0">${icon}</span>
              <div>
                <div style="font-size:13px;font-weight:500;margin-bottom:4px">${i+1}. ${p.enunciado}</div>
                <div style="font-size:12px;color:var(--gray-500)">${respuestaTexto}</div>
              </div>
            </div>
          </div>`;
      }).join('')}
    </div>` : ''}
  `;
}

function volverDashboard() {
  window.location.href = '/dashboard.html';
}
