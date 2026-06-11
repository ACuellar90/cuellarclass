// ============================================================
// CuellarClass — admin.js
// Panel del docente: alumnos, tareas, examenes, encuestas, foro
// ============================================================

let SESSION = null;
let _SECCIONES = [];
let _MATERIAS  = [];

document.addEventListener('DOMContentLoaded', async () => {
  SESSION = requireAuth(['docente']);
  if (!SESSION) return;

  showLoading();
  try {
    // Cargar es_admin del usuario actual
    const { data: yo } = await db.from('usuarios').select('es_admin, seccion_id').eq('id', SESSION.id).single();
    SESSION.es_admin  = yo?.es_admin  || false;
    SESSION.seccion_id = yo?.seccion_id || SESSION.seccion_id;

    await cargarSeccionesYMaterias();
    renderSidebar();
    mostrarTab('dashboard');
    initMobileSidebar();

    // Si no es admin ocultar secciones que no le corresponden
    if (!SESSION.es_admin) {
      document.querySelectorAll('[data-tab="docentes"], [data-tab="config"]').forEach(el => el.classList.add('hidden'));
    }
  } catch (err) {
    console.error(err);
    showToast('Error al cargar', 'error');
  } finally {
    hideLoading();
  }
});

// ── DATOS BASE ─────────────────────────────────────────────
async function cargarSeccionesYMaterias() {
  const [{ data: secciones }, { data: materias }] = await Promise.all([
    db.from('secciones').select('*, materias(*)').order('nombre'),
    db.from('materias').select('*').order('nombre'),
  ]);
  _SECCIONES = secciones || [];
  _MATERIAS  = materias  || [];
}

function seccionOptions(selected = '') {
  return _SECCIONES.map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.nombre} — ${s.materias?.nombre || ''}</option>`).join('');
}
function materiaOptions(selected = '') {
  return _MATERIAS.map(m => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${m.nombre}</option>`).join('');
}

// ── SIDEBAR ────────────────────────────────────────────────
function renderSidebar() {
  const avatarWrap = document.getElementById('sidebar-avatar');
  const nameEl = document.getElementById('sidebar-name');
  avatarWrap.innerHTML = renderAvatar(SESSION.foto_url, SESSION.nombre, 36);
  nameEl.textContent = SESSION.nombre;
}

// ── NAV ────────────────────────────────────────────────────
function mostrarTab(tab) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  document.querySelectorAll('.page-section').forEach(el => el.classList.toggle('hidden', el.id !== `section-${tab}`));
  const titles = {
    dashboard: 'Dashboard', alumnos: 'Alumnos', tareas: 'Tareas',
    examenes: 'Examenes', encuestas: 'Encuestas', foro: 'Foro', docentes: 'Docentes', config: 'Configuracion',
  };
  document.getElementById('topbar-titulo').textContent = titles[tab] || 'Admin';
  loadSection(tab);
}

const _loaded = {};
async function loadSection(tab) {
  if (_loaded[tab]) return;
  _loaded[tab] = true;
  switch (tab) {
    case 'dashboard':  await renderDashboard(); break;
    case 'alumnos':    await renderAlumnos(); break;
    case 'tareas':     await renderTareas(); break;
    case 'examenes':   await renderExamenes(); break;
    case 'encuestas':  await renderEncuestas(); break;
    case 'foro':       await renderForo(); break;
    case 'docentes':   await renderDocentes(); break;
    case 'config':     await renderConfig(); break;
  }
}

// ── DASHBOARD ─────────────────────────────────────────────
async function renderDashboard() {
  const el = document.getElementById('section-dashboard');

  const [
    { count: totalAlumnos },
    { count: totalTareas },
    { count: totalExamenes },
    { count: totalPosts },
    { data: tareasPend },
  ] = await Promise.all([
    db.from('usuarios').select('*',{count:'exact',head:true}).eq('rol','alumno').eq('activo',true),
    db.from('tareas').select('*',{count:'exact',head:true}).eq('activo',true),
    db.from('examenes').select('*',{count:'exact',head:true}).eq('activo',true),
    db.from('foro_posts').select('*',{count:'exact',head:true}),
    db.from('entregas_tareas').select('*, tareas(titulo), usuarios(nombre)')
      .eq('calificado',false).order('fecha_entrega',{ascending:false}).limit(8),
  ]);

  el.innerHTML = `
    <div class="page-header"><h2>Dashboard</h2><p>Bienvenido, ${SESSION.nombre.split(' ')[0]}</p></div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon">👨‍🎓</div><div class="stat-value">${totalAlumnos||0}</div><div class="stat-label">Alumnos activos</div></div>
      <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-value">${totalTareas||0}</div><div class="stat-label">Tareas activas</div></div>
      <div class="stat-card" style="border-left-color:#3b82f6"><div class="stat-icon">📝</div><div class="stat-value">${totalExamenes||0}</div><div class="stat-label">Examenes activos</div></div>
      <div class="stat-card" style="border-left-color:#3dba7f"><div class="stat-icon">💬</div><div class="stat-value">${totalPosts||0}</div><div class="stat-label">Posts en foro</div></div>
    </div>
    <div class="card">
      <div class="card-header">
        <h3>Entregas pendientes de calificar</h3>
        <span class="badge badge-gold">${tareasPend?.length || 0}</span>
      </div>
      <div class="card-body">
        ${!tareasPend || tareasPend.length === 0
          ? '<p class="text-gray" style="font-size:14px">No hay entregas pendientes.</p>'
          : `<div class="table-wrap"><table>
              <thead><tr><th>Alumno</th><th>Tarea</th><th>Fecha entrega</th><th></th></tr></thead>
              <tbody>${tareasPend.map(e => `
                <tr>
                  <td>${e.usuarios?.nombre || '—'}</td>
                  <td>${e.tareas?.titulo || '—'}</td>
                  <td>${formatFechaHora(e.fecha_entrega)}</td>
                  <td><button class="btn btn-sm btn-primary" onclick="abrirCalificarEntrega('${e.id}')">Calificar</button></td>
                </tr>`).join('')}
              </tbody></table></div>`
        }
      </div>
    </div>
  `;
}

