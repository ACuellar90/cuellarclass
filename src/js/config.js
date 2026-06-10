// ============================================================
// CuellarClass — config.js
// IMPORTANTE: reemplazar con tus credenciales de Supabase
// ============================================================

const SUPABASE_URL = 'https://zjlltoahotfughsfvxoy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqbGx0b2Fob3RmdWdoc2Z2eG95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTczNDksImV4cCI6MjA5NjY5MzM0OX0.yek1xumidpwEcENtHy4IsC9guNbqZbFdkA8JQRJ2pZ0';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cloudinary
const CLOUDINARY_CLOUD = 'dpfwjnq1f';
const CLOUDINARY_PRESET = 'idsje_fotos';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`;

// ── TOAST ──────────────────────────────────────────────────
function showToast(msg, type = 'default', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ', default: '●' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || '●'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(20px)'; toast.style.transition = '.3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── LOADING ────────────────────────────────────────────────
function showLoading() {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    el.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
}
function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ── MODAL HELPERS ──────────────────────────────────────────
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add('hidden'); document.body.style.overflow = ''; }
}
// Cerrar modal al click en overlay
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
    document.body.style.overflow = '';
  }
});

// ── AVATAR ────────────────────────────────────────────────
function renderAvatar(fotoUrl, nombre, size = 36) {
  if (fotoUrl) {
    return `<img src="${fotoUrl}" class="avatar" style="width:${size}px;height:${size}px;" alt="${nombre}">`;
  }
  const inicial = (nombre || 'A').charAt(0).toUpperCase();
  const fs = Math.round(size * 0.38);
  return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;font-size:${fs}px;">${inicial}</div>`;
}

// ── UPLOAD CLOUDINARY ────────────────────────────────────
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_PRESET);
  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error('Error al subir imagen');
}

// ── FORMATEO ──────────────────────────────────────────────
function formatFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-SV', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatFechaHora(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-SV', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function notaColor(nota, max = 10) {
  const pct = (nota / max) * 10;
  if (pct >= 7) return 'alta';
  if (pct >= 5) return 'media';
  return 'baja';
}
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

// ── TABS ───────────────────────────────────────────────────
function initTabs(containerSelector) {
  document.querySelectorAll(`${containerSelector} .tab-btn`).forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll(`${containerSelector} .tab-btn`).forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`${containerSelector} .tab-content`).forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tc = document.getElementById(target);
      if (tc) tc.classList.add('active');
    });
  });
}

// ── SESION (localStorage simple) ─────────────────────────
function getSession() {
  try { return JSON.parse(localStorage.getItem('cc_session') || 'null'); } catch { return null; }
}
function saveSession(data) {
  localStorage.setItem('cc_session', JSON.stringify(data));
}
function clearSession() {
  localStorage.removeItem('cc_session');
}
function requireAuth(allowedRoles = []) {
  const session = getSession();
  if (!session) { window.location.href = '/index.html'; return null; }
  if (allowedRoles.length && !allowedRoles.includes(session.rol)) {
    window.location.href = session.rol === 'docente' ? '/admin.html' : '/dashboard.html';
    return null;
  }
  return session;
}

// ── SHUFFLE (para banco de preguntas) ─────────────────────
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── MOBILE SIDEBAR ────────────────────────────────────────
function initMobileSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!hamburger) return;
  hamburger.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });
}
