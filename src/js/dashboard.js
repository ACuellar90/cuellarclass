// ============================================================
// CuellarClass — dashboard.js
// Vista del alumno
// ============================================================

let SESSION = null;
let SECCION = null;
let MATERIA = null;

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = requireAuth(['alumno']);
  if (!SESSION) return;

  showLoading();
  try {
    await cargarDatosIniciales();
    renderSidebar();
    mostrarTab('inicio');
    initMobileSidebar();
  } catch (err) {
    console.error(err);
    showToast('Error al cargar datos', 'error');
  } finally {
    hideLoading();
  }
});

// ── DATOS INICIALES ────────────────────────────────────────
async function cargarDatosIniciales() {
  // Cargar seccion + materia del alumno
  const { data: seccion } = await db
    .from('secciones')
    .select('*, materias(*)')
    .eq('id', SESSION.seccion_id)
    .single();
  SECCION = seccion;
  MATERIA = seccion?.materias;

  // Actualizar nombre en topbar
  document.getElementById('topbar-titulo').textContent = MATERIA?.nombre || 'CuellarClass';
  document.getElementById('user-display-name').textContent = SESSION.nombre.split(' ')[0];
}

// ── SIDEBAR ────────────────────────────────────────────────
function renderSidebar() {
  const avatarWrap = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-name');
  const roleEl = document.getElementById('sidebar-role');
  avatarWrap.innerHTML = renderAvatar(SESSION.foto_url, SESSION.nombre, 36);
  nameEl.textContent = SESSION.nombre;
  roleEl.textContent = SECCION ? `Seccion ${SECCION.nombre}` : 'Alumno';
}

// ── NAVEGACION ─────────────────────────────────────────────
function mostrarTab(tab) {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });
  document.querySelectorAll('.page-section').forEach(el => {
    el.classList.toggle('hidden', el.id !== `section-${tab}`);
  });
  const titles = {
    inicio: 'Inicio',
    tareas: 'Tareas',
    examenes: 'Examenes',
    encuestas: 'Encuestas',
    foro: 'Foro de Dudas',
    notas: 'Mis Notas',
  };
  document.getElementById('topbar-titulo').textContent = titles[tab] || 'CuellarClass';
  loadSection(tab);
}

// ── LOADER POR SECCION ─────────────────────────────────────
const _loaded = {};
async function loadSection(tab) {
  if (_loaded[tab]) return;
  _loaded[tab] = true;
  switch (tab) {
    case 'inicio':    await renderInicio(); break;
    case 'tareas':    await renderTareas(); break;
    case 'examenes':  await renderExamenes(); break;
    case 'encuestas': await renderEncuestas(); break;
    case 'foro':      await renderForo(); break;
    case 'notas':     await renderNotas(); break;
  }
}