// ── ALUMNOS ────────────────────────────────────────────────
async function renderAlumnos() {
  const el = document.getElementById('section-alumnos');

  let query = db.from('usuarios').select('*, secciones(nombre, materias(nombre))').eq('rol', 'alumno').eq('activo', true).order('nombre');
  if (!SESSION.es_admin && SESSION.seccion_id) query = query.eq('seccion_id', SESSION.seccion_id);
  const { data: alumnos } = await query;

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Alumnos</h2><p>${alumnos?.length || 0} alumnos registrados</p></div>
      <div class="flex gap-1">
        <button class="btn btn-secondary" onclick="abrirImportarAlumnos()">📤 Importar</button>
        <button class="btn btn-primary" onclick="abrirNuevoAlumno()">+ Nuevo alumno</button>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <input class="form-input" id="buscar-alumno" placeholder="Buscar por nombre o seccion..." oninput="filtrarAlumnos()" style="max-width:340px">
    </div>
    <div class="table-wrap">
      <table id="tabla-alumnos">
        <thead><tr><th>Alumno</th><th>Seccion</th><th>Materia</th><th>Email</th><th></th></tr></thead>
        <tbody>
          ${(alumnos||[]).map(a => `
            <tr data-nombre="${a.nombre.toLowerCase()}" data-seccion="${(a.secciones?.nombre||'').toLowerCase()}">
              <td>
                <div class="flex gap-1" style="align-items:center">
                  ${renderAvatar(a.foto_url, a.nombre, 32)}
                  <span class="fw-600">${a.nombre}</span>
                </div>
              </td>
              <td>${a.secciones ? `<span class="seccion-chip">${a.secciones.nombre}</span>` : '—'}</td>
              <td>${a.secciones?.materias?.nombre || '—'}</td>
              <td class="text-gray">${a.email}</td>
              <td>
                <div class="flex gap-1">
                  <button class="btn btn-sm btn-ghost" onclick="editarAlumno('${a.id}')">✏️</button>
                  <button class="btn btn-sm btn-ghost" onclick="verNotasAlumno('${a.id}','${a.nombre}')">📊</button>
                  <button class="btn btn-sm btn-ghost" onclick="desactivarAlumno('${a.id}')">🗑</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filtrarAlumnos() {
  const q = document.getElementById('buscar-alumno').value.toLowerCase();
  document.querySelectorAll('#tabla-alumnos tbody tr').forEach(row => {
    const n = row.dataset.nombre || '';
    const s = row.dataset.seccion || '';
    row.style.display = (n.includes(q) || s.includes(q)) ? '' : 'none';
  });
}

function abrirNuevoAlumno() {
  document.getElementById('modal-alumno-titulo').textContent = 'Nuevo alumno';
  document.getElementById('alumno-id').value = '';
  document.getElementById('alumno-nombre').value = '';
  document.getElementById('alumno-email').value = '';
  document.getElementById('alumno-pass').value = '';
  document.getElementById('alumno-seccion').innerHTML = `<option value="">-- Seleccionar --</option>${seccionOptions()}`;
  document.getElementById('alumno-foto-preview').innerHTML = '';
  openModal('modal-alumno');
}

async function editarAlumno(id) {
  const { data: a } = await db.from('usuarios').select('*').eq('id', id).single();
  document.getElementById('modal-alumno-titulo').textContent = 'Editar alumno';
  document.getElementById('alumno-id').value = a.id;
  document.getElementById('alumno-nombre').value = a.nombre;
  document.getElementById('alumno-email').value = a.email;
  document.getElementById('alumno-pass').value = '';
  document.getElementById('alumno-seccion').innerHTML = `<option value="">-- Seleccionar --</option>${seccionOptions(a.seccion_id)}`;
  document.getElementById('alumno-foto-preview').innerHTML = a.foto_url
    ? `<img src="${a.foto_url}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">` : '';
  openModal('modal-alumno');
}

async function submitAlumno() {
  const id      = document.getElementById('alumno-id').value;
  const nombre  = document.getElementById('alumno-nombre').value.trim();
  const email   = document.getElementById('alumno-email').value.trim().toLowerCase();
  const pass    = document.getElementById('alumno-pass').value;
  const seccion = document.getElementById('alumno-seccion').value;
  const fotoFile= document.getElementById('alumno-foto').files[0];

  if (!nombre || !email || (!id && !pass)) {
    showToast('Nombre, email y contrasena son obligatorios', 'error'); return;
  }

  const btn = document.getElementById('btn-submit-alumno');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    let foto_url = null;
    if (fotoFile) foto_url = await uploadToCloudinary(fotoFile);

    const payload = {
      nombre, email, rol: 'alumno',
      seccion_id: seccion || null,
      ...(foto_url ? { foto_url } : {}),
    };

    if (pass) {
      payload.password_hash = await dcodeIO.bcrypt.hash(pass, 10);
    }

    if (id) {
      const { error } = await db.from('usuarios').update(payload).eq('id', id);
      if (error) throw error;
      showToast('Alumno actualizado', 'success');
    } else {
      const { error } = await db.from('usuarios').insert(payload);
      if (error) throw error;
      showToast('Alumno creado', 'success');
    }

    closeModal('modal-alumno');
    _loaded['alumnos'] = false;
    await renderAlumnos();
  } catch (err) {
    console.error(err);
    showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function desactivarAlumno(id) {
  if (!confirm('Desactivar este alumno?')) return;
  await db.from('usuarios').update({ activo: false }).eq('id', id);
  showToast('Alumno desactivado', 'success');
  _loaded['alumnos'] = false;
  await renderAlumnos();
}

function previewFoto() {
  const file = document.getElementById('alumno-foto').files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('alumno-foto-preview').innerHTML =
    `<img src="${url}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">`;
}

async function verNotasAlumno(alumnoId, nombre) {
  const [{ data: entregas }, { data: intentos }] = await Promise.all([
    db.from('entregas_tareas').select('*, tareas(titulo,nota_maxima)').eq('alumno_id', alumnoId).eq('calificado', true),
    db.from('intentos_examen').select('*, examenes(titulo,nota_maxima)').eq('alumno_id', alumnoId).eq('completado', true),
  ]);

  const todas = [
    ...(entregas||[]).map(e => ({ tipo:'Tarea', titulo:e.tareas?.titulo, nota:e.nota, max:e.tareas?.nota_maxima })),
    ...(intentos||[]).map(i => ({ tipo:'Examen', titulo:i.examenes?.titulo, nota:i.nota, max:i.examenes?.nota_maxima })),
  ];

  const prom = todas.length > 0 ? (todas.reduce((a,n) => a + (n.nota/n.max)*10, 0) / todas.length).toFixed(1) : '—';

  document.getElementById('ver-entrega-body').innerHTML = `
    <h3 class="mb-2">${nombre}</h3>
    <div class="badge badge-navy mb-3">Promedio: ${prom}</div>
    ${todas.length === 0 ? '<p class="text-gray">Sin notas registradas.</p>'
    : `<table style="width:100%"><thead><tr><th>Actividad</th><th>Tipo</th><th>Nota</th></tr></thead>
        <tbody>${todas.map(n => `
          <tr>
            <td>${n.titulo||'—'}</td>
            <td><span class="badge badge-${n.tipo==='Tarea'?'gold':'blue'}">${n.tipo}</span></td>
            <td><span class="nota-circle ${notaColor(n.nota,n.max)}" style="width:36px;height:36px;font-size:.8rem">${n.nota}</span></td>
          </tr>`).join('')}
        </tbody></table>`}
  `;
  openModal('modal-ver-entrega');
}

// ── IMPORTAR ALUMNOS ───────────────────────────────────────
function abrirImportarAlumnos() {
  document.getElementById('import-seccion').innerHTML = `<option value="">-- Seccion --</option>${seccionOptions()}`;
  document.getElementById('import-preview').innerHTML = '';
  openModal('modal-importar');
}

async function procesarImport() {
  const seccionId = document.getElementById('import-seccion').value;
  const texto = document.getElementById('import-texto').value.trim();
  if (!seccionId || !texto) { showToast('Selecciona seccion y pega los datos', 'error'); return; }

  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const alumnos = lineas.map(l => {
    const parts = l.split('\t').length > 1 ? l.split('\t') : l.split(',');
    return { nombre: parts[0]?.trim(), email: parts[1]?.trim() };
  }).filter(a => a.nombre && a.email);

  document.getElementById('import-preview').innerHTML = `
    <div class="label mb-2">Vista previa (${alumnos.length} alumnos)</div>
    <div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Email</th></tr></thead>
    <tbody>${alumnos.map(a => `<tr><td>${a.nombre}</td><td>${a.email}</td></tr>`).join('')}</tbody></table></div>
    <button class="btn btn-primary mt-2" onclick="confirmarImport(${JSON.stringify(alumnos).replace(/"/g,'&quot;')},'${seccionId}')">Importar ${alumnos.length} alumnos</button>
  `;
}

async function confirmarImport(alumnos, seccionId) {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Importando...';
  const defaultPass = 'alumno2026';
  const hash = await dcodeIO.bcrypt.hash(defaultPass, 10);

  const inserts = alumnos.map(a => ({
    nombre: a.nombre, email: a.email,
    password_hash: hash, rol: 'alumno',
    seccion_id: seccionId, activo: true,
  }));

  const { error } = await db.from('usuarios').upsert(inserts, { onConflict: 'email', ignoreDuplicates: true });
  if (error) { showToast('Error: ' + error.message, 'error'); btn.disabled = false; return; }

  closeModal('modal-importar');
  showToast(`${alumnos.length} alumnos importados. Contrasena: ${defaultPass}`, 'success', 6000);
  _loaded['alumnos'] = false;
  await renderAlumnos();
}

// ── TAREAS ────────────────────────────────────────────────
async function renderTareas() {
  const el = document.getElementById('section-tareas');

  let query = db.from('tareas').select('*, secciones(nombre), materias(nombre)').eq('activo', true).order('creado_at', { ascending: false });
  if (!SESSION.es_admin && SESSION.seccion_id) query = query.eq('seccion_id', SESSION.seccion_id);
  const { data: tareas } = await query;

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Tareas</h2></div>
      <button class="btn btn-primary" onclick="abrirNuevaTarea()">+ Nueva tarea</button>
    </div>
    ${!tareas || tareas.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📋</div><h3>Sin tareas</h3><p>Crea la primera tarea.</p></div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Titulo</th><th>Seccion</th><th>Entrega</th><th>Nota max</th><th>Entregas</th><th></th></tr></thead>
          <tbody>
          ${await Promise.all(tareas.map(async t => {
            const { count } = await db.from('entregas_tareas').select('*',{count:'exact',head:true}).eq('tarea_id', t.id);
            const { count: pend } = await db.from('entregas_tareas').select('*',{count:'exact',head:true}).eq('tarea_id', t.id).eq('calificado', false);
            return `
              <tr>
                <td class="fw-600">${t.titulo}</td>
                <td>${t.secciones ? `<span class="seccion-chip">${t.secciones.nombre}</span>` : '<span class="badge badge-gray">Todas</span>'}</td>
                <td>${t.fecha_entrega ? formatFecha(t.fecha_entrega) : '—'}</td>
                <td>${t.nota_maxima}</td>
                <td>
                  <span>${count||0} recibidas</span>
                  ${pend > 0 ? `<span class="badge badge-gold" style="margin-left:6px">${pend} pendientes</span>` : ''}
                </td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-sm btn-ghost" onclick="verEntregasTarea('${t.id}','${t.titulo}')">📬 Calificar</button>
                    <button class="btn btn-sm btn-ghost" onclick="editarTarea('${t.id}')">✏️</button>
                    <button class="btn btn-sm btn-ghost" onclick="archivarTarea('${t.id}')">🗑</button>
                  </div>
                </td>
              </tr>`;
          })).then(rows => rows.join(''))}
          </tbody></table></div>`
    }
  `;
}

function abrirNuevaTarea() {
  document.getElementById('modal-tarea-titulo').textContent = 'Nueva tarea';
  document.getElementById('tarea-id').value = '';
  document.getElementById('tarea-titulo').value = '';
  document.getElementById('tarea-desc').value = '';
  document.getElementById('tarea-fecha').value = '';
  document.getElementById('tarea-nota').value = '10';
  document.getElementById('tarea-seccion').innerHTML = `<option value="">Todas las secciones</option>${seccionOptions()}`;
  openModal('modal-tarea');
}

async function editarTarea(id) {
  const { data: t } = await db.from('tareas').select('*').eq('id', id).single();
  document.getElementById('modal-tarea-titulo').textContent = 'Editar tarea';
  document.getElementById('tarea-id').value = t.id;
  document.getElementById('tarea-titulo').value = t.titulo;
  document.getElementById('tarea-desc').value = t.descripcion || '';
  document.getElementById('tarea-fecha').value = t.fecha_entrega ? t.fecha_entrega.slice(0,16) : '';
  document.getElementById('tarea-nota').value = t.nota_maxima;
  document.getElementById('tarea-seccion').innerHTML = `<option value="">Todas las secciones</option>${seccionOptions(t.seccion_id)}`;
  openModal('modal-tarea');
}

async function submitTarea() {
  const id      = document.getElementById('tarea-id').value;
  const titulo  = document.getElementById('tarea-titulo').value.trim();
  const desc    = document.getElementById('tarea-desc').value.trim();
  const fecha   = document.getElementById('tarea-fecha').value;
  const nota    = parseFloat(document.getElementById('tarea-nota').value);
  const seccion = document.getElementById('tarea-seccion').value;

  if (!titulo) { showToast('El titulo es obligatorio', 'error'); return; }

  const btn = document.getElementById('btn-submit-tarea');
  btn.disabled = true;

  // Determinar materia segun seccion
  let materiaId = null;
  if (seccion) {
    const s = _SECCIONES.find(s => s.id === seccion);
    materiaId = s?.materia_id || null;
  }

  const payload = {
    titulo, descripcion: desc || null,
    materia_id: materiaId,
    seccion_id: seccion || null,
    fecha_entrega: fecha ? new Date(fecha).toISOString() : null,
    nota_maxima: nota || 10,
  };

  try {
    if (id) {
      await db.from('tareas').update(payload).eq('id', id);
    } else {
      await db.from('tareas').insert(payload);
    }
    closeModal('modal-tarea');
    showToast('Tarea guardada', 'success');
    _loaded['tareas'] = false;
    await renderTareas();
  } catch (err) {
    showToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function archivarTarea(id) {
  if (!confirm('Archivar esta tarea?')) return;
  await db.from('tareas').update({ activo: false }).eq('id', id);
  showToast('Tarea archivada', 'success');
  _loaded['tareas'] = false;
  await renderTareas();
}

async function verEntregasTarea(tareaId, titulo) {
  const { data: entregas } = await db
    .from('entregas_tareas')
    .select('*, usuarios(nombre, foto_url)')
    .eq('tarea_id', tareaId)
    .order('fecha_entrega');

  document.getElementById('ver-entrega-body').innerHTML = `
    <h3 class="mb-3">${titulo}</h3>
    ${!entregas || entregas.length === 0
      ? '<p class="text-gray">Sin entregas aun.</p>'
      : entregas.map(e => `
        <div style="border:1px solid var(--gray-100);border-radius:var(--radius-sm);padding:14px;margin-bottom:12px">
          <div class="flex-between mb-2">
            <div class="flex gap-1" style="align-items:center">
              ${renderAvatar(e.usuarios?.foto_url, e.usuarios?.nombre, 28)}
              <span class="fw-600">${e.usuarios?.nombre}</span>
            </div>
            <span class="text-gray" style="font-size:12px">${formatFechaHora(e.fecha_entrega)}</span>
          </div>
          ${e.texto ? `<div style="background:var(--off-white);padding:10px;border-radius:var(--radius-sm);font-size:13px;margin-bottom:8px">${e.texto}</div>` : ''}
          ${e.archivo_url ? `<a href="${e.archivo_url}" target="_blank" class="btn btn-sm btn-outline">📎 Ver archivo</a>` : ''}
          <div class="flex gap-1 mt-2">
            <input type="number" placeholder="Nota" id="nota_${e.id}" value="${e.nota||''}" min="0" max="10" step="0.5" class="form-input" style="width:90px">
            <input type="text" placeholder="Comentario (opcional)" id="com_${e.id}" value="${e.comentario_docente||''}" class="form-input" style="flex:1">
            <button class="btn btn-sm btn-primary" onclick="calificarEntrega('${e.id}')">Guardar</button>
          </div>
        </div>`).join('')
    }
  `;
  openModal('modal-ver-entrega');
}

async function calificarEntrega(entregaId) {
  const nota = parseFloat(document.getElementById(`nota_${entregaId}`).value);
  const comentario = document.getElementById(`com_${entregaId}`).value.trim();
  if (isNaN(nota)) { showToast('Ingresa una nota valida', 'error'); return; }
  const { error } = await db.from('entregas_tareas').update({ nota, comentario_docente: comentario || null, calificado: true }).eq('id', entregaId);
  if (error) { showToast('Error al calificar', 'error'); return; }
  showToast('Nota guardada', 'success');
}

async function abrirCalificarEntrega(entregaId) {
  const { data: e } = await db.from('entregas_tareas').select('*, usuarios(nombre), tareas(titulo,nota_maxima)').eq('id', entregaId).single();
  document.getElementById('ver-entrega-body').innerHTML = `
    <h3>${e.tareas?.titulo}</h3>
    <p class="text-gray mb-2">${e.usuarios?.nombre}</p>
    ${e.texto ? `<div style="background:var(--off-white);padding:12px;border-radius:var(--radius-sm);font-size:14px;margin-bottom:12px">${e.texto}</div>` : ''}
    ${e.archivo_url ? `<a href="${e.archivo_url}" target="_blank" class="btn btn-outline btn-sm mb-2">📎 Ver archivo</a>` : ''}
    <div class="flex gap-1 mt-2">
      <input type="number" id="nota_${e.id}" value="${e.nota||''}" min="0" max="${e.tareas?.nota_maxima||10}" step="0.5" class="form-input" style="width:100px" placeholder="Nota">
      <input type="text" id="com_${e.id}" value="${e.comentario_docente||''}" class="form-input" style="flex:1" placeholder="Comentario">
      <button class="btn btn-primary" onclick="calificarEntrega('${e.id}')">Guardar</button>
    </div>
  `;
  openModal('modal-ver-entrega');
}

// ── EXAMENES ──────────────────────────────────────────────
async function renderExamenes() {
  const el = document.getElementById('section-examenes');

  let query = db.from('examenes').select('*, secciones(nombre)').order('creado_at', { ascending: false });
  if (!SESSION.es_admin && SESSION.seccion_id) query = query.eq('seccion_id', SESSION.seccion_id);
  const { data: examenes } = await query;

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Examenes</h2></div>
      <button class="btn btn-primary" onclick="abrirNuevoExamen()">+ Nuevo examen</button>
    </div>
    ${!examenes || examenes.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📝</div><h3>Sin examenes</h3><p>Crea el primer examen.</p></div>`
      : examenes.map(ex => `
        <div class="card mb-2">
          <div class="card-header">
            <div>
              <h3>${ex.titulo}</h3>
              <div class="flex gap-1 mt-1">
                ${ex.secciones ? `<span class="seccion-chip">${ex.secciones.nombre}</span>` : '<span class="badge badge-gray">Todas</span>'}
                ${ex.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Inactivo</span>'}
              </div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-${ex.activo ? 'secondary' : 'primary'}" onclick="toggleExamen('${ex.id}',${ex.activo})">
                ${ex.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button class="btn btn-sm btn-ghost" onclick="abrirBancoPreguntas('${ex.id}','${ex.titulo}')">📚 Banco</button>
              <button class="btn btn-sm btn-ghost" onclick="verResultadosExamen('${ex.id}','${ex.titulo}')">📊 Resultados</button>
              <button class="btn btn-sm btn-ghost" onclick="editarExamen('${ex.id}')">✏️</button>
            </div>
          </div>
          <div class="card-body">
            <div class="flex gap-3" style="font-size:13px;color:var(--gray-500)">
              <span>⏱ ${ex.tiempo_limite ? ex.tiempo_limite + ' min' : 'Sin limite'}</span>
              <span>❓ ${ex.preguntas_por_intento} preguntas por intento</span>
              <span>🔁 ${ex.intentos_max} intento(s) max</span>
              <span>⭐ Sobre ${ex.nota_maxima}</span>
            </div>
          </div>
        </div>`).join('')
    }
  `;
}

function abrirNuevoExamen() {
  document.getElementById('modal-examen-titulo').textContent = 'Nuevo examen';
  document.getElementById('examen-id').value = '';
  document.getElementById('examen-titulo').value = '';
  document.getElementById('examen-desc').value = '';
  document.getElementById('examen-tiempo').value = '';
  document.getElementById('examen-intentos').value = '1';
  document.getElementById('examen-preguntas').value = '10';
  document.getElementById('examen-nota').value = '10';
  document.getElementById('examen-seccion').innerHTML = `<option value="">Todas las secciones</option>${seccionOptions()}`;
  openModal('modal-examen');
}

async function editarExamen(id) {
  const { data: ex } = await db.from('examenes').select('*').eq('id', id).single();
  document.getElementById('modal-examen-titulo').textContent = 'Editar examen';
  document.getElementById('examen-id').value = ex.id;
  document.getElementById('examen-titulo').value = ex.titulo;
  document.getElementById('examen-desc').value = ex.descripcion || '';
  document.getElementById('examen-tiempo').value = ex.tiempo_limite || '';
  document.getElementById('examen-intentos').value = ex.intentos_max;
  document.getElementById('examen-preguntas').value = ex.preguntas_por_intento;
  document.getElementById('examen-nota').value = ex.nota_maxima;
  document.getElementById('examen-seccion').innerHTML = `<option value="">Todas las secciones</option>${seccionOptions(ex.seccion_id)}`;
  openModal('modal-examen');
}

async function submitExamen() {
  const id       = document.getElementById('examen-id').value;
  const titulo   = document.getElementById('examen-titulo').value.trim();
  const desc     = document.getElementById('examen-desc').value.trim();
  const tiempo   = parseInt(document.getElementById('examen-tiempo').value) || null;
  const intentos = parseInt(document.getElementById('examen-intentos').value) || 1;
  const nPregs   = parseInt(document.getElementById('examen-preguntas').value) || 10;
  const nota     = parseFloat(document.getElementById('examen-nota').value) || 10;
  const seccion  = document.getElementById('examen-seccion').value;

  if (!titulo) { showToast('El titulo es obligatorio', 'error'); return; }

  const btn = document.getElementById('btn-submit-examen');
  btn.disabled = true;

  const payload = {
    titulo, descripcion: desc || null,
    tiempo_limite: tiempo, intentos_max: intentos,
    preguntas_por_intento: nPregs, nota_maxima: nota,
    seccion_id: seccion || null,
    materia_id: seccion ? (_SECCIONES.find(s=>s.id===seccion)?.materia_id || null) : null,
  };

  try {
    if (id) {
      await db.from('examenes').update(payload).eq('id', id);
    } else {
      await db.from('examenes').insert(payload);
    }
    closeModal('modal-examen');
    showToast('Examen guardado', 'success');
    _loaded['examenes'] = false;
    await renderExamenes();
  } catch (err) {
    showToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleExamen(id, activo) {
  await db.from('examenes').update({ activo: !activo }).eq('id', id);
  showToast(`Examen ${!activo ? 'activado' : 'desactivado'}`, 'success');
  _loaded['examenes'] = false;
  await renderExamenes();
}

// ── BANCO DE PREGUNTAS ─────────────────────────────────────
let _examenActivo = null;

async function abrirBancoPreguntas(examenId, titulo) {
  _examenActivo = examenId;
  document.getElementById('banco-titulo').textContent = `Banco: ${titulo}`;
  await cargarPreguntas();
  openModal('modal-banco');
}

async function cargarPreguntas() {
  const { data: preguntas } = await db
    .from('preguntas')
    .select('*, opciones(*), respuestas_correctas(*)')
    .eq('examen_id', _examenActivo)
    .order('orden');

  const el = document.getElementById('banco-lista');

  if (!preguntas || preguntas.length === 0) {
    el.innerHTML = '<p class="text-gray" style="padding:20px 0">No hay preguntas en el banco. Agrega la primera.</p>';
    document.getElementById('banco-count').textContent = '0 preguntas';
    return;
  }

  document.getElementById('banco-count').textContent = `${preguntas.length} preguntas`;

  el.innerHTML = preguntas.map((p, i) => {
    let detalleHtml = '';
    if (p.tipo === 'opcion_multiple' || p.tipo === 'verdadero_falso') {
      detalleHtml = (p.opciones||[]).map(o =>
        `<div class="flex gap-1" style="font-size:13px;margin-top:4px">
          <span style="color:${o.es_correcta ? 'var(--success)' : 'var(--gray-300)'}">${o.es_correcta ? '✓' : '○'}</span>
          <span ${o.es_correcta ? 'style="font-weight:600;color:var(--navy)"' : 'style="color:var(--gray-500)"'}>${o.texto}</span>
        </div>`).join('');
    } else {
      const rc = p.respuestas_correctas?.[0];
      detalleHtml = rc ? `<div style="font-size:13px;color:var(--success);margin-top:4px">✓ ${rc.texto} ${rc.es_exacta ? '(exacta)' : '(contiene)'}</div>` : '';
    }

    const tipoLabel = { opcion_multiple: 'Opcion multiple', verdadero_falso: 'V/F', respuesta_corta: 'Respuesta corta' };
    return `
      <div style="border:1px solid var(--gray-100);border-radius:var(--radius-sm);padding:14px;margin-bottom:10px">
        <div class="flex-between mb-1">
          <span class="badge badge-${p.tipo==='opcion_multiple'?'navy':p.tipo==='verdadero_falso'?'gold':'blue'}">${tipoLabel[p.tipo]}</span>
          <div class="flex gap-1">
            <span class="text-gray" style="font-size:12px">${p.puntaje} pt</span>
            <button class="btn btn-sm btn-ghost" onclick="editarPregunta('${p.id}')">✏️</button>
            <button class="btn btn-sm btn-ghost" onclick="eliminarPregunta('${p.id}')">🗑</button>
          </div>
        </div>
        <div class="fw-600" style="font-size:14px;margin-bottom:6px">${i+1}. ${p.enunciado}</div>
        ${detalleHtml}
      </div>`;
  }).join('');
}

function abrirFormPregunta(tipo = 'opcion_multiple') {
  document.getElementById('pregunta-id').value = '';
  document.getElementById('pregunta-enunciado').value = '';
  document.getElementById('pregunta-puntaje').value = '1';
  document.getElementById('pregunta-tipo').value = tipo;
  cambiarTipoPregunta(tipo);
  openModal('modal-pregunta');
}

function cambiarTipoPregunta(tipo) {
  const optsContainer = document.getElementById('opciones-container');
  const rcContainer   = document.getElementById('rc-container');

  if (tipo === 'opcion_multiple') {
    optsContainer.innerHTML = `
      <div class="label mb-1">Opciones (marca la correcta)</div>
      ${[0,1,2,3].map(i => `
        <div class="flex gap-1 mb-1">
          <input type="radio" name="correcta" value="${i}" style="margin-top:10px;accent-color:var(--gold)">
          <input type="text" class="form-input" id="opt_${i}" placeholder="Opcion ${i+1}">
        </div>`).join('')}
    `;
    optsContainer.classList.remove('hidden');
    rcContainer.classList.add('hidden');
  } else if (tipo === 'verdadero_falso') {
    optsContainer.innerHTML = `
      <div class="label mb-1">Respuesta correcta</div>
      <div class="flex gap-2">
        <label class="flex gap-1" style="align-items:center;cursor:pointer">
          <input type="radio" name="correcta" value="0" style="accent-color:var(--gold)"> Verdadero
        </label>
        <label class="flex gap-1" style="align-items:center;cursor:pointer">
          <input type="radio" name="correcta" value="1" style="accent-color:var(--gold)"> Falso
        </label>
      </div>
    `;
    optsContainer.classList.remove('hidden');
    rcContainer.classList.add('hidden');
  } else {
    optsContainer.classList.add('hidden');
    rcContainer.classList.remove('hidden');
  }
}

async function submitPregunta() {
  const id        = document.getElementById('pregunta-id').value;
  const enunciado = document.getElementById('pregunta-enunciado').value.trim();
  const tipo      = document.getElementById('pregunta-tipo').value;
  const puntaje   = parseFloat(document.getElementById('pregunta-puntaje').value) || 1;

  if (!enunciado) { showToast('Escribe el enunciado', 'error'); return; }

  const btn = document.getElementById('btn-submit-pregunta');
  btn.disabled = true;

  try {
    let preguntaId = id;

    if (id) {
      await db.from('preguntas').update({ enunciado, tipo, puntaje }).eq('id', id);
      // Limpiar opciones/RC anteriores
      await db.from('opciones').delete().eq('pregunta_id', id);
      await db.from('respuestas_correctas').delete().eq('pregunta_id', id);
    } else {
      const { data } = await db.from('preguntas').insert({
        examen_id: _examenActivo, enunciado, tipo, puntaje,
      }).select().single();
      preguntaId = data.id;
    }

    if (tipo === 'opcion_multiple') {
      const correcta = document.querySelector('input[name="correcta"]:checked')?.value;
      const opciones = [0,1,2,3].map(i => ({
        pregunta_id: preguntaId,
        texto: document.getElementById(`opt_${i}`)?.value.trim(),
        es_correcta: String(i) === correcta,
        orden: i,
      })).filter(o => o.texto);
      if (opciones.length < 2) { showToast('Necesitas al menos 2 opciones', 'error'); btn.disabled = false; return; }
      await db.from('opciones').insert(opciones);
    } else if (tipo === 'verdadero_falso') {
      const correcta = document.querySelector('input[name="correcta"]:checked')?.value;
      await db.from('opciones').insert([
        { pregunta_id: preguntaId, texto: 'Verdadero', es_correcta: correcta === '0', orden: 0 },
        { pregunta_id: preguntaId, texto: 'Falso',     es_correcta: correcta === '1', orden: 1 },
      ]);
    } else {
      const resp = document.getElementById('rc-texto').value.trim();
      const exacta = document.getElementById('rc-exacta').checked;
      if (!resp) { showToast('Escribe la respuesta correcta', 'error'); btn.disabled = false; return; }
      await db.from('respuestas_correctas').insert({ pregunta_id: preguntaId, texto: resp, es_exacta: exacta });
    }

    closeModal('modal-pregunta');
    showToast('Pregunta guardada', 'success');
    await cargarPreguntas();
  } catch (err) {
    console.error(err);
    showToast('Error al guardar pregunta', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function eliminarPregunta(id) {
  if (!confirm('Eliminar esta pregunta?')) return;
  await db.from('preguntas').delete().eq('id', id);
  showToast('Pregunta eliminada', 'success');
  await cargarPreguntas();
}

async function editarPregunta(id) {
  const { data: p } = await db.from('preguntas').select('*, opciones(*), respuestas_correctas(*)').eq('id', id).single();
  document.getElementById('pregunta-id').value = p.id;
  document.getElementById('pregunta-enunciado').value = p.enunciado;
  document.getElementById('pregunta-puntaje').value = p.puntaje;
  document.getElementById('pregunta-tipo').value = p.tipo;
  cambiarTipoPregunta(p.tipo);

  if (p.tipo === 'opcion_multiple') {
    const opts = [...(p.opciones||[])].sort((a,b)=>(a.orden||0)-(b.orden||0));
    opts.forEach((o, i) => {
      const input = document.getElementById(`opt_${i}`);
      if (input) input.value = o.texto;
      if (o.es_correcta) {
        const radio = document.querySelector(`input[name="correcta"][value="${i}"]`);
        if (radio) radio.checked = true;
      }
    });
  } else if (p.tipo === 'verdadero_falso') {
    const correcta = p.opciones?.find(o => o.es_correcta);
    if (correcta) {
      const val = correcta.texto === 'Verdadero' ? '0' : '1';
      const radio = document.querySelector(`input[name="correcta"][value="${val}"]`);
      if (radio) radio.checked = true;
    }
  } else {
    const rc = p.respuestas_correctas?.[0];
    if (rc) {
      document.getElementById('rc-texto').value = rc.texto;
      document.getElementById('rc-exacta').checked = rc.es_exacta;
    }
  }
  openModal('modal-pregunta');
}

async function verResultadosExamen(examenId, titulo) {
  const { data: intentos } = await db
    .from('intentos_examen')
    .select('*, usuarios(nombre)')
    .eq('examen_id', examenId)
    .eq('completado', true)
    .order('nota', { ascending: false });

  const total = intentos?.length || 0;
  const prom = total > 0 ? (intentos.reduce((a,i)=>a+i.nota,0)/total).toFixed(1) : '—';

  document.getElementById('ver-entrega-body').innerHTML = `
    <h3>${titulo}</h3>
    <div class="flex gap-2 mt-2 mb-3">
      <span class="badge badge-navy">${total} intentos</span>
      <span class="badge badge-gold">Promedio: ${prom}</span>
    </div>
    ${total === 0
      ? '<p class="text-gray">Sin intentos completados.</p>'
      : `<div class="table-wrap"><table>
          <thead><tr><th>Alumno</th><th>Nota</th><th>Fecha</th></tr></thead>
          <tbody>${intentos.map(i => `
            <tr>
              <td>${i.usuarios?.nombre}</td>
              <td><span class="nota-circle ${notaColor(i.nota)}" style="width:36px;height:36px;font-size:.8rem">${i.nota}</span></td>
              <td class="text-gray">${formatFecha(i.fecha_fin)}</td>
            </tr>`).join('')}
          </tbody></table></div>`
    }
  `;
  openModal('modal-ver-entrega');
}

// ── ENCUESTAS ─────────────────────────────────────────────
async function renderEncuestas() {
  const el = document.getElementById('section-encuestas');

  let query = db.from('encuestas').select('*, secciones(nombre), preguntas_encuesta(count)').order('creado_at', { ascending: false });
  if (!SESSION.es_admin && SESSION.seccion_id) query = query.eq('seccion_id', SESSION.seccion_id);
  const { data: encuestas } = await query;

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Encuestas</h2></div>
      <button class="btn btn-primary" onclick="abrirNuevaEncuesta()">+ Nueva encuesta</button>
    </div>
    ${!encuestas || encuestas.length === 0
      ? `<div class="empty-state"><div class="empty-icon">📊</div><h3>Sin encuestas</h3></div>`
      : encuestas.map(enc => `
        <div class="card mb-2">
          <div class="card-header">
            <div>
              <h3>${enc.titulo}</h3>
              <div class="flex gap-1 mt-1">
                ${enc.secciones ? `<span class="seccion-chip">${enc.secciones.nombre}</span>` : '<span class="badge badge-gray">Todas</span>'}
                ${enc.activo ? '<span class="badge badge-green">Activa</span>' : '<span class="badge badge-gray">Inactiva</span>'}
                <span class="badge badge-gold">${enc.preguntas_encuesta?.[0]?.count || 0} preguntas</span>
              </div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-${enc.activo ? 'secondary' : 'primary'}" onclick="toggleEncuesta('${enc.id}',${enc.activo})">${enc.activo ? 'Desactivar' : 'Activar'}</button>
              <button class="btn btn-sm btn-ghost" onclick="editarPreguntasEncuesta('${enc.id}','${enc.titulo}')">✏️ Preguntas</button>
              <button class="btn btn-sm btn-ghost" onclick="verResultadosEncuesta('${enc.id}','${enc.titulo}')">📊 Resultados</button>
            </div>
          </div>
        </div>`).join('')
    }
  `;
}

