"""
COFERSA Negociación Especial - Database Module
SQLite3 database setup, schema, and operations.
"""
import sqlite3
import os
import json
import time
import hashlib
import secrets
from datetime import datetime

DB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DB_DIR, 'cofersa_ne.db')

def get_db():
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    # Users table
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        nombre TEXT NOT NULL,
        apellido TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('vendedor','supervisor','gerente_ventas','compras','admin')),
        supervisor_id INTEGER REFERENCES users(id),
        status TEXT NOT NULL DEFAULT 'activo' CHECK(status IN ('activo','inactivo')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    
    # Approval rules table
    c.execute('''CREATE TABLE IF NOT EXISTS reglas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        marca TEXT NOT NULL,
        clasificacion TEXT NOT NULL,
        limite_vendedor   REAL NOT NULL DEFAULT 0,
        limite_supervisor REAL NOT NULL,
        limite_gte_ventas REAL NOT NULL DEFAULT 0,
        limite_compras    REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_reglas_marca ON reglas(marca)')
    
    # Budget table
    c.execute('''CREATE TABLE IF NOT EXISTS presupuesto (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supervisor TEXT NOT NULL,
        asesor TEXT NOT NULL,
        marca TEXT NOT NULL,
        ppto_mensual_crc REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_ppto_marca ON presupuesto(marca)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_ppto_asesor ON presupuesto(asesor)')
    
    # Solicitudes (requests) table
    c.execute('''CREATE TABLE IF NOT EXISTS solicitudes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folio TEXT UNIQUE,
        cliente_codigo TEXT NOT NULL,
        cliente_nombre TEXT NOT NULL,
        numero_pedido TEXT NOT NULL,
        justificacion TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente'
            CHECK(estado IN ('borrador','pendiente','en_revision','escalada','aprobada','parcialmente_aprobada','rechazada','cancelada')),
        vendedor_id INTEGER NOT NULL REFERENCES users(id),
        aprobador_actual_id INTEGER REFERENCES users(id),
        aprobador_nivel TEXT,
        aprobador_final_id INTEGER REFERENCES users(id),
        comentario_aprobador TEXT,
        monto_total_descuento REAL DEFAULT 0,
        monto_total_aprobado REAL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        approved_at TEXT,
        sla_deadline TEXT
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_sol_estado ON solicitudes(estado)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_sol_vendedor ON solicitudes(vendedor_id)')
    
    # SKU lines table
    c.execute('''CREATE TABLE IF NOT EXISTS solicitud_skus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
        marca TEXT NOT NULL,
        clasificacion TEXT,
        codigo_sku TEXT NOT NULL,
        descripcion TEXT NOT NULL,
        bdf TEXT,
        cantidad REAL NOT NULL,
        precio_base REAL NOT NULL,
        porcentaje_descuento_sol REAL NOT NULL,
        precio_solicitado REAL NOT NULL,
        monto_descuento REAL NOT NULL,
        porcentaje_aprobado REAL,
        precio_aprobado REAL,
        monto_aprobado REAL,
        sku_estado TEXT NOT NULL DEFAULT 'pendiente',
        sku_comentario TEXT,
        aprobado_por INTEGER REFERENCES users(id),
        aprobado_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_skus_sol ON solicitud_skus(solicitud_id)')
    # Migrations for existing DB
    for _col, _def in [
        ('sku_estado', "TEXT NOT NULL DEFAULT 'pendiente'"),
        ('sku_comentario', 'TEXT'),
        ('aprobado_por', 'INTEGER'),
        ('aprobado_at', 'TEXT'),
        ('bdf', 'TEXT'),
    ]:
        try:
            c.execute(f"ALTER TABLE solicitud_skus ADD COLUMN {_col} {_def}")
        except Exception: pass
    c.execute("UPDATE solicitud_skus SET sku_estado='pendiente' WHERE sku_estado IS NULL OR sku_estado=''")

    # ── Reglas migrations (v5: add limite_vendedor) ───────────────────────────
    for _rcol, _rdef in [
        ('limite_vendedor',   'REAL NOT NULL DEFAULT 0'),
        ('limite_gte_ventas', 'REAL NOT NULL DEFAULT 0'),
    ]:
        try:
            c.execute(f'ALTER TABLE reglas ADD COLUMN {_rcol} {_rdef}')
        except Exception:
            pass
    # Back-fill: if limite_vendedor=0, copy from limite_supervisor
    c.execute("""UPDATE reglas SET limite_vendedor=limite_supervisor
               WHERE limite_vendedor=0 AND limite_supervisor>0""")

    # Audit log
    c.execute('''CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        details TEXT,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at)')
    
    # Password reset requests
    c.execute('''CREATE TABLE IF NOT EXISTS password_reset_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobada','rechazada','atendida')),
        nueva_password TEXT,
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolved_by INTEGER REFERENCES users(id),
        ip_address TEXT
    )''')
    c.execute('CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_requests(user_id)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_pwreset_estado ON password_reset_requests(estado)')

    # Password reset requests
    c.execute('''CREATE TABLE IF NOT EXISTS password_reset_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        estado TEXT NOT NULL DEFAULT 'pendiente',
        nueva_password TEXT,
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolved_by INTEGER REFERENCES users(id),
        ip_address TEXT
    )''')
    try:
        c.execute('CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_reset_requests(user_id)')
    except Exception: pass

    # Sessions
    c.execute('''CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
    )''')
    
    # Email log
    c.execute('''CREATE TABLE IF NOT EXISTS email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        solicitud_id INTEGER,
        recipients TEXT,
        subject TEXT,
        body_preview TEXT,
        status TEXT DEFAULT 'pending',
        error_msg TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    
    # App config
    c.execute('''CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )''')
    
    conn.commit()
    
    # ── Seed users from COFERSA_Template_Usuarios.xlsx ─────────────────────────
    c.execute("SELECT COUNT(*) FROM users")
    if c.fetchone()[0] == 0:
        import os as _os
        import sys as _sys
        _base = _os.path.dirname(_os.path.abspath(__file__))
        _sys.path.insert(0, _base)
        import xlsx_reader as _xr

        # Build supervisor map from presupuesto file (supervisor_username -> [asesor_username])
        _ppto_file = _os.path.join(_base, 'COFERSA_Template_Presupuesto.xlsx')
        _sup_map = {}  # asesor_username -> supervisor_username
        if _os.path.exists(_ppto_file):
            try:
                _pptos = _xr.import_presupuesto_from_xlsx(_ppto_file)
                for _p in _pptos:
                    _a = str(_p.get('asesor', '')).strip()
                    _s = str(_p.get('supervisor', '')).strip()
                    if _a and _s and _a not in _sup_map:
                        _sup_map[_a] = _s
            except Exception as _ep:
                print(f'Warning: could not build supervisor map: {_ep}')

        # Load users from template
        _users_file = _os.path.join(_base, 'COFERSA_Template_Usuarios.xlsx')
        seed_users = []
        if _os.path.exists(_users_file):
            try:
                _raw = _xr.read_xlsx(_users_file)
                for _r in _raw:
                    _email = str(_r.get('Correo (email)', _r.get('correo', ''))).strip()
                    _nombre = str(_r.get('Nombre', _r.get('nombre', ''))).strip()
                    _apellido = str(_r.get('Apellido', _r.get('apellido', ''))).strip()
                    _role = str(_r.get('Rol', _r.get('rol', 'vendedor'))).strip().lower()
                    _status = str(_r.get('Estado', _r.get('estado', 'activo'))).strip().lower()
                    if _email:
                        _uname = _email.replace('@cofersa.cr', '').replace('@', '_').lower()
                        # Supervisor username: from presupuesto map for vendedores
                        _sup_u = _sup_map.get(_uname) if _role == 'vendedor' else None
                        seed_users.append((_email, _nombre, _apellido, _role, _status, _sup_u))
            except Exception as _e:
                print(f'Warning: could not load users xlsx: {_e}')

        # Fallback hardcoded users if xlsx failed
        if not seed_users:
            seed_users = [
                ('lvargas@cofersa.cr',   'Luis Carlos', 'Vargas',   'supervisor',     'activo', None),
                ('jgarcia@cofersa.cr',   'Jorge',       'García',   'gerente_ventas', 'activo', None),
                ('compras@cofersa.cr',   'Gerentes',    'de Marca', 'compras',        'activo', None),
                ('compras2@cofersa.cr',  'Ana',         'Mora',     'compras',        'activo', None),
                ('abarrios@cofersa.cr',  'Alejandro',   'Barrios',  'admin',          'activo', None),
                ('falvarado@cofersa.cr', 'Freddy',      'Alvarado', 'vendedor',       'activo', 'lvargas'),
            ]

        # Insert: non-vendedores first (pass 0), then vendedores (pass 1)
        for _pass in (0, 1):
            for _email, _nombre, _apellido, _role, _status, _sup_uname in seed_users:
                _is_vendedor = (_role == 'vendedor')
                if (_pass == 0 and _is_vendedor) or (_pass == 1 and not _is_vendedor):
                    continue
                _uname = _email.replace('@cofersa.cr', '').replace('@', '_').lower()
                _salt = secrets.token_hex(16)
                _hash = hashlib.sha256((_salt + 'Cofersa123!').encode()).hexdigest()
                _sup_id = None
                if _sup_uname:
                    _sup_row = c.execute("SELECT id FROM users WHERE username=?", (_sup_uname,)).fetchone()
                    if _sup_row:
                        _sup_id = _sup_row[0]
                try:
                    c.execute(
                        'INSERT INTO users (username, password_hash, salt, nombre, apellido, email, role, supervisor_id, status) VALUES (?,?,?,?,?,?,?,?,?)',
                        (_uname, _hash, _salt, _nombre, _apellido, _email, _role, _sup_id, _status)
                    )
                except Exception:
                    pass
        conn.commit()

    # ── Seed reglas from Reglas.xlsx ─────────────────────────────────────────
    c.execute("SELECT COUNT(*) FROM reglas")
    if c.fetchone()[0] == 0:
        import os as _os2
        _base2 = _os2.path.dirname(_os2.path.abspath(__file__))
        _reglas_file = _os2.path.join(_base2, 'COFERSA_Template_Reglas.xlsx')
        if _os2.path.exists(_reglas_file):
            try:
                import sys as _sys2
                _sys2.path.insert(0, _base2)
                import xlsx_reader as _xr2
                _reglas = _xr2.import_reglas_from_xlsx(_reglas_file)
                for _r in _reglas:
                    if _r.get('marca') and _r['marca'] != 'Marca':
                        c.execute(
                            'INSERT INTO reglas (marca, clasificacion, limite_vendedor, limite_supervisor, limite_gte_ventas, limite_compras) VALUES (?,?,?,?,?,?)',
                            (_r['marca'], _r['clasificacion'],
                             float(_r.get('limite_vendedor', _r.get('limite_supervisor', 0))),
                             float(_r.get('limite_supervisor', 0)),
                             float(_r.get('limite_gte_ventas', 0)),
                             float(_r.get('limite_compras', 0)))
                        )
                conn.commit()
            except Exception as _e2:
                print(f'Warning: could not load reglas xlsx: {_e2}')

    # ── Seed presupuesto from Presupuesto.xlsx ───────────────────────────────
    c.execute("SELECT COUNT(*) FROM presupuesto")
    if c.fetchone()[0] == 0:
        import os as _os3
        _base3 = _os3.path.dirname(_os3.path.abspath(__file__))
        _ppto_file = _os3.path.join(_base3, 'COFERSA_Template_Presupuesto.xlsx')
        if _os3.path.exists(_ppto_file):
            try:
                import sys as _sys3
                _sys3.path.insert(0, _base3)
                import xlsx_reader as _xr3
                _pptos = _xr3.import_presupuesto_from_xlsx(_ppto_file)
                for _p in _pptos:
                    if _p.get('supervisor') and _p.get('marca'):
                        c.execute(
                            'INSERT INTO presupuesto (supervisor, asesor, marca, ppto_mensual_crc) VALUES (?,?,?,?)',
                            (_p['supervisor'], _p['asesor'], _p['marca'], float(_p['ppto_mensual_crc']))
                        )
                conn.commit()
            except Exception as _e3:
                print(f'Warning: could not load presupuesto xlsx: {_e3}')
    
    # Default config
    defaults = {
        'smtp_host': 'smtp.gmail.com',
        'smtp_port': '587',
        'smtp_user': '',
        'smtp_password': '',
        'smtp_from': 'negociacionespecial@cofersa.cr',
        'email_ne_team': 'negociacionespecial@cofersa.cr',
        'app_name': 'COFERSA - Negociación Especial',
        'base_url': 'http://localhost:8080',
    }
    for k, v in defaults.items():
        c.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?,?)", (k, v))
    conn.commit()
    conn.close()

def hash_password(password, salt=None):
    if salt is None:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.sha256((salt + password).encode()).hexdigest()
    return pw_hash, salt

def verify_password(password, pw_hash, salt):
    return hashlib.sha256((salt + password).encode()).hexdigest() == pw_hash

def create_session(user_id):
    token = secrets.token_urlsafe(48)
    conn = get_db()
    expires = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    # Session valid for 12 hours
    from datetime import timedelta
    exp = (datetime.utcnow() + timedelta(hours=12)).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)",
                 (token, user_id, exp))
    conn.commit()
    conn.close()
    return token

