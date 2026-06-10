-- ============================================================
-- CuellarClass — Schema completo
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. MATERIAS
CREATE TABLE materias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  color TEXT DEFAULT '#d4af37',
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SECCIONES
CREATE TABLE secciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,         -- ej: "1A", "2B"
  anio INT NOT NULL,            -- 1, 2 o 3
  materia_id UUID REFERENCES materias(id) ON DELETE SET NULL,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. USUARIOS (docente + alumnos)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('docente', 'alumno')),
  seccion_id UUID REFERENCES secciones(id) ON DELETE SET NULL,
  foto_url TEXT,
  activo BOOLEAN DEFAULT TRUE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TAREAS
CREATE TABLE tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  materia_id UUID REFERENCES materias(id) ON DELETE CASCADE,
  seccion_id UUID REFERENCES secciones(id) ON DELETE CASCADE,  -- NULL = todas las secciones de la materia
  fecha_entrega TIMESTAMPTZ,
  nota_maxima NUMERIC(5,2) DEFAULT 10,
  activo BOOLEAN DEFAULT TRUE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ENTREGAS DE TAREAS
CREATE TABLE entregas_tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id UUID REFERENCES tareas(id) ON DELETE CASCADE,
  alumno_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  texto TEXT,
  archivo_url TEXT,
  fecha_entrega TIMESTAMPTZ DEFAULT NOW(),
  nota NUMERIC(5,2),
  comentario_docente TEXT,
  calificado BOOLEAN DEFAULT FALSE,
  UNIQUE (tarea_id, alumno_id)
);

-- 6. EXAMENES
CREATE TABLE examenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  materia_id UUID REFERENCES materias(id) ON DELETE CASCADE,
  seccion_id UUID REFERENCES secciones(id) ON DELETE CASCADE,  -- NULL = todas
  tiempo_limite INT,             -- minutos, NULL = sin limite
  intentos_max INT DEFAULT 1,
  preguntas_por_intento INT DEFAULT 10,  -- cuantas del banco mostrar
  nota_maxima NUMERIC(5,2) DEFAULT 10,
  activo BOOLEAN DEFAULT FALSE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PREGUNTAS DEL BANCO
CREATE TABLE preguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examen_id UUID REFERENCES examenes(id) ON DELETE CASCADE,
  enunciado TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('opcion_multiple', 'verdadero_falso', 'respuesta_corta')),
  puntaje NUMERIC(5,2) DEFAULT 1,
  orden INT,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. OPCIONES (para opcion_multiple y verdadero_falso)
CREATE TABLE opciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID REFERENCES preguntas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  es_correcta BOOLEAN DEFAULT FALSE,
  orden INT
);

-- 9. RESPUESTA CORRECTA PARA RESPUESTA CORTA
CREATE TABLE respuestas_correctas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_id UUID REFERENCES preguntas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,           -- respuesta esperada (comparacion insensible a mayusculas)
  es_exacta BOOLEAN DEFAULT FALSE  -- FALSE = contiene el texto, TRUE = debe ser exacto
);

-- 10. INTENTOS DE EXAMEN
CREATE TABLE intentos_examen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examen_id UUID REFERENCES examenes(id) ON DELETE CASCADE,
  alumno_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_inicio TIMESTAMPTZ DEFAULT NOW(),
  fecha_fin TIMESTAMPTZ,
  nota NUMERIC(5,2),
  completado BOOLEAN DEFAULT FALSE,
  preguntas_snapshot JSONB NOT NULL,  -- array de IDs asignados al azar
  numero_intento INT DEFAULT 1
);

-- 11. RESPUESTAS DEL INTENTO
CREATE TABLE respuestas_intento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intento_id UUID REFERENCES intentos_examen(id) ON DELETE CASCADE,
  pregunta_id UUID REFERENCES preguntas(id) ON DELETE CASCADE,
  opcion_id UUID REFERENCES opciones(id) ON DELETE SET NULL,   -- para MC y VF
  texto_respuesta TEXT,                                         -- para respuesta corta
  es_correcta BOOLEAN,
  puntaje_obtenido NUMERIC(5,2) DEFAULT 0
);