function abrirNuevaEncuesta() {
  document.getElementById('enc-id').value = '';
  document.getElementById('enc-titulo').value = '';
  document.getElementById('enc-desc').value = '';
  document.getElementById('enc-seccion').innerHTML = `<option value="">Todas las secciones</option>${seccionOptions()}`;
  openModal('modal-encuesta-form');
}

async function submitEncuestaForm() {
  const id      = document.getElementById('enc-id').value;
  const titulo  = document.getElementById('enc-titulo').value.trim();
  const desc    = document.getElementById('enc-desc').value.trim();
  const seccion = document.getElementById('enc-seccion').value;

  if (!titulo) { showToast('El titulo es obligatorio', 'error'); return; }

  const payload = { titulo, descripcion: desc||null, seccion_id: seccion||null, activo: true };
  if (id) {
    await db.from('encuestas').update(payload).eq('id', id);
  } else {
    await db.from('encuestas').insert(payload);
  }
  closeModal('modal-encuesta-form');
  showToast('Encuesta guardada', 'success');
  _loaded['encuestas'] = false;
  await renderEncuestas();
}

async function toggleEncuesta(id, activo) {
  await db.from('encuestas').update({ activo: !activo }).eq('id', id);
  showToast(`Encuesta ${!activo ? 'activada' : 'desactivada'}`, 'success');
  _loaded['encuestas'] = false;
  await renderEncuestas();
}