// ── INICIO ────────────────────────────────────────────────
async function renderInicio() {
  const el = document.getElementById('section-inicio');

  // Stats: tareas pendientes, examenes disponibles, posts sin leer
  const [{ count: tareasPend }, { count: examDisp }, { count: foroPosts }] = await Promise.all([
    db.from('tareas').select('*', { count: 'exact', head: true })
      .eq('seccion_id', SESSION.seccion_id).eq('activo', true),
    db.from('examenes').select('*', { count: 'exact', head: true })
      .eq('seccion_id', SESSION.seccion_id).eq('activo', true),
    db.from('foro_posts').select('*', { count: 'exact', head: true })
      .eq('seccion_id', SESSION.seccion_id),
  ]);

  // Proximas entregas
  const { data: proximas } = await db
    .from('tareas')
    .select('id, titulo, fecha_entrega')
    .eq('seccion_id', SESSION.seccion_id)
    .eq('activo', true)
    .gte('fecha_entrega', new Date().toISOString())
    .order('fecha_entrega', { ascending: true })
    .limit(4);

  el.innerHTML = `
    <div class="page-header">
      <h2>Hola, ${SESSION.nombre.split(' ')[0]} 👋</h2>
      <p>${MATERIA?.nombre || ''} — Seccion ${SECCION?.nombre || ''}</p>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">📋</div>
        <div class="stat-value">${tareasPend || 0}</div>
        <div class="stat-label">Tareas activas</div>
      </div>
      <div class="stat-card" style="border-left-color:#3b82f6">
        <div class="stat-icon">📝</div>
        <div class="stat-value">${examDisp || 0}</div>
        <div class="stat-label">Examenes disponibles</div>
      </div>
      <div class="stat-card" style="border-left-color:#3dba7f">
        <div class="stat-icon">💬</div>
        <div class="stat-value">${foroPosts || 0}</div>
        <div class="stat-label">Posts en el foro</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3>Proximas entregas</h3>
      </div>
      <div class="card-body">
        ${proximas && proximas.length > 0
          ? proximas.map(t => `
            <div class="flex-between mb-2" style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
              <div>
                <div class="fw-600" style="font-size:14px">${t.titulo}</div>
                <div class="text-gray" style="font-size:12px">Entrega: ${formatFecha(t.fecha_entrega)}</div>
              </div>
              <button class="btn btn-sm btn-outline" onclick="irATarea('${t.id}')">Ver</button>
            </div>`).join('')
          : '<div class="text-gray" style="font-size:14px">No hay entregas proximas.</div>'
        }
      </div>
    </div>
  `;
}