-- 12. ENCUESTAS
CREATE TABLE encuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  materia_id UUID REFERENCES materias(id) ON DELETE CASCADE,
  seccion_id UUID REFERENCES secciones(id) ON DELETE CASCADE,
  activo BOOLEAN DEFAULT TRUE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. PREGUNTAS DE ENCUESTA
CREATE TABLE preguntas_encuesta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encuesta_id UUID REFERENCES encuestas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('escala', 'opcion_multiple', 'texto_libre')),
  opciones_json JSONB,  -- para opcion_multiple: ["opcion1","opcion2",...]
  orden INT
);

-- 14. RESPUESTAS DE ENCUESTA
CREATE TABLE respuestas_encuesta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_encuesta_id UUID REFERENCES preguntas_encuesta(id) ON DELETE CASCADE,
  alumno_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  respuesta TEXT,
  creado_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pregunta_encuesta_id, alumno_id)
);

-- 15. FORO — POSTS
CREATE TABLE foro_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id UUID REFERENCES materias(id) ON DELETE CASCADE,
  seccion_id UUID REFERENCES secciones(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  contenido TEXT NOT NULL,
  fijado BOOLEAN DEFAULT FALSE,
  resuelto BOOLEAN DEFAULT FALSE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. FORO — RESPUESTAS
CREATE TABLE foro_respuestas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES foro_posts(id) ON DELETE CASCADE,
  autor_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  contenido TEXT NOT NULL,
  es_solucion BOOLEAN DEFAULT FALSE,
  creado_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDICES para performance
-- ============================================================
CREATE INDEX idx_usuarios_seccion ON usuarios(seccion_id);
CREATE INDEX idx_tareas_materia ON tareas(materia_id);
CREATE INDEX idx_tareas_seccion ON tareas(seccion_id);
CREATE INDEX idx_entregas_tarea ON entregas_tareas(tarea_id);
CREATE INDEX idx_entregas_alumno ON entregas_tareas(alumno_id);
CREATE INDEX idx_preguntas_examen ON preguntas(examen_id);
CREATE INDEX idx_intentos_examen ON intentos_examen(examen_id);
CREATE INDEX idx_intentos_alumno ON intentos_examen(alumno_id);
CREATE INDEX idx_foro_posts_materia ON foro_posts(materia_id);
CREATE INDEX idx_foro_respuestas_post ON foro_respuestas(post_id);

-- ============================================================
-- DESHABILITAR RLS (igual que IDSJE Sistema)
-- ============================================================
ALTER TABLE materias DISABLE ROW LEVEL SECURITY;
ALTER TABLE secciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE tareas DISABLE ROW LEVEL SECURITY;
ALTER TABLE entregas_tareas DISABLE ROW LEVEL SECURITY;
ALTER TABLE examenes DISABLE ROW LEVEL SECURITY;
ALTER TABLE preguntas DISABLE ROW LEVEL SECURITY;
ALTER TABLE opciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_correctas DISABLE ROW LEVEL SECURITY;
ALTER TABLE intentos_examen DISABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_intento DISABLE ROW LEVEL SECURITY;
ALTER TABLE encuestas DISABLE ROW LEVEL SECURITY;
ALTER TABLE preguntas_encuesta DISABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas_encuesta DISABLE ROW LEVEL SECURITY;
ALTER TABLE foro_posts DISABLE ROW LEVEL SECURITY;
ALTER TABLE foro_respuestas DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- DATOS INICIALES (docente)
-- password: admin2026 → hash bcrypt generado en app al crear
-- Insertar despues de correr el app por primera vez
-- ============================================================
-- INSERT INTO materias (nombre) VALUES ('Informatica'), ('Programacion');