async function verResultadosEncuesta(encuestaId, titulo) {
  const { data: preguntas } = await db
    .from('preguntas_encuesta')
    .select('*, respuestas_encuesta(respuesta)')
    .eq('encuesta_id', encuestaId);

  document.getElementById('ver-entrega-body').innerHTML = `
    <h3 class="mb-3">${titulo}</h3>
    ${(preguntas||[]).map(p => {
      const resps = (p.respuestas_encuesta||[]).map(r=>r.respuesta).filter(Boolean);
      const conteo = resps.reduce((acc,r)=>{ acc[r]=(acc[r]||0)+1; return acc; }, {});
      return `
        <div style="margin-bottom:20px;padding:14px;border:1px solid var(--gray-100);border-radius:var(--radius-sm)">
          <div class="fw-600" style="font-size:14px;margin-bottom:8px">${p.texto}</div>
          <div class="label mb-1">${resps.length} respuestas</div>
          ${Object.entries(conteo).map(([v,n]) => `
            <div class="flex-between" style="font-size:13px;margin-bottom:4px">
              <span>${v}</span>
              <span class="badge badge-gold">${n}</span>
            </div>`).join('')}
          ${resps.length===0 ? '<span class="text-gray" style="font-size:13px">Sin respuestas</span>' : ''}
        </div>`;
    }).join('')}
  `;
  openModal('modal-ver-entrega');
}

