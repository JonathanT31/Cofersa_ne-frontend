#!/usr/bin/env python3
"""
COFERSA NE - Sistema de Negociación Especial v5.2.1
===============================================
Web app for managing special negotiation discounts.
Runs on Python 3.12+ with ZERO external dependencies.

Usage:
    python main.py              # Runs on port 8080
    python main.py 9090         # Runs on custom port
    python main.py 0.0.0.0 8080 # Binds to all interfaces
"""
import http.server
import http.cookies
import urllib.parse
import json
import os
import sys
import io
import csv
import re
import tempfile
import traceback
import shutil
from datetime import datetime, timedelta

def add_business_hours(start_dt, hours):
    """Add business hours (Mon-Fri 07:00-16:30) to a datetime."""
    WORK_START = 7    # 07:00
    WORK_END   = 16   # 16:30 → use 16.5 fractional hours
    WORK_END_MINS = 30

    remaining = hours
    current = start_dt

    # If we start outside business hours, snap to next business start
    def next_business_start(dt):
        # If weekend, advance to Monday
        while dt.weekday() >= 5:  # 5=Sat, 6=Sun
            dt = dt.replace(hour=WORK_START, minute=0, second=0) + timedelta(days=1)
        if dt.hour < WORK_START:
            dt = dt.replace(hour=WORK_START, minute=0, second=0)
        elif dt.hour > WORK_END or (dt.hour == WORK_END and dt.minute >= WORK_END_MINS):
            dt = dt + timedelta(days=1)
            dt = dt.replace(hour=WORK_START, minute=0, second=0)
            while dt.weekday() >= 5:
                dt = dt + timedelta(days=1)
        return dt

    current = next_business_start(current)

    while remaining > 0:
        # Minutes left in current business day
        end_of_day = current.replace(hour=WORK_END, minute=WORK_END_MINS, second=0)
        mins_left_today = (end_of_day - current).total_seconds() / 3600
        if remaining <= mins_left_today:
            current = current + timedelta(hours=remaining)
            remaining = 0
        else:
            remaining -= mins_left_today
            # Jump to next business day start
            current = current + timedelta(days=1)
            current = current.replace(hour=WORK_START, minute=0, second=0)
            while current.weekday() >= 5:
                current = current + timedelta(days=1)

    return current
from functools import wraps

# Add project root to path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import database as db
import xlsx_reader
import email_service
from templates import (layout, esc, format_crc, format_pct, page_login,
                       page_home, estado_badge, APP_VERSION, CSS, JS_COMMON)

# Initialize database on import
db.init_db()

# ==================== PRELOAD SEED DATA ====================
def preload_seed_data():
    """Load seed Excel files if database is empty."""
    conn = db.get_db()
    
    # Check if reglas are already loaded
    count = conn.execute("SELECT COUNT(*) FROM reglas").fetchone()[0]
    if count == 0:
        seed_reglas = os.path.join(BASE_DIR, 'data', 'seed_Reglas.xlsx')
        if os.path.exists(seed_reglas):
            try:
                data = xlsx_reader.import_reglas_from_xlsx(seed_reglas)
                for r in data:
                    conn.execute("""INSERT INTO reglas (marca, clasificacion, limite_vendedor, limite_supervisor, limite_gte_ventas, limite_compras)
                                    VALUES (?,?,?,?,?,?)""",
                                 (r['marca'], r['clasificacion'],
                                  float(r.get('limite_vendedor', r.get('limite_supervisor',0))),
                                  float(r.get('limite_supervisor',0)),
                                  float(r.get('limite_gte_ventas',0)), r['limite_compras']))
                conn.commit()
                print(f"  Loaded {len(data)} approval rules from seed file.")
            except Exception as e:
                print(f"  Warning: Could not load seed reglas: {e}")
    
    count = conn.execute("SELECT COUNT(*) FROM presupuesto").fetchone()[0]
    if count == 0:
        seed_ppto = os.path.join(BASE_DIR, 'data', 'seed_Presupuesto.xlsx')
        if os.path.exists(seed_ppto):
            try:
                data = xlsx_reader.import_presupuesto_from_xlsx(seed_ppto)
                for r in data:
                    conn.execute("""INSERT INTO presupuesto (supervisor, asesor, marca, ppto_mensual_crc)
                                    VALUES (?,?,?,?)""",
                                 (r['supervisor'], r['asesor'], r['marca'], r['ppto_mensual_crc']))
                conn.commit()
                print(f"  Loaded {len(data)} budget records from seed file.")
            except Exception as e:
                print(f"  Warning: Could not load seed presupuesto: {e}")
    
    conn.close()


