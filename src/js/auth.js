// ============================================================
// CuellarClass — auth.js
// Login page logic
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Si ya hay sesion activa, redirigir
  const session = getSession();
  if (session) {
    window.location.href = session.rol === 'docente' ? '/admin.html' : '/dashboard.html';
    return;
  }

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passInput  = document.getElementById('login-pass');
  const btnLogin   = document.getElementById('btn-login');
  const errMsg     = document.getElementById('login-error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errMsg.textContent = '';
    const email = emailInput.value.trim().toLowerCase();
    const pass  = passInput.value;

    if (!email || !pass) {
      errMsg.textContent = 'Ingresa tu correo y contrasena.';
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Ingresando...';

    try {
      // Buscar usuario por email
      const { data: usuarios, error } = await db
        .from('usuarios')
        .select('id, nombre, email, password_hash, rol, seccion_id, foto_url, activo')
        .eq('email', email)
        .eq('activo', true)
        .limit(1);

      console.log("usuarios:", usuarios, "error:", error);
      if (error) throw error;

      if (!usuarios || usuarios.length === 0) {
        errMsg.textContent = 'Correo o contrasena incorrectos.';
        return;
      }

      const usuario = usuarios[0];

      // Verificar password con bcrypt (cargado via CDN)
      const match = await dcodeIO.bcrypt.compare(pass, usuario.password_hash);
      if (!match) {
        errMsg.textContent = 'Correo o contrasena incorrectos.';
        return;
      }

      // Guardar sesion
      saveSession({
        id:         usuario.id,
        nombre:     usuario.nombre,
        email:      usuario.email,
        rol:        usuario.rol,
        seccion_id: usuario.seccion_id,
        foto_url:   usuario.foto_url,
      });

      // Redirigir
      window.location.href = usuario.rol === 'docente' ? '/admin.html' : '/dashboard.html';

    } catch (err) {
      console.error(err);
      errMsg.textContent = 'Error al conectar. Intenta de nuevo.';
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Ingresar';
    }
  });

  // Toggle ver contrasena
  const togglePass = document.getElementById('toggle-pass');
  if (togglePass) {
    togglePass.addEventListener('click', () => {
      const tipo = passInput.type === 'password' ? 'text' : 'password';
      passInput.type = tipo;
      togglePass.textContent = tipo === 'password' ? '👁' : '🙈';
    });
  }
});