// ── FORO ──────────────────────────────────────────────────
async function renderForo() {
  const el = document.getElementById('section-foro');

  let query = db.from('foro_posts').select('*, autor:usuarios(nombre), secciones(nombre), foro_respuestas(count)').order('fijado', { ascending: false }).order('creado_at', { ascending: false });
  if (!SESSION.es_admin && SESSION.seccion_id) query = query.eq('seccion_id', SESSION.seccion_id);
  const { data: posts } = await query;

  el.innerHTML = `
    <div class="page-header"><h2>Foro de Dudas</h2></div>
    ${!posts || posts.length === 0
      ? `<div class="empty-state"><div class="empty-icon">💬</div><h3>Sin publicaciones</h3></div>`
      : posts.map(post => `
        <div class="forum-post-card ${post.fijado ? 'pinned' : ''} ${post.resuelto ? 'resolved' : ''}">
          <div class="flex-between">
            <div style="flex:1;cursor:pointer" onclick="abrirPostAdmin('${post.id}')">
              <div class="flex gap-1 mb-1">
                ${post.fijado ? '<span class="badge badge-gold">📌 Fijado</span>' : ''}
                ${post.resuelto ? '<span class="badge badge-green">✓ Resuelto</span>' : ''}
                ${post.secciones ? `<span class="seccion-chip">${post.secciones.nombre}</span>` : ''}
              </div>
              <div class="fw-600">${post.titulo}</div>
              <div style="font-size:12px;color:var(--gray-500);margin-top:4px">${post.autor?.nombre} • ${timeAgo(post.creado_at)} • 💬 ${post.foro_respuestas?.[0]?.count || 0}</div>
            </div>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-ghost" onclick="toggleFijado('${post.id}',${post.fijado})">${post.fijado ? '📌 Desfijar' : '📌 Fijar'}</button>
              <button class="btn btn-sm btn-ghost" onclick="toggleResuelto('${post.id}',${post.resuelto})">${post.resuelto ? '○ Pendiente' : '✓ Resuelto'}</button>
            </div>
          </div>
        </div>`).join('')
    }
  `;
}