# ==================== HTTP HANDLER ====================
class RequestHandler(http.server.BaseHTTPRequestHandler):
    """Main HTTP request handler with routing."""
    
    def log_message(self, fmt, *args):
        ts = datetime.now().strftime('%H:%M:%S')
        print(f"[{ts}] {args[0] if args else ''}")
    
    # ---------- Cookie / Session Helpers ----------
    def get_cookie(self, name):
        cookie_str = self.headers.get('Cookie', '')
        cookies = http.cookies.SimpleCookie()
        try:
            cookies.load(cookie_str)
        except:
            return None
        if name in cookies:
            return cookies[name].value
        return None
    
    def set_cookie(self, name, value, max_age=43200):
        cookie = http.cookies.SimpleCookie()
        cookie[name] = value
        cookie[name]['path'] = '/'
        cookie[name]['max-age'] = max_age
        cookie[name]['httponly'] = True
        cookie[name]['samesite'] = 'Lax'
        return cookie[name].OutputString()
    
    def get_user(self):
        token = self.get_cookie('session')
        if token:
            return db.get_session_user(token)
        return None
    
    def require_auth(self, allowed_roles=None):
        user = self.get_user()
        if not user:
            self.redirect('/login')
            return None
        if allowed_roles and user['role'] not in allowed_roles:
            self.send_error_page(403, 'No tiene permisos para acceder a esta página.')
            return None
        return user
    
    def get_client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0])
    
    # ---------- Response Helpers ----------
    def respond_html(self, html_content, status=200, extra_headers=None):
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        data = html_content.encode('utf-8')
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)
    
    def respond_json(self, obj, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        data = json.dumps(obj, ensure_ascii=False, default=str).encode('utf-8')
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)
    
    def respond_csv(self, csv_text, filename='export.csv'):
        self.send_response(200)
        self.send_header('Content-Type', 'text/csv; charset=utf-8')
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        data = csv_text.encode('utf-8-sig')  # BOM for Excel
        self.send_header('Content-Length', len(data))
        self.end_headers()
        self.wfile.write(data)
    
    def redirect(self, url, extra_headers=None):
        self.send_response(302)
        self.send_header('Location', url)
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
    
    def send_error_page(self, code, message):
        content = f'''<div class="card" style="text-align:center;padding:40px;">
            <h1 style="color:var(--danger);">Error {code}</h1>
            <p style="margin:20px 0;">{esc(message)}</p>
            <a href="/" class="btn btn-primary">Volver al inicio</a>
        </div>'''
        user = self.get_user()
        self.respond_html(layout(f'Error {code}', content, user), code)
    
    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(length)
    
    def parse_form(self):
        content_type = self.headers.get('Content-Type', '')
        if 'multipart/form-data' in content_type:
            body = self.read_body()
            return self._parse_multipart(content_type, body)
        else:
            body = self.read_body()
            if content_type.startswith('application/json'):
                return json.loads(body)
            return dict(urllib.parse.parse_qsl(body.decode('utf-8')))
    
    def _parse_multipart(self, content_type, body):
        """Parse multipart/form-data without cgi module."""
        result = {}
        # Extract boundary
        for part in content_type.split(';'):
            part = part.strip()
            if part.startswith('boundary='):
                boundary = part[9:].strip('"')
                break
        else:
            return result
        
        boundary_bytes = ('--' + boundary).encode()
        end_boundary = ('--' + boundary + '--').encode()
        
        parts = body.split(boundary_bytes)
        for part in parts:
            if not part or part.strip() == b'' or part.strip() == b'--':
                continue
            part = part.lstrip(b'\r\n')
            if part.startswith(b'--'):
                continue
            
            # Split headers from body
            if b'\r\n\r\n' in part:
                headers_raw, part_body = part.split(b'\r\n\r\n', 1)
            elif b'\n\n' in part:
                headers_raw, part_body = part.split(b'\n\n', 1)
            else:
                continue
            
            # Remove trailing boundary marker
            if part_body.endswith(b'\r\n'):
                part_body = part_body[:-2]
            elif part_body.endswith(b'\n'):
                part_body = part_body[:-1]
            
            # Parse headers
            headers_str = headers_raw.decode('utf-8', errors='replace')
            name = None
            filename = None
            for line in headers_str.split('\n'):
                line = line.strip()
                if line.lower().startswith('content-disposition:'):
                    for param in line.split(';'):
                        param = param.strip()
                        if param.startswith('name='):
                            name = param[5:].strip('"')
                        elif param.startswith('filename='):
                            filename = param[9:].strip('"')
            
            if name:
                if filename:
                    result[name] = {'filename': filename, 'data': part_body}
                else:
                    result[name] = part_body.decode('utf-8', errors='replace')
        
        return result
    
    # ---------- ROUTING ----------
    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip('/')
            if not path:
                path = '/'
            query = dict(urllib.parse.parse_qsl(parsed.query))
            
            routes = {
                '/login': self.page_login_get,
                '/logout': self.page_logout,
                '/': self.page_home,
                '/solicitud/nueva': self.page_nueva_solicitud,
                '/mis-solicitudes': self.page_mis_solicitudes,
                '/bandeja': self.page_bandeja,
                '/dashboard': self.page_dashboard,
                '/admin/reglas': self.page_admin_reglas,
                '/admin/presupuesto': self.page_admin_presupuesto,
                '/admin/usuarios': self.page_admin_usuarios,
                '/admin/solicitudes': self.page_admin_solicitudes,
                '/admin/auditoria': self.page_admin_auditoria,
                '/admin/config': self.page_admin_config,
                '/static/nueva_solicitud.js': self.serve_nueva_solicitud_js,
                '/static/infocompras.js':     self.serve_infocompras_js,
                '/admin/password-resets': self.page_admin_password_resets,
                '/cambiar-password': self.page_cambiar_password,
                '/solicitar-reset': self.page_solicitar_reset,
                '/admin/password-resets': self.page_admin_password_resets,
                '/cambiar-password': self.page_cambiar_password,
                '/solicitar-reset': self.page_solicitar_reset,
                '/exportar': self.page_exportar,
                '/api/reglas/marca': self.api_reglas_marca,
                '/api/ppto/marca': self.api_ppto_marca,
                '/email/preview': self.page_email_preview,
                '/api/marcas': self.api_marcas,
                '/api/stats': self.api_stats,
            }
            
            handler = routes.get(path)
            if handler:
                handler(query)
                return
            
            # Dynamic routes
            m = re.match(r'/solicitud/(\d+)', path)
            if m:
                self.page_solicitud_detalle(int(m.group(1)), query)
                return
            
            m = re.match(r'/api/export/(\w+)', path)
            if m:
                self.api_export(m.group(1), query)
                return

            m = re.match(r'/email/preview/(\d+)', path)
            if m:
                self.page_email_preview(int(m.group(1)), query)
                return

            self.send_error_page(404, 'Página no encontrada.')
        except Exception as e:
            traceback.print_exc()
            self.send_error_page(500, f'Error interno: {str(e)}')
    
    def do_POST(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path.rstrip('/')
            if not path:
                path = '/'
            
            routes = {
                '/login': self.page_login_post,
                '/api/solicitud/crear': self.api_solicitud_crear,
                '/api/solicitud/aprobar': self.api_solicitud_aprobar,
                '/api/solicitud/rechazar': self.api_solicitud_rechazar,
                '/api/solicitud/cancelar': self.api_solicitud_cancelar,
                '/admin/reglas/import': self.api_reglas_import,
                '/admin/reglas/save': self.api_reglas_save,
                '/admin/reglas/delete': self.api_reglas_delete,
                '/admin/presupuesto/import': self.api_presupuesto_import,
                '/admin/presupuesto/save': self.api_presupuesto_save,
                '/admin/presupuesto/delete': self.api_presupuesto_delete,
                '/admin/usuarios/save': self.api_usuarios_save,
                '/admin/usuarios/delete': self.api_usuarios_delete,
                '/admin/usuarios/import': self.api_usuarios_import,
                '/admin/config/save': self.api_config_save,
                '/api/cambiar-password': self.api_cambiar_password,
                '/api/solicitar-reset': self.api_solicitar_reset,
                '/api/password-reset/approve': self.api_password_reset_approve,
                '/api/password-reset/bulk-approve': self.api_password_reset_bulk_approve,
                '/api/cambiar-password': self.api_cambiar_password,
                '/api/solicitar-reset': self.api_solicitar_reset,
                '/api/password-reset/approve': self.api_password_reset_approve,
                '/api/password-reset/bulk-approve': self.api_password_reset_bulk_approve,
            }
            
            handler = routes.get(path)
            if handler:
                handler()
                return
            
            self.send_error_page(404, 'Ruta no encontrada.')
        except Exception as e:
            traceback.print_exc()
            if self.headers.get('Content-Type', '').startswith('application/json'):
                self.respond_json({'ok': False, 'error': str(e)}, 500)
            else:
                self.send_error_page(500, f'Error interno: {str(e)}')
    
    # ========== AUTH PAGES ==========
    def page_login_get(self, query=None):
        user = self.get_user()
        if user:
            self.redirect('/')
            return
        self.respond_html(page_login(query.get('error', '') if query else ''))
    
    def page_login_post(self):
        data = self.parse_form()
        username = data.get('username', '').strip().lower()
        password = data.get('password', '')
        
        # Remove @cofersa.cr if present
        username = username.replace('@cofersa.cr', '')
        
        conn = db.get_db()
        user = conn.execute("SELECT * FROM users WHERE username=? AND status='activo'",
                           (username,)).fetchone()
        conn.close()
        
        if user and db.verify_password(password, user['password_hash'], user['salt']):
            token = db.create_session(user['id'])
            db.log_audit(user['id'], username, 'login', ip=self.get_client_ip())
            cookie_header = self.set_cookie('session', token)
            self.redirect('/', extra_headers={'Set-Cookie': cookie_header})
        else:
            self.respond_html(page_login('Usuario o contraseña incorrectos.'))
    
    def page_logout(self, query=None):
        token = self.get_cookie('session')
        if token:
            user = db.get_session_user(token)
            if user:
                db.log_audit(user['id'], user['username'], 'logout', ip=self.get_client_ip())
            db.delete_session(token)
        cookie_header = self.set_cookie('session', '', 0)
        self.redirect('/login', extra_headers={'Set-Cookie': cookie_header})
    
    # ========== HOME ==========
    def page_home(self, query=None):
        user = self.require_auth()
        if not user:
            return
        
        conn = db.get_db()
        now = datetime.now()
        month_start = now.strftime('%Y-%m-01')
        stats = {}
        
        if user['role'] == 'vendedor':
            stats['mis_pendientes'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE vendedor_id=? AND estado IN ('pendiente','en_revision','escalada','parcialmente_aprobada')",
                (user['id'],)).fetchone()[0]
            stats['mis_aprobadas'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE vendedor_id=? AND estado='aprobada' AND approved_at>=?",
                (user['id'], month_start)).fetchone()[0]
            r = conn.execute(
                "SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes WHERE vendedor_id=? AND estado='aprobada' AND approved_at>=?",
                (user['id'], month_start)).fetchone()
            stats['mi_gasto_mes'] = r[0]
        elif user['role'] == 'compras':
            stats['por_aprobar'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE aprobador_nivel='compras' AND estado IN ('pendiente','en_revision','escalada','parcialmente_aprobada')").fetchone()[0]
        elif user['role'] in ('supervisor', 'gerente_ventas'):
            stats['por_aprobar'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE aprobador_actual_id=? AND estado IN ('pendiente','en_revision','escalada','parcialmente_aprobada')",
                (user['id'],)).fetchone()[0]
            stats['aprobadas_mes'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE estado='aprobada' AND approved_at>=?",
                (month_start,)).fetchone()[0]
            r = conn.execute(
                "SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes WHERE estado='aprobada' AND approved_at>=?",
                (month_start,)).fetchone()
            stats['gasto_mes'] = r[0]
            ppto = conn.execute("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto").fetchone()[0]
            stats['consumo_ppto'] = (r[0] / ppto * 100) if ppto > 0 else 0
        else:  # admin
            stats['total_pendientes'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE estado IN ('pendiente','en_revision','escalada')").fetchone()[0]
            stats['total_mes'] = conn.execute(
                "SELECT COUNT(*) FROM solicitudes WHERE created_at>=?", (month_start,)).fetchone()[0]
            r = conn.execute(
                "SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes WHERE estado='aprobada' AND approved_at>=?",
                (month_start,)).fetchone()
            stats['gasto_mes'] = r[0]
            stats['usuarios_activos'] = conn.execute(
                "SELECT COUNT(*) FROM users WHERE status='activo'").fetchone()[0]
        
        conn.close()
        self.respond_html(page_home(user, stats))
    
    # ========== NUEVA SOLICITUD ==========
    def serve_nueva_solicitud_js(self, query=None):
        """Serve the static JS for nueva solicitud page."""
        js_path = os.path.join(BASE_DIR, 'static', 'nueva_solicitud.js')
        try:
            with open(js_path, 'r', encoding='utf-8') as f:
                js_content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(js_content.encode('utf-8'))
        except Exception as e:
            self.send_response(404)
            self.end_headers()

    def serve_infocompras_js(self, query=None):
        """Serve the global infocompras cache script."""
        js_path = os.path.join(BASE_DIR, 'static', 'infocompras.js')
        try:
            with open(js_path, 'r', encoding='utf-8') as f:
                js_content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(js_content.encode('utf-8'))
        except Exception:
            self.send_response(404)
            self.end_headers()

    def page_nueva_solicitud(self, query=None):

        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return

        conn = db.get_db()
        marcas = conn.execute("SELECT DISTINCT marca FROM reglas ORDER BY marca").fetchall()
        marcas_list = [r['marca'] for r in marcas]
        conn.close()

        js_marcas = json.dumps(marcas_list)

        html_parts = []
        html_parts.append('<h1>Nueva Solicitud de Negociaci&#243;n Especial</h1>')

        # ── 1. Client section first ────────────────────────────────────────────
        html_parts.append(
            '<div class="card" style="margin-bottom:14px;">'
            '<div class="card-header">&#128100; Datos del Cliente</div>'
            '<div class="grid-3">'
            '<div class="form-group"><label>C&#243;digo de Cliente *</label>'
            '<input type="text" id="cliente_codigo" class="form-control" required></div>'
            '<div class="form-group"><label>Nombre de Cliente *</label>'
            '<input type="text" id="cliente_nombre" class="form-control" required></div>'
            '<div class="form-group"><label>N&#250;mero de Pedido</label>'
            '<input type="text" id="numero_pedido" class="form-control" placeholder="Opcional"></div>'
            '</div>'
            '<div class="form-group"><label>Justificaci&#243;n / Motivo *</label>'
            '<textarea id="justificacion" class="form-control" rows="2" required></textarea></div>'
            '</div>'
        )

        # ── 2. Infocompras search card (individual + bulk tabs) ──
        html_parts.append(
            '<div class="card" id="infocCard" style="margin-bottom:14px;border:2px solid #1a5276;">'

            # Header
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">'
            '<strong style="font-size:14px;">&#128269; B&#250;squeda de Productos &#8212; Infocompras</strong>'
            '<span id="infocStatus" style="font-size:12px;color:#888;">Conectando con Infocompras...</span>'
            '</div>'

            # Mode tabs (styled like cotizador)
            '<div style="display:flex;gap:0;margin-bottom:14px;border-bottom:2px solid #eee;">'
            '<button id="infocTabSingle" class="infoc-tab active" onclick="switchSearchMode(&apos;single&apos;)"'
            ' style="padding:8px 18px;background:none;border:none;border-bottom:2px solid #1a5276;'
            'margin-bottom:-2px;cursor:pointer;font-size:13px;font-weight:600;color:#1a5276;">'
            'B&#250;squeda Individual</button>'
            '<button id="infocTabBulk" class="infoc-tab" onclick="switchSearchMode(&apos;bulk&apos;)"'
            ' style="padding:8px 18px;background:none;border:none;border-bottom:2px solid transparent;'
            'margin-bottom:-2px;cursor:pointer;font-size:13px;color:#888;">'
            'Ingreso Masivo</button>'
            '</div>'

            # Individual search
            '<div id="singleSearchMode">'
            '<div style="position:relative;">'
            '<input type="text" id="infocSearch" class="form-control"'
            ' placeholder="Buscar por art&#237;culo, descripci&#243;n, marca o c&#243;digo AFV..."'
            ' disabled style="background:#f8f8f8;" oninput="onInfocSearch(this.value)">'
            '<div id="infocSuggestions" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:500;'
            'background:white;border:1px solid #ddd;border-radius:6px;'
            'box-shadow:0 4px 16px rgba(0,0,0,.15);max-height:320px;overflow-y:auto;"></div>'
            '</div>'
            '<div style="font-size:11px;color:#888;margin-top:6px;">'
            '&#128161; Busca y haz click para agregar un producto a la vez. Marca, c&#243;digo, descripci&#243;n y precio se llenan autom&#225;ticamente.'
            '</div>'
            '</div>'

            # Bulk input
            '<div id="bulkSearchMode" style="display:none;">'
            '<div class="form-group">'
            '<label style="font-size:13px;color:#555;">Ingresa c&#243;digos de art&#237;culos (uno por l&#237;nea o separados por comas)</label>'
            '<textarea id="bulkCodesInput" class="form-control" disabled'
            ' placeholder="Ejemplo:&#10;7008590&#10;3045020&#10;5203003&#10;&#10;O separados por comas: 7008590, 3045020, 5203003"'
            ' style="min-height:130px;resize:vertical;font-family:monospace;font-size:13px;background:#f8f8f8;"></textarea>'
            '</div>'
            '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">'
            '<button id="bulkAddBtn" class="btn btn-primary" onclick="addBulkProducts()" disabled>'
            '&#10133; Agregar Todos a Solicitud</button>'
            '<span id="bulkStatus" style="font-size:12px;"></span>'
            '</div>'
            '<div style="font-size:11px;color:#888;margin-top:8px;">'
            '&#128161; Pega una lista completa de c&#243;digos y se agregar&#225;n autom&#225;ticamente.'
            '</div>'
            '</div>'
            '</div>'
        )

        # Main solicitud form
        html_parts.append(
            '<div class="card" style="margin-top:14px;">'
            '<div id="skuContainer">'
            '<div class="page-header" style="margin:16px 0 8px;">'
            '<h3>L&#237;neas de SKU</h3>'
            '<button type="button" class="btn btn-outline btn-sm" onclick="addSkuRow()">+ Agregar L&#237;nea Manual</button>'
            '</div></div>'
            '<div class="actions-bar" style="margin-top:20px;">'
            '<button type="button" class="btn btn-success" style="font-size:15px;" onclick="enviarSolicitud()">Enviar Solicitud</button>'
            '<button type="button" class="btn btn-outline"'
            ' onclick="cancelarNueva()">Cancelar</button>'
            '</div>'
            '<div id="formErrors" style="margin-top:10px;"></div>'
            '</div>'
        )

        # Script: inject marcas, load JS, auto-load infocompras
        html_parts.append(
            '<script>window.marcasDisponibles = ' + js_marcas + '; window.currentUserRole = "' + user['role'] + '";</script>'
            '<script src="/static/nueva_solicitud.js"></script>'
            '<script>loadInfocompras();</script>'
        )

        content = ''.join(html_parts)
        self.respond_html(layout('Nueva Solicitud', content, user, 'nueva'))

    def api_solicitud_crear(self):
        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return
        
        try:
            data = json.loads(self.read_body())
        except:
            self.respond_json({'ok': False, 'error': 'Datos inválidos'}, 400)
            return
        
        errors = []
        cliente_codigo = str(data.get('cliente_codigo', '')).strip()
        cliente_nombre = str(data.get('cliente_nombre', '')).strip()
        numero_pedido = str(data.get('numero_pedido', '')).strip()
        justificacion = str(data.get('justificacion', '')).strip()
        skus = data.get('skus', [])
        
        if not cliente_codigo:
            errors.append('Código de cliente requerido.')
        if not cliente_nombre:
            errors.append('Nombre de cliente requerido.')
        # numero_pedido is optional
        if not justificacion:
            errors.append('Justificación requerida.')
        if not skus:
            errors.append('Debe incluir al menos una línea de SKU.')

        # Vendedores MUST have a linked supervisor
        if user.get('role') == 'vendedor' and not user.get('supervisor_id'):
            errors.append('Su cuenta no tiene un supervisor asignado. Contacte al administrador antes de crear solicitudes.')
        
        # Validate and clean SKUs
        clean_skus = []
        monto_total = 0
        max_pct_by_marca  = {}
        max_monto_by_marca = {}
        
        conn = db.get_db()
        
        for i, s in enumerate(skus):
            marca = str(s.get('marca', '')).strip()
            codigo = str(s.get('codigo_sku', '')).strip()
            desc = str(s.get('descripcion', '')).strip()
            
            try:
                cant = float(s.get('cantidad', 0))
            except:
                cant = 0
            try:
                pbase = float(s.get('precio_base', 0))
            except:
                pbase = 0
            try:
                pct = float(s.get('porcentaje_descuento_sol', 0))
            except:
                pct = 0
            
            if pbase <= 0:
                errors.append(f'Línea {i+1}: Precio base inválido.')
                continue
            if pct < 0 or pct > 100:
                errors.append(f'Línea {i+1}: Descuento inválido.')
                continue
            
            psol = pbase * (1 - pct / 100)
            mdesc = (pbase - psol) * cant
            
            # Get clasificacion from reglas
            regla = conn.execute("SELECT clasificacion FROM reglas WHERE marca=? LIMIT 1",
                                (marca,)).fetchone()
            clasificacion = regla['clasificacion'] if regla else ''
            
            # Track max percentage and total monto per marca for routing
            if marca not in max_pct_by_marca or pct > max_pct_by_marca[marca]:
                max_pct_by_marca[marca] = pct
            max_monto_by_marca[marca] = max_monto_by_marca.get(marca, 0) + mdesc
            
            monto_total += mdesc
            clean_skus.append({
                'marca': marca, 'clasificacion': clasificacion,
                'codigo_sku': codigo, 'descripcion': desc,
                'bdf': str(s.get('bdf', '') or '').strip(),
                'cantidad': cant, 'precio_base': pbase,
                'porcentaje_descuento_sol': round(pct, 2),
                'precio_solicitado': round(psol, 2),
                'monto_descuento': round(mdesc, 2),
            })
        
        if errors:
            conn.close()
            self.respond_json({'ok': False, 'error': ' | '.join(errors)}, 400)
            return
        
        # ── v5: 3-level routing — vendedor / supervisor / compras ────────────────
        # Step 1: determine required level based on max pct vs marca limits
        aprobador_nivel = 'vendedor'   # default: vendedor can self-approve
        for marca, pct in max_pct_by_marca.items():
            regla = conn.execute("SELECT * FROM reglas WHERE marca=? LIMIT 1", (marca,)).fetchone()
            if regla:
                regla = dict(regla)
                lim_vend = float(regla.get('limite_vendedor') or regla.get('limite_supervisor') or 0)
                lim_sup  = float(regla.get('limite_supervisor') or 0)
                lim_comp = float(regla.get('limite_compras') or 0)
                if pct > lim_sup:
                    aprobador_nivel = 'compras'
                    break
                elif pct > lim_vend:
                    if aprobador_nivel != 'compras':
                        aprobador_nivel = 'supervisor'

        # Step 2: resolve users for each level
        creator_role = user['role']
        creator_row = conn.execute("SELECT * FROM users WHERE id=?", (user['id'],)).fetchone()
        creator_row = dict(creator_row) if creator_row else user

        # Supervisor linked to this vendedor
        supervisor_vinculado = None
        if creator_row.get('supervisor_id'):
            sv = conn.execute(
                "SELECT * FROM users WHERE id=? AND role='supervisor' AND status='activo'",
                (creator_row['supervisor_id'],)
            ).fetchone()
            if sv: supervisor_vinculado = dict(sv)

        # Any compras user (also includes gerente_ventas acting at compras level)
        compras_user = conn.execute(
            "SELECT * FROM users WHERE role='compras' AND status='activo' LIMIT 1"
        ).fetchone()
        compras_user = dict(compras_user) if compras_user else None

        # gerente_ventas can also act at compras level
        gte_ventas_user = conn.execute(
            "SELECT * FROM users WHERE role='gerente_ventas' AND status='activo' LIMIT 1"
        ).fetchone()
        gte_ventas_user = dict(gte_ventas_user) if gte_ventas_user else None

        # Step 3: check vendedor self-approval conditions
        # Conditions: (a) all pcts within vendedor limits AND (b) budget available
        can_vendedor_self_approve = False
        if aprobador_nivel == 'vendedor' and creator_role == 'vendedor':
            # Check budget: current month spend + this request <= presupuesto
            from datetime import datetime as _dt
            _now = _dt.now()
            _m_start = f"{_now.year}-{_now.month:02d}-01"
            _m_end   = f"{_now.year}-{_now.month+1:02d}-01" if _now.month < 12 else f"{_now.year+1}-01-01"
            budget_ok = True
            for marca_b, mdesc_b in {s['marca']: 0 for s in clean_skus}.items():
                # sum monto_descuento for this marca in this request
                req_monto = sum(s['monto_descuento'] for s in clean_skus if s['marca'] == marca_b)
                # current month approved spend for this user+marca
                spent = conn.execute(
                    """SELECT COALESCE(SUM(sk.monto_aprobado),0)
                       FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id
                       WHERE s.vendedor_id=? AND s.estado='aprobada'
                       AND s.approved_at>=? AND s.approved_at<?
                       AND sk.marca=? AND sk.monto_aprobado IS NOT NULL""",
                    (user['id'], _m_start, _m_end, marca_b)
                ).fetchone()[0] or 0
                ppto = conn.execute(
                    "SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE asesor=? AND marca=?",
                    (user['username'], marca_b)
                ).fetchone()[0] or 0
                if ppto > 0 and (spent + req_monto) > ppto:
                    budget_ok = False
                    break
            can_vendedor_self_approve = budget_ok

        # Step 4: resolve aprobador
        aprobador      = None
        auto_aprobado  = False

        if creator_role in ('compras', 'gerente_ventas'):
            # Compras and gerente_ventas always act at compras level
            aprobador       = creator_row
            aprobador_nivel = 'compras'
            auto_aprobado   = True

        elif creator_role == 'supervisor':
            if aprobador_nivel == 'vendedor':
                # Supervisor within vendedor range → self-approve at supervisor level
                aprobador       = creator_row
                aprobador_nivel = 'supervisor'
                auto_aprobado   = True
            elif aprobador_nivel == 'supervisor':
                aprobador       = creator_row
                aprobador_nivel = 'supervisor'
                auto_aprobado   = True
            else:
                aprobador       = compras_user or gte_ventas_user
                aprobador_nivel = 'compras'

        elif creator_role == 'vendedor' and can_vendedor_self_approve:
            # Vendedor self-approves
            aprobador       = creator_row
            aprobador_nivel = 'vendedor'
            auto_aprobado   = True

        else:
            # Standard routing: vendedor needs external approval
            if aprobador_nivel in ('vendedor', 'supervisor'):
                aprobador_nivel = 'supervisor'
                if supervisor_vinculado:
                    aprobador = supervisor_vinculado
                elif compras_user:
                    aprobador = compras_user
                    aprobador_nivel = 'compras'
            else:
                # compras level
                aprobador = compras_user or gte_ventas_user

        if not aprobador:
            aprobador = conn.execute(
                "SELECT * FROM users WHERE role='admin' AND status='activo' LIMIT 1"
            ).fetchone()
            if aprobador: aprobador = dict(aprobador)
            aprobador_nivel = 'admin' 

        aprobador_id = aprobador['id'] if aprobador else None
        
        # Calculate SLA deadline
        sla_hours = {'vendedor': 0, 'supervisor': 1, 'gerente_ventas': 4, 'compras': 8, 'admin': 8}
        sla_h = sla_hours.get(aprobador_nivel, 8)
        sla_deadline = add_business_hours(datetime.now(), sla_h).strftime('%Y-%m-%d %H:%M:%S')
        
        # Insert solicitud
        try:
            cursor = conn.execute("""INSERT INTO solicitudes 
                (cliente_codigo, cliente_nombre, numero_pedido, justificacion, estado,
                 vendedor_id, aprobador_actual_id, aprobador_nivel, monto_total_descuento, sla_deadline)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (cliente_codigo, cliente_nombre, numero_pedido, justificacion,
                 'pendiente', user['id'], aprobador_id, aprobador_nivel,
                 round(monto_total, 2), sla_deadline))
            sol_id = cursor.lastrowid
            
            # Insert SKU lines
            for s in clean_skus:
                conn.execute("""INSERT INTO solicitud_skus
                    (solicitud_id, marca, clasificacion, codigo_sku, descripcion, cantidad,
                     precio_base, porcentaje_descuento_sol, precio_solicitado, monto_descuento, bdf)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (sol_id, s['marca'], s['clasificacion'], s['codigo_sku'], s['descripcion'],
                     s['cantidad'], s['precio_base'], s['porcentaje_descuento_sol'],
                     s['precio_solicitado'], s['monto_descuento'], s.get('bdf','')))
            
            conn.commit()

            # ── v5: Auto-approval if conditions met ───────────────────────────
            if auto_aprobado:
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                folio = db.generate_folio(conn)
                for sku in conn.execute("SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall():
                    conn.execute("""UPDATE solicitud_skus
                        SET sku_estado='aprobado', porcentaje_aprobado=?, precio_aprobado=?,
                            monto_aprobado=?, aprobado_por=?, aprobado_at=?
                        WHERE id=?""",
                        (sku['porcentaje_descuento_sol'], sku['precio_solicitado'],
                         sku['monto_descuento'], user['id'], now_str, sku['id']))
                monto_aprobado_total = sum(
                    s['monto_descuento'] for s in clean_skus
                )
                conn.execute("""UPDATE solicitudes
                    SET estado='aprobada', aprobador_final_id=?, aprobador_nivel=?,
                        monto_total_aprobado=?, approved_at=?, folio=?,
                        updated_at=datetime('now')
                    WHERE id=?""",
                    (user['id'], aprobador_nivel, round(monto_aprobado_total,2),
                     now_str, folio, sol_id))
                conn.commit()
                audit_detail = (f"AUTOAPROBADA por {creator_role} — "
                                f"Cliente: {cliente_codigo}, Monto: {monto_total:.2f}")
            else:
                audit_detail = f"Cliente: {cliente_codigo} - {cliente_nombre}, Monto: {monto_total:.2f}"

            db.log_audit(user['id'], user['username'],
                        'solicitud_autoaprobada' if auto_aprobado else 'solicitud_creada',
                        'solicitud', sol_id, audit_detail,
                        ip=self.get_client_ip())
            
            # ── Email dispatch ────────────────────────────────────────────────
            mailto = ''
            sol_dict = dict(conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone())
            skus_list = [dict(r) for r in conn.execute("SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall()]
            _vend_info = {'nombre': user.get('nombre',''), 'apellido': user.get('apellido',''), 'email': user.get('email','')}
            _apr_info  = {'nombre': aprobador.get('nombre',''), 'apellido': aprobador.get('apellido',''), 'email': aprobador.get('email','')} if aprobador else None

            if auto_aprobado:
                # Auto-approved: reuse full approval email flow with same distribution list
                subject, body = email_service.build_solicitud_email(
                    sol_dict, skus_list, 'approved',
                    db.get_config('base_url'),
                    vendedor_info=_vend_info, aprobador_info=_apr_info)
                # TO: the vendedor (creator)
                auto_to = set()
                auto_cc = set()
                if user.get('email'): auto_to.add(user['email'])
                # CC: same full distribution as when approval is granted:
                # supervisor, ne_team, compras_team, all admins
                if supervisor_vinculado and supervisor_vinculado.get('email'):
                    auto_cc.add(supervisor_vinculado['email'])
                _ne_email  = db.get_config('email_ne_team', '')
                _cp_email  = db.get_config('email_compras_team', 'compras@cofersa.cr')
                if _ne_email: auto_cc.add(_ne_email)
                if _cp_email and _cp_email not in auto_to: auto_cc.add(_cp_email)
                for _adm in conn.execute(
                    "SELECT email FROM users WHERE role='admin' AND status='activo'"
                ).fetchall():
                    if _adm['email']: auto_cc.add(_adm['email'])
                auto_cc -= auto_to
                auto_to.discard(''); auto_cc.discard('')
                body_plain = email_service.build_plain_text_email(sol_dict, skus_list,
                                                                   vendedor_info=_vend_info, aprobador_info=_apr_info)
                mailto = email_service.build_mailto(list(auto_to), list(auto_cc), subject, body_plain)
                conn.close()
                email_service.send_email(db, list(auto_to | auto_cc), subject, body, sol_id)
            elif aprobador:
                # Pending: notify approver
                subject, body = email_service.build_solicitud_email(
                    sol_dict, skus_list, 'created',
                    db.get_config('base_url'),
                    vendedor_info=_vend_info, aprobador_info=_apr_info)
                to_emails = [aprobador['email']] if aprobador.get('email') else []
                body_plain = email_service.build_plain_text_email(sol_dict, skus_list,
                                                                   vendedor_info=_vend_info, aprobador_info=_apr_info)
                mailto = email_service.build_mailto(to_emails, [], subject, body_plain)
                conn.close()
                email_service.send_email(db, list(set(to_emails)), subject, body, sol_id)
            else:
                conn.close()

            self.respond_json({'ok': True, 'solicitud_id': sol_id,
                               'auto_aprobado': auto_aprobado, 'mailto': mailto})
        
        except Exception as e:
            conn.close()
            traceback.print_exc()
            self.respond_json({'ok': False, 'error': f'Error al guardar: {str(e)}'}, 500)
    
    # ========== MIS SOLICITUDES ==========
    def page_mis_solicitudes(self, query=None):
        user = self.require_auth()
        if not user:
            return
        
        conn = db.get_db()
        # RULE: Mis Solicitudes always shows ONLY the solicitudes created by this user
        rows = conn.execute("""SELECT s.*, u.nombre||' '||u.apellido as vendedor_nombre
            FROM solicitudes s LEFT JOIN users u ON s.vendedor_id=u.id
            WHERE s.vendedor_id=? ORDER BY s.created_at DESC LIMIT 200""",
            (user['id'],)).fetchall()
        conn.close()
        
        table_rows = ''
        for r in rows:
            table_rows += f'''<tr>
                <td><a href="/solicitud/{r['id']}">{esc(r['folio'] or f"#{r['id']}")}</a></td>
                <td>{esc(r['cliente_nombre'])}</td>
                <td>{esc(r['numero_pedido'])}</td>
                <td class="text-right">{format_crc(r['monto_total_descuento'])}</td>
                <td>{estado_badge(r['estado'])}</td>
                <td>{esc(r['created_at'][:16])}</td>
            </tr>'''
        
        content = f'''
        <h1>Mis Solicitudes</h1>
        <div class="card">
            <div class="table-responsive">
            <table>
                <thead><tr>
                    <th>Folio/ID</th><th>Cliente</th><th>Pedido</th>
                    <th class="text-right">Monto Desc.</th><th>Estado</th><th>Fecha</th>
                </tr></thead>
                <tbody>{table_rows if table_rows else '<tr><td colspan="6" class="text-center">No hay solicitudes</td></tr>'}</tbody>
            </table>
        </div>'''
        self.respond_html(layout('Mis Solicitudes', content, user, 'mis'))
    
    # ========== SOLICITUD DETALLE ==========
    def page_solicitud_detalle(self, sol_id, query=None):
        user = self.require_auth()
        if not user:
            return
        
        conn = db.get_db()
        sol = conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone()
        if not sol:
            conn.close()
            self.send_error_page(404, 'Solicitud no encontrada.')
            return
        sol = dict(sol)
        
        role = user['role']
        is_compras_nivel = (role == 'compras' and sol.get('aprobador_nivel') == 'compras')
        can_view = (role == 'admin' or
                    sol['vendedor_id'] == user['id'] or
                    sol['aprobador_actual_id'] == user['id'] or
                    is_compras_nivel or
                    role in ('supervisor', 'gerente_ventas', 'compras'))
        if not can_view:
            conn.close()
            self.send_error_page(403, 'No tiene permisos para ver esta solicitud.')
            return

        skus = [dict(r) for r in conn.execute(
            """SELECT ss.*, u.nombre||' '||u.apellido as aprobado_por_nombre
               FROM solicitud_skus ss
               LEFT JOIN users u ON ss.aprobado_por = u.id
               WHERE ss.solicitud_id=? ORDER BY ss.marca, ss.id""",
            (sol_id,)).fetchall()]
        vendedor  = conn.execute("SELECT * FROM users WHERE id=?", (sol['vendedor_id'],)).fetchone()
        aprobador = conn.execute("SELECT * FROM users WHERE id=?", (sol['aprobador_actual_id'],)).fetchone() if sol['aprobador_actual_id'] else None
        audit     = conn.execute("SELECT * FROM audit_log WHERE entity_type='solicitud' AND entity_id=? ORDER BY created_at DESC", (sol_id,)).fetchall()
        conn.close()
        
        msg = query.get('msg', '') if query else ''
        msg_html = ''
        if msg == 'creada':
            msg_html = '<div class="alert alert-success">Solicitud creada exitosamente y enviada para aprobación.</div>'
        elif msg == 'aprobada':
            msg_html = '<div class="alert alert-success">Solicitud aprobada exitosamente.</div>'
        elif msg == 'rechazada':
            msg_html = '<div class="alert alert-warning">Solicitud rechazada.</div>'
        
        # ── Group SKUs by marca ───────────────────────────────────────────────
        from collections import OrderedDict as _OD
        skus_by_marca = _OD()
        for s in skus:
            skus_by_marca.setdefault(s['marca'], []).append(s)

        _sku_estado_cls = {'aprobado':'badge-approved','rechazado':'badge-rejected','pendiente':'badge-pending'}
        _sku_estado_lbl = {'aprobado':'✓ Aprobado','rechazado':'✕ Rechazado','pendiente':'⏳ Pendiente'}

        # ── For non-vendedor: fetch ranges + ppto per marca ──────────────────
        info_por_marca = {}
        if role != 'vendedor':
            _conn2 = db.get_db()
            _now2  = datetime.now()
            _ms2   = f"{_now2.year}-{_now2.month:02d}-01"
            _me2   = (f"{_now2.year}-{_now2.month+1:02d}-01"
                      if _now2.month < 12 else f"{_now2.year+1}-01-01")
            _vend_id2 = sol.get('vendedor_id', user['id'])
            _vend_row2 = _conn2.execute("SELECT username FROM users WHERE id=?",(_vend_id2,)).fetchone()
            _vend_uname2 = _vend_row2['username'] if _vend_row2 else ''
            for _mk in skus_by_marca.keys():
                _rg = _conn2.execute("SELECT * FROM reglas WHERE marca=? LIMIT 1",(_mk,)).fetchone()
                _pp = _conn2.execute(
                    "SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE asesor=? AND marca=?",
                    (_vend_uname2, _mk)).fetchone()[0] or 0
                _gs = _conn2.execute(
                    """SELECT COALESCE(SUM(sk.monto_aprobado),0)
                       FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id
                       WHERE s.vendedor_id=? AND s.estado='aprobada'
                       AND s.approved_at>=? AND s.approved_at<? AND sk.marca=?
                       AND sk.monto_aprobado IS NOT NULL""",
                    (_vend_id2, _ms2, _me2, _mk)).fetchone()[0] or 0
                info_por_marca[_mk] = {
                    'regla': dict(_rg) if _rg else None,
                    'ppto': float(_pp), 'gastado': float(_gs),
                    'pct_consumo': round(float(_gs)/float(_pp)*100,1) if _pp > 0 else 0,
                    'month_label': f"{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][_now2.month-1]} {_now2.year}"
                }
            _conn2.close()

        marca_sections = ''
        for marca, mskus in skus_by_marca.items():
            _apr = sum(1 for sk in mskus if sk.get('sku_estado','pendiente')=='aprobado')
            _rej = sum(1 for sk in mskus if sk.get('sku_estado','pendiente')=='rechazado')
            _pen = sum(1 for sk in mskus if sk.get('sku_estado','pendiente')=='pendiente')
            if _apr==len(mskus):   _mb='<span class="badge badge-approved">✓ Aprobada</span>'
            elif _rej==len(mskus): _mb='<span class="badge badge-rejected">✕ Rechazada</span>'
            elif _pen==len(mskus): _mb='<span class="badge badge-pending">Pendiente</span>'
            else:                  _mb='<span class="badge badge-escalated">Parcial</span>'

            _rows = ''
            for s in mskus:
                _est   = s.get('sku_estado','pendiente')
                _ecls  = _sku_estado_cls.get(_est,'badge-draft')
                _elbl  = _sku_estado_lbl.get(_est,_est)
                _apr_h = ''
                if _est == 'aprobado':
                    _apr_h = f'<td class="text-right">{format_pct(s["porcentaje_aprobado"])}</td><td class="text-right">{format_crc(s.get("precio_aprobado",0))}</td><td class="text-right">{format_crc(s.get("monto_aprobado",0))}</td>'
                else:
                    _apr_h = '<td class="text-right color-muted font-sm">—</td><td class="text-right color-muted font-sm">—</td><td class="text-right color-muted font-sm">—</td>'
                _por = f'<span class="font-sm color-muted"> · {esc(s.get("aprobado_por_nombre",""))}</span>' if s.get("aprobado_por_nombre") else ''
                _rows += f'''<tr>
                    <td>{esc(s['codigo_sku'])}</td><td class="wrap">{esc(s['descripcion'])}{('<br><span style="font-size:11px;color:#1a5276;">BDF: '+esc(s['bdf'])+'</span>') if s.get('bdf') else ''}</td>
                    <td class="text-right">{s["cantidad"]}</td>
                    <td class="text-right">{format_crc(s["precio_base"])}</td>
                    <td class="text-right">{format_pct(s["porcentaje_descuento_sol"])}</td>
                    <td class="text-right">{format_crc(s["precio_solicitado"])}</td>
                    <td class="text-right">{format_crc(s["monto_descuento"])}</td>
                    {_apr_h}
                    <td><span class="badge {_ecls}">{_elbl}</span>{_por}</td>
                </tr>'''

            _info_mk = info_por_marca.get(marca, {})
            _rg_mk   = _info_mk.get('regla')
            _ranges_html = ''
            _ppto_html   = ''
            if role != 'vendedor' and _rg_mk:
                _lv = _rg_mk.get('limite_vendedor', 0)
                _ls = _rg_mk.get('limite_supervisor', 0)
                _lc = _rg_mk.get('limite_compras', 0)
                _ranges_html = (f'<div style="font-size:11px;color:#555;margin-top:4px;">'
                    f'<span style="color:#27ae60;">&#9679;</span> Vendedor hasta <strong>{_lv}%</strong>'
                    f' &nbsp;|&nbsp; <span style="color:#e67e22;">&#9679;</span> Supervisor hasta <strong>{_ls}%</strong>'
                    f' &nbsp;|&nbsp; <span style="color:#e74c3c;">&#9679;</span> Compras &ge;<strong>{_lc}%</strong>'
                    f'</div>')
                _pp_val = _info_mk.get('ppto', 0)
                _gs_val = _info_mk.get('gastado', 0)
                _pct_c  = _info_mk.get('pct_consumo', 0)
                _ml     = _info_mk.get('month_label', '')
                _clr    = '#27ae60' if _pct_c < 80 else ('#e67e22' if _pct_c < 100 else '#e74c3c')
                if _pp_val > 0:
                    _ppto_html = (f'<div style="font-size:11px;color:#555;margin-top:3px;">'
                        f'{_ml}: Presupuesto <strong>{format_crc(_pp_val)}</strong>'
                        f' | Gastado <strong>{format_crc(_gs_val)}</strong>'
                        f' | <strong style="color:{_clr};">{_pct_c}%</strong></div>')

            marca_sections += f'''
            <div class="card" style="margin-bottom:12px;border-left:4px solid #1a5276;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
                    <strong>🏷 {esc(marca)}</strong>
                    <span>{_mb} <span class="font-sm color-muted">{len(mskus)} SKU · {_apr}✓ {_rej}✕ {_pen}⏳</span></span>
                </div>
                {_ranges_html}{_ppto_html}
                <div class="table-responsive">
                <table style="min-width:680px;">
                    <thead><tr>
                        <th>SKU</th><th>Descripción</th><th class="text-right">Cant</th>
                        <th class="text-right">P.Base</th><th class="text-right">%Sol</th>
                        <th class="text-right">P.Sol</th><th class="text-right">Mto.Desc</th>
                        <th class="text-right">%Aprob</th><th class="text-right">P.Aprob</th><th class="text-right">Mto.Aprob</th>
                        <th>Estado</th>
                    </tr></thead>
                    <tbody>{_rows}</tbody>
                </table>
                </div>
            </div>'''

        # ── Build approval action panel ───────────────────────────────────────
        actions_html  = ''
        is_compras_act= (role == 'compras' and sol.get('aprobador_nivel') == 'compras')
        is_assigned_approver = (sol['aprobador_actual_id'] == user['id'])
        is_approver = (
            is_assigned_approver or role == 'admin' or is_compras_act
            or (role == 'supervisor' and sol.get('aprobador_nivel') == 'supervisor')
            or (role == 'gerente_ventas' and sol.get('aprobador_nivel') == 'gerente_ventas')
        ) and sol['estado'] in ('pendiente','en_revision','escalada','parcialmente_aprobada')

        if is_approver:
            pending_skus = [s for s in skus if s.get('sku_estado','pendiente') == 'pendiente']
            if pending_skus:
                _sku_rows_act = ''
                for s in pending_skus:
                    _sid = s['id']
                    _sku_rows_act += f'''
                    <div class="sku-row" style="margin-bottom:10px;">
                        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                            <strong class="font-sm">{esc(s['marca'])} — {esc(s['codigo_sku'])} — {esc(s['descripcion'])}</strong>{(' <span style="font-size:11px;color:#1a5276;">[BDF: '+esc(s['bdf'])+']</span>') if s.get('bdf') else ''}
                            <select class="form-control sku-act" data-sku="{_sid}" style="width:160px;" onchange="onActChange({_sid})">
                                <option value="aprobar">✓ Aprobar</option>
                                <option value="rechazar">✕ Rechazar</option>
                                <option value="pendiente">⏸ Dejar pendiente</option>
                            </select>
                        </div>
                        <div id="pct_row_{_sid}" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <label class="font-sm" style="margin:0;">% desc. aprobado (máx {s["porcentaje_descuento_sol"]:.2f}%):</label>
                            <input type="number" class="form-control aprov-pct" data-sku="{_sid}"
                                value="{s["porcentaje_descuento_sol"]:.2f}" step="0.01" min="0"
                                max="{s["porcentaje_descuento_sol"]:.2f}" style="width:100px;font-size:13px;">
                        </div>
                    </div>'''

                actions_html = f'''
                <div class="card" style="border:2px solid var(--warning);">
                    <div class="card-header">Panel de Aprobación — {len(pending_skus)} SKU(s) pendientes</div>
                    <p class="font-sm color-muted" style="margin-bottom:12px;">
                        Seleccione la acción para cada SKU. Use los botones rápidos para actuar sobre todos a la vez.
                    </p>
                    {_sku_rows_act}
                    <div class="form-group" style="margin-top:10px;">
                        <label>Comentario</label>
                        <textarea id="comentarioAprobador" class="form-control" rows="2"></textarea>
                    </div>
                    <div class="actions-bar" style="flex-wrap:wrap;gap:8px;">
                        <button class="btn btn-success" onclick="procesarSolicitud({sol_id})">✓ Procesar Selección</button>
                        <button class="btn btn-outline btn-sm" onclick="setAllActs('aprobar')">Aprobar todos</button>
                        <button class="btn btn-outline btn-sm" onclick="setAllActs('rechazar')">Rechazar todos</button>
                    </div>
                    <div id="actionErrors" style="margin-top:10px;"></div>
                </div>'''
            else:
                actions_html = '<div class="alert alert-info">Todos los SKUs de esta solicitud ya han sido procesados.</div>'
        
        # Can cancel if vendor owns it and it's not yet approved
        cancel_html = ''
        # Link to email preview (visible to all)
        email_preview_link = f'<a href="/email/preview/{sol["id"]}" target="_blank" class="btn btn-outline btn-sm" style="margin-top:10px;">📧 Ver Correo Enviado</a>'

        if sol['vendedor_id'] == user['id'] and sol['estado'] in ('pendiente', 'en_revision', 'escalada'):
            cancel_html = f'''<button class="btn btn-outline" style="margin-top:10px;" 
                onclick="if(confirm('¿Cancelar esta solicitud?'))cancelarSolicitud({sol_id})">Cancelar Solicitud</button>'''
        
        audit_rows = ''
        for a in audit:
            audit_rows += f'''<tr>
                <td>{esc(a['created_at'][:19])}</td>
                <td>{esc(a['username'])}</td>
                <td>{esc(a['action'])}</td>
                <td style="font-size:11px;">{esc(a['details'] or '')}</td>
            </tr>'''
        
        content = f'''
        {msg_html}
        <div class="page-header">
            <h1>Solicitud {esc(sol.get('folio') or f"#{sol['id']}")}</h1>
            <div>{estado_badge(sol['estado'])}</div>
        </div>

        <div class="card">
            <div class="grid-3">
                <div><strong>Cliente:</strong> {esc(sol['cliente_codigo'])} — {esc(sol['cliente_nombre'])}</div>
                <div><strong>Pedido:</strong> {esc(sol['numero_pedido'])}</div>
                <div><strong>Vendedor:</strong> {esc(vendedor['nombre'] if vendedor else '')} {esc(vendedor['apellido'] if vendedor else '')}</div>
            </div>
            <div class="grid-3" style="margin-top:10px;">
                <div><strong>Creada:</strong> {esc(sol['created_at'][:19])}</div>
                <div><strong>Nivel Aprobación:</strong> {esc(sol.get('aprobador_nivel',''))}</div>
                <div><strong>Aprobador Asignado:</strong> {esc(aprobador['nombre'] + ' ' + aprobador['apellido'] if aprobador else 'Sin asignar')}</div>
            </div>
            <div style="margin-top:10px;"><strong>Justificación:</strong> {esc(sol['justificacion'])}</div>
            {f"<div style='margin-top:8px;'><strong>Folio:</strong> {esc(sol['folio'])}</div>" if sol.get('folio') else ''}
            {f"<div style='margin-top:6px;'><strong>Comentario:</strong> {esc(sol.get('comentario_aprobador',''))}</div>" if sol.get('comentario_aprobador') else ''}
            <div class="grid-2" style="margin-top:10px;">
                <div><strong>Total Solicitado:</strong> {format_crc(sol['monto_total_descuento'])}</div>
                <div><strong>Total Aprobado:</strong> {format_crc(sol.get('monto_total_aprobado',0))}</div>
            </div>
        </div>

        <h2 style="margin-bottom:8px;">Detalle por Marca</h2>
        {marca_sections}

        {actions_html}
        {cancel_html}
        {email_preview_link}

        <div class="card" style="margin-top:16px;">
            <div class="card-header">Historial / Auditoría</div>
            <div class="table-responsive">
            <table>
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
                <tbody>{audit_rows if audit_rows else '<tr><td colspan="4" class="text-center">Sin registros</td></tr>'}</tbody>
            </table>
            </div>
        </div>

        <script>
        function onActChange(id) {{
            var act = document.querySelector('.sku-act[data-sku="'+id+'"]').value;
            var row = document.getElementById('pct_row_'+id);
            if (row) row.style.display = act === 'aprobar' ? 'flex' : 'none';
        }}
        function setAllActs(act) {{
            document.querySelectorAll('.sku-act').forEach(function(s){{
                s.value = act; onActChange(s.dataset.sku);
            }});
        }}
        async function procesarSolicitud(id) {{
            var adj = {{}}; var acts = {{}};
            document.querySelectorAll('.sku-act').forEach(function(s){{ acts[s.dataset.sku]=s.value; }});
            document.querySelectorAll('.aprov-pct').forEach(function(e){{ adj[e.dataset.sku]=parseFloat(e.value)||0; }});
            var comentario = document.getElementById('comentarioAprobador').value;
            var hasPend = Object.values(acts).some(function(a){{ return a==='pendiente'; }});
            var msg = hasPend
                ? 'Hay SKUs marcados como "Dejar pendiente". ¿Procesar solo los seleccionados?'
                : '¿Confirma el procesamiento?';
            if (!confirm(msg)) return;
            var r = await apiPost('/api/solicitud/aprobar', {{id:id, sku_adjustments:adj, sku_actions:acts, comentario:comentario}});
            if (r.ok) {{
                if (r.parcial) {{
                    alert(r.message || 'Procesado parcialmente.');
                    window.location.reload();
                }} else if (r.rechazada) {{
                    window.location = '/solicitud/'+id+'?msg=rechazada';
                }} else {{
                    if (r.mailto) window.location.href = r.mailto;
                    setTimeout(function(){{ window.location = '/solicitud/'+id+'?msg=aprobada'; }}, 500);
                }}
            }} else {{
                document.getElementById('actionErrors').innerHTML = '<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
            }}
        }}
        async function rechazarSolicitud(id) {{
            var comentario = document.getElementById('comentarioAprobador') ? document.getElementById('comentarioAprobador').value : '';
            if (!comentario) {{ alert('Debe agregar un comentario al rechazar.'); return; }}
            if (!confirm('¿Confirma el rechazo total de la solicitud?')) return;
            var r = await apiPost('/api/solicitud/rechazar', {{id:id, comentario:comentario}});
            if (r.ok) {{
                if (r.mailto) window.location.href = r.mailto;
                setTimeout(function(){{ window.location='/solicitud/'+id+'?msg=rechazada'; }}, 500);
            }} else document.getElementById('actionErrors').innerHTML='<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
        }}
        async function cancelarSolicitud(id) {{
            var motivo = prompt('Motivo de cancelación:');
            if (!motivo) return;
            var r = await apiPost('/api/solicitud/cancelar', {{id:id, comentario:motivo}});
            if (r.ok) {{
                if (r.mailto) window.location.href = r.mailto;
                setTimeout(function(){{ window.location.reload(); }}, 500);
            }} else alert(r.error||'Error');
        }}
        </script>'''

        self.respond_html(layout(f'Solicitud {sol.get("folio") or sol["id"]}', content, user))
    
    # ========== API: APPROVE ==========
    def api_solicitud_aprobar(self):
        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return

        data       = json.loads(self.read_body())
        sol_id     = data.get('id')
        sku_adj    = data.get('sku_adjustments', {})   # {sku_id_str: pct}
        sku_acts   = data.get('sku_actions', {})        # {sku_id_str: 'aprobar'|'rechazar'|'pendiente'}
        comentario = data.get('comentario', '')

        conn = db.get_db()

        sol = conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone()
        if not sol:
            conn.close()
            self.respond_json({'ok': False, 'error': 'Solicitud no encontrada'}, 404)
            return

        sol  = dict(sol)
        role = user.get('role', '')

        # ── Estados válidos ───────────────────────────────────────────────────
        if sol['estado'] not in ('pendiente', 'en_revision', 'escalada', 'parcialmente_aprobada'):
            conn.close()
            self.respond_json({'ok': False,
                'error': f"Estado '{sol['estado']}' no permite aprobación"}, 400)
            return

        # ── Permiso ───────────────────────────────────────────────────────────
        is_compras_user  = (role == 'compras')          # compras can approve anything
        is_compras_nivel = (sol.get('aprobador_nivel') == 'compras' and role == 'compras')
        is_assigned      = (sol['aprobador_actual_id'] == user['id'])
        if not is_assigned and role != 'admin' and not is_compras_user:
            conn.close()
            self.respond_json({'ok': False, 'error': 'No tiene autoridad para esta solicitud'}, 403)
            return

        # ── Cargar todos los SKUs ─────────────────────────────────────────────
        all_skus = [dict(r) for r in conn.execute(
            "SELECT * FROM solicitud_skus WHERE solicitud_id=? ORDER BY id",
            (sol_id,)).fetchall()]

        # ── Verificar escalación (solo SKUs pendientes que se aprueban ahora) ─
        needs_escalation = False
        for s in all_skus:
            if s.get('sku_estado', 'pendiente') in ('aprobado', 'rechazado'):
                continue
            sid    = str(s['id'])
            action = sku_acts.get(sid, 'aprobar')
            if action in ('rechazar', 'pendiente'):
                continue
            adj_pct = float(sku_adj.get(sid, s['porcentaje_descuento_sol']))
            regla = conn.execute(
                "SELECT * FROM reglas WHERE marca=? LIMIT 1", (s['marca'],)).fetchone()
            if regla:
                regla = dict(regla)
                lim_vend = float(regla.get('limite_vendedor') or regla.get('limite_supervisor') or 0)
                lim_sup  = float(regla.get('limite_supervisor') or 0)
                if role == 'vendedor' and adj_pct > lim_vend:
                    needs_escalation = True
                elif role == 'supervisor' and adj_pct > lim_sup:
                    needs_escalation = True
                # compras + gerente_ventas: no limit

        # ── Escalate if needed (v5: supervisor→compras, no gerente_ventas mid-step) ─
        if needs_escalation and role not in ('admin', 'compras', 'gerente_ventas'):
            next_level    = 'compras'   # v5: always escalate to compras
            next_approver = conn.execute(
                "SELECT * FROM users WHERE role IN ('compras','gerente_ventas') AND status='activo' LIMIT 1",
                ).fetchone()
            if not next_approver:
                conn.close()
                self.respond_json({'ok': False,
                    'error': f'No hay aprobador disponible para {next_level}.'})
                return

            next_approver = dict(next_approver)
            sla_h_esc = 8  # compras level SLA
            sla_deadline  = add_business_hours(datetime.now(), sla_h_esc).strftime('%Y-%m-%d %H:%M:%S')

            conn.execute("""UPDATE solicitudes SET estado='escalada', aprobador_actual_id=?,
                aprobador_nivel=?, sla_deadline=?, updated_at=datetime('now'),
                comentario_aprobador=? WHERE id=?""",
                (next_approver['id'], next_level, sla_deadline, comentario, sol_id))
            db.audit(conn, user['id'], user['username'], 'solicitud_escalada',
                'solicitud', sol_id, f"Escalada a {next_level}", ip=self.get_client_ip())
            conn.commit()

            # Gather email data while conn is still open
            _sol_e  = dict(conn.execute(
                "SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone())
            _skus_e = [dict(r) for r in conn.execute(
                "SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall()]
            _vr = conn.execute(
                "SELECT nombre,apellido,email FROM users WHERE id=?",
                (_sol_e['vendedor_id'],)).fetchone()
            _vi = dict(_vr) if _vr else {}
            _ai = {'nombre': next_approver['nombre'],
                   'apellido': next_approver['apellido'],
                   'email': next_approver['email']}
            _subj, _body = email_service.build_solicitud_email(
                _sol_e, _skus_e, 'escalated',
                db.get_config('base_url'), vendedor_info=_vi, aprobador_info=_ai)
            _to = [next_approver['email']] if next_approver.get('email') else []

            conn.close()   # ← CLOSE before send_email touches DB
            email_service.send_email(db, _to, _subj, _body, sol_id)
            self.respond_json({'ok': True, 'escalated': True,
                'message': f'Solicitud escalada a {next_level}'})
            return

        # ── Procesar cada SKU pendiente ───────────────────────────────────────
        now_ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        for s in all_skus:
            if s.get('sku_estado', 'pendiente') in ('aprobado', 'rechazado'):
                continue   # ya resuelto

            sid    = str(s['id'])
            action = sku_acts.get(sid, 'aprobar')

            if action == 'rechazar':
                conn.execute("""UPDATE solicitud_skus
                    SET sku_estado='rechazado', sku_comentario=?,
                        aprobado_por=?, aprobado_at=?
                    WHERE id=?""",
                    (comentario, user['id'], now_ts, s['id']))
                db.audit(conn, user['id'], user['username'], 'sku_rechazado',
                    'solicitud', sol_id,
                    f"SKU {s['codigo_sku']} ({s['marca']}) rechazado",
                    ip=self.get_client_ip())

            elif action == 'pendiente':
                pass   # dejar para después

            else:   # 'aprobar'
                adj_pct = float(sku_adj.get(sid, s['porcentaje_descuento_sol']))
                adj_pct = max(0.0, min(adj_pct, float(s['porcentaje_descuento_sol'])))
                precio_aprobado = s['precio_base'] * (1 - adj_pct / 100)
                monto_aprobado  = (s['precio_base'] - precio_aprobado) * s['cantidad']
                conn.execute("""UPDATE solicitud_skus
                    SET porcentaje_aprobado=?, precio_aprobado=?, monto_aprobado=?,
                        sku_estado='aprobado', sku_comentario=?,
                        aprobado_por=?, aprobado_at=?
                    WHERE id=?""",
                    (round(adj_pct, 2), round(precio_aprobado, 2), round(monto_aprobado, 2),
                     comentario, user['id'], now_ts, s['id']))
                db.audit(conn, user['id'], user['username'], 'sku_aprobado',
                    'solicitud', sol_id,
                    f"SKU {s['codigo_sku']} ({s['marca']}) aprobado {adj_pct:.2f}%",
                    ip=self.get_client_ip())

        # ── Recalcular estado de la solicitud ─────────────────────────────────
        counts = conn.execute("""
            SELECT
              SUM(CASE WHEN sku_estado='pendiente'  THEN 1 ELSE 0 END) as pend,
              SUM(CASE WHEN sku_estado='aprobado'   THEN 1 ELSE 0 END) as apro,
              SUM(CASE WHEN sku_estado='rechazado'  THEN 1 ELSE 0 END) as rech,
              SUM(COALESCE(monto_aprobado, 0))                         as monto
            FROM solicitud_skus WHERE solicitud_id=?""", (sol_id,)).fetchone()

        pend  = counts['pend'] or 0
        apro  = counts['apro'] or 0
        rech  = counts['rech'] or 0
        monto = float(counts['monto'] or 0)

        if pend > 0:
            # Todavía hay SKUs pendientes → estado parcial, NO enviar correo
            conn.execute("""UPDATE solicitudes SET estado='parcialmente_aprobada',
                monto_total_aprobado=?, comentario_aprobador=?,
                updated_at=datetime('now') WHERE id=?""",
                (round(monto, 2), comentario, sol_id))
            db.audit(conn, user['id'], user['username'],
                'solicitud_parcialmente_aprobada', 'solicitud', sol_id,
                f"{apro} aprobados, {rech} rechazados, {pend} pendientes",
                ip=self.get_client_ip())
            conn.commit()
            conn.close()
            self.respond_json({'ok': True, 'parcial': True,
                'message': f'{apro} SKU(s) procesados. {pend} aún pendientes.',
                'pending_count': pend})
            return

        # ── Todos los SKUs resueltos ──────────────────────────────────────────
        if apro == 0:
            # Todos rechazados → solicitud rechazada
            conn.execute("""UPDATE solicitudes SET estado='rechazada',
                aprobador_final_id=?, comentario_aprobador=?,
                updated_at=datetime('now') WHERE id=?""",
                (user['id'], comentario, sol_id))
            db.audit(conn, user['id'], user['username'], 'solicitud_rechazada',
                'solicitud', sol_id, "Todos los SKUs rechazados",
                ip=self.get_client_ip())
            conn.commit()
            conn.close()
            self.respond_json({'ok': True, 'rechazada': True})
            return

        # Aprobación final: generar folio
        folio = db.generate_folio(conn)
        conn.execute("""UPDATE solicitudes SET estado='aprobada', folio=?,
            aprobador_final_id=?, monto_total_aprobado=?, comentario_aprobador=?,
            approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?""",
            (folio, user['id'], round(monto, 2), comentario, sol_id))
        db.audit(conn, user['id'], user['username'], 'solicitud_aprobada',
            'solicitud', sol_id,
            f"Folio: {folio}, Monto: {monto:.2f}",
            ip=self.get_client_ip())

        # Recopilar datos para el correo ANTES de cerrar conn
        sol_upd  = dict(conn.execute(
            "SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone())
        skus_upd = [dict(r) for r in conn.execute(
            "SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall()]
        vend_row = conn.execute(
            "SELECT * FROM users WHERE id=?", (sol['vendedor_id'],)).fetchone()
        vend_info = ({'nombre': vend_row['nombre'], 'apellido': vend_row['apellido'],
                      'email': vend_row['email']} if vend_row else {})
        apr_info  = {'nombre': user['nombre'], 'apellido': user['apellido'],
                     'email': user.get('email', '')}

        subject, body = email_service.build_solicitud_email(
            sol_upd, skus_upd, 'approved', db.get_config('base_url'),
            vendedor_info=vend_info, aprobador_info=apr_info)

        # Construir lista de destinatarios usando conn (antes de cerrar)
        apr_to = set()
        apr_cc = set()
        if vend_row and vend_row['email']:
            apr_to.add(vend_row['email'])
        if user.get('email'):
            apr_cc.add(user['email'])

        sup_email = None
        gte_email = None
        if vend_row and vend_row['supervisor_id']:
            _sr = conn.execute(
                "SELECT email FROM users WHERE id=? AND status='activo'",
                (vend_row['supervisor_id'],)).fetchone()
            if _sr: sup_email = _sr['email']
        _gr = conn.execute(
            "SELECT email FROM users WHERE role='gerente_ventas' AND status='activo' LIMIT 1"
        ).fetchone()
        if _gr: gte_email = _gr['email']

        if role == 'gerente_ventas':
            if sup_email: apr_cc.add(sup_email)
        elif role in ('compras', 'admin'):
            if gte_email: apr_cc.add(gte_email)
            if sup_email: apr_cc.add(sup_email)

        ne_email      = db.get_config('email_ne_team', '')
        compras_email = db.get_config('email_compras_team', 'compras@cofersa.cr')
        if ne_email:      apr_cc.add(ne_email)
        if compras_email and compras_email not in apr_to:
            apr_cc.add(compras_email)
        for _a in conn.execute(
            "SELECT email FROM users WHERE role='admin' AND status='activo'"
        ).fetchall():
            if _a['email']: apr_cc.add(_a['email'])

        apr_cc -= apr_to
        apr_to.discard(''); apr_cc.discard('')
        all_recip = list(apr_to | apr_cc)

        body_plain = email_service.build_plain_text_email(
            sol_upd, skus_upd, vendedor_info=vend_info, aprobador_info=apr_info)
        mailto = email_service.build_mailto(
            list(apr_to), list(apr_cc), subject, body_plain)

        conn.commit()
        conn.close()   # ← ALWAYS close before send_email

        email_service.send_email(db, all_recip, subject, body, sol_id)

        self.respond_json({'ok': True, 'folio': folio, 'mailto': mailto})

    # ========== API: REJECT ==========
    def api_solicitud_rechazar(self):
        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return
        
        data = json.loads(self.read_body())
        sol_id = data.get('id')
        comentario = data.get('comentario', '')
        
        conn = db.get_db()
        sol = conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone()
        if not sol or sol['estado'] not in ('pendiente', 'en_revision', 'escalada', 'parcialmente_aprobada'):
            conn.close()
            self.respond_json({'ok': False, 'error': 'Solicitud no válida para rechazo'}, 400)
            return
        
        conn.execute("""UPDATE solicitudes SET estado='rechazada', comentario_aprobador=?,
            aprobador_final_id=?, updated_at=datetime('now') WHERE id=?""",
            (comentario, user['id'], sol_id))
        conn.commit()
        
        db.audit(conn, user['id'], user['username'], 'solicitud_rechazada', 'solicitud', sol_id,
                    f"Motivo: {comentario}", ip=self.get_client_ip())
        
        # Send email
        sol_dict = dict(conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone())
        skus_list = [dict(r) for r in conn.execute("SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall()]
        _vend_row_rej = conn.execute("SELECT nombre,apellido,email FROM users WHERE id=?", (sol_dict['vendedor_id'],)).fetchone()
        _vend_info_rej = dict(_vend_row_rej) if _vend_row_rej else {}
        _apr_info_rej = {'nombre': user.get('nombre',''), 'apellido': user.get('apellido',''), 'email': user.get('email','')}
        subject, body = email_service.build_solicitud_email(sol_dict, skus_list, 'rejected', db.get_config('base_url'),
                                                             vendedor_info=_vend_info_rej,
                                                             aprobador_info=_apr_info_rej)
        # REJECTION email:
        # - Supervisor rejects  → TO: solicitante only
        # - Gte Ventas rejects  → TO: solicitante only
        # - Compras rejects     → TO: solicitante; CC: supervisor vinculado
        vendedor = conn.execute("SELECT * FROM users WHERE id=?", (sol['vendedor_id'],)).fetchone()
        _rej_to  = set()
        _rej_cc  = set()

        # TO: solicitante always
        if vendedor and vendedor['email']:
            _rej_to.add(vendedor['email'])

        # If compras rejected, CC supervisor vinculado
        if user.get('role') == 'compras':
            if vendedor and vendedor['supervisor_id']:
                _sup_rej = conn.execute("SELECT email FROM users WHERE id=? AND status='activo'",
                                        (vendedor['supervisor_id'],)).fetchone()
                if _sup_rej and _sup_rej['email']:
                    _rej_cc.add(_sup_rej['email'])

        _rej_cc -= _rej_to
        _rej_to.discard(''); _rej_cc.discard('')
        recipients = list(_rej_to | _rej_cc)

        # Build mailto BEFORE closing conn
        _body_plain_rej = email_service.build_plain_text_email(sol_dict, skus_list,
                                                                vendedor_info=_vend_info_rej,
                                                                aprobador_info=_apr_info_rej)
        _mailto_rej = email_service.build_mailto(list(_rej_to), list(_rej_cc), subject, _body_plain_rej)
        conn.close()   # close BEFORE send_email to avoid DB lock
        email_service.send_email(db, recipients, subject, body, sol_id)
        self.respond_json({'ok': True, 'mailto': _mailto_rej})
    
    # ========== API: CANCEL ==========
    def api_solicitud_cancelar(self):
        user = self.require_auth()
        if not user:
            return
        data = json.loads(self.read_body())
        sol_id = data.get('id')
        comentario = data.get('comentario', '')
        
        conn = db.get_db()
        sol = conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone()
        if not sol:
            conn.close()
            self.respond_json({'ok': False, 'error': 'No encontrada'}, 404)
            return
        
        if sol['vendedor_id'] != user['id'] and user['role'] != 'admin':
            conn.close()
            self.respond_json({'ok': False, 'error': 'Sin permisos'}, 403)
            return
        
        if sol['estado'] not in ('pendiente', 'en_revision', 'escalada', 'borrador', 'parcialmente_aprobada'):
            conn.close()
            self.respond_json({'ok': False, 'error': 'No se puede cancelar en este estado'}, 400)
            return
        
        conn.execute("UPDATE solicitudes SET estado='cancelada', comentario_aprobador=?, updated_at=datetime('now') WHERE id=?",
                    (comentario, sol_id))
        conn.commit()
        db.audit(conn, user['id'], user['username'], 'solicitud_cancelada', 'solicitud', sol_id, details=comentario, ip=self.get_client_ip())

        # CANCELLATION email: same recipients as the original creation email
        # i.e. the approver that was assigned at time of creation
        sol_cancelled = dict(conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone())
        skus_cancelled = [dict(r) for r in conn.execute("SELECT * FROM solicitud_skus WHERE solicitud_id=?", (sol_id,)).fetchall()]

        _vend_can = conn.execute("SELECT * FROM users WHERE id=?", (sol_cancelled['vendedor_id'],)).fetchone()
        _vend_info_can = {}
        if _vend_can:
            _vend_info_can = {'nombre': _vend_can['nombre'], 'apellido': _vend_can['apellido'], 'email': _vend_can['email']}

        # The original approver is aprobador_actual_id (still stored even after cancellation)
        _orig_apr_id = sol_cancelled.get('aprobador_actual_id') or sol_cancelled.get('aprobador_final_id')
        _orig_apr_info = {}
        _orig_apr_email = None
        if _orig_apr_id:
            _orig_apr_row = conn.execute("SELECT * FROM users WHERE id=?", (_orig_apr_id,)).fetchone()
            if _orig_apr_row:
                _orig_apr_info = {'nombre': _orig_apr_row['nombre'], 'apellido': _orig_apr_row['apellido'], 'email': _orig_apr_row['email']}
                _orig_apr_email = _orig_apr_row['email']

        _subj_can, _body_can = email_service.build_solicitud_email(
            sol_cancelled, skus_cancelled, 'cancelled',
            base_url=db.get_config('base_url'),
            vendedor_info=_vend_info_can,
            aprobador_info=_orig_apr_info
        )
        # Send only to the original approver (same as creation)
        _can_to = [_orig_apr_email] if _orig_apr_email else []
        _body_plain_can = email_service.build_plain_text_email(
            sol_cancelled, skus_cancelled,
            vendedor_info=_vend_info_can,
            aprobador_info=_orig_apr_info
        )
        _mailto_can = email_service.build_mailto(_can_to, [], _subj_can, _body_plain_can)
        conn.close()   # close BEFORE send_email to avoid DB lock
        email_service.send_email(db, _can_to, _subj_can, _body_can, sol_id)
        self.respond_json({'ok': True, 'mailto': _mailto_can})
    
    # ========== BANDEJA APROBACIÓN ==========
    def page_bandeja(self, query=None):
        user = self.require_auth()
        if not user:
            return

        conn = db.get_db()
        q    = query or {}
        role = user['role']

        # ── Multi-value filters from URL ─────────────────────────────────────
        # estados: comma-separated list of states; empty = pending only
        estados_param = q.get('estados', '')
        marcas_param  = q.get('marcas',  '')
        f_estados = [e.strip() for e in estados_param.split(',') if e.strip()]
        f_marcas  = [m.strip() for m in marcas_param.split(',')  if m.strip()]

        # ── Visibility scope by role ──────────────────────────────────────────
        # Vendedor:       only their own solicitudes
        # Supervisor:     all solicitudes from their assigned vendedores (any state, any nivel)
        # Gerente/Compras/Admin: all solicitudes in the system
        sql = """SELECT s.*, u.nombre||' '||u.apellido as vendedor_nombre,
                a.nombre||' '||a.apellido as aprobador_nombre
                FROM solicitudes s
                LEFT JOIN users u ON s.vendedor_id=u.id
                LEFT JOIN users a ON s.aprobador_actual_id=a.id
                WHERE 1=1"""
        params = []

        if role == 'vendedor':
            sql += " AND s.vendedor_id=?"
            params.append(user['id'])
        elif role == 'supervisor':
            # All solicitudes from their vendedores (regardless of who approves or estado)
            sql += """ AND s.vendedor_id IN (
                SELECT id FROM users WHERE supervisor_id=? AND status='activo'
            )"""
            params.append(user['id'])
        # gerente_ventas, compras, admin: no scope filter — see everything

        # ── Estado filter (multi-select) ──────────────────────────────────────
        if f_estados:
            ph = ','.join('?'*len(f_estados))
            sql += f" AND s.estado IN ({ph})"
            params.extend(f_estados)
        else:
            # Default: show pending-action items
            sql += " AND s.estado IN ('pendiente','en_revision','escalada','parcialmente_aprobada')"

        # ── Marca filter (multi-select, applied post-query via solicitud_skus) ─
        # We'll filter in Python after fetching marcas-per-solicitud
        sql += " ORDER BY s.created_at DESC LIMIT 500"
        rows = conn.execute(sql, params).fetchall()

        # Fetch marcas per solicitud
        sol_ids = [r['id'] for r in rows]
        marcas_by_sol = {}
        if sol_ids:
            ph = ','.join('?'*len(sol_ids))
            for mr in conn.execute(
                f"SELECT solicitud_id, GROUP_CONCAT(DISTINCT marca) as m FROM solicitud_skus WHERE solicitud_id IN ({ph}) GROUP BY solicitud_id",
                sol_ids).fetchall():
                marcas_by_sol[mr['solicitud_id']] = mr['m'] or ''

        # Apply marca filter
        if f_marcas:
            rows = [r for r in rows if any(
                m in (marcas_by_sol.get(r['id'],'') or '').split(',')
                for m in f_marcas
            )]

        all_marcas = conn.execute("SELECT DISTINCT marca FROM solicitud_skus ORDER BY marca").fetchall()
        conn.close()

        # ── Build table rows ──────────────────────────────────────────────────
        table_rows = ''
        for r in rows:
            sla_style = ''
            if r['sla_deadline'] and r['estado'] in ('pendiente','en_revision','escalada'):
                if datetime.now().strftime('%Y-%m-%d %H:%M:%S') > r['sla_deadline']:
                    sla_style = 'style="background:#fff3e0;"'
            _marc = marcas_by_sol.get(r['id'], '—')
            table_rows += (
                f'<tr {sla_style}>'
                f'<td><a href="/solicitud/{r["id"]}">{esc(r["folio"] or f"#{r['id']}")}</a></td>'
                f'<td>{esc(r["vendedor_nombre"] or "")}</td>'
                f'<td>{esc(r["cliente_nombre"])}</td>'
                f'<td>{esc(r["numero_pedido"])}</td>'
                f'<td class="wrap" style="max-width:160px;font-size:12px;color:#555;">{esc(_marc)}</td>'
                f'<td class="text-right">{format_crc(r["monto_total_descuento"])}</td>'
                f'<td>{estado_badge(r["estado"])}</td>'
                f'<td style="font-size:12px;">{esc(r["aprobador_nivel"] or "")}</td>'
                f'<td style="font-size:12px;">{esc(r["created_at"][:16])}</td>'
                f'</tr>'
            )

        # ── Multi-select estado widget ─────────────────────────────────────────
        all_estados = [
            ('pendiente','Pendiente'),('en_revision','En Revisión'),
            ('escalada','Escalada'),('parcialmente_aprobada','Parcial'),
            ('aprobada','Aprobada'),('rechazada','Rechazada'),('cancelada','Cancelada'),
        ]
        est_items = ''
        for val, lbl in all_estados:
            chk = 'checked' if val in f_estados else ''
            est_items += (f'<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;'
                          f'cursor:pointer;font-size:13px;white-space:nowrap;">'
                          f'<input type="checkbox" value="{val}" {chk} '
                          f'onchange="updateBandejaFilter()" style="cursor:pointer;width:14px;height:14px;">'
                          f'<span>{lbl}</span></label>')
        est_btn_lbl = f"{len(f_estados)} estados" if f_estados else "Pendientes"
        est_widget = (
            f'<div class="form-group" style="margin:0;position:relative;">'
            f'<label style="font-size:11px;color:#888;">Estado</label>'
            f'<button type="button" id="btnEstados" onclick="toggleDd(&apos;ddEstados&apos;)" '
            f'style="display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #ddd;'
            f'border-radius:6px;background:white;cursor:pointer;font-size:13px;min-width:160px;'
            f'justify-content:space-between;min-height:40px;">'
            f'<span id="lblEstados">{est_btn_lbl}</span>'
            f'<span style="color:#888;font-size:10px;">&#9660;</span></button>'
            f'<div id="ddEstados" style="display:none;position:absolute;top:100%;left:0;z-index:300;'
            f'background:white;border:1px solid #ddd;border-radius:8px;'
            f'box-shadow:0 4px 20px rgba(0,0,0,.15);min-width:200px;max-height:300px;overflow-y:auto;padding:4px 0;">'
            f'<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;'
            f'font-size:13px;border-bottom:1px solid #eee;font-weight:600;">'
            f'<input type="checkbox" id="allEstados" onchange="toggleAllBandeja(&apos;Estados&apos;)" '
            f'style="cursor:pointer;width:14px;height:14px;" {"checked" if not f_estados else ""}>'
            f'<span>Todos</span></label>'
            f'{est_items}'
            f'<div style="padding:8px 10px;border-top:1px solid #eee;">'
            f'<button onclick="applyBandejaFilters()" style="width:100%;padding:7px;background:#1a5276;'
            f'color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600;">'
            f'Aplicar</button></div></div></div>'
        )

        # ── Multi-select marca widget ──────────────────────────────────────────
        marc_items = ''
        for mr in all_marcas:
            m = mr['marca']
            chk = 'checked' if m in f_marcas else ''
            marc_items += (f'<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;'
                           f'cursor:pointer;font-size:13px;white-space:nowrap;">'
                           f'<input type="checkbox" value="{esc(m)}" {chk} '
                           f'onchange="updateBandejaFilter()" style="cursor:pointer;width:14px;height:14px;">'
                           f'<span>{esc(m)}</span></label>')
        marc_btn_lbl = f"{len(f_marcas)} marcas" if f_marcas else "Todas"
        marc_widget = (
            f'<div class="form-group" style="margin:0;position:relative;">'
            f'<label style="font-size:11px;color:#888;">Marca</label>'
            f'<button type="button" id="btnMarcas" onclick="toggleDd(&apos;ddMarcas&apos;)" '
            f'style="display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #ddd;'
            f'border-radius:6px;background:white;cursor:pointer;font-size:13px;min-width:160px;'
            f'justify-content:space-between;min-height:40px;">'
            f'<span id="lblMarcas">{marc_btn_lbl}</span>'
            f'<span style="color:#888;font-size:10px;">&#9660;</span></button>'
            f'<div id="ddMarcas" style="display:none;position:absolute;top:100%;left:0;z-index:300;'
            f'background:white;border:1px solid #ddd;border-radius:8px;'
            f'box-shadow:0 4px 20px rgba(0,0,0,.15);min-width:200px;max-height:300px;overflow-y:auto;padding:4px 0;">'
            f'<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;'
            f'font-size:13px;border-bottom:1px solid #eee;font-weight:600;">'
            f'<input type="checkbox" id="allMarcas" onchange="toggleAllBandeja(&apos;Marcas&apos;)" '
            f'style="cursor:pointer;width:14px;height:14px;" {"checked" if not f_marcas else ""}>'
            f'<span>Todas</span></label>'
            f'{marc_items}'
            f'<div style="padding:8px 10px;border-top:1px solid #eee;">'
            f'<button onclick="applyBandejaFilters()" style="width:100%;padding:7px;background:#1a5276;'
            f'color:white;border:none;border-radius:5px;cursor:pointer;font-size:13px;font-weight:600;">'
            f'Aplicar</button></div></div></div>'
        )

        estados_enc = ','.join(f_estados)
        marcas_enc  = ','.join(f_marcas)
        empty_msg   = '<tr><td colspan="9" class="text-center color-muted" style="padding:20px;">No hay solicitudes para los filtros seleccionados</td></tr>'

        content = f"""
        <h1>Bandeja de Aprobación</h1>
        <div class="filters-bar">
            {est_widget}
            {marc_widget}
        </div>
        <div class="card">
            <div class="table-responsive">
            <table>
                <thead><tr>
                    <th>Folio/ID</th><th>Vendedor</th><th>Cliente</th><th>Pedido</th>
                    <th>Marcas</th><th class="text-right">Monto Desc.</th>
                    <th>Estado</th><th>Nivel</th><th>Fecha</th>
                </tr></thead>
                <tbody>{table_rows if table_rows else empty_msg}</tbody>
            </table>
            </div>
        </div>
        <script>
        var _bEstados = {repr(estados_enc)};
        var _bMarcas  = {repr(marcas_enc)};

        function toggleDd(id) {{
            document.querySelectorAll('#ddEstados,#ddMarcas').forEach(function(d) {{
                if (d.id !== id) d.style.display='none';
            }});
            var d=document.getElementById(id);
            d.style.display=(d.style.display==='none')?'block':'none';
        }}
        document.addEventListener('click',function(e) {{
            if(!e.target.closest('#btnEstados') && !e.target.closest('#ddEstados'))
                document.getElementById('ddEstados').style.display='none';
            if(!e.target.closest('#btnMarcas')  && !e.target.closest('#ddMarcas'))
                document.getElementById('ddMarcas').style.display='none';
        }});
        function toggleAllBandeja(which) {{
            var allChk=document.getElementById('all'+which);
            var inputs=document.querySelectorAll('#dd'+which+' input:not(#all'+which+')');
            if(allChk&&allChk.checked) inputs.forEach(function(c){{c.checked=false;}});
            updateBandejaFilter();
        }}
        function updateBandejaFilter() {{
            var estChk=document.querySelectorAll('#ddEstados input:not(#allEstados):checked');
            var mrcChk=document.querySelectorAll('#ddMarcas input:not(#allMarcas):checked');
            document.getElementById('lblEstados').textContent=estChk.length?estChk.length+' estados':'Pendientes';
            document.getElementById('lblMarcas').textContent=mrcChk.length?mrcChk.length+' marcas':'Todas';
            var allE=document.getElementById('allEstados');
            var allM=document.getElementById('allMarcas');
            if(allE) allE.checked=(estChk.length===0);
            if(allM) allM.checked=(mrcChk.length===0);
        }}
        function applyBandejaFilters() {{
            var estVals=Array.from(document.querySelectorAll('#ddEstados input:not(#allEstados):checked')).map(function(c){{return c.value;}}).join(',');
            var mrcVals=Array.from(document.querySelectorAll('#ddMarcas input:not(#allMarcas):checked')).map(function(c){{return c.value;}}).join(',');
            var url=new URL(window.location);
            if(estVals) url.searchParams.set('estados',estVals); else url.searchParams.delete('estados');
            if(mrcVals) url.searchParams.set('marcas',mrcVals);  else url.searchParams.delete('marcas');
            window.location=url.toString();
        }}
        </script>"""

        self.respond_html(layout('Bandeja de Aprobación', content, user, 'bandeja'))

    # ========== DASHBOARD ==========
    def page_dashboard(self, query=None):
        user = self.require_auth()
        if not user:
            return

        conn = db.get_db()
        q    = query or {}
        now  = datetime.now()
        role = user["role"]
        mlm  = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

        year_str = q.get("year", now.strftime("%Y"))
        try:    year = int(year_str)
        except: year = now.year
        year_start = f"{year}-01-01"
        year_end   = f"{year+1}-01-01"

        months_param    = q.get("months", now.strftime("%Y-%m"))
        selected_months = sorted(set(m.strip() for m in months_param.split(",") if m.strip()))
        if not selected_months:
            selected_months = [now.strftime("%Y-%m")]
        n_months = len(selected_months)

        def month_range(ym):
            y2,mo2 = int(ym[:4]),int(ym[5:7])
            ms = f"{y2}-{mo2:02d}-01"
            me = (f"{y2+1}-01-01" if mo2==12 else f"{y2}-{mo2+1:02d}-01")
            return ms,me

        def multi_where(col, months):
            parts,params = [],[]
            for ym in months:
                ms,me = month_range(ym)
                parts.append(f"({col}>=? AND {col}<?)")
                params.extend([ms,me])
            return "("+" OR ".join(parts)+")",params

        approved_wh, approved_p = multi_where("s.approved_at", selected_months)
        rejected_wh, rejected_p = multi_where("s.updated_at",  selected_months)
        created_wh,  created_p  = multi_where("s.created_at",  selected_months)

        if n_months == 1:
            ym0 = selected_months[0]
            sel_label = f"{mlm[int(ym0[5:7])-1]} {ym0[:4]}"
        else:
            sel_label = ", ".join(f"{mlm[int(m[5:7])-1]} {m[:4]}" for m in selected_months)

        # ── Filter params ─────────────────────────────────────────────────────
        f_marcas = [m.strip() for m in q.get("marcas","").split(",") if m.strip()]
        f_sups   = [s.strip() for s in q.get("sups","").split(",")   if s.strip()]
        f_vends  = [v.strip() for v in q.get("vends","").split(",")  if v.strip()]

        # dropdown options — scoped by role hierarchy
        # Marcas: all roles see marcas (but data is already filtered by scope)
        all_marcas_list = [dict(r) for r in conn.execute(
            "SELECT DISTINCT marca FROM solicitud_skus ORDER BY marca").fetchall()]
        if role == "vendedor":
            # Vendedor: no sup/vend filter widgets — they only see their own data
            all_sup_list  = []
            all_vend_list = []
        elif role == "supervisor":
            all_sup_list  = []
            all_vend_list = [dict(r) for r in conn.execute(
                "SELECT id,nombre,apellido,username FROM users WHERE role='vendedor' AND supervisor_id=? AND status='activo' ORDER BY nombre",
                (user["id"],)).fetchall()]
        else:
            # gerente_ventas, compras, admin: see all
            all_sup_list  = [dict(r) for r in conn.execute(
                "SELECT id,nombre,apellido,username FROM users WHERE role='supervisor' AND status='activo' ORDER BY nombre").fetchall()]
            all_vend_list = [dict(r) for r in conn.execute(
                "SELECT id,nombre,apellido,username FROM users WHERE role='vendedor' AND status='activo' ORDER BY nombre").fetchall()]

        # ── Base scope (hierarchy: vendedor→supervisor→gerente_ventas→compras) ──
        base_extra = ""; base_p = []
        if f_vends:
            ph = ",".join("?"*len(f_vends))
            base_extra += f" AND s.vendedor_id IN (SELECT id FROM users WHERE username IN ({ph}) AND status='activo')"
            base_p     += f_vends
        elif f_sups and role not in ("supervisor","vendedor"):
            ph = ",".join("?"*len(f_sups))
            base_extra += f" AND s.vendedor_id IN (SELECT id FROM users WHERE supervisor_id IN (SELECT id FROM users WHERE username IN ({ph})) AND status='activo')"
            base_p     += f_sups
        elif role == "supervisor":
            base_extra += " AND s.vendedor_id IN (SELECT id FROM users WHERE supervisor_id=? AND status='activo')"
            base_p     += [user["id"]]
        elif role == "vendedor":
            base_extra += " AND s.vendedor_id=?"
            base_p     += [user["id"]]

        # marca filter at SKU level
        mf_extra = ""; mf_p = []
        if f_marcas:
            ph = ",".join("?"*len(f_marcas))
            mf_extra = f" AND sk.marca IN ({ph})"
            mf_p     = f_marcas

        def qry(sql, params):
            return conn.execute(sql, params).fetchone()[0]

        # ── KPIs ──────────────────────────────────────────────────────────────
        gasto_sel      = qry(f"SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes s WHERE estado='aprobada' AND {approved_wh} {base_extra}", approved_p+base_p)
        aprobadas_sel  = qry(f"SELECT COUNT(*) FROM solicitudes s WHERE estado='aprobada' AND {approved_wh} {base_extra}", approved_p+base_p)
        rechazadas_sel = qry(f"SELECT COUNT(*) FROM solicitudes s WHERE estado='rechazada' AND {rejected_wh} {base_extra}", rejected_p+base_p)
        total_sol_sel  = qry(f"SELECT COUNT(*) FROM solicitudes s WHERE {created_wh} {base_extra}", created_p+base_p)
        sla_ok         = qry(f"SELECT COUNT(*) FROM solicitudes s WHERE estado='aprobada' AND {approved_wh} AND approved_at<=sla_deadline {base_extra}", approved_p+base_p)
        pendientes     = qry(f"SELECT COUNT(*) FROM solicitudes s WHERE estado IN ('pendiente','en_revision','escalada') {base_extra}", base_p)
        sla_pct        = (sla_ok/aprobadas_sel*100) if aprobadas_sel>0 else 0
        gasto_anual    = qry(f"SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes s WHERE estado='aprobada' AND s.approved_at>=? AND s.approved_at<? {base_extra}", [year_start,year_end]+base_p)

        # ── Budget ────────────────────────────────────────────────────────────
        if role == "vendedor":
            total_ppto = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE asesor=?", [user["username"]])
        elif role == "supervisor":
            total_ppto = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE supervisor=?", [user["username"]])
        else:
            total_ppto = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto", [])
        ppto_periodo      = total_ppto * n_months
        consumo_pct       = (gasto_sel/ppto_periodo*100) if ppto_periodo>0 else 0
        consumo_anual_pct = (gasto_anual/(total_ppto*12)*100) if total_ppto>0 else 0
        pc  = "#27ae60" if consumo_pct<80      else ("#f39c12" if consumo_pct<100      else "#e74c3c")
        pac = "#27ae60" if consumo_anual_pct<80 else ("#f39c12" if consumo_anual_pct<100 else "#e74c3c")

        # ── Marca tables with ppto ────────────────────────────────────────────
        by_marca_sel = conn.execute(
            "SELECT sk.marca,"
            " COALESCE(SUM(sk.monto_aprobado),0) as gasto,"
            " COALESCE((SELECT SUM(p.ppto_mensual_crc) FROM presupuesto p WHERE p.marca=sk.marca),0)*? as ppto"
            " FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id"
            f" WHERE s.estado='aprobada' AND {approved_wh} AND sk.monto_aprobado IS NOT NULL {base_extra} {mf_extra}"
            " GROUP BY sk.marca ORDER BY gasto DESC",
            [n_months]+approved_p+base_p+mf_p).fetchall()

        by_marca_anual = conn.execute(
            "SELECT sk.marca,"
            " COALESCE(SUM(sk.monto_aprobado),0) as gasto,"
            " COALESCE((SELECT SUM(p.ppto_mensual_crc) FROM presupuesto p WHERE p.marca=sk.marca),0)*12 as ppto"
            " FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id"
            f" WHERE s.estado='aprobada' AND s.approved_at>=? AND s.approved_at<? AND sk.monto_aprobado IS NOT NULL {base_extra} {mf_extra}"
            " GROUP BY sk.marca ORDER BY gasto DESC",
            [year_start,year_end]+base_p+mf_p).fetchall()

        # ── Monthly evolution (gasto + presupuesto per month) ────────────────
        monthly_data = []   # list of (gasto, ppto)
        for mo in range(1,13):
            ms = f"{year}-{mo:02d}-01"
            me = (f"{year+1}-01-01" if mo==12 else f"{year}-{mo+1:02d}-01")
            gasto_mo = qry(
                f"SELECT COALESCE(SUM(monto_total_aprobado),0) FROM solicitudes s WHERE estado='aprobada' AND s.approved_at>=? AND s.approved_at<? {base_extra}",
                [ms,me]+base_p)
            if role == "supervisor":
                ppto_mo = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE supervisor=?", [user["username"]])
            elif role == "vendedor":
                ppto_mo = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE asesor=?", [user["username"]])
            else:
                ppto_mo = qry("SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto", [])
            monthly_data.append((gasto_mo, ppto_mo))

        # ── By supervisor ─────────────────────────────────────────────────────
        by_sup_sel=[]; by_sup_anual=[]; by_sup_marca_sel=[]
        by_vend_sel=[]; by_vend_anual=[]
        if role in ("gerente_ventas","compras","admin"):
            sx = ("" if not f_sups else
                  " AND sup.username IN (" + ",".join("?"*len(f_sups)) + ")")
            vx = ("" if not f_vends else
                  " AND vend.username IN (" + ",".join("?"*len(f_vends)) + ")")
            sp = (f_sups if f_sups else [])
            vp = (f_vends if f_vends else [])
            by_sup_sel = conn.execute(
                "SELECT sup.nombre||' '||sup.apellido as sup_nombre, sup.username as sup_username,"
                " COALESCE(SUM(s.monto_total_aprobado),0) as gasto,"
                " COALESCE((SELECT SUM(p2.ppto_mensual_crc)*? FROM presupuesto p2 WHERE p2.supervisor=sup.username),0) as ppto"
                " FROM solicitudes s JOIN users vend ON s.vendedor_id=vend.id"
                f" JOIN users sup ON vend.supervisor_id=sup.id WHERE s.estado='aprobada' AND {approved_wh} {sx} {vx}"
                " GROUP BY sup.id ORDER BY gasto DESC",
                [n_months]+approved_p+sp+vp).fetchall()
            by_sup_anual = conn.execute(
                "SELECT sup.nombre||' '||sup.apellido as sup_nombre, sup.username as sup_username,"
                " COALESCE(SUM(s.monto_total_aprobado),0) as gasto,"
                " COALESCE((SELECT SUM(p2.ppto_mensual_crc)*12 FROM presupuesto p2 WHERE p2.supervisor=sup.username),0) as ppto"
                " FROM solicitudes s JOIN users vend ON s.vendedor_id=vend.id"
                f" JOIN users sup ON vend.supervisor_id=sup.id WHERE s.estado='aprobada' AND s.approved_at>=? AND s.approved_at<? {sx} {vx}"
                " GROUP BY sup.id ORDER BY gasto DESC",
                [year_start,year_end]+sp+vp).fetchall()
            by_sup_marca_sel = conn.execute(
                "SELECT sup.nombre||' '||sup.apellido as sup_nombre, sk.marca,"
                " COALESCE(SUM(sk.monto_aprobado),0) as gasto"
                " FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id"
                " JOIN users vend ON s.vendedor_id=vend.id"
                f" JOIN users sup ON vend.supervisor_id=sup.id WHERE s.estado='aprobada' AND {approved_wh} AND sk.monto_aprobado IS NOT NULL {sx} {vx} {mf_extra}"
                " GROUP BY sup.id, sk.marca ORDER BY sup_nombre, gasto DESC",
                approved_p+sp+vp+mf_p).fetchall()

        # Vendedor breakdown (for supervisors and above)
        if role in ("supervisor","gerente_ventas","compras","admin"):
            vx2 = ("" if not f_vends else " AND vend.username IN (" + ",".join("?"*len(f_vends)) + ")")
            vp2 = (f_vends if f_vends else [])
            vscope = (" AND vend.supervisor_id=?" if role=="supervisor" and not f_vends else "")
            vscope_p = ([user["id"]] if role=="supervisor" and not f_vends else [])
            by_vend_sel = conn.execute(
                f"SELECT vend.nombre||' '||vend.apellido as vend_nombre,"
                f" COALESCE(SUM(s.monto_total_aprobado),0) as gasto"
                f" FROM solicitudes s JOIN users vend ON s.vendedor_id=vend.id"
                f" WHERE s.estado='aprobada' AND {approved_wh} {vscope} {vx2}"
                f" GROUP BY vend.id ORDER BY gasto DESC",
                approved_p+vscope_p+vp2).fetchall()

        top10 = conn.execute(
            f"SELECT s.id,s.folio,s.cliente_nombre,s.monto_total_aprobado,s.approved_at,u.nombre||' '||u.apellido as vendedor_nombre FROM solicitudes s LEFT JOIN users u ON s.vendedor_id=u.id WHERE s.estado='aprobada' AND {approved_wh} {base_extra} ORDER BY s.monto_total_aprobado DESC LIMIT 10",
            approved_p+base_p).fetchall()

        conn.close()

        # ── Month picker HTML ─────────────────────────────────────────────────
        all_months_list = [f"{y2}-{mo2:02d}" for y2 in range(now.year-1,now.year+2) for mo2 in range(1,13)]
        picker_items = ""
        for ym in all_months_list:
            checked = "checked" if ym in selected_months else ""
            lbl3 = f"{mlm[int(ym[5:7])-1]} {ym[:4]}"
            bold = "font-weight:bold;color:#1a5276;" if ym==now.strftime("%Y-%m") else ""
            picker_items += (f'<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:13px;"'
                             f' onmouseover="this.style.background=\'#f0f4f8\'" onmouseout="this.style.background=\'\'">'
                             f'<input type="checkbox" value="{ym}" {checked} onchange="updateMonthPicker()" style="cursor:pointer;width:14px;height:14px;">'
                             f'<span style="{bold}">{lbl3}</span></label>')
        year_opts_html = "".join(f'<option value="{y2}" {"selected" if y2==year else ""}>{y2}</option>' for y2 in range(now.year-1,now.year+2))
        months_encoded = ",".join(selected_months)
        f_marcas_enc   = ",".join(f_marcas)
        f_sups_enc     = ",".join(f_sups)
        f_vends_enc    = ",".join(f_vends)

        # ── Multi-select widget builder ───────────────────────────────────────
        def multi_widget(wid, label, options, sel_vals):
            cnt      = len(sel_vals)
            btn_lbl  = f"{cnt} seleccionados" if cnt else "Todos"
            all_chk  = "" if sel_vals else "checked"
            # Seleccionar Todos checkbox at top
            todos_row = (f'<label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #e8e8e8;font-weight:600;">'
                         f'<input type="checkbox" id="all_{wid}" {all_chk} onchange="toggleAllMulti(\'{wid}\')" style="cursor:pointer;width:14px;height:14px;">'
                         f'<span>Seleccionar Todos</span></label>')
            items    = todos_row
            for v,l in options:
                chk   = "checked" if v in sel_vals else ""
                items += (f'<label style="display:flex;align-items:center;gap:8px;padding:5px 12px;cursor:pointer;font-size:13px;white-space:nowrap;">'
                          f'<input type="checkbox" value="{esc(v)}" {chk} onchange="updateMultiFilter(\'{wid}\')" style="cursor:pointer;width:14px;height:14px;">'
                          f'<span>{esc(l)}</span></label>')
            return (f'<div class="form-group" style="margin:0;position:relative;">'
                    f'<label style="font-size:11px;color:#888;">{label}</label>'
                    f'<button type="button" id="btn_{wid}" onclick="toggleMulti(\'{wid}\')"'
                    f' style="display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #ddd;border-radius:6px;background:white;cursor:pointer;font-size:13px;min-width:160px;justify-content:space-between;min-height:40px;">'
                    f'<span id="lbl_{wid}">{btn_lbl}</span>'
                    f'<span style="color:#888;font-size:10px;">&#9660;</span></button>'
                    f'<div id="dd_{wid}" style="display:none;position:absolute;top:100%;left:0;z-index:300;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15);min-width:200px;max-height:300px;overflow-y:auto;padding:4px 0;">'
                    f'<div style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">'
                    f'<button type="button" onclick="applyFilters()" style="font-size:12px;padding:5px 14px;border:1px solid #1a5276;border-radius:4px;cursor:pointer;background:#1a5276;color:white;font-weight:600;">Aplicar</button>'
                    f'</div>{items}</div></div>')

        w_marcas = multi_widget("marcas","Marcas",     [(r["marca"],r["marca"]) for r in all_marcas_list], f_marcas)
        w_sups   = multi_widget("sups","Supervisores", [(r["username"],r["nombre"]+" "+r["apellido"]) for r in all_sup_list], f_sups) if role != "supervisor" else ""
        w_vends  = multi_widget("vends","Vendedores",  [(r["username"],r["nombre"]+" "+r["apellido"]) for r in all_vend_list], f_vends)

        # ── KPI cards ─────────────────────────────────────────────────────────
        kpi1 = (f'<div class="grid-4" style="margin-bottom:16px;">'
                f'<div class="kpi-card"><div class="kpi-value">{format_crc(gasto_sel)}</div><div class="kpi-label">Gasto Aprobado ({sel_label})</div></div>'
                f'<div class="kpi-card"><div class="kpi-value">{format_crc(ppto_periodo)}</div><div class="kpi-label">Presupuesto Período ({n_months} {"mes" if n_months==1 else "meses"})</div></div>'
                f'<div class="kpi-card"><div class="kpi-value" style="color:{pc};">{consumo_pct:.1f}%</div><div class="kpi-label">Consumo del Presupuesto</div>'
                f'<div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:{min(consumo_pct,100):.0f}%;background:{pc};"></div></div></div>'
                f'<div class="kpi-card"><div class="kpi-value">{sla_pct:.0f}%</div><div class="kpi-label">Cumplimiento SLA</div><div class="kpi-sub">{sla_ok}/{aprobadas_sel} dentro de SLA</div></div></div>')
        kpi2 = (f'<div class="grid-4" style="margin-bottom:16px;">'
                f'<div class="kpi-card"><div class="kpi-value">{total_sol_sel}</div><div class="kpi-label">Solicitudes (período)</div></div>'
                f'<div class="kpi-card"><div class="kpi-value" style="color:var(--success);">{aprobadas_sel}</div><div class="kpi-label">Aprobadas</div></div>'
                f'<div class="kpi-card"><div class="kpi-value" style="color:var(--danger);">{rechazadas_sel}</div><div class="kpi-label">Rechazadas</div></div>'
                f'<div class="kpi-card"><div class="kpi-value" style="color:var(--warning);">{pendientes}</div><div class="kpi-label">Pendientes (hoy)</div></div></div>')
        kpi3 = (f'<div class="grid-4" style="margin-bottom:16px;">'
                f'<div class="kpi-card"><div class="kpi-value" style="color:{pac};">{format_crc(gasto_anual)}</div><div class="kpi-label">Gasto Acumulado {year}</div></div>'
                f'<div class="kpi-card"><div class="kpi-value" style="color:{pac};">{consumo_anual_pct:.1f}%</div><div class="kpi-label">Consumo Anual vs Ppto x12</div>'
                f'<div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:{min(consumo_anual_pct,100):.0f}%;background:{pac};"></div></div></div>'
                f'<div class="kpi-card"><div class="kpi-value">{format_crc(total_ppto*12)}</div><div class="kpi-label">Presupuesto Anual Proyectado</div></div>'
                f'<div class="kpi-card"><div class="kpi-value">{format_crc(max(0,total_ppto*12-gasto_anual))}</div><div class="kpi-label">Disponible Anual Estimado</div></div></div>')

        # ── Bar chart — dual bars: presupuesto (light) + aprobado (dark) ───────
        max_val   = max((max(g,p) for g,p in monthly_data), default=1) or 1
        bar_cells = ""
        for i,(lbl4,(val,pval)) in enumerate(zip(mlm,monthly_data)):
            ym_bar = f"{year}-{i+1:02d}"
            h_apr  = int((val /max_val)*80) if max_val>0 else 0
            h_ppto = int((pval/max_val)*80) if max_val>0 else 0
            is_sel = ym_bar in selected_months
            bg_apr = "#1a5276" if is_sel else "#a9cce3"
            bst    = "font-weight:bold;color:#1a5276;" if is_sel else ""
            lbl_s  = format_crc(val) if val>0 else ""
            bar_cells += (
                f'<td style="text-align:center;vertical-align:bottom;padding:0 2px;width:{100//12}%;">'
                f'<div style="font-size:8px;color:#555;margin-bottom:2px;white-space:nowrap;">{lbl_s}</div>'
                f'<div style="display:flex;gap:1px;align-items:flex-end;justify-content:center;">'
                f'<div title="Presupuesto: {format_crc(pval)}" style="width:10px;height:{h_ppto}px;background:#d0e8f8;border-radius:2px 2px 0 0;min-height:2px;"></div>'
                f'<div title="Aprobado: {format_crc(val)}" style="width:10px;height:{h_apr}px;background:{bg_apr};border-radius:2px 2px 0 0;min-height:2px;"></div>'
                f'</div>'
                f'<div style="font-size:9px;margin-top:3px;{bst}">{lbl4}</div></td>'
            )
        monthly_section = (
            f'<div class="card" style="margin-bottom:16px;">'
            f'<div class="card-header">Evolución Mensual — {year}'
            f' <span style="font-size:11px;font-weight:400;color:#888;">'
            f'&#9646; Presupuesto &nbsp; &#9646; Aprobado</span></div>'
            f'<div style="overflow-x:auto;">'
            f'<table style="width:100%;min-width:500px;border-collapse:collapse;">'
            f'<tbody><tr style="vertical-align:bottom;height:110px;">{bar_cells}</tr></tbody>'
            f'</table></div></div>'
        )

        # ── Marca table with ppto + % + grand total ───────────────────────────
        def marca_table(rows_data, title):
            rows_html = ""; tg=0.0; tp=0.0
            for r in rows_data:
                g=float(r["gasto"]); p=float(r["ppto"])
                if g<=0 and p<=0: continue
                tg+=g; tp+=p
                pct     = (g/p*100) if p>0 else None
                pc2     = "#27ae60" if (pct or 0)<80 else ("#f39c12" if (pct or 0)<100 else "#e74c3c")
                pct_c   = f'<span style="color:{pc2};font-weight:600;">{pct:.1f}%</span>' if pct is not None else '<span style="color:#aaa;">—</span>'
                ppto_c  = format_crc(p) if p>0 else '<span style="color:#aaa;">—</span>'
                rows_html += f'<tr><td>{esc(r["marca"])}</td><td class="text-right">{format_crc(g)}</td><td class="text-right">{ppto_c}</td><td class="text-right">{pct_c}</td></tr>'
            if not rows_html:
                rows_html = '<tr><td colspan="4" class="text-center color-muted font-sm">Sin datos</td></tr>'
            else:
                tpct   = (tg/tp*100) if tp>0 else None
                tpc    = "#27ae60" if (tpct or 0)<80 else ("#f39c12" if (tpct or 0)<100 else "#e74c3c")
                tpct_c = f'<span style="color:{tpc};font-weight:700;">{tpct:.1f}%</span>' if tpct is not None else '<span style="color:#aaa;">—</span>'
                tppto  = format_crc(tp) if tp>0 else '<span style="color:#aaa;">—</span>'
                rows_html += (f'<tr style="background:#f0f4f8;font-weight:700;border-top:2px solid #d0d7e0;">'
                              f'<td>TOTAL</td><td class="text-right">{format_crc(tg)}</td>'
                              f'<td class="text-right">{tppto}</td><td class="text-right">{tpct_c}</td></tr>')
            return (f'<div class="card"><div class="card-header">{title}</div><div class="table-responsive">'
                    f'<table style="min-width:320px;"><thead><tr><th>Marca</th>'
                    f'<th class="text-right">Gasto</th><th class="text-right">Presupuesto</th><th class="text-right">% Consumo</th>'
                    f'</tr></thead><tbody>{rows_html}</tbody></table></div></div>')

        marca_section = (f'<div class="grid-2" style="margin-bottom:16px;">'
                         f'{marca_table(by_marca_sel,"Gasto por Marca — "+sel_label)}'
                         f'{marca_table(by_marca_anual,"Gasto por Marca — Acumulado "+str(year))}</div>')

        # ── Vendedor breakdown (supervisor view) ──────────────────────────────
        vend_section = ""
        if role in ("supervisor","gerente_ventas","compras","admin") and by_vend_sel:
            def vend_table_fn(rows_data, title):
                rows = "".join(
                    f'<tr><td>{esc(r["vend_nombre"])}</td><td class="text-right">{format_crc(r["gasto"])}</td></tr>'
                    for r in rows_data if r["gasto"]>0
                ) or '<tr><td colspan="2" class="text-center color-muted font-sm">Sin datos</td></tr>'
                total = sum(float(r["gasto"]) for r in rows_data if r["gasto"]>0)
                if total>0:
                    rows += f'<tr style="background:#f0f4f8;font-weight:700;border-top:2px solid #d0d7e0;"><td>TOTAL</td><td class="text-right">{format_crc(total)}</td></tr>'
                return (f'<div class="card"><div class="card-header">{title}</div><div class="table-responsive">'
                        f'<table style="min-width:260px;"><thead><tr><th>Vendedor</th><th class="text-right">Gasto</th></tr></thead>'
                        f'<tbody>{rows}</tbody></table></div></div>')
            vend_section = vend_table_fn(by_vend_sel, "Gasto por Vendedor — " + sel_label)

        # ── Supervisor section ────────────────────────────────────────────────
        sup_section = ""
        if role in ("gerente_ventas","compras","admin"):
            def sup_table(rows_data, ppto_months, title):
                rows_h = ""; tg = 0.0; tp = 0.0
                for r in rows_data:
                    r = dict(r)  # convert sqlite3.Row to dict for .get() support
                    g = float(r["gasto"])
                    sup_uname = r.get("sup_username","")
                    p = float(r.get("ppto", 0))
                    tg += g; tp += p
                    pct    = (g/p*100) if p>0 else None
                    pc2    = "#27ae60" if (pct or 0)<80 else ("#f39c12" if (pct or 0)<100 else "#e74c3c")
                    pct_c  = f'<span style="color:{pc2};font-weight:600;">{pct:.1f}%</span>' if pct is not None else '<span style="color:#aaa;">—</span>'
                    ppto_c = format_crc(p) if p>0 else '<span style="color:#aaa;">—</span>'
                    rows_h += f'<tr><td>{esc(r["sup_nombre"])}</td><td class="text-right">{format_crc(g)}</td><td class="text-right">{ppto_c}</td><td class="text-right">{pct_c}</td></tr>'
                if not rows_h:
                    rows_h = '<tr><td colspan="4" class="text-center color-muted font-sm">Sin datos</td></tr>'
                else:
                    tpct   = (tg/tp*100) if tp>0 else None
                    tpc    = "#27ae60" if (tpct or 0)<80 else ("#f39c12" if (tpct or 0)<100 else "#e74c3c")
                    tpct_c = f'<span style="color:{tpc};font-weight:700;">{tpct:.1f}%</span>' if tpct is not None else '<span style="color:#aaa;">—</span>'
                    tppto  = format_crc(tp) if tp>0 else '<span style="color:#aaa;">—</span>'
                    rows_h += (f'<tr style="background:#f0f4f8;font-weight:700;border-top:2px solid #d0d7e0;">'
                               f'<td>TOTAL</td><td class="text-right">{format_crc(tg)}</td>'
                               f'<td class="text-right">{tppto}</td><td class="text-right">{tpct_c}</td></tr>')
                return (f'<div class="card"><div class="card-header">{title}</div><div class="table-responsive">'
                        f'<table style="min-width:340px;"><thead><tr>'
                        f'<th>Supervisor</th><th class="text-right">Gasto</th><th class="text-right">Presupuesto</th><th class="text-right">% Consumo</th>'
                        f'</tr></thead><tbody>{rows_h}</tbody></table></div></div>')
            sup_section = (f'<div class="grid-2" style="margin-bottom:16px;">'
                           f'{sup_table(by_sup_sel, n_months,"Gasto por Supervisor — "+sel_label)}'
                           f'{sup_table(by_sup_anual, 12,"Gasto por Supervisor — Acumulado "+str(year))}</div>')
            cross_rows = ""
            for r in by_sup_marca_sel:
                if r["gasto"] <= 0: continue
                cross_rows += f'<tr><td>{esc(r["sup_nombre"])}</td><td>{esc(r["marca"])}</td><td class="text-right">{format_crc(r["gasto"])}</td></tr>'
            if cross_rows:
                sup_section += (f'<div class="card" style="margin-bottom:16px;"><div class="card-header">Gasto Supervisor + Marca — {sel_label}</div>'
                                f'<div class="table-responsive"><table><thead><tr><th>Supervisor</th><th>Marca</th><th class="text-right">Gasto</th></tr></thead>'
                                f'<tbody>{cross_rows}</tbody></table></div></div>')

        # ── Top 10 ────────────────────────────────────────────────────────────
        top10_rows = ("".join(f'<tr><td><a href="/solicitud/{t["id"]}">{esc(t["folio"] or "#"+str(t["id"]))}</a></td>'
                              f'<td>{esc(t["vendedor_nombre"] or "")}</td><td>{esc(t["cliente_nombre"])}</td>'
                              f'<td class="text-right">{format_crc(t["monto_total_aprobado"])}</td><td>{esc((t["approved_at"] or "")[:16])}</td></tr>' for t in top10)
                     or '<tr><td colspan="5" class="text-center color-muted">Sin datos</td></tr>')

        content = f"""
        <div class="page-header">
            <h1>Dashboard &mdash; Control Presupuestario</h1>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                <div class="form-group" style="margin:0;position:relative;">
                    <label style="font-size:11px;color:#888;">Meses seleccionados ({n_months})</label>
                    <button type="button" id="monthPickerBtn" onclick="toggleMonthPicker()"
                            style="display:flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #ddd;border-radius:6px;background:white;cursor:pointer;font-size:13px;min-width:220px;justify-content:space-between;min-height:40px;">
                        <span id="monthPickerLabel">{sel_label}</span>
                        <span style="color:#888;font-size:10px;">&#9660;</span>
                    </button>
                    <div id="monthPickerDropdown" style="display:none;position:absolute;top:100%;right:0;z-index:300;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.15);min-width:200px;max-height:340px;overflow-y:auto;padding:4px 0;">
                        <div style="padding:6px 10px;border-bottom:1px solid #eee;display:flex;gap:6px;">
                            <button type="button" onclick="selectNoMonths()" style="font-size:11px;padding:3px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;">Ninguno</button>
                            <button type="button" onclick="selectCurrentYear()" style="font-size:11px;padding:3px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;background:white;">Año {year}</button>
                        </div>
                        {picker_items}
                        <div style="padding:8px 10px;border-top:1px solid #eee;">
                            <button type="button" onclick="applyMonthPicker()" style="width:100%;padding:8px;background:#1a5276;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">Aplicar</button>
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin:0;">
                    <label style="font-size:11px;color:#888;">Año acumulado</label>
                    <select class="form-control" id="yearSelect" onchange="applyFilters()">
                        {year_opts_html}
                    </select>
                </div>
                {w_marcas}
                {w_sups}
                {w_vends}
            </div>
        </div>
        {kpi1}{kpi2}{kpi3}{monthly_section}{sup_section}{vend_section}{marca_section}
        <div class="card">
            <div class="card-header">Top 10 Solicitudes &mdash; {sel_label}</div>
            <div class="table-responsive"><table>
                <thead><tr><th>Folio</th><th>Vendedor</th><th>Cliente</th><th class="text-right">Monto</th><th>Fecha</th></tr></thead>
                <tbody>{top10_rows}</tbody>
            </table></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
            <a href="/api/export/dashboard?months={months_encoded}" class="btn btn-outline btn-sm">Exportar Dashboard CSV</a>
            <a href="/api/export/solicitudes?months={months_encoded}" class="btn btn-outline btn-sm">Exportar Solicitudes CSV</a>
            <a href="/api/export/powerbi?months={months_encoded}" class="btn btn-outline btn-sm">Exportar Power BI</a>
        </div>
        <script>
        var _selYear={year}; var _selMonths={repr(months_encoded)};
        function toggleMonthPicker(){{var d=document.getElementById("monthPickerDropdown");d.style.display=(d.style.display==="none")?"block":"none";}}
        document.addEventListener("click",function(e){{var b=document.getElementById("monthPickerBtn"),d=document.getElementById("monthPickerDropdown");if(d&&!d.contains(e.target)&&b&&!b.contains(e.target))d.style.display="none";}});
        function updateMonthPicker(){{var b=document.querySelectorAll("#monthPickerDropdown input:checked"),l=document.getElementById("monthPickerLabel");if(!b.length)l.textContent="Sin selección";else if(b.length===1)l.textContent=b[0].parentElement.querySelector("span").textContent;else l.textContent=b.length+" meses seleccionados";}}
        function selectNoMonths(){{document.querySelectorAll("#monthPickerDropdown input").forEach(function(c){{c.checked=false;}});updateMonthPicker();}}
        function selectCurrentYear(){{document.querySelectorAll("#monthPickerDropdown input").forEach(function(c){{c.checked=c.value.startsWith(_selYear+"-");}});updateMonthPicker();}}
        function applyMonthPicker(){{var b=document.querySelectorAll("#monthPickerDropdown input:checked");if(!b.length){{alert("Seleccione al menos un mes.");return;}}applyFilters(Array.from(b).map(function(c){{return c.value;}}).sort().join(","));}}
        function toggleMulti(id){{document.querySelectorAll("[id^=dd_]").forEach(function(d){{if(d.id!=="dd_"+id)d.style.display="none";}});var d=document.getElementById("dd_"+id);d.style.display=(d.style.display==="none")?"block":"none";}}
        document.addEventListener("click",function(e){{if(!e.target.closest("[id^=dd_]")&&!e.target.closest("[id^=btn_]"))document.querySelectorAll("[id^=dd_]").forEach(function(d){{d.style.display="none";}});}});
        function clearMulti(id){{
            document.querySelectorAll("#dd_"+id+" input:not(#all_"+id+")").forEach(function(c){{c.checked=false;}});
            var ac=document.getElementById("all_"+id); if(ac)ac.checked=true;
            updateMultiFilter(id);
        }}
        function updateMultiFilter(id){{
            var items=document.querySelectorAll("#dd_"+id+" input:not(#all_"+id+"):checked");
            var lbl=document.getElementById("lbl_"+id);
            var ac=document.getElementById("all_"+id);
            lbl.textContent=items.length?items.length+" seleccionados":"Todos";
            if(ac) ac.checked=(items.length===0);
        }}
        function toggleAllMulti(id){{
            var ac=document.getElementById("all_"+id);
            var inputs=document.querySelectorAll("#dd_"+id+" input:not(#all_"+id+")");
            if(ac&&ac.checked){{inputs.forEach(function(c){{c.checked=false;}});}}
            else{{inputs.forEach(function(c){{c.checked=true;}});if(ac)ac.checked=false;}}
            updateMultiFilter(id);
        }}
        function applyFilters(om){{
            var months=om||_selMonths;
            var yr=document.getElementById("yearSelect")?document.getElementById("yearSelect").value:_selYear;
            var marcas=Array.from(document.querySelectorAll("#dd_marcas input:checked")).map(function(c){{return c.value;}}).join(",");
            var sups  =Array.from(document.querySelectorAll("#dd_sups input:checked")).map(function(c){{return c.value;}}).join(",");
            var vends =Array.from(document.querySelectorAll("#dd_vends input:checked")).map(function(c){{return c.value;}}).join(",");
            var url="/dashboard?months="+encodeURIComponent(months)+"&year="+yr;
            if(marcas)url+="&marcas="+encodeURIComponent(marcas);
            if(sups)  url+="&sups="+encodeURIComponent(sups);
            if(vends) url+="&vends="+encodeURIComponent(vends);
            window.location=url;
        }}
        </script>"""

        self.respond_html(layout("Dashboard", content, user, "dashboard"))




        # ========== ADMIN: REGLAS ==========
    def page_admin_reglas(self, query=None):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        
        conn = db.get_db()
        reglas = conn.execute("SELECT * FROM reglas ORDER BY clasificacion, marca").fetchall()
        conn.close()
        
        rows = ''
        for r in reglas:
            rows += f'''<tr>
                <td>{r['id']}</td>
                <td><input type="text" class="form-control" value="{esc(r['marca'])}" data-id="{r['id']}" data-field="marca" onchange="saveRegla(this)" style="min-width:120px;"></td>
                <td><input type="text" class="form-control" value="{esc(r['clasificacion'])}" data-id="{r['id']}" data-field="clasificacion" onchange="saveRegla(this)" style="min-width:80px;"></td>
                <td><input type="number" class="form-control" value="{r['limite_vendedor']}" data-id="{r['id']}" data-field="limite_vendedor" onchange="saveRegla(this)" step="0.01" style="width:80px;"></td>
                <td><input type="number" class="form-control" value="{r['limite_supervisor']}" data-id="{r['id']}" data-field="limite_supervisor" onchange="saveRegla(this)" step="0.01" style="width:80px;"></td>
                <td style="padding:8px;font-size:13px;color:#555;">&#8805; <strong>{r['limite_compras']}%</strong></td>
                <td><button class="btn btn-danger btn-sm" onclick="deleteRegla({r['id']})">✕</button></td>
            </tr>'''
        
        content = f'''
        <h1>Reglas de Aprobación por Marca</h1>
        <div class="card">
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;align-items:flex-end;">
                <form method="POST" action="/admin/reglas/import" enctype="multipart/form-data" style="display:flex;gap:10px;align-items:center;">
                    <input type="file" name="file" accept=".xlsx,.csv" class="form-control" style="max-width:300px;">
                    <button type="submit" class="btn btn-primary btn-sm">Importar Excel/CSV</button>
                </form>
                <a href="/api/export/reglas" class="btn btn-outline btn-sm">Exportar CSV</a>
                <button class="btn btn-success btn-sm" onclick="addReglaRow()">+ Agregar Fila</button>
            </div>
            <div class="table-responsive">
            <table>
                <thead><tr>
                    <th>#</th><th>Marca</th><th>Clasificación</th>
                    <th>Lím. Vendedor %</th><th>Lím. Supervisor %</th><th>Compras (≥ Lím. Supervisor)</th><th></th>
                </tr></thead>
                <tbody id="reglasBody">{rows}</tbody>
            </table>
            </div>
        </div>
        <div id="reglaMsg"></div>
        
        <script>
        async function saveRegla(el) {{
            var id = el.dataset.id;
            var field = el.dataset.field;
            var value = el.value;
            var r = await apiPost('/admin/reglas/save', {{id: parseInt(id), field: field, value: value}});
            if (r.ok) {{
                el.style.borderColor = '#27ae60';
                setTimeout(()=>el.style.borderColor='', 1000);
            }} else {{
                el.style.borderColor = '#e74c3c';
                alert(r.error || 'Error');
            }}
        }}
        async function deleteRegla(id) {{
            if (!confirm('¿Eliminar esta regla?')) return;
            var r = await apiPost('/admin/reglas/delete', {{id: id}});
            if (r.ok) window.location.reload();
            else alert(r.error || 'Error');
        }}
        async function addReglaRow() {{
            var r = await apiPost('/admin/reglas/save', {{id: 0, field: 'new', value: ''}});
            if (r.ok) window.location.reload();
        }}
        </script>'''
        self.respond_html(layout('Reglas de Aprobación', content, user, 'reglas'))
    
    def api_reglas_import(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = self.parse_form()
        file_data = data.get('file')
        if not file_data or not isinstance(file_data, dict):
            self.redirect('/admin/reglas')
            return
        
        # Save temp file
        tmp_path = os.path.join(BASE_DIR, 'data', 'tmp_reglas_import')
        ext = '.xlsx' if file_data['filename'].endswith('.xlsx') else '.csv'
        tmp_file = tmp_path + ext
        with open(tmp_file, 'wb') as f:
            f.write(file_data['data'])
        
        conn = db.get_db()
        try:
            if ext == '.xlsx':
                records = xlsx_reader.import_reglas_from_xlsx(tmp_file)
            else:
                records = xlsx_reader.read_csv_text(file_data['data'].decode('utf-8-sig'))
            
            conn.execute("DELETE FROM reglas")
            for r in records:
                marca = r.get('marca', r.get('Marca', ''))
                conn.execute("""INSERT INTO reglas (marca, clasificacion, limite_supervisor, limite_gte_ventas, limite_compras)
                    VALUES (?,?,?,?,?)""",
                    (marca,
                     r.get('clasificacion', r.get('Clasificación', r.get('clasificacion', ''))),
                     xlsx_reader.parse_number(r.get('limite_supervisor', r.get('Limite Supervisor', 0))),
                     xlsx_reader.parse_number(r.get('limite_gte_ventas', r.get('Limite Gte Ventas', 0))),
                     xlsx_reader.parse_number(r.get('limite_compras', r.get('Limite Compras', 0)))))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'reglas_importadas', details=f"{len(records)} reglas importadas",
                        ip=self.get_client_ip())
        except Exception as e:
            traceback.print_exc()
        finally:
            os.remove(tmp_file) if os.path.exists(tmp_file) else None
            conn.close()
        self.redirect('/admin/reglas')
    
    def api_reglas_save(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = json.loads(self.read_body())
        conn = db.get_db()
        
        if data.get('field') == 'new' or data.get('id') == 0:
            conn.execute("INSERT INTO reglas (marca, clasificacion, limite_supervisor, limite_gte_ventas, limite_compras) VALUES ('','',0,0,0)")
            conn.commit()
            conn.close()
            self.respond_json({'ok': True})
            return
        
        rid = data['id']
        field = data['field']
        value = data['value']
        
        allowed = ['marca', 'clasificacion', 'limite_vendedor', 'limite_supervisor', 'limite_gte_ventas', 'limite_compras']
        if field not in allowed:
            conn.close()
            self.respond_json({'ok': False, 'error': 'Campo no válido'}, 400)
            return
        
        old = conn.execute(f"SELECT {field} FROM reglas WHERE id=?", (rid,)).fetchone()
        old_val = old[0] if old else ''
        
        if field.startswith('limite'):
            value = float(value)
        
        conn.execute(f"UPDATE reglas SET {field}=?, updated_at=datetime('now') WHERE id=?", (value, rid))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'regla_editada', 'regla', rid,
                    f"{field}: {old_val} → {value}", str(old_val), str(value), self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})
    
    def api_reglas_delete(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = json.loads(self.read_body())
        conn = db.get_db()
        conn.execute("DELETE FROM reglas WHERE id=?", (data['id'],))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'regla_eliminada', 'regla', data['id'], ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})
    
    # ========== ADMIN: PRESUPUESTO ==========
    def page_admin_presupuesto(self, query=None):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        q = query or {}
        ppto_import_error = q.get('error', '')

        conn = db.get_db()
        page = int(q.get('page', 1))
        per_page = 50
        offset = (page - 1) * per_page
        
        total = conn.execute("SELECT COUNT(*) FROM presupuesto").fetchone()[0]
        records = conn.execute("SELECT * FROM presupuesto ORDER BY supervisor, asesor, marca LIMIT ? OFFSET ?",
                              (per_page, offset)).fetchall()
        conn.close()
        
        rows = ''
        for r in records:
            rows += f'''<tr>
                <td>{r['id']}</td>
                <td><input type="text" class="form-control" value="{esc(r['supervisor'])}" data-id="{r['id']}" data-field="supervisor" onchange="savePpto(this)" style="min-width:120px;"></td>
                <td><input type="text" class="form-control" value="{esc(r['asesor'])}" data-id="{r['id']}" data-field="asesor" onchange="savePpto(this)" style="min-width:120px;"></td>
                <td><input type="text" class="form-control" value="{esc(r['marca'])}" data-id="{r['id']}" data-field="marca" onchange="savePpto(this)" style="min-width:100px;"></td>
                <td><input type="number" class="form-control" value="{r['ppto_mensual_crc']}" data-id="{r['id']}" data-field="ppto_mensual_crc" onchange="savePpto(this)" step="1" style="width:120px;"></td>
                <td><button class="btn btn-danger btn-sm" onclick="deletePpto({r['id']})">✕</button></td>
            </tr>'''
        
        total_pages = (total + per_page - 1) // per_page
        pag = ''
        for p in range(1, total_pages + 1):
            cls = 'btn-primary' if p == page else 'btn-outline'
            pag += f'<a href="/admin/presupuesto?page={p}" class="btn {cls} btn-sm">{p}</a> '
        
        ppto_err_html = f'<div class="alert alert-danger">{chr(123)}esc(ppto_import_error){chr(125)}</div>' if ppto_import_error else ''
        content = f'''
        {chr(123)}ppto_err_html{chr(125)}
        <h1>Presupuesto Mensual por Marca/Asesor</h1>
        <div class="card">
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;align-items:flex-end;">
                <form method="POST" action="/admin/presupuesto/import" enctype="multipart/form-data" style="display:flex;gap:10px;align-items:center;">
                    <input type="file" name="file" accept=".xlsx,.csv" class="form-control" style="max-width:300px;">
                    <button type="submit" class="btn btn-primary btn-sm">Importar Excel/CSV</button>
                </form>
                <a href="/api/export/presupuesto" class="btn btn-outline btn-sm">Exportar CSV</a>
                <button class="btn btn-success btn-sm" onclick="addPptoRow()">+ Agregar Fila</button>
            </div>
            <p style="font-size:12px;color:#888;">Total: {total} registros | Página {page} de {total_pages}</p>
            <div class="table-responsive">
            <table>
                <thead><tr><th>#</th><th>Supervisor</th><th>Asesor</th><th>Marca</th><th>Ppto Mensual CRC</th><th></th></tr></thead>
                <tbody>{rows}</tbody>
            </table>
            </div>
            <div style="margin-top:10px;">{pag}</div>
        </div>
        <script>
        async function savePpto(el) {{
            var r = await apiPost('/admin/presupuesto/save', {{id: parseInt(el.dataset.id), field: el.dataset.field, value: el.value}});
            el.style.borderColor = r.ok ? '#27ae60' : '#e74c3c';
            setTimeout(()=>el.style.borderColor='', 1000);
        }}
        async function deletePpto(id) {{
            if (!confirm('¿Eliminar?')) return;
            var r = await apiPost('/admin/presupuesto/delete', {{id: id}});
            if (r.ok) window.location.reload();
        }}
        async function addPptoRow() {{
            var r = await apiPost('/admin/presupuesto/save', {{id: 0, field: 'new', value: ''}});
            if (r.ok) window.location.reload();
        }}
        </script>'''
        self.respond_html(layout('Presupuesto', content, user, 'presupuesto'))
    
    def api_presupuesto_import(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = self.parse_form()
        file_data = data.get('file')
        if not file_data or not isinstance(file_data, dict):
            self.redirect('/admin/presupuesto')
            return

        tmp_path = os.path.join(BASE_DIR, 'data', 'tmp_ppto_import')
        ext = '.xlsx' if file_data['filename'].endswith('.xlsx') else '.csv'
        tmp_file = tmp_path + ext
        with open(tmp_file, 'wb') as f:
            f.write(file_data['data'])

        conn = db.get_db()
        try:
            if ext == '.xlsx':
                records = xlsx_reader.import_presupuesto_from_xlsx(tmp_file)
            else:
                text = file_data['data'].decode('utf-8-sig')
                raw = xlsx_reader.read_csv_text(text)
                records = []
                for r in raw:
                    records.append({
                        'supervisor': r.get('Supervisor', r.get('supervisor', '')),
                        'asesor': r.get('Asesor', r.get('asesor', '')),
                        'marca': r.get('Marca', r.get('marca', '')),
                        'ppto_mensual_crc': xlsx_reader.parse_number(r.get('Ppto Mensual_en_CRC', r.get('ppto_mensual_crc', 0)))
                    })

            # ── VALIDATION: supervisors and asesores must exist in users table ──────
            missing_users = set()
            for r in records:
                sup_uname = r.get('supervisor', '').strip()
                ase_uname = r.get('asesor', '').strip()
                if sup_uname:
                    exists = conn.execute(
                        "SELECT 1 FROM users WHERE username=? AND role='supervisor' AND status='activo'",
                        (sup_uname,)
                    ).fetchone()
                    if not exists:
                        missing_users.add(f"{sup_uname} (supervisor)")
                if ase_uname:
                    exists = conn.execute(
                        "SELECT 1 FROM users WHERE username=? AND status='activo'",
                        (ase_uname,)
                    ).fetchone()
                    if not exists:
                        missing_users.add(f"{ase_uname} (vendedor/asesor)")

            if missing_users:
                conn.close()
                os.remove(tmp_file) if os.path.exists(tmp_file) else None
                missing_list = ', '.join(sorted(missing_users))
                self.redirect(f'/admin/presupuesto?error=Los+siguientes+usuarios+no+existen+en+el+sistema+antes+de+cargar+presupuesto:+{urllib.parse.quote(missing_list)}')
                return
            # ── END VALIDATION ───────────────────────────────────────────────────────

            conn.execute("DELETE FROM presupuesto")
            for r in records:
                conn.execute("INSERT INTO presupuesto (supervisor, asesor, marca, ppto_mensual_crc) VALUES (?,?,?,?)",
                    (r['supervisor'], r['asesor'], r['marca'], r['ppto_mensual_crc']))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'presupuesto_importado',
                        details=f"{len(records)} registros", ip=self.get_client_ip())
        except Exception as e:
            traceback.print_exc()
        finally:
            os.remove(tmp_file) if os.path.exists(tmp_file) else None
            conn.close()
        self.redirect('/admin/presupuesto')
    
    def api_presupuesto_save(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = json.loads(self.read_body())
        conn = db.get_db()
        
        if data.get('field') == 'new' or data.get('id') == 0:
            conn.execute("INSERT INTO presupuesto (supervisor, asesor, marca, ppto_mensual_crc) VALUES ('','','',0)")
            conn.commit()
            conn.close()
            self.respond_json({'ok': True})
            return
        
        rid = data['id']
        field = data['field']
        value = data['value']
        
        allowed = ['supervisor', 'asesor', 'marca', 'ppto_mensual_crc']
        if field not in allowed:
            conn.close()
            self.respond_json({'ok': False, 'error': 'Campo no válido'}, 400)
            return
        
        if field == 'ppto_mensual_crc':
            value = float(value)
        
        conn.execute(f"UPDATE presupuesto SET {field}=?, updated_at=datetime('now') WHERE id=?", (value, rid))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'presupuesto_editado', 'presupuesto', rid,
                    f"{field} → {value}", ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})
    
    def api_presupuesto_delete(self):
        user = self.require_auth(['admin', 'compras'])
        if not user:
            return
        data = json.loads(self.read_body())
        conn = db.get_db()
        conn.execute("DELETE FROM presupuesto WHERE id=?", (data['id'],))
        conn.commit()
        conn.close()
        self.respond_json({'ok': True})
    
    # ========== ADMIN: USUARIOS ==========
    def page_admin_usuarios(self, query=None):
        user = self.require_auth(['admin'])
        if not user:
            return
        
        conn = db.get_db()
        users = conn.execute("""SELECT u.*, s.nombre||' '||s.apellido as supervisor_nombre
            FROM users u LEFT JOIN users s ON u.supervisor_id=s.id
            ORDER BY u.role, u.nombre""").fetchall()
        supervisors = conn.execute("SELECT id, nombre, apellido FROM users WHERE role='supervisor' AND status='activo'").fetchall()
        conn.close()
        
        sup_opts = ''.join(f'<option value="{s["id"]}">{esc(s["nombre"])} {esc(s["apellido"])}</option>' for s in supervisors)
        sup_options_new = ''.join(f'<option value="{s["id"]}">{esc(s["nombre"])} {esc(s["apellido"])}</option>' for s in supervisors)
        
        rows = ''
        for u in users:
            sup_select = f'''<select class="form-control" data-id="{u['id']}" data-field="supervisor_id" onchange="saveUser(this)" style="width:130px;">
                <option value="">N/A</option>
                {''.join(f'<option value="{s["id"]}" {"selected" if u["supervisor_id"]==s["id"] else ""}>{esc(s["nombre"])} {esc(s["apellido"])}</option>' for s in supervisors)}
            </select>'''
            
            rows += f'''<tr>
                <td>{u['id']}</td>
                <td><input type="text" class="form-control" value="{esc(u['username'])}" data-id="{u['id']}" data-field="username" onchange="saveUser(this)" style="width:100px;"></td>
                <td><input type="text" class="form-control" value="{esc(u['nombre'])}" data-id="{u['id']}" data-field="nombre" onchange="saveUser(this)" style="width:100px;"></td>
                <td><input type="text" class="form-control" value="{esc(u['apellido'])}" data-id="{u['id']}" data-field="apellido" onchange="saveUser(this)" style="width:100px;"></td>
                <td><input type="email" class="form-control" value="{esc(u['email'])}" data-id="{u['id']}" data-field="email" onchange="saveUser(this)" style="width:160px;"></td>
                <td><select class="form-control" data-id="{u['id']}" data-field="role" onchange="saveUser(this)" style="width:110px;">
                    {''.join(f'<option value="{r}" {"selected" if u["role"]==r else ""}>{r}</option>' for r in ['vendedor','supervisor','gerente_ventas','compras','admin'])}
                </select></td>
                <td>{sup_select}</td>
                <td><select class="form-control" data-id="{u['id']}" data-field="status" onchange="saveUser(this)" style="width:80px;">
                    <option value="activo" {"selected" if u["status"]=="activo" else ""}>Activo</option>
                    <option value="inactivo" {"selected" if u["status"]=="inactivo" else ""}>Inactivo</option>
                </select></td>
                <td>
                    <button class="btn btn-warning btn-sm" onclick="resetPw({u['id']})">Reset PW</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteUser({u['id']})">✕</button>
                </td>
            </tr>'''
        
        content = f'''
        <h1>Gestión de Usuarios</h1>
        <div class="card">
            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;align-items:flex-end;">
                <button class="btn btn-success btn-sm" onclick="showNewUser()">+ Nuevo Usuario</button>
                <form method="POST" action="/admin/usuarios/import" enctype="multipart/form-data" style="display:flex;gap:10px;align-items:center;">
                    <input type="file" name="file" accept=".xlsx,.csv" class="form-control" style="max-width:300px;">
                    <button type="submit" class="btn btn-primary btn-sm">Importar Usuarios</button>
                </form>
            </div>
            
            <div id="newUserForm" style="display:none;background:#f8f9fa;padding:15px;border-radius:8px;margin-bottom:15px;">
                <h3>Nuevo Usuario</h3>
                <div class="grid-3">
                    <div class="form-group"><label>Usuario</label><input type="text" id="nu_user" class="form-control" placeholder="sin @cofersa.cr"></div>
                    <div class="form-group"><label>Nombre</label><input type="text" id="nu_nombre" class="form-control"></div>
                    <div class="form-group"><label>Apellido</label><input type="text" id="nu_apellido" class="form-control"></div>
                </div>
                <div class="grid-3">
                    <div class="form-group"><label>Email</label><input type="email" id="nu_email" class="form-control"></div>
                    <div class="form-group"><label>Rol</label><select id="nu_role" class="form-control" onchange="toggleSupField()">
                        <option value="vendedor">Vendedor</option><option value="supervisor">Supervisor</option>
                        <option value="gerente_ventas">Gte. Ventas</option><option value="compras">Compras</option>
                        <option value="admin">Admin</option>
                    </select></div>
                    <div class="form-group"><label>Contraseña</label><input type="text" id="nu_pw" class="form-control" value="Cofersa123!"></div>
                </div>
                <div class="grid-3" id="nu_sup_row" style="display:none;">
                    <div class="form-group"><label>Supervisor <span style="color:var(--danger)">*</span> (requerido para vendedores)</label>
                    <select id="nu_supervisor_id" class="form-control">
                        <option value="">-- Seleccione supervisor --</option>
                        {sup_options_new}
                    </select></div>
                </div>
                <button class="btn btn-success" onclick="createUser()">Crear Usuario</button>
                <button class="btn btn-outline" onclick="document.getElementById('newUserForm').style.display='none'">Cancelar</button>
                <div id="nuMsg" style="margin-top:8px;"></div>
            </div>
            
            <div style="overflow-x:auto;">
            <table style="font-size:12px;">
                <thead><tr>
                    <th>#</th><th>Usuario</th><th>Nombre</th><th>Apellido</th><th>Email</th><th>Rol</th><th>Supervisor</th><th>Estado</th><th>Acciones</th>
                </tr></thead>
                <tbody>{rows}</tbody>
            </table>
            </div>
        </div>
        
        <script>
        function showNewUser() {{
            document.getElementById('newUserForm').style.display='block';
            toggleSupField(); // show supervisor field if default role is vendedor
        }}
        function toggleSupField() {{
            var role = document.getElementById('nu_role').value;
            var row = document.getElementById('nu_sup_row');
            if (row) row.style.display = (role === 'vendedor') ? 'grid' : 'none';
        }}
        async function createUser() {{
            var role = document.getElementById('nu_role').value;
            var supId = document.getElementById('nu_supervisor_id') ? document.getElementById('nu_supervisor_id').value : '';
            if (role === 'vendedor' && !supId) {{
                document.getElementById('nuMsg').innerHTML = '<div class="alert alert-danger">Los vendedores deben tener un supervisor asignado.</div>';
                return;
            }}
            var r = await apiPost('/admin/usuarios/save', {{
                id: 0, action: 'create',
                username: document.getElementById('nu_user').value,
                nombre: document.getElementById('nu_nombre').value,
                apellido: document.getElementById('nu_apellido').value,
                email: document.getElementById('nu_email').value,
                role: role,
                supervisor_id: supId ? parseInt(supId) : null,
                password: document.getElementById('nu_pw').value
            }});
            if (r.ok) window.location.reload();
            else document.getElementById('nuMsg').innerHTML = '<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
        }}
        async function saveUser(el) {{
            var r = await apiPost('/admin/usuarios/save', {{
                id: parseInt(el.dataset.id), field: el.dataset.field, value: el.value
            }});
            el.style.borderColor = r.ok ? '#27ae60' : '#e74c3c';
            setTimeout(()=>el.style.borderColor='', 1000);
        }}
        async function resetPw(id) {{
            var pw = prompt('Nueva contraseña:', 'Cofersa123!');
            if (!pw) return;
            var r = await apiPost('/admin/usuarios/save', {{id: id, field: 'password', value: pw}});
            alert(r.ok ? 'Contraseña actualizada' : (r.error||'Error'));
        }}
        async function deleteUser(id) {{
            if (!confirm('¿Eliminar este usuario?')) return;
            var r = await apiPost('/admin/usuarios/delete', {{id: id}});
            if (r.ok) window.location.reload();
            else alert(r.error||'Error');
        }}
        </script>'''
        self.respond_html(layout('Usuarios', content, user, 'usuarios'))
    
    def api_usuarios_save(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        conn = db.get_db()
        
        if data.get('action') == 'create' or data.get('id') == 0:
            # Validate: vendedores must have supervisor
            if data.get('role') == 'vendedor' and not data.get('supervisor_id'):
                conn.close()
                self.respond_json({'ok': False, 'error': 'Los vendedores deben tener un supervisor asignado.'}, 400)
                return
            username = data.get('username', '').strip().lower().replace('@cofersa.cr', '')
            if not username:
                conn.close()
                self.respond_json({'ok': False, 'error': 'Username requerido'}, 400)
                return
            exists = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
            if exists:
                conn.close()
                self.respond_json({'ok': False, 'error': 'Usuario ya existe'}, 400)
                return
            
            pw = data.get('password', 'Cofersa123!')
            pw_hash, salt = db.hash_password(pw)
            _sup_id_create = data.get('supervisor_id') or None
            if _sup_id_create:
                try: _sup_id_create = int(_sup_id_create)
                except: _sup_id_create = None
            conn.execute("""INSERT INTO users (username, password_hash, salt, nombre, apellido, email, role, supervisor_id, status)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (username, pw_hash, salt,
                 data.get('nombre', ''), data.get('apellido', ''),
                 data.get('email', f'{username}@cofersa.cr'),
                 data.get('role', 'vendedor'), _sup_id_create, 'activo'))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'usuario_creado', details=f"username: {username}",
                        ip=self.get_client_ip())
            conn.close()
            self.respond_json({'ok': True})
            return
        
        uid = data['id']
        field = data.get('field', '')
        value = data.get('value', '')
        
        if field == 'password':
            pw_hash, salt = db.hash_password(value)
            conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                        (pw_hash, salt, uid))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'password_reset', 'user', uid, ip=self.get_client_ip())
            conn.close()
            self.respond_json({'ok': True})
            return
        
        allowed = ['username', 'nombre', 'apellido', 'email', 'role', 'status', 'supervisor_id']
        if field not in allowed:
            conn.close()
            self.respond_json({'ok': False, 'error': 'Campo no válido'}, 400)
            return
        
        if field == 'supervisor_id':
            value = int(value) if value else None
        
        conn.execute(f"UPDATE users SET {field}=?, updated_at=datetime('now') WHERE id=?", (value, uid))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'usuario_editado', 'user', uid,
                    f"{field} → {value}", ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})
    
    def api_usuarios_delete(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        uid = data.get('id')
        if uid == user['id']:
            self.respond_json({'ok': False, 'error': 'No puede eliminarse a sí mismo'}, 400)
            return
        conn = db.get_db()
        conn.execute("UPDATE users SET status='inactivo', updated_at=datetime('now') WHERE id=?", (uid,))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'usuario_desactivado', 'user', uid, ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})
    
    def api_usuarios_import(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = self.parse_form()
        file_data = data.get('file')
        if not file_data or not isinstance(file_data, dict):
            self.redirect('/admin/usuarios')
            return
        
        tmp_path = os.path.join(BASE_DIR, 'data', 'tmp_users_import')
        ext = '.xlsx' if file_data['filename'].endswith('.xlsx') else '.csv'
        tmp_file = tmp_path + ext
        with open(tmp_file, 'wb') as f:
            f.write(file_data['data'])
        
        conn = db.get_db()
        try:
            if ext == '.xlsx':
                records = xlsx_reader.read_xlsx(tmp_file)
            else:
                records = xlsx_reader.read_csv_text(file_data['data'].decode('utf-8-sig'))
            
            count = 0
            for r in records:
                email = ''
                for k, v in r.items():
                    if 'correo' in k.lower() or 'email' in k.lower() or 'mail' in k.lower():
                        email = str(v).strip()
                
                nombre = ''
                for k, v in r.items():
                    if 'nombre' in k.lower() and 'apellido' not in k.lower():
                        nombre = str(v).strip()
                
                apellido = ''
                for k, v in r.items():
                    if 'apellido' in k.lower():
                        apellido = str(v).strip()
                
                role = 'vendedor'
                for k, v in r.items():
                    if 'rol' in k.lower() or 'role' in k.lower():
                        role = str(v).strip().lower()
                
                status = 'activo'
                for k, v in r.items():
                    if 'status' in k.lower() or 'estado' in k.lower():
                        status = str(v).strip().lower()
                
                if not email:
                    continue
                
                username = email.replace('@cofersa.cr', '').lower()
                
                existing = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
                if existing:
                    conn.execute("""UPDATE users SET nombre=?, apellido=?, email=?, role=?, status=?, updated_at=datetime('now')
                        WHERE id=?""", (nombre, apellido, email, role, status, existing['id']))
                else:
                    pw_hash, salt = db.hash_password('Cofersa123!')
                    conn.execute("""INSERT INTO users (username, password_hash, salt, nombre, apellido, email, role, status)
                        VALUES (?,?,?,?,?,?,?,?)""",
                        (username, pw_hash, salt, nombre, apellido, email, role, status))
                count += 1
            
            conn.commit()
            db.log_audit(user['id'], user['username'], 'usuarios_importados',
                        details=f"{count} usuarios procesados", ip=self.get_client_ip())
        except Exception as e:
            traceback.print_exc()
        finally:
            os.remove(tmp_file) if os.path.exists(tmp_file) else None
            conn.close()
        self.redirect('/admin/usuarios')
    
    # ========== ADMIN: ALL SOLICITUDES ==========
    def page_admin_solicitudes(self, query=None):
        user = self.require_auth(['admin', 'compras', 'gerente_ventas'])
        if not user:
            return
        
        q = query or {}
        conn = db.get_db()
        
        sql = """SELECT s.*, u.nombre||' '||u.apellido as vendedor_nombre,
                a.nombre||' '||a.apellido as aprobador_nombre
                FROM solicitudes s 
                LEFT JOIN users u ON s.vendedor_id=u.id
                LEFT JOIN users a ON s.aprobador_actual_id=a.id WHERE 1=1"""
        params = []
        
        if q.get('estado'):
            sql += " AND s.estado=?"
            params.append(q['estado'])
        if q.get('desde'):
            sql += " AND s.created_at>=?"
            params.append(q['desde'])
        if q.get('hasta'):
            sql += " AND s.created_at<=?"
            params.append(q['hasta'] + ' 23:59:59')
        
        sql += " ORDER BY s.created_at DESC LIMIT 500"
        rows = conn.execute(sql, params).fetchall()
        conn.close()
        
        table_rows = ''
        for r in rows:
            table_rows += f'''<tr>
                <td><a href="/solicitud/{r['id']}">{esc(r['folio'] or f"#{r['id']}")}</a></td>
                <td>{esc(r['vendedor_nombre'])}</td>
                <td>{esc(r['cliente_nombre'])}</td>
                <td>{esc(r['numero_pedido'])}</td>
                <td class="text-right">{format_crc(r['monto_total_descuento'])}</td>
                <td class="text-right">{format_crc(r['monto_total_aprobado'] or 0)}</td>
                <td>{estado_badge(r['estado'])}</td>
                <td>{esc(r['created_at'][:16])}</td>
            </tr>'''
        
        content = f'''
        <h1>Todas las Solicitudes</h1>
        <div class="filters-bar">
            <div class="form-group"><label>Estado</label>
                <select class="form-control" onchange="applyFilter('estado',this.value)">
                    <option value="">Todos</option>
                    {''.join(f'<option value="{e}" {"selected" if q.get("estado")==e else ""}>{e}</option>' for e in ['pendiente','aprobada','rechazada','escalada','cancelada'])}
                </select>
            </div>
            <div class="form-group"><label>Desde</label><input type="date" class="form-control" value="{q.get('desde','')}" onchange="applyFilter('desde',this.value)"></div>
            <div class="form-group"><label>Hasta</label><input type="date" class="form-control" value="{q.get('hasta','')}" onchange="applyFilter('hasta',this.value)"></div>
        </div>
        <div class="card">
            <div class="table-responsive">
            <table>
                <thead><tr><th>Folio/ID</th><th>Vendedor</th><th>Cliente</th><th>Pedido</th>
                    <th class="text-right">Monto Sol.</th><th class="text-right">Monto Aprob.</th><th>Estado</th><th>Fecha</th></tr></thead>
                <tbody>{table_rows}</tbody>
            </table>
        </div>
        <script>
        function applyFilter(k,v){{var u=new URL(window.location);if(v)u.searchParams.set(k,v);else u.searchParams.delete(k);window.location=u.toString();}}
        </script>'''
        self.respond_html(layout('Todas Solicitudes', content, user, 'todas'))
    
    # ========== ADMIN: AUDITORIA ==========
    def page_admin_auditoria(self, query=None):
        user = self.require_auth(['admin'])
        if not user:
            return
        
        conn = db.get_db()
        q = query or {}
        page = int(q.get('page', 1))
        per_page = 100
        
        total = conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]
        rows = conn.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?",
                           (per_page, (page-1)*per_page)).fetchall()
        conn.close()
        
        table_rows = ''
        for r in rows:
            table_rows += f'''<tr>
                <td style="font-size:11px;">{esc(r['created_at'][:19])}</td>
                <td>{esc(r['username'] or '')}</td>
                <td>{esc(r['action'])}</td>
                <td>{esc(r['entity_type'] or '')} {r['entity_id'] or ''}</td>
                <td style="font-size:11px;max-width:300px;overflow:hidden;">{esc(r['details'] or '')}</td>
                <td style="font-size:10px;">{esc(r['ip_address'] or '')}</td>
            </tr>'''
        
        total_pages = max(1, (total + per_page - 1) // per_page)
        pag = ' '.join(f'<a href="/admin/auditoria?page={p}" class="btn {"btn-primary" if p==page else "btn-outline"} btn-sm">{p}</a>' for p in range(max(1,page-5), min(total_pages+1, page+6)))
        
        content = f'''
        <h1>Auditoría del Sistema</h1>
        <div class="card">
            <p style="font-size:12px;color:#888;">Total: {total} registros | Página {page} de {total_pages}</p>
            <div class="table-responsive">
            <table>
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr></thead>
                <tbody>{table_rows}</tbody>
            </table>
            </div>
            <div style="margin-top:10px;">{pag}</div>
        </div>
        <div style="margin-top:10px;"><a href="/api/export/auditoria" class="btn btn-outline btn-sm">Exportar CSV</a></div>'''
        self.respond_html(layout('Auditoría', content, user, 'auditoria'))
    
    # ========== ADMIN: CONFIG ==========
    def page_admin_config(self, query=None):
        user = self.require_auth(['admin'])
        if not user:
            return
        
        configs = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from',
                    'email_ne_team', 'app_name', 'base_url']
        
        fields = ''
        for key in configs:
            val = db.get_config(key, '')
            input_type = 'password' if 'password' in key else 'text'
            fields += f'''<div class="form-group">
                <label>{key}</label>
                <input type="{input_type}" class="form-control" name="{key}" value="{esc(val)}">
            </div>'''
        
        content = f'''
        <h1>Configuración del Sistema</h1>
        <div class="card">
            <form id="configForm">
                {fields}
                <button type="button" class="btn btn-primary" onclick="saveConfig()">Guardar Configuración</button>
            </form>
            <div id="configMsg" style="margin-top:10px;"></div>
        </div>
        
        <div class="card" style="margin-top:20px;">
            <div class="card-header">Configuración de Correo con Google Workspace</div>
            <p>Para enviar correos desde la app, configure:</p>
            <ol style="padding-left:20px;line-height:2;">
                <li>Active "Acceso de apps menos seguras" o genere una <strong>App Password</strong> en su cuenta Google Workspace.</li>
                <li>En Google Admin → Security → App Access, permita SMTP relay si es necesario.</li>
                <li>Configure smtp_host: <code>smtp.gmail.com</code>, smtp_port: <code>587</code></li>
                <li>smtp_user: su email de Google Workspace (ej: <code>sistema@cofersa.cr</code>)</li>
                <li>smtp_password: la App Password generada (16 caracteres)</li>
                <li>smtp_from: email remitente (ej: <code>negociacionespecial@cofersa.cr</code>)</li>
            </ol>
        </div>

        <div class="card" style="margin-top:20px;">
            <div class="card-header">Integración con Google Sheets</div>
            <p>Para exportar datos a Google Sheets automáticamente:</p>
            <ol style="padding-left:20px;line-height:2;">
                <li>Cree un Google Sheet destino y compártalo con permisos de edición.</li>
                <li>En Google Sheets, vaya a Extensiones → Apps Script.</li>
                <li>Cree un Web App que reciba datos POST en formato JSON.</li>
                <li>Publique como Web App y copie la URL del deployment.</li>
                <li>Configure el webhook en base_url/api/export/gsheet.</li>
            </ol>
            <p>Alternativamente, puede exportar CSV desde la sección Exportar y pegarlo en Google Sheets.</p>
        </div>
        
        <script>
        async function saveConfig() {{
            var data = {{}};
            document.querySelectorAll('#configForm input').forEach(function(el) {{
                data[el.name] = el.value;
            }});
            var r = await apiPost('/admin/config/save', data);
            document.getElementById('configMsg').innerHTML = r.ok ? 
                '<div class="alert alert-success">Configuración guardada</div>' :
                '<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
        }}
        </script>'''
        self.respond_html(layout('Configuración', content, user, 'config'))
    
    def api_config_save(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        for key, value in data.items():
            db.set_config(key, value)
        db.log_audit(user['id'], user['username'], 'config_actualizada',
                    details=', '.join(data.keys()), ip=self.get_client_ip())
        self.respond_json({'ok': True})
    
    # ========== EXPORTAR ==========
    # ========== EMAIL PREVIEW (fallback when SMTP not configured) ==========
    def page_email_preview(self, sol_id, query=None):
        """Show the full HTML email for a solicitud — used as SMTP fallback."""
        user = self.require_auth()
        if not user:
            return

        conn = db.get_db()
        sol = conn.execute("SELECT * FROM solicitudes WHERE id=?", (sol_id,)).fetchone()
        if not sol:
            conn.close()
            self.send_error_page(404, "Solicitud no encontrada.")
            return

        sol = dict(sol)
        skus = [dict(r) for r in conn.execute(
            "SELECT * FROM solicitud_skus WHERE solicitud_id=? ORDER BY id", (sol_id,)).fetchall()]

        # Fetch vendedor and aprobador info
        vend_row = conn.execute("SELECT nombre,apellido,email FROM users WHERE id=?",
                                (sol['vendedor_id'],)).fetchone()
        vend_info = dict(vend_row) if vend_row else {}

        apr_id = sol.get('aprobador_final_id') or sol.get('aprobador_actual_id')
        apr_info = {}
        if apr_id:
            apr_row = conn.execute("SELECT nombre,apellido,email FROM users WHERE id=?",
                                   (apr_id,)).fetchone()
            if apr_row:
                apr_info = dict(apr_row)
        conn.close()

        # Determine event type
        estado = sol.get('estado', '')
        event_map = {
            'aprobada': 'approved', 'rechazada': 'rejected',
            'escalada': 'escalated', 'cancelada': 'cancelled',
        }
        event_type = event_map.get(estado, 'created')

        subject, email_html = email_service.build_solicitud_email(
            sol, skus, event_type,
            base_url=db.get_config('base_url'),
            vendedor_info=vend_info,
            aprobador_info=apr_info
        )

        # Wrap with a print/copy toolbar
        toolbar = f"""
        <div style="position:fixed;top:0;left:0;right:0;background:#1a5276;color:white;
                    padding:10px 20px;display:flex;gap:12px;align-items:center;z-index:9999;
                    font-family:Arial,sans-serif;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
            <span style="font-weight:700;flex:1;">Vista Previa del Correo — {esc(subject)}</span>
            <button onclick="window.print()"
                style="background:white;color:#1a5276;border:none;padding:6px 14px;
                       border-radius:4px;cursor:pointer;font-weight:600;">🖨 Imprimir / PDF</button>
            <a href="/solicitud/{sol_id}"
                style="background:rgba(255,255,255,0.2);color:white;padding:6px 14px;
                       border-radius:4px;text-decoration:none;">← Volver a Solicitud</a>
        </div>
        <div style="height:48px;"></div>"""

        full_page = email_html.replace("<body", "<body").replace(
            "</body>", f"{toolbar}</body>", 1
        )
        # Insert toolbar after opening body tag
        full_page = email_html.replace(
            "<body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;'>",
            f"<body style='margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;'>{toolbar}"
        )

        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(full_page.encode('utf-8'))

    def page_exportar(self, query=None):
        user = self.require_auth()
        if not user:
            return
        role = user['role']

        # Solicitudes card — all roles, scoped
        scope_note = ''
        if role == 'vendedor':
            scope_note = '<p style="font-size:12px;color:#888;margin-top:6px;">Solo tus solicitudes</p>'
        elif role == 'supervisor':
            scope_note = '<p style="font-size:12px;color:#888;margin-top:6px;">Solicitudes de tus vendedores</p>'

        admin_only = ''
        if role == 'admin':
            admin_only = '''<div class="card">
                <div class="card-header">Admin</div>
                <p><a href="/api/export/reglas" class="btn btn-primary btn-sm">Exportar Reglas (CSV)</a></p>
                <p style="margin-top:10px;"><a href="/api/export/auditoria" class="btn btn-outline btn-sm">Exportar Auditoría (CSV)</a></p>
            </div>'''

        content = f'''
        <h1>Exportar Datos</h1>
        <p style="color:#555;font-size:13px;margin-bottom:16px;">Los datos exportados respetan tu nivel de acceso en el sistema.</p>
        <div class="grid-2">
            <div class="card">
                <div class="card-header">Solicitudes y Aprobaciones</div>
                <p><a href="/api/export/solicitudes" class="btn btn-primary btn-sm">Todas las Solicitudes (CSV)</a></p>
                <p style="margin-top:10px;"><a href="/api/export/aprobadas" class="btn btn-success btn-sm">Solo Aprobadas (CSV)</a></p>
                <p style="margin-top:10px;"><a href="/api/export/powerbi" class="btn btn-outline btn-sm">Dataset Power BI (CSV)</a></p>
                {scope_note}
            </div>
            {'<div class="card"><div class="card-header">Presupuesto</div><p><a href="/api/export/presupuesto" class="btn btn-primary btn-sm">Exportar Presupuesto (CSV)</a></p>' + scope_note + '</div>' if role != 'vendedor' else ''}
            {admin_only}
        </div>'''
        self.respond_html(layout('Exportar', content, user, 'exportar'))
    
    def api_export(self, export_type, query=None):
        user = self.require_auth()  # all roles can export their own data
        if not user:
            return
        
        conn = db.get_db()
        
        if export_type == 'reglas':
            if user['role'] not in ('admin', 'compras'):
                conn.close(); self.send_error_page(403, 'Sin permisos para exportar reglas.'); return
            rows = conn.execute("SELECT * FROM reglas ORDER BY marca").fetchall()
            headers = ['marca', 'clasificacion', 'limite_vendedor', 'limite_supervisor', 'limite_compras']
            data = [{h: r[h] for h in headers} for r in rows]
            conn.close()
            self.respond_csv(xlsx_reader.export_csv(headers, data), 'reglas_aprobacion.csv')
        
        elif export_type == 'presupuesto':
            # Scope presupuesto by role
            if user['role'] == 'vendedor':
                ppto_rows = conn.execute("SELECT * FROM presupuesto WHERE asesor=? ORDER BY marca", (user['username'],)).fetchall()
            elif user['role'] == 'supervisor':
                ppto_rows = conn.execute("SELECT * FROM presupuesto WHERE supervisor=? ORDER BY asesor, marca", (user['username'],)).fetchall()
            else:
                ppto_rows = conn.execute("SELECT * FROM presupuesto ORDER BY supervisor, asesor, marca").fetchall()
            headers = ['supervisor', 'asesor', 'marca', 'ppto_mensual_crc']
            data = [{h: r[h] for h in headers} for r in ppto_rows]
            conn.close()
            self.respond_csv(xlsx_reader.export_csv(headers, data), 'presupuesto.csv')
        
        elif export_type in ('solicitudes', 'aprobadas', 'powerbi'):
            # Scope by role
            role_exp = user['role']
            uid_exp  = user['id']
            scope_clause = ""
            scope_params = []
            if role_exp == 'vendedor':
                scope_clause = "AND s.vendedor_id=?"
                scope_params = [uid_exp]
            elif role_exp == 'supervisor':
                scope_clause = "AND s.vendedor_id IN (SELECT id FROM users WHERE supervisor_id=? AND status='activo')"
                scope_params = [uid_exp]
            estado_clause = "AND s.estado='aprobada'" if export_type in ('aprobadas', 'powerbi') else ""
            where_clause = f"WHERE 1=1 {estado_clause} {scope_clause}"
            _sql = (
                "SELECT s.*, u.nombre||' '||u.apellido as vendedor_nombre, "
                "u.email as vendedor_email, "
                "a.nombre||' '||a.apellido as aprobador_nombre "
                "FROM solicitudes s "
                "LEFT JOIN users u ON s.vendedor_id=u.id "
                "LEFT JOIN users a ON s.aprobador_final_id=a.id "
                + where_clause +
                " ORDER BY s.created_at DESC"
            )
            rows = conn.execute(_sql, scope_params).fetchall()
            
            output = io.StringIO()
            writer = csv.writer(output)
            headers = ['folio', 'estado', 'cliente_codigo', 'cliente_nombre', 'numero_pedido',
                       'vendedor', 'vendedor_email', 'aprobador', 'aprobador_nivel',
                       'monto_total_descuento', 'monto_total_aprobado', 'justificacion',
                       'created_at', 'approved_at', 'sla_deadline', 'comentario_aprobador']
            
            if export_type == 'powerbi':
                headers += ['marca', 'codigo_sku', 'descripcion', 'cantidad', 'precio_base',
                            'pct_descuento_sol', 'precio_solicitado', 'monto_descuento',
                            'pct_aprobado', 'precio_aprobado', 'monto_aprobado', 'clasificacion']
            
            writer.writerow(headers)
            
            for r in rows:
                base = [r['folio'] or f"#{r['id']}", r['estado'], r['cliente_codigo'],
                        r['cliente_nombre'], r['numero_pedido'],
                        r['vendedor_nombre'], r['vendedor_email'] or '',
                        r['aprobador_nombre'] or '', r['aprobador_nivel'] or '',
                        r['monto_total_descuento'], r['monto_total_aprobado'] or 0,
                        r['justificacion'], r['created_at'], r['approved_at'] or '',
                        r['sla_deadline'] or '', r['comentario_aprobador'] or '']
                
                if export_type == 'powerbi':
                    skus = [dict(s) for s in conn.execute("SELECT * FROM solicitud_skus WHERE solicitud_id=?", (r['id'],)).fetchall()]
                    for sk in skus:
                        writer.writerow(base + [sk['marca'], sk['codigo_sku'], sk['descripcion'],
                                               sk['cantidad'], sk['precio_base'],
                                               sk['porcentaje_descuento_sol'], sk['precio_solicitado'],
                                               sk['monto_descuento'], sk.get('porcentaje_aprobado',''),
                                               sk.get('precio_aprobado',''), sk.get('monto_aprobado',''),
                                               sk.get('clasificacion','')])
                    if not skus:
                        writer.writerow(base + [''] * 12)
                else:
                    writer.writerow(base)
            
            conn.close()
            fname = f"{export_type}_{datetime.now().strftime('%Y%m%d')}.csv"
            self.respond_csv(output.getvalue(), fname)
        
        elif export_type == 'auditoria':
            if user['role'] != 'admin':
                conn.close(); self.send_error_page(403, 'Solo administradores pueden exportar auditoría.'); return
            rows = conn.execute("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10000").fetchall()
            headers = ['created_at', 'username', 'action', 'entity_type', 'entity_id', 'details', 'ip_address']
            data = [{h: r[h] for h in headers} for r in rows]
            conn.close()
            self.respond_csv(xlsx_reader.export_csv(headers, data), 'auditoria.csv')
        
        elif export_type == 'dashboard':
            q = query or {}
            month = q.get('month', datetime.now().strftime('%Y-%m'))
            month_start = month + '-01'
            y, m = int(month[:4]), int(month[5:7])
            month_end = f"{y}-{m+1:02d}-01" if m < 12 else f"{y+1}-01-01"
            
            rows = conn.execute("""
                SELECT sk.marca, SUM(sk.monto_aprobado) as gasto,
                    COALESCE((SELECT SUM(p.ppto_mensual_crc) FROM presupuesto p WHERE p.marca=sk.marca),0) as ppto
                FROM solicitud_skus sk JOIN solicitudes s ON sk.solicitud_id=s.id
                WHERE s.estado='aprobada' AND s.approved_at>=? AND s.approved_at<?
                AND sk.monto_aprobado IS NOT NULL
                GROUP BY sk.marca ORDER BY gasto DESC
            """, (month_start, month_end)).fetchall()
            
            headers = ['marca', 'gasto_aprobado', 'presupuesto', 'pct_consumo']
            data = []
            for r in rows:
                ppto = r['ppto'] or 0
                gasto = r['gasto'] or 0
                data.append({'marca': r['marca'], 'gasto_aprobado': gasto,
                            'presupuesto': ppto,
                            'pct_consumo': f"{(gasto/ppto*100):.2f}" if ppto > 0 else "0"})
            conn.close()
            self.respond_csv(xlsx_reader.export_csv(headers, data), f'dashboard_{month}.csv')
        
        else:
            conn.close()
            self.send_error_page(404, 'Exportación no encontrada')
    
    # ========== API: REGLAS MARCA ==========
    def api_reglas_marca(self, query=None):
        q = query or {}
        marca = q.get('marca', '')
        if not marca:
            self.respond_json({'ok': False, 'error': 'Marca requerida'}, 400)
            return
        conn = db.get_db()
        regla = conn.execute("SELECT * FROM reglas WHERE marca=? LIMIT 1", (marca,)).fetchone()
        conn.close()
        if regla:
            self.respond_json({'ok': True, 'data': {
                'marca':             regla['marca'],
                'clasificacion':     regla['clasificacion'],
                'limite_vendedor':   float(regla['limite_vendedor']   or 0),
                'limite_supervisor': float(regla['limite_supervisor']  or 0),
                'limite_gte_ventas': float(regla['limite_gte_ventas']  or 0),
                'limite_compras':    float(regla['limite_compras']     or 0),
            }})
        else:
            self.respond_json({'ok': False, 'error': 'Marca no encontrada'})
    
    def api_ppto_marca(self, query=None):
        """Return budget info for a marca+user for the current month."""
        user = self.get_user()
        if not user:
            self.respond_json({'ok': False}, 401)
            return
        q      = query or {}
        marca  = q.get('marca', '')
        if not marca:
            self.respond_json({'ok': False, 'error': 'Marca requerida'}, 400)
            return

        conn = db.get_db()
        now  = datetime.now()
        month_start = f"{now.year}-{now.month:02d}-01"
        if now.month == 12:
            month_end = f"{now.year+1}-01-01"
        else:
            month_end = f"{now.year}-{now.month+1:02d}-01"

        role = user['role']
        uid  = user['id']

        # Budget for this user+marca (by asesor username)
        ppto = conn.execute(
            "SELECT COALESCE(SUM(ppto_mensual_crc),0) FROM presupuesto WHERE asesor=? AND marca=?",
            (user['username'], marca)).fetchone()[0]

        # Gasto aprobado this month for this user+marca
        gasto = conn.execute(
            """SELECT COALESCE(SUM(sk.monto_aprobado),0)
               FROM solicitud_skus sk
               JOIN solicitudes s ON sk.solicitud_id=s.id
               WHERE s.vendedor_id=? AND s.estado='aprobada'
               AND s.approved_at>=? AND s.approved_at<?
               AND sk.marca=? AND sk.monto_aprobado IS NOT NULL""",
            (uid, month_start, month_end, marca)).fetchone()[0]

        conn.close()
        pct = round(gasto / ppto * 100, 1) if ppto > 0 else 0
        self.respond_json({'ok': True, 'marca': marca,
            'ppto': float(ppto), 'gasto': float(gasto), 'pct': pct,
            'month': f"{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][now.month-1]} {now.year}"})

    def api_marcas(self, query=None):
        conn = db.get_db()
        marcas = conn.execute("SELECT DISTINCT marca FROM reglas ORDER BY marca").fetchall()
        conn.close()
        self.respond_json({'ok': True, 'marcas': [r['marca'] for r in marcas]})
    
    def api_stats(self, query=None):
        user = self.get_user()
        if not user:
            self.respond_json({'ok': False}, 401)
            return
        self.respond_json({'ok': True, 'message': 'Stats endpoint'})

    # ========== CAMBIAR CONTRASEÑA (non-admin users) ==========
    def page_cambiar_password(self, query=None):
        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return
        q = query or {}
        msg = q.get('msg', '')
        err = q.get('error', '')
        msg_html = f'<div class="alert alert-success">{esc(msg)}</div>' if msg else ''
        err_html = f'<div class="alert alert-danger">{esc(err)}</div>' if err else ''
        content = f'''
        <h1>Cambiar Mi Contraseña</h1>
        {msg_html}{err_html}
        <div class="card" style="max-width:480px;">
            <div class="form-group">
                <label>Contraseña Actual *</label>
                <input type="password" id="pw_actual" class="form-control" placeholder="Tu contraseña actual">
            </div>
            <div class="form-group">
                <label>Nueva Contraseña *</label>
                <input type="password" id="pw_nueva" class="form-control" placeholder="Mínimo 6 caracteres">
            </div>
            <div class="form-group">
                <label>Confirmar Nueva Contraseña *</label>
                <input type="password" id="pw_confirm" class="form-control" placeholder="Repite la nueva contraseña">
            </div>
            <div id="pwMsg" style="margin-bottom:10px;"></div>
            <button class="btn btn-primary" onclick="cambiarPw()">Guardar Nueva Contraseña</button>
            <a href="/" class="btn btn-outline" style="margin-left:8px;">Cancelar</a>
        </div>
        <script>
        async function cambiarPw() {{
            var actual  = document.getElementById('pw_actual').value;
            var nueva   = document.getElementById('pw_nueva').value;
            var confirm = document.getElementById('pw_confirm').value;
            var msg     = document.getElementById('pwMsg');
            if (!actual || !nueva || !confirm) {{
                msg.innerHTML = '<div class="alert alert-danger">Todos los campos son requeridos.</div>'; return;
            }}
            if (nueva.length < 6) {{
                msg.innerHTML = '<div class="alert alert-danger">La nueva contraseña debe tener al menos 6 caracteres.</div>'; return;
            }}
            if (nueva !== confirm) {{
                msg.innerHTML = '<div class="alert alert-danger">La nueva contraseña y la confirmación no coinciden.</div>'; return;
            }}
            var r = await apiPost('/api/cambiar-password', {{actual: actual, nueva: nueva}});
            if (r.ok) {{
                msg.innerHTML = '<div class="alert alert-success">Contraseña actualizada correctamente.</div>';
                document.getElementById('pw_actual').value = '';
                document.getElementById('pw_nueva').value = '';
                document.getElementById('pw_confirm').value = '';
            }} else {{
                msg.innerHTML = '<div class="alert alert-danger">' + (r.error || 'Error') + '</div>';
            }}
        }}
        </script>'''
        self.respond_html(layout('Mi Contraseña', content, user, 'cambiar_pw'))

    def api_cambiar_password(self):
        user = self.require_auth(['vendedor', 'supervisor', 'gerente_ventas', 'compras', 'admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        actual = data.get('actual', '')
        nueva  = data.get('nueva', '')
        if not actual or not nueva:
            self.respond_json({'ok': False, 'error': 'Faltan campos requeridos.'}, 400); return
        if len(nueva) < 6:
            self.respond_json({'ok': False, 'error': 'La nueva contraseña debe tener al menos 6 caracteres.'}, 400); return
        conn = db.get_db()
        user_row = conn.execute("SELECT * FROM users WHERE id=?", (user['id'],)).fetchone()
        if not user_row or not db.verify_password(actual, user_row['password_hash'], user_row['salt']):
            conn.close()
            self.respond_json({'ok': False, 'error': 'La contraseña actual es incorrecta.'}, 403); return
        pw_hash, salt = db.hash_password(nueva)
        conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                     (pw_hash, salt, user['id']))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'password_changed', 'user', user['id'],
                     'Usuario cambió su propia contraseña', ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})

    # ========== SOLICITAR RESET DE CONTRASEÑA (login page, no auth required) ==========
    def page_solicitar_reset(self, query=None):
        q = query or {}
        msg  = q.get('msg', '')
        err  = q.get('error', '')
        msg_html = f'<div class="alert alert-success">{esc(msg)}</div>' if msg else ''
        err_html = f'<div class="alert alert-danger">{esc(err)}</div>' if err else ''
        content = f'''
        <div class="login-container">
            <div class="login-card">
                <h1>COFERSA</h1>
                <div class="subtitle">Solicitud de Reseteo de Contraseña</div>
                {msg_html}{err_html}
                <div class="form-group" style="text-align:left;">
                    <label>Usuario (sin @cofersa.cr)</label>
                    <input type="text" id="rst_username" class="form-control" placeholder="tu.usuario">
                </div>
                <div id="rstMsg" style="margin-bottom:10px;"></div>
                <button class="btn btn-primary w-100" style="padding:12px;font-size:15px;" onclick="solicitarReset()">
                    Enviar Solicitud de Reseteo
                </button>
                <div style="margin-top:14px;">
                    <a href="/login" style="font-size:13px;color:#1a5276;">← Volver al inicio de sesión</a>
                </div>
            </div>
        </div>
        <script>
        async function solicitarReset() {{
            var username = document.getElementById('rst_username').value.trim();
            var msg = document.getElementById('rstMsg');
            if (!username) {{ msg.innerHTML = '<div class="alert alert-danger">Ingresa tu usuario.</div>'; return; }}
            var r = await apiPost('/api/solicitar-reset', {{username: username}});
            if (r.ok) {{
                msg.innerHTML = '<div class="alert alert-success">Solicitud registrada. Un administrador procesará tu solicitud pronto.</div>';
                document.getElementById('rst_username').value = '';
            }} else {{
                msg.innerHTML = '<div class="alert alert-danger">' + (r.error || 'Error') + '</div>';
            }}
        }}
        </script>'''
        self.respond_html(layout('Solicitar Reseteo', content))

    def api_solicitar_reset(self):
        data = json.loads(self.read_body())
        username = data.get('username', '').strip().lower().replace('@cofersa.cr', '')
        if not username:
            self.respond_json({'ok': False, 'error': 'Usuario requerido.'}, 400); return
        conn = db.get_db()
        user_row = conn.execute("SELECT * FROM users WHERE username=? AND status='activo'", (username,)).fetchone()
        if not user_row:
            conn.close()
            # Return ok to avoid user enumeration — don't reveal if user exists
            self.respond_json({'ok': True}); return
        if user_row['role'] == 'admin':
            conn.close()
            self.respond_json({'ok': False, 'error': 'Los administradores deben contactar directamente al equipo de TI.'}); return
        # Check if there's already a pending request
        existing = conn.execute(
            "SELECT id FROM password_reset_requests WHERE user_id=? AND estado='pendiente'",
            (user_row['id'],)).fetchone()
        if existing:
            conn.close()
            self.respond_json({'ok': True}); return  # silently OK, already pending
        conn.execute(
            "INSERT INTO password_reset_requests (user_id, estado, ip_address) VALUES (?,?,?)",
            (user_row['id'], 'pendiente', self.get_client_ip()))
        conn.commit()
        db.log_audit(None, username, 'password_reset_requested', 'user', user_row['id'],
                     f'Solicitud de reseteo por {username}', ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})

    # ========== ADMIN: GESTIÓN DE RESETEOS DE CONTRASEÑA ==========
    def page_admin_password_resets(self, query=None):
        user = self.require_auth(['admin'])
        if not user:
            return
        conn = db.get_db()
        resets = conn.execute("""
            SELECT r.*, u.username, u.nombre, u.apellido, u.email, u.role,
                   ra.username as resolved_by_name
            FROM password_reset_requests r
            JOIN users u ON r.user_id=u.id
            LEFT JOIN users ra ON r.resolved_by=ra.id
            ORDER BY r.requested_at DESC LIMIT 200
        """).fetchall()
        conn.close()

        rows = ''
        pending_ids = []
        for r in resets:
            estado_cls = {'pendiente':'badge-pending','aprobada':'badge-approved',
                          'atendida':'badge-approved','rechazada':'badge-rejected'}.get(r['estado'],'badge-draft')
            btn = ''
            if r['estado'] == 'pendiente':
                pending_ids.append(r['id'])
                rid = r['id']
            btn = f'<button class="btn btn-success btn-sm" onclick="approveReset({rid})">✓ Aprobar</button> <button class="btn btn-danger btn-sm" onclick="rejectReset({rid})">✕ Rechazar</button>'
            resolved_info = f"{esc(r['resolved_by_name'] or '')} {esc(r['resolved_at'][:16] if r['resolved_at'] else '')}"
            rows += f'''<tr>
                <td><input type="checkbox" class="reset-chk" value="{r['id']}" {'disabled' if r['estado'] != 'pendiente' else ''}></td>
                <td>{esc(r['username'])}</td>
                <td>{esc(r['nombre'])} {esc(r['apellido'])}</td>
                <td>{esc(r['email'])}</td>
                <td>{esc(r['role'])}</td>
                <td><span class="badge {estado_cls}">{esc(r['estado'])}</span></td>
                <td>{esc(r['requested_at'][:16])}</td>
                <td style="font-size:11px;">{resolved_info}</td>
                <td>{btn}</td>
            </tr>'''

        content = f'''
        <h1>Gestión de Reseteos de Contraseña</h1>
        <div class="card">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
                <button class="btn btn-success btn-sm" onclick="bulkApprove()">✓ Aprobar Seleccionados</button>
                <button class="btn btn-outline btn-sm" onclick="selectAll()">Seleccionar Pendientes</button>
                <span class="color-muted font-sm">{len([r for r in resets if r['estado']=='pendiente'])} solicitudes pendientes</span>
            </div>
            <div class="table-responsive">
            <table>
                <thead><tr>
                    <th style="width:32px;"></th>
                    <th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th>
                    <th>Estado</th><th>Solicitado</th><th>Resuelto por</th><th>Acciones</th>
                </tr></thead>
                <tbody>{rows if rows else '<tr><td colspan="9" class="text-center color-muted">Sin solicitudes</td></tr>'}</tbody>
            </table>
            </div>
        </div>
        <script>
        function selectAll() {{
            document.querySelectorAll('.reset-chk:not(:disabled)').forEach(function(c){{ c.checked = true; }});
        }}
        async function approveReset(id) {{
            var r = await apiPost('/api/password-reset/approve', {{id: id}});
            if (r.ok) {{ alert('Contraseña reseteada a: ' + r.nueva_password); window.location.reload(); }}
            else alert(r.error || 'Error');
        }}
        async function rejectReset(id) {{
            if (!confirm('¿Rechazar esta solicitud?')) return;
            var r = await apiPost('/api/password-reset/approve', {{id: id, accion: 'rechazar'}});
            if (r.ok) window.location.reload();
            else alert(r.error || 'Error');
        }}
        async function bulkApprove() {{
            var ids = [];
            document.querySelectorAll('.reset-chk:checked').forEach(function(c){{ ids.push(parseInt(c.value)); }});
            if (!ids.length) {{ alert('Selecciona al menos una solicitud.'); return; }}
            if (!confirm('¿Aprobar ' + ids.length + ' solicitud(es)? Se generará una contraseña temporal para cada usuario.')) return;
            var r = await apiPost('/api/password-reset/bulk-approve', {{ids: ids}});
            if (r.ok) {{
                var msg = r.results.map(function(x){{ return x.username + ': ' + x.nueva_password; }}).join('\\n');
                alert('Contraseñas reseteadas:\\n' + msg);
                window.location.reload();
            }} else alert(r.error || 'Error');
        }}
        </script>'''
        self.respond_html(layout('Reseteos de Contraseña', content, user, 'pwresets'))

    def api_password_reset_approve(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        reset_id = data.get('id')
        accion = data.get('accion', 'aprobar')
        conn = db.get_db()
        req = conn.execute(
            "SELECT * FROM password_reset_requests WHERE id=? AND estado='pendiente'", (reset_id,)).fetchone()
        if not req:
            conn.close()
            self.respond_json({'ok': False, 'error': 'Solicitud no encontrada o ya procesada.'}, 404); return
        if accion == 'rechazar':
            conn.execute("""UPDATE password_reset_requests
                SET estado='rechazada', resolved_at=datetime('now'), resolved_by=? WHERE id=?""",
                (user['id'], reset_id))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'password_reset_rejected', 'user',
                         req['user_id'], ip=self.get_client_ip())
            conn.close()
            self.respond_json({'ok': True})
            return
        # Generate a temporary password
        import secrets as _sec
        nueva_password = 'Cofersa' + _sec.token_hex(3).upper()
        pw_hash, salt = db.hash_password(nueva_password)
        conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                     (pw_hash, salt, req['user_id']))
        conn.execute("""UPDATE password_reset_requests
            SET estado='atendida', resolved_at=datetime('now'), resolved_by=?, nueva_password=?
            WHERE id=?""", (user['id'], nueva_password, reset_id))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'password_reset_approved', 'user',
                     req['user_id'],
                     f'Contraseña reseteada por admin {user["username"]}',
                     ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True, 'nueva_password': nueva_password})

    def api_password_reset_bulk_approve(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        ids = data.get('ids', [])
        if not ids:
            self.respond_json({'ok': False, 'error': 'No se recibieron IDs.'}, 400); return
        import secrets as _sec
        conn = db.get_db()
        results = []
        for reset_id in ids:
            req = conn.execute(
                "SELECT r.*, u.username FROM password_reset_requests r JOIN users u ON r.user_id=u.id WHERE r.id=? AND r.estado='pendiente'",
                (reset_id,)).fetchone()
            if not req:
                continue
            nueva_password = 'Cofersa' + _sec.token_hex(3).upper()
            pw_hash, salt = db.hash_password(nueva_password)
            conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                         (pw_hash, salt, req['user_id']))
            conn.execute("""UPDATE password_reset_requests
                SET estado='atendida', resolved_at=datetime('now'), resolved_by=?, nueva_password=?
                WHERE id=?""", (user['id'], nueva_password, reset_id))
            db.log_audit(user['id'], user['username'], 'password_reset_approved', 'user',
                         req['user_id'],
                         f'Reseteo masivo por {user["username"]}',
                         ip=self.get_client_ip())
            results.append({'username': req['username'], 'nueva_password': nueva_password})
        conn.commit()
        conn.close()
        self.respond_json({'ok': True, 'results': results})

# ==================== SERVER STARTUP ====================
def run_server(host='0.0.0.0', port=8080):
    # Copy seed files if they exist
    uploads_dir = os.path.join(BASE_DIR, 'uploads')
    data_dir = os.path.join(BASE_DIR, 'data')
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(uploads_dir, exist_ok=True)
    
    # Copy seed files from project root if they exist
    for name_pair in [('Reglas.xlsx', 'seed_Reglas.xlsx'), ('Presupuesto.xlsx', 'seed_Presupuesto.xlsx')]:
        src = os.path.join(BASE_DIR, name_pair[0])
        dst = os.path.join(data_dir, name_pair[1])
        if os.path.exists(src) and not os.path.exists(dst):
            shutil.copy2(src, dst)
    
    # Initialize DB and load seeds
    db.init_db()
    preload_seed_data()
    
    print(f"""
╔══════════════════════════════════════════════════════╗
║   COFERSA NE - Sistema Negociación Especial v5.2.1  ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║   Servidor iniciado en:                              ║
║   → http://{host}:{port}                         ║
║   → http://localhost:{port}                      ║
║                                                      ║
║   Admin por defecto:                                 ║
║   → Usuario: abarrios                                ║
║   → Contraseña: Cofersa123!                          ║
║                                                      ║
║   Presione Ctrl+C para detener                       ║
╚══════════════════════════════════════════════════════╝
""")
    
    server = http.server.HTTPServer((host, port), RequestHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
        server.server_close()

if __name__ == '__main__':
    host = '0.0.0.0'
    port = 8080
    
    if len(sys.argv) >= 3:
        host = sys.argv[1]
        port = int(sys.argv[2])
    elif len(sys.argv) >= 2:
        try:
            port = int(sys.argv[1])
        except ValueError:
            host = sys.argv[1]
    
    run_server(host, port)

    # ========== CAMBIAR CONTRASEÑA ==========
    def page_cambiar_password(self, query=None):
        user = self.require_auth()
        if not user:
            return
        q = query or {}
        msg = q.get('msg', '')
        msg_html = f'<div class="alert alert-success">{esc(msg)}</div>' if msg else ''
        content = f'''
        <h1>Cambiar Mi Contraseña</h1>
        {msg_html}
        <div class="card" style="max-width:480px;">
            <div class="form-group">
                <label>Contraseña Actual *</label>
                <input type="password" id="pw_actual" class="form-control" placeholder="Tu contraseña actual">
            </div>
            <div class="form-group">
                <label>Nueva Contraseña * (mínimo 6 caracteres)</label>
                <input type="password" id="pw_nueva" class="form-control" placeholder="Nueva contraseña">
            </div>
            <div class="form-group">
                <label>Confirmar Nueva Contraseña *</label>
                <input type="password" id="pw_confirm" class="form-control" placeholder="Repite la nueva contraseña">
            </div>
            <div id="pwMsg" style="margin-bottom:10px;"></div>
            <div class="actions-bar">
                <button class="btn btn-primary" onclick="cambiarPw()">Guardar Contraseña</button>
                <a href="/" class="btn btn-outline">Cancelar</a>
            </div>
        </div>
        <script>
        async function cambiarPw() {{
            var actual  = document.getElementById('pw_actual').value;
            var nueva   = document.getElementById('pw_nueva').value;
            var confirm = document.getElementById('pw_confirm').value;
            var msg     = document.getElementById('pwMsg');
            if (!actual || !nueva || !confirm) {{
                msg.innerHTML='<div class="alert alert-danger">Todos los campos son obligatorios.</div>'; return;
            }}
            if (nueva.length < 6) {{
                msg.innerHTML='<div class="alert alert-danger">La nueva contraseña debe tener al menos 6 caracteres.</div>'; return;
            }}
            if (nueva !== confirm) {{
                msg.innerHTML='<div class="alert alert-danger">La nueva contraseña y la confirmación no coinciden.</div>'; return;
            }}
            var r = await apiPost('/api/cambiar-password', {{actual:actual, nueva:nueva}});
            if (r.ok) {{
                msg.innerHTML='<div class="alert alert-success">Contraseña actualizada correctamente.</div>';
                document.getElementById('pw_actual').value='';
                document.getElementById('pw_nueva').value='';
                document.getElementById('pw_confirm').value='';
            }} else {{
                msg.innerHTML='<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
            }}
        }}
        </script>'''
        self.respond_html(layout('Mi Contraseña', content, user, 'cambiar_pw'))

    def api_cambiar_password(self):
        user = self.require_auth()
        if not user:
            return
        data   = json.loads(self.read_body())
        actual = data.get('actual', '')
        nueva  = data.get('nueva', '')
        if not actual or not nueva:
            self.respond_json({'ok': False, 'error': 'Faltan campos.'}, 400); return
        if len(nueva) < 6:
            self.respond_json({'ok': False, 'error': 'Mínimo 6 caracteres.'}, 400); return
        conn = db.get_db()
        row  = conn.execute("SELECT * FROM users WHERE id=?", (user['id'],)).fetchone()
        if not row or not db.verify_password(actual, row['password_hash'], row['salt']):
            conn.close()
            self.respond_json({'ok': False, 'error': 'La contraseña actual es incorrecta.'}, 403); return
        pw_hash, salt = db.hash_password(nueva)
        conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                     (pw_hash, salt, user['id']))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'password_changed', 'user', user['id'],
                     'Contraseña cambiada por el propio usuario', ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})

    # ========== SOLICITAR RESET DE CONTRASEÑA (público) ==========
    def page_solicitar_reset(self, query=None):
        q    = query or {}
        msg  = q.get('msg', '')
        msg_html = f'<div class="alert alert-success">{esc(msg)}</div>' if msg else ''
        content = f'''
        <div class="login-container">
            <div class="login-card">
                <h1>COFERSA</h1>
                <div class="subtitle">Solicitar Reseteo de Contraseña</div>
                {msg_html}
                <div class="form-group" style="text-align:left;">
                    <label>Usuario (sin @cofersa.cr)</label>
                    <input type="text" id="rst_user" class="form-control" placeholder="tu.usuario">
                </div>
                <div id="rstMsg" style="margin-bottom:10px;"></div>
                <button class="btn btn-primary w-100" style="padding:12px;font-size:15px;" onclick="solicitarReset()">
                    Enviar Solicitud de Reseteo
                </button>
                <div style="margin-top:14px;">
                    <a href="/login" style="font-size:13px;color:#1a5276;">← Volver al inicio de sesión</a>
                </div>
            </div>
        </div>
        <script>
        async function solicitarReset() {{
            var username = document.getElementById('rst_user').value.trim();
            var msg = document.getElementById('rstMsg');
            if (!username) {{ msg.innerHTML='<div class="alert alert-danger">Ingresa tu usuario.</div>'; return; }}
            var r = await apiPost('/api/solicitar-reset', {{username: username}});
            msg.innerHTML = r.ok
                ? '<div class="alert alert-success">Solicitud registrada. Un administrador la atenderá pronto.</div>'
                : '<div class="alert alert-danger">'+(r.error||'Error')+'</div>';
            if (r.ok) document.getElementById('rst_user').value='';
        }}
        </script>'''
        self.respond_html(layout('Solicitar Reseteo', content))

    def api_solicitar_reset(self):
        data     = json.loads(self.read_body())
        username = data.get('username','').strip().lower().replace('@cofersa.cr','')
        if not username:
            self.respond_json({'ok': False, 'error': 'Usuario requerido.'}); return
        conn = db.get_db()
        row  = conn.execute("SELECT * FROM users WHERE username=? AND status='activo'", (username,)).fetchone()
        if not row:
            conn.close(); self.respond_json({'ok': True}); return   # no revelar si existe
        if row['role'] == 'admin':
            conn.close()
            self.respond_json({'ok': False, 'error': 'Los administradores deben contactar al equipo de TI.'}); return
        existing = conn.execute(
            "SELECT id FROM password_reset_requests WHERE user_id=? AND estado='pendiente'",
            (row['id'],)).fetchone()
        if not existing:
            conn.execute("INSERT INTO password_reset_requests (user_id, estado, ip_address) VALUES (?,?,?)",
                         (row['id'], 'pendiente', self.get_client_ip()))
            conn.commit()
            db.log_audit(None, username, 'password_reset_requested', 'user', row['id'],
                         f'Solicitud de reseteo para {username}', ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True})

    # ========== ADMIN: GESTIÓN DE RESETEOS ==========
    def page_admin_password_resets(self, query=None):
        user = self.require_auth(['admin'])
        if not user:
            return
        conn = db.get_db()
        resets = conn.execute("""
            SELECT r.*, u.username, u.nombre, u.apellido, u.email, u.role,
                   ra.username as resolved_by_name
            FROM password_reset_requests r
            JOIN users u ON r.user_id=u.id
            LEFT JOIN users ra ON r.resolved_by=ra.id
            ORDER BY r.requested_at DESC LIMIT 200
        """).fetchall()
        conn.close()

        rows = ''
        pendientes = 0
        for r in resets:
            _ecls = {'pendiente':'badge-pending','atendida':'badge-approved','rechazada':'badge-rejected'}.get(r['estado'],'badge-draft')
            btn = ''
            if r['estado'] == 'pendiente':
                pendientes += 1
                rid = r['id']
                btn = (f'<button class="btn btn-success btn-sm" onclick="aprobarReset({rid})">✓ Aprobar</button> '
                       f'<button class="btn btn-danger btn-sm" onclick="rechazarReset({rid})">✕ Rechazar</button>')
            res_info = f"{esc(r['resolved_by_name'] or '')} {esc(r['resolved_at'][:16] if r['resolved_at'] else '')}"
            rows += f'''<tr>
                <td><input type="checkbox" class="rst-chk" value="{r['id']}" {'disabled' if r['estado']!='pendiente' else ''}></td>
                <td>{esc(r['username'])}</td><td>{esc(r['nombre'])} {esc(r['apellido'])}</td>
                <td>{esc(r['email'])}</td><td>{esc(r['role'])}</td>
                <td><span class="badge {_ecls}">{esc(r['estado'])}</span></td>
                <td>{esc(r['requested_at'][:16])}</td><td class="font-sm">{res_info}</td>
                <td>{btn}</td>
            </tr>'''

        content = f'''
        <div class="page-header">
            <h1>Reseteos de Contraseña</h1>
            <span class="badge badge-pending">{pendientes} pendientes</span>
        </div>
        <div class="card">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px;">
                <button class="btn btn-success btn-sm" onclick="bulkApprove()">✓ Aprobar Seleccionados</button>
                <button class="btn btn-outline btn-sm" onclick="selectAll()">Seleccionar pendientes</button>
            </div>
            <div class="table-responsive">
            <table>
                <thead><tr>
                    <th style="width:30px;"></th>
                    <th>Usuario</th><th>Nombre</th><th>Email</th><th>Rol</th>
                    <th>Estado</th><th>Solicitado</th><th>Resuelto por</th><th>Acciones</th>
                </tr></thead>
                <tbody>{rows if rows else '<tr><td colspan="9" class="text-center color-muted">Sin solicitudes</td></tr>'}</tbody>
            </table>
            </div>
        </div>
        <script>
        function selectAll() {{
            document.querySelectorAll('.rst-chk:not(:disabled)').forEach(function(c){{ c.checked=true; }});
        }}
        async function aprobarReset(id) {{
            var r = await apiPost('/api/password-reset/approve', {{id:id}});
            if (r.ok) {{ alert('Contraseña reseteada a: ' + r.nueva_password + '\\nComuníquela al usuario de forma segura.'); window.location.reload(); }}
            else alert(r.error||'Error');
        }}
        async function rechazarReset(id) {{
            if (!confirm('¿Rechazar esta solicitud?')) return;
            var r = await apiPost('/api/password-reset/approve', {{id:id, accion:'rechazar'}});
            if (r.ok) window.location.reload();
            else alert(r.error||'Error');
        }}
        async function bulkApprove() {{
            var ids=[];
            document.querySelectorAll('.rst-chk:checked').forEach(function(c){{ ids.push(parseInt(c.value)); }});
            if (!ids.length) {{ alert('Selecciona al menos una solicitud.'); return; }}
            if (!confirm('¿Aprobar '+ids.length+' solicitud(es)?')) return;
            var r = await apiPost('/api/password-reset/bulk-approve', {{ids:ids}});
            if (r.ok) {{
                var msg = r.results.map(function(x){{ return x.username+': '+x.nueva_password; }}).join('\\n');
                alert('Contraseñas reseteadas:\\n'+msg+'\\n\\nComuníquelas a los usuarios de forma segura.');
                window.location.reload();
            }} else alert(r.error||'Error');
        }}
        </script>'''
        self.respond_html(layout('Reseteos PW', content, user, 'pwresets'))

    def api_password_reset_approve(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data   = json.loads(self.read_body())
        req_id = data.get('id')
        accion = data.get('accion', 'aprobar')
        conn   = db.get_db()
        req    = conn.execute(
            "SELECT * FROM password_reset_requests WHERE id=? AND estado='pendiente'", (req_id,)).fetchone()
        if not req:
            conn.close(); self.respond_json({'ok': False, 'error': 'Solicitud no encontrada o ya procesada.'}, 404); return
        if accion == 'rechazar':
            conn.execute("UPDATE password_reset_requests SET estado='rechazada', resolved_at=datetime('now'), resolved_by=? WHERE id=?",
                         (user['id'], req_id))
            conn.commit()
            db.log_audit(user['id'], user['username'], 'password_reset_rejected', 'user', req['user_id'], ip=self.get_client_ip())
            conn.close(); self.respond_json({'ok': True}); return
        import secrets as _sec
        nueva_pw = 'Cofersa' + _sec.token_hex(3).upper()
        pw_hash, salt = db.hash_password(nueva_pw)
        conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                     (pw_hash, salt, req['user_id']))
        conn.execute("UPDATE password_reset_requests SET estado='atendida', resolved_at=datetime('now'), resolved_by=?, nueva_password=? WHERE id=?",
                     (user['id'], nueva_pw, req_id))
        conn.commit()
        db.log_audit(user['id'], user['username'], 'password_reset_approved', 'user', req['user_id'],
                     f'Reseteo aprobado por {user["username"]}', ip=self.get_client_ip())
        conn.close()
        self.respond_json({'ok': True, 'nueva_password': nueva_pw})

    def api_password_reset_bulk_approve(self):
        user = self.require_auth(['admin'])
        if not user:
            return
        data = json.loads(self.read_body())
        ids  = data.get('ids', [])
        if not ids:
            self.respond_json({'ok': False, 'error': 'No se recibieron IDs.'}); return
        import secrets as _sec
        conn    = db.get_db()
        results = []
        for rid in ids:
            req = conn.execute(
                "SELECT r.*, u.username FROM password_reset_requests r JOIN users u ON r.user_id=u.id WHERE r.id=? AND r.estado='pendiente'",
                (rid,)).fetchone()
            if not req: continue
            nueva_pw = 'Cofersa' + _sec.token_hex(3).upper()
            pw_hash, salt = db.hash_password(nueva_pw)
            conn.execute("UPDATE users SET password_hash=?, salt=?, updated_at=datetime('now') WHERE id=?",
                         (pw_hash, salt, req['user_id']))
            conn.execute("UPDATE password_reset_requests SET estado='atendida', resolved_at=datetime('now'), resolved_by=?, nueva_password=? WHERE id=?",
                         (user['id'], nueva_pw, rid))
            db.log_audit(user['id'], user['username'], 'password_reset_approved', 'user', req['user_id'],
                         f'Reseteo masivo por {user["username"]}', ip=self.get_client_ip())
            results.append({'username': req['username'], 'nueva_password': nueva_pw})
        conn.commit(); conn.close()
        self.respond_json({'ok': True, 'results': results})