// ── TAREAS ────────────────────────────────────────────────
async function renderTareas() {
  const el = document.getElementById('section-tareas');
  el.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  const { data: tareas } = await db
    .from('tareas')
    .select('*')
    .eq('seccion_id', SESSION.seccion_id)
    .eq('activo', true)
    .order('fecha_entrega', { ascending: true });

  // Mis entregas
  const { data: entregas } = await db
    .from('entregas_tareas')
    .select('tarea_id, nota, calificado')
    .eq('alumno_id', SESSION.id);

  const entregaMap = {};
  (entregas || []).forEach(e => { entregaMap[e.tarea_id] = e; });

  if (!tareas || tareas.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>Sin tareas por ahora</h3><p>El profe aun no ha publicado tareas.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-header"><h2>Tareas</h2></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${tareas.map(t => {
        const entrega = entregaMap[t.id];
        const vencida = t.fecha_entrega && new Date(t.fecha_entrega) < new Date();
        let estadoBadge = '<span class="badge badge-gray">Sin entregar</span>';
        if (entrega) {
          if (entrega.calificado) {
            const nc = notaColor(entrega.nota, t.nota_maxima);
            estadoBadge = `<span class="badge badge-${nc === 'alta' ? 'green' : nc === 'media' ? 'gold' : 'red'}">${entrega.nota}/${t.nota_maxima}</span>`;
          } else {
            estadoBadge = '<span class="badge badge-blue">Entregada</span>';
          }
        } else if (vencida) {
          estadoBadge = '<span class="badge badge-red">Vencida</span>';
        }
        return `
          <div class="activity-card">
            <div class="activity-type">Tarea</div>
            <div class="flex-between">
              <div class="activity-title">${t.titulo}</div>
              ${estadoBadge}
            </div>
            <p style="font-size:13px;color:var(--gray-500);margin:8px 0">${t.descripcion || ''}</p>
            <div class="flex-between mt-1">
              <div class="activity-meta">
                <span>📅 ${t.fecha_entrega ? formatFecha(t.fecha_entrega) : 'Sin fecha'}</span>
                <span>⭐ ${t.nota_maxima} pts</span>
              </div>
              ${!entrega ? `<button class="btn btn-sm btn-primary" onclick="abrirEntregarTarea('${t.id}','${t.titulo}',${!!t.fecha_entrega && !vencida})">
                ${vencida ? 'Entregar (tardio)' : 'Entregar'}
              </button>` : `<button class="btn btn-sm btn-ghost" onclick="verEntrega('${t.id}')">Ver entrega</button>`}
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// ── MODAL ENTREGAR TAREA ──────────────────────────────────
function abrirEntregarTarea(tareaId, titulo, enTiempo) {
  document.getElementById('modal-entrega-titulo').textContent = titulo;
  document.getElementById('entrega-tarea-id').value = tareaId;
  document.getElementById('entrega-texto').value = '';
  document.getElementById('entrega-archivo').value = '';
  openModal('modal-entrega');
}

async function submitEntrega() {
  const tareaId = document.getElementById('entrega-tarea-id').value;
  const texto   = document.getElementById('entrega-texto').value.trim();
  const archivo = document.getElementById('entrega-archivo').files[0];

  if (!texto && !archivo) {
    showToast('Escribe algo o adjunta un archivo.', 'error');
    return;
  }

  const btn = document.getElementById('btn-submit-entrega');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    let archivoUrl = null;
    if (archivo) {
      archivoUrl = await uploadToCloudinary(archivo);
    }

    const { error } = await db.from('entregas_tareas').upsert({
      tarea_id: tareaId,
      alumno_id: SESSION.id,
      texto: texto || null,
      archivo_url: archivoUrl,
      fecha_entrega: new Date().toISOString(),
    }, { onConflict: 'tarea_id,alumno_id' });

    if (error) throw error;

    closeModal('modal-entrega');
    showToast('Tarea entregada correctamente', 'success');
    _loaded['tareas'] = false;
    await renderTareas();
  } catch (err) {
    console.error(err);
    showToast('Error al entregar. Intenta de nuevo.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entregar';
  }
}

async function verEntrega(tareaId) {
  const { data } = await db
    .from('entregas_tareas')
    .select('*, tareas(titulo, nota_maxima)')
    .eq('tarea_id', tareaId)
    .eq('alumno_id', SESSION.id)
    .single();

  if (!data) { showToast('No se encontro la entrega', 'error'); return; }

  const notaHtml = data.calificado
    ? `<div class="flex-center" style="margin:12px 0">
        <div class="nota-circle ${notaColor(data.nota, data.tareas.nota_maxima)}">${data.nota}</div>
        <div style="margin-left:12px">
          <div class="fw-600">Nota: ${data.nota}/${data.tareas.nota_maxima}</div>
          ${data.comentario_docente ? `<div style="font-size:13px;color:var(--gray-500);margin-top:4px">${data.comentario_docente}</div>` : ''}
        </div>
      </div>`
    : '<span class="badge badge-blue">En revision</span>';

  document.getElementById('ver-entrega-body').innerHTML = `
    <h3 style="margin-bottom:12px">${data.tareas.titulo}</h3>
    ${notaHtml}
    ${data.texto ? `<div style="background:var(--off-white);padding:14px;border-radius:var(--radius-sm);font-size:14px;margin-top:12px">${data.texto}</div>` : ''}
    ${data.archivo_url ? `<div class="mt-2"><a href="${data.archivo_url}" target="_blank" class="btn btn-outline btn-sm">📎 Ver archivo adjunto</a></div>` : ''}
    <div class="text-gray mt-2" style="font-size:12px">Entregado: ${formatFechaHora(data.fecha_entrega)}</div>
  `;
  openModal('modal-ver-entrega');
}

function irATarea(id) {
  _loaded['tareas'] = false;
  mostrarTab('tareas');
}

// ── EXAMENES ──────────────────────────────────────────────
async function renderExamenes() {
  const el = document.getElementById('section-examenes');
  el.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  const { data: examenes } = await db
    .from('examenes')
    .select('*')
    .eq('seccion_id', SESSION.seccion_id)
    .eq('activo', true)
    .order('creado_at', { ascending: false });

  const { data: intentos } = await db
    .from('intentos_examen')
    .select('examen_id, nota, completado, numero_intento')
    .eq('alumno_id', SESSION.id);

  const intentoMap = {};
  (intentos || []).forEach(i => {
    if (!intentoMap[i.examen_id] || i.numero_intento > intentoMap[i.examen_id].numero_intento) {
      intentoMap[i.examen_id] = i;
    }
  });

  if (!examenes || examenes.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><h3>Sin examenes activos</h3><p>El profe aun no ha publicado examenes.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="page-header"><h2>Examenes</h2></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${examenes.map(ex => {
        const intento = intentoMap[ex.id];
        const intentosUsados = intentos ? intentos.filter(i => i.examen_id === ex.id).length : 0;
        const puedeHacer = intentosUsados < ex.intentos_max;
        let estadoBadge = puedeHacer
          ? '<span class="badge badge-green">Disponible</span>'
          : '<span class="badge badge-gray">Completado</span>';
        return `
          <div class="activity-card" style="border-top-color:#3b82f6">
            <div class="activity-type">Examen</div>
            <div class="flex-between">
              <div class="activity-title">${ex.titulo}</div>
              ${estadoBadge}
            </div>
            <p style="font-size:13px;color:var(--gray-500);margin:8px 0">${ex.descripcion || ''}</p>
            <div class="flex-between mt-1">
              <div class="activity-meta">
                ${ex.tiempo_limite ? `<span>⏱ ${ex.tiempo_limite} min</span>` : '<span>⏱ Sin limite</span>'}
                <span>❓ ${ex.preguntas_por_intento} preguntas</span>
                <span>🔁 ${intentosUsados}/${ex.intentos_max} intentos</span>
                ${intento?.completado ? `<span>⭐ ${intento.nota}/${ex.nota_maxima}</span>` : ''}
              </div>
              ${puedeHacer
                ? `<button class="btn btn-sm btn-primary" onclick="iniciarExamen('${ex.id}')">Iniciar</button>`
                : `<button class="btn btn-sm btn-ghost" onclick="verResultadoExamen('${ex.id}')">Ver resultado</button>`
              }
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

async function iniciarExamen(examenId) {
  // Confirmar
  if (!confirm('Vas a iniciar el examen. Una vez iniciado, el tiempo corre. ¿Continuar?')) return;
  // Redirigir a sala de examen
  window.location.href = `/examen.html?id=${examenId}`;
}

async function verResultadoExamen(examenId) {
  const { data: intentos } = await db
    .from('intentos_examen')
    .select('*, examenes(titulo, nota_maxima)')
    .eq('examen_id', examenId)
    .eq('alumno_id', SESSION.id)
    .order('numero_intento', { ascending: false });

  if (!intentos || intentos.length === 0) { showToast('Sin resultados', 'error'); return; }

  const html = intentos.map(i => `
    <div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--gray-100)">
      <div>
        <div class="fw-600">Intento ${i.numero_intento}</div>
        <div class="text-gray" style="font-size:12px">${formatFechaHora(i.fecha_fin)}</div>
      </div>
      <div class="nota-circle ${notaColor(i.nota, i.examenes.nota_maxima)}" style="width:48px;height:48px;font-size:1rem">${i.nota}</div>
    </div>
  `).join('');

  document.getElementById('ver-entrega-body').innerHTML = `<h3>${intentos[0].examenes.titulo}</h3><div class="mt-2">${html}</div>`;
  openModal('modal-ver-entrega');
}

// ── ENCUESTAS ─────────────────────────────────────────────
async function renderEncuestas() {
  const el = document.getElementById('section-encuestas');
  el.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  const { data: encuestas } = await db
    .from('encuestas')
    .select('*, preguntas_encuesta(count)')
    .eq('seccion_id', SESSION.seccion_id)
    .eq('activo', true);

  if (!encuestas || encuestas.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>Sin encuestas activas</h3><p>El profe aun no ha publicado encuestas.</p></div>`;
    return;
  }

  // Revisar cuales ya respondio
  const { data: respYa } = await db
    .from('respuestas_encuesta')
    .select('pregunta_encuesta_id, preguntas_encuesta(encuesta_id)')
    .eq('alumno_id', SESSION.id);

  const encuestasRespondidas = new Set();
  (respYa || []).forEach(r => {
    if (r.preguntas_encuesta?.encuesta_id) encuestasRespondidas.add(r.preguntas_encuesta.encuesta_id);
  });

  el.innerHTML = `
    <div class="page-header"><h2>Encuestas</h2></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${encuestas.map(enc => {
        const respondida = encuestasRespondidas.has(enc.id);
        return `
          <div class="activity-card" style="border-top-color:#3dba7f">
            <div class="activity-type">Encuesta</div>
            <div class="flex-between">
              <div class="activity-title">${enc.titulo}</div>
              ${respondida ? '<span class="badge badge-green">Respondida</span>' : '<span class="badge badge-gold">Pendiente</span>'}
            </div>
            <p style="font-size:13px;color:var(--gray-500);margin:8px 0">${enc.descripcion || 'Sin descripcion'}</p>
            <div class="flex justify-end mt-1">
              ${!respondida
                ? `<button class="btn btn-sm btn-primary" onclick="abrirEncuesta('${enc.id}','${enc.titulo}')">Responder</button>`
                : '<span class="text-gray" style="font-size:13px">Ya respondiste esta encuesta</span>'
              }
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

async function abrirEncuesta(encuestaId, titulo) {
  const { data: preguntas } = await db
    .from('preguntas_encuesta')
    .select('*')
    .eq('encuesta_id', encuestaId)
    .order('orden');

  if (!preguntas || preguntas.length === 0) { showToast('La encuesta no tiene preguntas', 'error'); return; }

  document.getElementById('modal-encuesta-titulo').textContent = titulo;

  const body = document.getElementById('modal-encuesta-body');
  body.innerHTML = preguntas.map((p, i) => {
    let inputHtml = '';
    if (p.tipo === 'escala') {
      inputHtml = `<div class="flex gap-2 mt-1">${[1,2,3,4,5].map(n => `
        <label style="display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer">
          <input type="radio" name="enc_${p.id}" value="${n}" style="accent-color:var(--gold)">
          <span style="font-size:12px">${n}</span>
        </label>`).join('')}
      </div>`;
    } else if (p.tipo === 'opcion_multiple' && p.opciones_json) {
      const opts = JSON.parse(p.opciones_json);
      inputHtml = opts.map(o => `
        <label class="option-item" style="margin-top:8px">
          <input type="radio" name="enc_${p.id}" value="${o}"> ${o}
        </label>`).join('');
    } else {
      inputHtml = `<textarea class="form-textarea mt-1" name="enc_${p.id}" style="min-height:70px" placeholder="Tu respuesta..."></textarea>`;
    }
    return `<div class="mb-3"><div class="fw-600" style="font-size:14px">${i+1}. ${p.texto}</div>${inputHtml}</div>`;
  }).join('');

  document.getElementById('btn-enviar-encuesta').onclick = () => submitEncuesta(encuestaId, preguntas);
  openModal('modal-encuesta');
}

async function submitEncuesta(encuestaId, preguntas) {
  const btn = document.getElementById('btn-enviar-encuesta');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  const inserts = [];
  for (const p of preguntas) {
    let respuesta = null;
    if (p.tipo === 'texto_libre') {
      const el = document.querySelector(`[name="enc_${p.id}"]`);
      respuesta = el?.value?.trim() || null;
    } else {
      const el = document.querySelector(`[name="enc_${p.id}"]:checked`);
      respuesta = el?.value || null;
    }
    if (respuesta) {
      inserts.push({ pregunta_encuesta_id: p.id, alumno_id: SESSION.id, respuesta });
    }
  }

  try {
    const { error } = await db.from('respuestas_encuesta').insert(inserts);
    if (error) throw error;
    closeModal('modal-encuesta');
    showToast('Respuestas enviadas. Gracias!', 'success');
    _loaded['encuestas'] = false;
    await renderEncuestas();
  } catch (err) {
    console.error(err);
    showToast('Error al enviar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar respuestas';
  }
}

// ── FORO ──────────────────────────────────────────────────
async function renderForo() {
  const el = document.getElementById('section-foro');
  el.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  const { data: posts } = await db
    .from('foro_posts')
    .select('*, autor:usuarios(nombre, foto_url), foro_respuestas(count)')
    .eq('seccion_id', SESSION.seccion_id)
    .order('fijado', { ascending: false })
    .order('creado_at', { ascending: false });

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Foro de Dudas</h2><p>Pregunta y participa</p></div>
      <button class="btn btn-primary" onclick="abrirNuevoPost()">+ Nueva pregunta</button>
    </div>
    ${!posts || posts.length === 0
      ? `<div class="empty-state"><div class="empty-icon">💬</div><h3>Sin publicaciones</h3><p>Se el primero en preguntar.</p></div>`
      : posts.map(post => `
        <div class="forum-post-card ${post.fijado ? 'pinned' : ''} ${post.resuelto ? 'resolved' : ''}" onclick="abrirPost('${post.id}')">
          <div class="flex-between mb-1">
            <div class="flex gap-1" style="align-items:center">
              ${post.fijado ? '<span class="badge badge-gold">📌 Fijado</span>' : ''}
              ${post.resuelto ? '<span class="badge badge-green">✓ Resuelto</span>' : ''}
            </div>
            <span style="font-size:12px;color:var(--gray-500)">${timeAgo(post.creado_at)}</span>
          </div>
          <div class="fw-600" style="font-size:15px;margin-bottom:4px">${post.titulo}</div>
          <div style="font-size:13px;color:var(--gray-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${post.contenido}</div>
          <div class="flex gap-2 mt-2" style="font-size:12px;color:var(--gray-500);align-items:center">
            ${renderAvatar(post.autor?.foto_url, post.autor?.nombre, 20)}
            <span>${post.autor?.nombre || 'Anonimo'}</span>
            <span>•</span>
            <span>💬 ${post.foro_respuestas?.[0]?.count || 0} respuestas</span>
          </div>
        </div>`).join('')
    }
  `;
}

function abrirNuevoPost() {
  document.getElementById('nuevo-post-titulo').value = '';
  document.getElementById('nuevo-post-contenido').value = '';
  openModal('modal-nuevo-post');
}

async function submitPost() {
  const titulo = document.getElementById('nuevo-post-titulo').value.trim();
  const contenido = document.getElementById('nuevo-post-contenido').value.trim();
  if (!titulo || !contenido) { showToast('Completa todos los campos', 'error'); return; }

  const btn = document.getElementById('btn-submit-post');
  btn.disabled = true;

  try {
    const { error } = await db.from('foro_posts').insert({
      materia_id: MATERIA?.id,
      seccion_id: SESSION.seccion_id,
      autor_id: SESSION.id,
      titulo,
      contenido,
    });
    if (error) throw error;
    closeModal('modal-nuevo-post');
    showToast('Publicado correctamente', 'success');
    _loaded['foro'] = false;
    await renderForo();
  } catch (err) {
    console.error(err);
    showToast('Error al publicar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function abrirPost(postId) {
  const { data: post } = await db
    .from('foro_posts')
    .select('*, autor:usuarios(nombre, foto_url)')
    .eq('id', postId)
    .single();

  const { data: respuestas } = await db
    .from('foro_respuestas')
    .select('*, autor:usuarios(nombre, foto_url, rol)')
    .eq('post_id', postId)
    .order('creado_at');

  document.getElementById('post-detail-titulo').textContent = post.titulo;
  document.getElementById('post-detail-body').innerHTML = `
    <div class="flex gap-2 mb-3" style="align-items:center">
      ${renderAvatar(post.autor?.foto_url, post.autor?.nombre, 32)}
      <div>
        <div class="fw-600" style="font-size:13px">${post.autor?.nombre}</div>
        <div class="text-gray" style="font-size:11px">${formatFechaHora(post.creado_at)}</div>
      </div>
    </div>
    <p style="font-size:14px;line-height:1.7;margin-bottom:20px">${post.contenido}</p>
    <div style="border-top:1px solid var(--gray-100);padding-top:16px">
      <div class="label mb-2">${respuestas?.length || 0} Respuestas</div>
      ${(respuestas || []).map(r => `
        <div style="display:flex;gap:12px;margin-bottom:16px">
          ${renderAvatar(r.autor?.foto_url, r.autor?.nombre, 30)}
          <div style="flex:1;background:var(--off-white);border-radius:var(--radius-sm);padding:12px">
            <div class="flex-between mb-1">
              <span class="fw-600" style="font-size:13px">${r.autor?.nombre} ${r.autor?.rol === 'docente' ? '<span class="badge badge-navy" style="font-size:10px">Profe</span>' : ''}</span>
              <span class="text-gray" style="font-size:11px">${timeAgo(r.creado_at)}</span>
            </div>
            <p style="font-size:13px">${r.contenido}</p>
          </div>
        </div>`).join('')}
    </div>
    <div class="mt-2">
      <textarea id="nueva-respuesta-texto" class="form-textarea" placeholder="Escribe tu respuesta..." style="min-height:80px"></textarea>
      <button class="btn btn-primary btn-sm mt-1" onclick="submitRespuesta('${postId}')">Responder</button>
    </div>
  `;
  openModal('modal-post-detail');
}

async function submitRespuesta(postId) {
  const texto = document.getElementById('nueva-respuesta-texto').value.trim();
  if (!texto) return;
  try {
    const { error } = await db.from('foro_respuestas').insert({
      post_id: postId,
      autor_id: SESSION.id,
      contenido: texto,
    });
    if (error) throw error;
    showToast('Respuesta publicada', 'success');
    await abrirPost(postId);
  } catch (err) {
    console.error(err);
    showToast('Error al responder', 'error');
  }
}

// ── NOTAS ─────────────────────────────────────────────────
async function renderNotas() {
  const el = document.getElementById('section-notas');
  el.innerHTML = '<div class="flex-center" style="padding:40px"><div class="spinner"></div></div>';

  const [{ data: entregas }, { data: intentos }] = await Promise.all([
    db.from('entregas_tareas').select('*, tareas(titulo,nota_maxima)').eq('alumno_id', SESSION.id).eq('calificado', true),
    db.from('intentos_examen').select('*, examenes(titulo,nota_maxima)').eq('alumno_id', SESSION.id).eq('completado', true),
  ]);

  const todas = [
    ...(entregas || []).map(e => ({ tipo: 'Tarea', titulo: e.tareas?.titulo, nota: e.nota, max: e.tareas?.nota_maxima })),
    ...(intentos || []).map(i => ({ tipo: 'Examen', titulo: i.examenes?.titulo, nota: i.nota, max: i.examenes?.nota_maxima })),
  ];

  if (todas.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><h3>Sin notas aun</h3><p>Aqui apareceran tus notas cuando el profe las registre.</p></div>`;
    return;
  }

  const promedio = todas.reduce((acc, n) => acc + (n.nota / n.max) * 10, 0) / todas.length;

  el.innerHTML = `
    <div class="page-header"><h2>Mis Notas</h2></div>
    <div class="stat-card mb-3" style="max-width:220px">
      <div class="stat-icon">📊</div>
      <div class="stat-value">${promedio.toFixed(1)}</div>
      <div class="stat-label">Promedio general</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Actividad</th><th>Tipo</th><th>Nota</th><th>Sobre</th></tr></thead>
        <tbody>
          ${todas.map(n => `
            <tr>
              <td>${n.titulo || '—'}</td>
              <td><span class="badge badge-${n.tipo === 'Tarea' ? 'gold' : 'blue'}">${n.tipo}</span></td>
              <td>
                <div class="nota-circle ${notaColor(n.nota, n.max)}" style="width:40px;height:40px;font-size:.9rem">
                  ${n.nota}
                </div>
              </td>
              <td class="text-gray">${n.max}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── LOGOUT ────────────────────────────────────────────────
function logout() {
  clearSession();
  window.location.href = '/index.html';
}