async function toggleFijado(id, val) {
  await db.from('foro_posts').update({ fijado: !val }).eq('id', id);
  _loaded['foro'] = false;
  await renderForo();
}
async function toggleResuelto(id, val) {
  await db.from('foro_posts').update({ resuelto: !val }).eq('id', id);
  _loaded['foro'] = false;
  await renderForo();
}

async function abrirPostAdmin(postId) {
  const { data: post } = await db.from('foro_posts').select('*, autor:usuarios(nombre, foto_url)').eq('id', postId).single();
  const { data: respuestas } = await db.from('foro_respuestas').select('*, autor:usuarios(nombre,foto_url,rol)').eq('post_id', postId).order('creado_at');

  document.getElementById('post-detail-titulo').textContent = post.titulo;
  document.getElementById('post-detail-body').innerHTML = `
    <div class="flex gap-2 mb-3" style="align-items:center">
      ${renderAvatar(post.autor?.foto_url, post.autor?.nombre, 32)}
      <div><div class="fw-600">${post.autor?.nombre}</div><div class="text-gray" style="font-size:11px">${formatFechaHora(post.creado_at)}</div></div>
    </div>
    <p style="font-size:14px;margin-bottom:20px">${post.contenido}</p>
    <div style="border-top:1px solid var(--gray-100);padding-top:16px">
      <div class="label mb-2">${respuestas?.length||0} Respuestas</div>
      ${(respuestas||[]).map(r => `
        <div style="display:flex;gap:12px;margin-bottom:16px">
          ${renderAvatar(r.autor?.foto_url, r.autor?.nombre, 30)}
          <div style="flex:1;background:var(--off-white);border-radius:var(--radius-sm);padding:12px">
            <div class="flex-between mb-1">
              <span class="fw-600" style="font-size:13px">${r.autor?.nombre} ${r.autor?.rol==='docente'?'<span class="badge badge-navy" style="font-size:10px">Profe</span>':''}</span>
              <span class="text-gray" style="font-size:11px">${timeAgo(r.creado_at)}</span>
            </div>
            <p style="font-size:13px">${r.contenido}</p>
          </div>
        </div>`).join('')}
    </div>
    <div class="mt-2">
      <textarea id="nueva-respuesta-texto" class="form-textarea" placeholder="Responder como docente..." style="min-height:80px"></textarea>
      <button class="btn btn-primary btn-sm mt-1" onclick="submitRespuestaAdmin('${postId}')">Responder</button>
    </div>
  `;
  openModal('modal-post-detail');
}