def get_session_user(token):
    if not token:
        return None
    conn = get_db()
    now = datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
    row = conn.execute("""
        SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id
        WHERE s.token=? AND s.expires_at>? AND u.status='activo'
    """, (token, now)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_session(token):
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()

def log_audit(user_id, username, action, entity_type=None, entity_id=None,
              details=None, old_value=None, new_value=None, ip=''):
    """Open own connection. Only call when NO other connection has uncommitted writes."""
    conn = get_db()
    conn.execute("""INSERT INTO audit_log
        (user_id, username, action, entity_type, entity_id, details, old_value, new_value, ip_address)
        VALUES (?,?,?,?,?,?,?,?,?)""",
        (user_id, username, action, entity_type, entity_id, details, old_value, new_value, ip))
    conn.commit()
    conn.close()

def audit(conn, user_id, username, action, entity_type=None, entity_id=None,
          details=None, old_value=None, new_value=None, ip=''):
    """Write audit using an EXISTING open connection — never opens a new connection."""
    conn.execute("""INSERT INTO audit_log
        (user_id, username, action, entity_type, entity_id, details, old_value, new_value, ip_address)
        VALUES (?,?,?,?,?,?,?,?,?)""",
        (user_id, username, action, entity_type, entity_id, details, old_value, new_value, ip))

def get_config(key, default=''):
    conn = get_db()
    row = conn.execute("SELECT value FROM config WHERE key=?", (key,)).fetchone()
    conn.close()
    return row['value'] if row else default

def set_config(key, value):
    conn = get_db()
    conn.execute("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?,?,datetime('now'))",
                 (key, value))
    conn.commit()
    conn.close()

def generate_folio(conn):
    now = datetime.utcnow()
    prefix = f"NE-{now.strftime('%Y%m')}-"
    row = conn.execute(
        "SELECT folio FROM solicitudes WHERE folio LIKE ? ORDER BY folio DESC LIMIT 1",
        (prefix + '%',)
    ).fetchone()
    if row:
        try:
            last_num = int(row['folio'].split('-')[-1])
        except:
            last_num = 0
        seq = last_num + 1
    else:
        seq = 1
    return f"{prefix}{seq:06d}"