async function submitRespuestaAdmin(postId) {
  const texto = document.getElementById('nueva-respuesta-texto').value.trim();
  if (!texto) return;
  await db.from('foro_respuestas').insert({ post_id: postId, autor_id: SESSION.id, contenido: texto });
  showToast('Respuesta publicada', 'success');
  await abrirPostAdmin(postId);
}

// ── CONFIG ─────────────────────────────────────────────────
async function renderConfig() {
  const el = document.getElementById('section-config');

  const { data: secciones } = await db.from('secciones').select('*, materias(nombre)').order('nombre');
  const { data: materias }  = await db.from('materias').select('*').order('nombre');

  el.innerHTML = `
    <div class="page-header"><h2>Configuracion</h2></div>
    <div class="grid-2 gap-3">
      <div class="card">
        <div class="card-header"><h3>Materias</h3><button class="btn btn-sm btn-primary" onclick="nuevaMateria()">+ Agregar</button></div>
        <div class="card-body">
          ${(materias||[]).length === 0 ? '<p class="text-gray" style="font-size:14px">Sin materias.</p>' : ''}
          ${(materias||[]).map(m => `
            <div class="flex-between mb-2" style="padding:8px 0;border-bottom:1px solid var(--gray-100)">
              <span class="fw-600">${m.nombre}</span>
              <div class="flex gap-1">
                <button class="btn btn-sm btn-ghost" onclick="editarMateria('${m.id}')">✏️</button>
                <button class="btn btn-sm btn-ghost" onclick="eliminarMateria('${m.id}')">🗑</button>
              </div>
            </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Secciones</h3><button class="btn btn-sm btn-primary" onclick="nuevaSeccion()">+ Agregar</button></div>
        <div class="card-body">
          ${(secciones||[]).length === 0 ? '<p class="text-gray" style="font-size:14px">Sin secciones.</p>' : ''}
          ${(secciones||[]).map(s => `
            <div class="flex-between mb-2" style="padding:8px 0;border-bottom:1px solid var(--gray-100)">
              <div><span class="seccion-chip">${s.nombre}</span> <span class="text-gray" style="font-size:13px;margin-left:8px">${s.materias?.nombre||'—'}</span></div>
              <div class="flex gap-1">
                <button class="btn btn-sm btn-ghost" onclick="editarSeccion('${s.id}')">✏️</button>
                <button class="btn btn-sm btn-ghost" onclick="eliminarSeccion('${s.id}')">🗑</button>
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3>Reset anual</h3></div>
      <div class="card-body">
        <p style="font-size:14px;color:var(--gray-500);margin-bottom:16px">Elimina todas las notas, entregas e intentos de examen del ciclo actual. Los alumnos, tareas y examenes se conservan.</p>
        <button class="btn btn-danger" onclick="resetAnual()">⚠️ Ejecutar reset anual</button>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-header"><h3>Mi cuenta</h3></div>
      <div class="card-body">
        <div class="flex gap-2 mb-3">
          ${renderAvatar(SESSION.foto_url, SESSION.nombre, 60)}
          <div>
            <div class="fw-600">${SESSION.nombre}</div>
            <div class="text-gray">${SESSION.email}</div>
            <span class="badge badge-navy mt-1">Docente</span>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="cambiarPassword()">Cambiar contrasena</button>
      </div>
    </div>
  `;
}

function nuevaMateria() {
  document.getElementById('materia-id').value = '';
  document.getElementById('materia-nombre').value = '';
  document.getElementById('modal-materia-titulo').textContent = 'Nueva materia';
  openModal('modal-materia');
}

async function submitMateria() {
  const id     = document.getElementById('materia-id').value;
  const nombre = document.getElementById('materia-nombre').value.trim();
  if (!nombre) { showToast('Escribe el nombre', 'error'); return; }
  const btn = document.getElementById('btn-submit-materia');
  btn.disabled = true;
  try {
    if (id) {
      await db.from('materias').update({ nombre }).eq('id', id);
      showToast('Materia actualizada', 'success');
    } else {
      await db.from('materias').insert({ nombre });
      showToast('Materia creada', 'success');
    }
    closeModal('modal-materia');
    await cargarSeccionesYMaterias();
    _loaded['config'] = false; await renderConfig();
  } catch (err) {
    showToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function editarMateria(id) {
  const m = _MATERIAS.find(m => m.id === id);
  if (!m) return;
  document.getElementById('materia-id').value = m.id;
  document.getElementById('materia-nombre').value = m.nombre;
  document.getElementById('modal-materia-titulo').textContent = 'Editar materia';
  openModal('modal-materia');
}

async function eliminarMateria(id) {
  if (!confirm('Eliminar materia? Se eliminaran las secciones asociadas.')) return;
  await db.from('materias').delete().eq('id', id);
  showToast('Materia eliminada', 'success');
  await cargarSeccionesYMaterias();
  _loaded['config'] = false; await renderConfig();
}

function nuevaSeccion() {
  document.getElementById('seccion-id').value = '';
  document.getElementById('seccion-nombre').value = '';
  document.getElementById('seccion-anio').value = '1';
  document.getElementById('seccion-materia').innerHTML = `<option value="">-- Sin materia --</option>${materiaOptions()}`;
  document.getElementById('modal-seccion-titulo').textContent = 'Nueva seccion';
  openModal('modal-seccion');
}

async function editarSeccion(id) {
  const s = _SECCIONES.find(s => s.id === id);
  if (!s) return;
  document.getElementById('seccion-id').value = s.id;
  document.getElementById('seccion-nombre').value = s.nombre;
  document.getElementById('seccion-anio').value = s.anio || 1;
  document.getElementById('seccion-materia').innerHTML = `<option value="">-- Sin materia --</option>${materiaOptions(s.materia_id)}`;
  document.getElementById('modal-seccion-titulo').textContent = 'Editar seccion';
  openModal('modal-seccion');
}

async function submitSeccion() {
  const id       = document.getElementById('seccion-id').value;
  const nombre   = document.getElementById('seccion-nombre').value.trim();
  const anio     = parseInt(document.getElementById('seccion-anio').value) || 1;
  const materia  = document.getElementById('seccion-materia').value;
  if (!nombre) { showToast('Escribe el nombre', 'error'); return; }
  const btn = document.getElementById('btn-submit-seccion');
  btn.disabled = true;
  try {
    const payload = { nombre, anio, materia_id: materia || null };
    if (id) {
      await db.from('secciones').update(payload).eq('id', id);
      showToast('Seccion actualizada', 'success');
    } else {
      await db.from('secciones').insert(payload);
      showToast('Seccion creada', 'success');
    }
    closeModal('modal-seccion');
    await cargarSeccionesYMaterias();
    _loaded['config'] = false; await renderConfig();
  } catch (err) {
    showToast('Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function eliminarSeccion(id) {
  if (!confirm('Eliminar seccion?')) return;
  await db.from('secciones').delete().eq('id', id);
  showToast('Seccion eliminada', 'success');
  await cargarSeccionesYMaterias();
  _loaded['config'] = false; await renderConfig();
}

async function resetAnual() {
  const confirmar = prompt('Escribe "RESET 2026" para confirmar el reset anual:');
  if (confirmar !== 'RESET 2026') { showToast('Reset cancelado', 'info'); return; }

  showLoading();
  try {
    await Promise.all([
      db.from('entregas_tareas').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('respuestas_intento').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('intentos_examen').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('respuestas_encuesta').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('foro_respuestas').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
      db.from('foro_posts').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    ]);
    showToast('Reset anual completado', 'success');
  } catch (err) {
    showToast('Error en reset', 'error');
  } finally {
    hideLoading();
  }
}

async function cambiarPassword() {
  const nueva = prompt('Nueva contrasena (min 6 caracteres):');
  if (!nueva || nueva.length < 6) { showToast('Contrasena muy corta', 'error'); return; }
  const hash = await dcodeIO.bcrypt.hash(nueva, 10);
  await db.from('usuarios').update({ password_hash: hash }).eq('id', SESSION.id);
  showToast('Contrasena actualizada', 'success');
}

function logout() {
  clearSession();
  window.location.href = '/index.html';
}

// ── DOCENTES ──────────────────────────────────────────────
async function renderDocentes() {
  const el = document.getElementById('section-docentes');

  const { data: docentes } = await db
    .from('usuarios')
    .select('*, secciones(nombre)')
    .eq('rol', 'docente')
    .eq('activo', true)
    .order('nombre');

  el.innerHTML = `
    <div class="page-header flex-between">
      <div><h2>Docentes</h2><p>${docentes?.length || 0} docentes registrados</p></div>
      <button class="btn btn-primary" onclick="abrirNuevoDocente()">+ Nuevo docente</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Docente</th><th>Email</th><th>Seccion</th><th>Rol</th><th></th></tr></thead>
        <tbody>
          ${!docentes || docentes.length === 0
            ? '<tr><td colspan="5"><div class="empty-state"><div class="empty-icon">👨‍🏫</div><h3>Sin docentes</h3><p>Crea el primer docente.</p></div></td></tr>'
            : docentes.map(d => `
              <tr>
                <td>
                  <div class="flex gap-1" style="align-items:center">
                    ${renderAvatar(d.foto_url, d.nombre, 36)}
                    <div>
                      <div class="fw-600">${d.nombre}</div>
                      ${d.id === SESSION.id ? '<span class="badge badge-gold" style="font-size:10px">Tu cuenta</span>' : ''}
                    </div>
                  </div>
                </td>
                <td class="text-gray">${d.email}</td>
                <td>${d.secciones ? `<span class="seccion-chip">${d.secciones.nombre}</span>` : '<span class="badge badge-gray">Todas</span>'}</td>
                <td>${d.es_admin ? '<span class="badge badge-navy">Superadmin</span>' : '<span class="badge badge-gold">Docente</span>'}</td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-sm btn-ghost" onclick="editarDocente('${d.id}')">✏️ Editar</button>
                    ${d.id !== SESSION.id
                      ? `<button class="btn btn-sm btn-ghost" onclick="desactivarDocente('${d.id}')">🗑 Desactivar</button>`
                      : ''}
                  </div>
                </td>
              </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function abrirNuevoDocente() {
  document.getElementById('modal-docente-titulo').textContent = 'Nuevo docente';
  document.getElementById('docente-id').value = '';
  document.getElementById('docente-nombre').value = '';
  document.getElementById('docente-email').value = '';
  document.getElementById('docente-pass').value = '';
  document.getElementById('docente-seccion').innerHTML = `<option value="">-- Todas las secciones (admin) --</option>${seccionOptions()}`;
  document.getElementById('docente-foto-preview').innerHTML = '';
  openModal('modal-docente');
}

async function editarDocente(id) {
  const { data: d } = await db.from('usuarios').select('*').eq('id', id).single();
  document.getElementById('modal-docente-titulo').textContent = 'Editar docente';
  document.getElementById('docente-id').value = d.id;
  document.getElementById('docente-nombre').value = d.nombre;
  document.getElementById('docente-email').value = d.email;
  document.getElementById('docente-pass').value = '';
  document.getElementById('docente-seccion').innerHTML = `<option value="">-- Todas las secciones (admin) --</option>${seccionOptions(d.seccion_id)}`;
  document.getElementById('docente-foto-preview').innerHTML = d.foto_url
    ? `<img src="${d.foto_url}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">` : '';
  openModal('modal-docente');
}

async function submitDocente() {
  const id      = document.getElementById('docente-id').value;
  const nombre  = document.getElementById('docente-nombre').value.trim();
  const email   = document.getElementById('docente-email').value.trim().toLowerCase();
  const pass    = document.getElementById('docente-pass').value;
  const seccion = document.getElementById('docente-seccion').value;
  const foto    = document.getElementById('docente-foto').files[0];

  if (!nombre || !email) { showToast('Nombre y email son obligatorios', 'error'); return; }
  if (!id && !pass) { showToast('La contrasena es obligatoria para nuevos docentes', 'error'); return; }
  if (pass && pass.length < 6) { showToast('La contrasena debe tener al menos 6 caracteres', 'error'); return; }

  const btn = document.getElementById('btn-submit-docente');
  btn.disabled = true; btn.textContent = 'Guardando...';

  try {
    let foto_url = null;
    if (foto) foto_url = await uploadToCloudinary(foto);

    const payload = {
      nombre, email, rol: 'docente', activo: true,
      seccion_id: seccion || null,
      es_admin: !seccion, // si no tiene seccion asignada es admin
      ...(foto_url ? { foto_url } : {}),
    };

    if (pass) {
      payload.password_hash = await dcodeIO.bcrypt.hash(pass, 10);
    }

    if (id) {
      const { error } = await db.from('usuarios').update(payload).eq('id', id);
      if (error) throw error;
      showToast('Docente actualizado', 'success');
    } else {
      const { error } = await db.from('usuarios').insert(payload);
      if (error) throw error;
      showToast('Docente creado correctamente', 'success');
    }

    closeModal('modal-docente');
    _loaded['docentes'] = false;
    await renderDocentes();
  } catch (err) {
    console.error(err);
    showToast('Error: ' + (err.message || 'Intenta de nuevo'), 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function desactivarDocente(id) {
  if (!confirm('Desactivar este docente?')) return;
  await db.from('usuarios').update({ activo: false }).eq('id', id);
  showToast('Docente desactivado', 'success');
  _loaded['docentes'] = false;
  await renderDocentes();
}

function previewFotoDocente() {
  const file = document.getElementById('docente-foto').files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  document.getElementById('docente-foto-preview').innerHTML =
    `<img src="${url}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:2px solid var(--gold)">`;
}