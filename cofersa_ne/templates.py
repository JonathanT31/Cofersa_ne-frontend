"""
COFERSA NE - Template Engine
Server-side HTML rendering using only Python stdlib.
"""
import html as html_mod

APP_VERSION = "v5.2.1"

def esc(text):
    """HTML escape."""
    return html_mod.escape(str(text)) if text else ''

def format_crc(value):
    """Format number as CRC currency."""
    try:
        v = float(value)
        # Format with thousands separator and 2 decimals
        if v < 0:
            return f"-₡{abs(v):,.2f}"
        return f"₡{v:,.2f}"
    except (ValueError, TypeError):
        return "₡0.00"

def format_pct(value):
    try:
        return f"{float(value):.2f}%"
    except:
        return "0.00%"

def layout(title, content, user=None, active=''):
    """Main layout wrapper."""
    nav = ''
    # Inject infocompras.js on every authenticated page
    infoc_script_tag = '<script src="/static/infocompras.js"></script>' if user else ''
    if user:
        role = user.get('role', '')
        nav_items = []

        # ── Todos los roles ───────────────────────────────────────────────────
        nav_items.append(('/', 'Inicio', 'inicio'))
        nav_items.append(('/solicitud/nueva', 'Nueva Solicitud', 'nueva'))
        nav_items.append(('/mis-solicitudes', 'Mis Solicitudes', 'mis'))
        # Bandeja y Dashboard: ocultos para vendedor
        if role != 'vendedor':
            nav_items.append(('/bandeja', 'Bandeja Aprobación', 'bandeja'))
            nav_items.append(('/dashboard', 'Dashboard', 'dashboard'))
        nav_items.append(('/exportar', 'Exportar', 'exportar'))

        # Catálogos — solo compras y admin
        if role in ('admin', 'compras'):
            nav_items.append(('/admin/reglas', 'Reglas', 'reglas'))
            nav_items.append(('/admin/presupuesto', 'Presupuesto', 'presupuesto'))

        # ── Admin exclusivo ───────────────────────────────────────────────────
        if role == 'admin':
            nav_items.append(('/admin/usuarios', 'Usuarios', 'usuarios'))
            nav_items.append(('/admin/password-resets', 'Reseteos PW', 'pwresets'))
            nav_items.append(('/admin/solicitudes', 'Todas Solicitudes', 'todas'))
            nav_items.append(('/admin/auditoria', 'Auditoría', 'auditoria'))
            nav_items.append(('/admin/config', 'Configuración', 'config'))

        # ── Contraseña — todos ────────────────────────────────────────────────
        nav_items.append(('/cambiar-password', 'Mi Contraseña', 'cambiar_pw'))
        
        links = ''
        for href, label, key in nav_items:
            cls = ' class="active"' if key == active else ''
            links += f'<a href="{href}"{cls}>{esc(label)}</a>'
        
    
        role_labels = {'vendedor':'Vendedor','supervisor':'Supervisor',
                       'gerente_ventas':'Gte. Ventas','compras':'Compras','admin':'Admin'}
        
        nav = f'''<nav class="topnav" id="topnav">
            <div class="nav-top-row">
                <div class="nav-brand">COFERSA NE <span style="font-size:11px;font-weight:400;opacity:0.7;margin-left:4px;">{APP_VERSION}</span></div>
                <div class="nav-user">
                    <span class="role-badge">{role_labels.get(role, role)}</span>
                    <span class="nav-username">{esc(user.get('nombre',''))} {esc(user.get('apellido',''))}</span>
                    <a href="#" onclick="if(window.INFOC)window.INFOC.clearCache();window.location='/logout';" class="btn-logout">Salir</a>
                </div>
                <button class="nav-hamburger" onclick="toggleNav()" aria-label="Menu">&#9776;</button>
            </div>
            <div class="nav-links" id="navLinks">{links}</div>
        </nav>'''
    
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{esc(title)} - COFERSA NE {APP_VERSION}</title>
    <style>{CSS}</style>
    {infoc_script_tag}
</head>
<body>
    {nav}
    <div class="container">
        {content}
        <div style="margin-top:32px;padding:10px 0;border-top:1px solid #e0e4ea;text-align:right;">
            <span style="font-size:11px;color:#aaa;">COFERSA NE · {APP_VERSION}</span>
        </div>
    </div>
    <script>{JS_COMMON}</script>
    <div style="position:fixed;bottom:12px;right:14px;z-index:999;pointer-events:none;">
        <span style="background:rgba(26,82,118,0.85);color:white;padding:3px 10px;border-radius:10px;
                     font-size:10px;font-weight:600;letter-spacing:0.5px;backdrop-filter:blur(4px);">
            COFERSA NE {APP_VERSION}
        </span>
    </div>
</body>
</html>'''

# ==================== CSS ====================
CSS = '''
:root {
    --primary: #1a5276;
    --primary-light: #2980b9;
    --success: #27ae60;
    --danger: #e74c3c;
    --warning: #f39c12;
    --info: #3498db;
    --gray: #95a5a6;
    --light: #ecf0f1;
    --dark: #2c3e50;
    --white: #fff;
    --shadow: 0 2px 8px rgba(0,0,0,0.1);
    --radius: 8px;
    --nav-h: 56px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f4f6f9; color: #333; font-size: 14px; line-height: 1.5; overflow-x: hidden; }
.container { max-width: 1400px; margin: 0 auto; padding: 16px; width: 100%; }
.topnav { background: var(--primary); color: white; box-shadow: var(--shadow); position: sticky; top: 0; z-index: 200; width: 100%; }
.nav-top-row { display: flex; align-items: center; height: var(--nav-h); padding: 0 16px; gap: 10px; }
.nav-brand { font-weight: 700; font-size: 18px; white-space: nowrap; flex-shrink: 0; }
.nav-user { display: flex; align-items: center; gap: 8px; margin-left: auto; font-size: 13px; flex-shrink: 0; }
.nav-username { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.role-badge { background: var(--warning); color: var(--dark); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.btn-logout { color: rgba(255,255,255,0.85); text-decoration: none; padding: 5px 10px; border: 1px solid rgba(255,255,255,0.4); border-radius: 4px; font-size: 12px; white-space: nowrap; transition: background 0.2s; }
.btn-logout:hover { background: rgba(255,255,255,0.2); color: white; }
.nav-hamburger { display: none; background: none; border: none; color: white; font-size: 22px; cursor: pointer; padding: 4px 8px; line-height: 1; flex-shrink: 0; order: -1; -webkit-tap-highlight-color: transparent; }
.nav-links { display: flex; gap: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding: 0 8px; background: rgba(0,0,0,0.15); }
.nav-links::-webkit-scrollbar { display: none; }
.nav-links a { color: rgba(255,255,255,0.8); text-decoration: none; padding: 10px 12px; font-size: 13px; white-space: nowrap; border-bottom: 3px solid transparent; transition: all 0.2s; display: block; }
.nav-links a:hover, .nav-links a.active { color: white; border-bottom-color: var(--warning); background: rgba(255,255,255,0.08); }
h1 { font-size: clamp(18px, 4vw, 24px); margin-bottom: 16px; color: var(--dark); font-weight: 700; }
h2 { font-size: clamp(16px, 3vw, 20px); margin-bottom: 12px; color: var(--dark); }
h3 { font-size: 15px; margin-bottom: 8px; font-weight: 600; }
.card { background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow); padding: 16px; margin-bottom: 16px; }
.card-header { font-size: 15px; font-weight: 600; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid var(--light); }
.btn { display: inline-flex; align-items: center; justify-content: center; padding: 9px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; text-decoration: none; text-align: center; transition: all 0.2s; white-space: nowrap; min-height: 40px; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.btn-primary { background: var(--primary); color: white; }
.btn-primary:hover { background: var(--primary-light); }
.btn-success { background: var(--success); color: white; }
.btn-success:hover { background: #1e8449; }
.btn-danger { background: var(--danger); color: white; }
.btn-danger:hover { background: #c0392b; }
.btn-warning { background: var(--warning); color: white; }
.btn-warning:hover { background: #d68910; }
.btn-sm { padding: 6px 12px; font-size: 12px; min-height: 34px; }
.btn-outline { background: transparent; border: 1px solid var(--primary); color: var(--primary); }
.btn-outline:hover { background: var(--primary); color: white; }
.form-group { margin-bottom: 14px; }
.form-group label { display: block; font-weight: 500; margin-bottom: 5px; font-size: 13px; color: #555; }
.form-control { width: 100%; padding: 9px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; transition: border-color 0.2s; background: white; -webkit-appearance: none; min-height: 40px; }
.form-control:focus { outline: none; border-color: var(--primary-light); box-shadow: 0 0 0 3px rgba(41,128,185,0.12); }
select.form-control { appearance: auto; -webkit-appearance: auto; }
textarea.form-control { resize: vertical; min-height: 80px; }
.form-error { color: var(--danger); font-size: 12px; margin-top: 3px; }
.form-inline { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.form-inline .form-group { margin-bottom: 0; }
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.table-responsive { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: var(--radius); }
.search-mode-tabs { display:flex;gap:0;border-bottom:2px solid #eee;margin-bottom:14px; }
table { width: 100%; border-collapse: collapse; min-width: 500px; }
th, td { padding: 9px 10px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; white-space: nowrap; }
th { background: #f8f9fa; font-weight: 600; color: #555; }
tr:hover td { background: #f5f8fc; }
.text-right { text-align: right; }
.text-center { text-align: center; }
td.wrap, th.wrap { white-space: normal; }
.badge { display: inline-block; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.badge-pending  { background: #ffeaa7; color: #d68910; }
.badge-approved { background: #d5f5e3; color: #1e8449; }
.badge-rejected { background: #fadbd8; color: #c0392b; }
.badge-escalated{ background: #d6eaf8; color: #2471a3; }
.badge-draft    { background: #eee;    color: #666; }
.badge-review   { background: #e8daef; color: #7d3c98; }
.badge-cancelled{ background: #f2f3f4; color: #909497; }
.alert { padding: 12px 16px; border-radius: 6px; margin-bottom: 14px; font-size: 13px; line-height: 1.5; }
.alert-success  { background: #d5f5e3; color: #1e8449; border: 1px solid #a9dfbf; }
.alert-danger   { background: #fadbd8; color: #c0392b; border: 1px solid #f5b7b1; }
.alert-warning  { background: #fef9e7; color: #9a7d0a; border: 1px solid #f9e79f; }
.alert-info     { background: #d6eaf8; color: #2471a3; border: 1px solid #aed6f1; }
.kpi-card { background: white; border-radius: var(--radius); padding: 16px; box-shadow: var(--shadow); text-align: center; }
.kpi-value { font-size: clamp(16px, 3.5vw, 26px); font-weight: 700; color: var(--primary); line-height: 1.2; word-break: break-word; }
.kpi-label { font-size: 12px; color: #888; margin-top: 4px; }
.kpi-sub   { font-size: 11px; color: #aaa; }
.sku-row { background: #fafbfc; border: 1px solid #e0e4ea; border-radius: var(--radius); padding: 12px; margin-bottom: 10px; }
.sku-row .form-group { margin-bottom: 8px; }
.sku-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px; }
.sku-fields { display: grid; grid-template-columns: 130px 1fr 80px 120px 120px 90px 120px 120px; gap: 8px; align-items: end; }
.sku-marca-row { display: grid; grid-template-columns: 180px 1fr; gap: 8px; margin-bottom: 8px; }
.ranges-info { background: #eaf2f8; padding: 8px 10px; border-radius: 4px; font-size: 11px; line-height: 1.6; color: #2c3e50; border-left: 3px solid var(--primary); }
.progress-bar { height: 18px; background: #eee; border-radius: 9px; overflow: hidden; }
.progress-fill { height: 100%; border-radius: 9px; transition: width 0.3s; }
.login-container { max-width: 420px; margin: 60px auto; padding: 0 16px; }
.login-card { background: white; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); padding: 36px 32px; text-align: center; }
.login-card h1 { color: var(--primary); margin-bottom: 4px; font-size: 26px; }
.login-card .subtitle { color: #888; margin-bottom: 28px; font-size: 14px; }
.filters-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; padding: 14px; background: white; border-radius: var(--radius); box-shadow: var(--shadow); }
.filters-bar .form-group { margin-bottom: 0; min-width: 140px; flex: 1; }
.tab-group { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 0; border-bottom: 2px solid #eee; }
.tab-btn { padding: 9px 18px; background: none; border: none; cursor: pointer; font-size: 14px; color: #888; border-bottom: 2px solid transparent; margin-bottom: -2px; white-space: nowrap; }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
.infoc-tab { padding:8px 18px;background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;font-size:13px;color:#888;transition:color .2s; }
.infoc-tab.active { color:var(--primary);border-bottom-color:var(--primary);font-weight:600; }
.infoc-tab:hover { color:var(--primary); }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000; display: none; align-items: center; justify-content: center; padding: 16px; overflow-y: auto; }
.modal-overlay.show { display: flex; }
.modal { background: white; border-radius: 12px; padding: 24px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; position: relative; margin: auto; }
.actions-bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 14px; }
.page-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
.detail-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.detail-item label { font-size: 11px; color: #888; text-transform: uppercase; display: block; margin-bottom: 2px; }
.detail-item span { font-size: 14px; font-weight: 500; color: var(--dark); }
.overflow-x-auto { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.flex { display: flex; } .flex-wrap { flex-wrap: wrap; } .align-center { align-items: center; } .justify-between { justify-content: space-between; }
.mt-10 { margin-top: 10px; } .mt-16 { margin-top: 16px; } .mb-16 { margin-bottom: 16px; }
.font-sm { font-size: 12px; } .color-muted { color: #888; } .w-100 { width: 100%; }
@media (max-width: 900px) {
    .grid-4 { grid-template-columns: repeat(2, 1fr); }
    .grid-3 { grid-template-columns: repeat(2, 1fr); }
    .sku-fields { grid-template-columns: repeat(4, 1fr); }
    .sku-marca-row { grid-template-columns: 1fr; }
    .sku-marca-row { grid-template-columns: 1fr; }
    .detail-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
    .container { padding: 10px; }
    .nav-hamburger { display: block; }
    .nav-links { display: none; flex-direction: column; padding: 0; border-top: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.2); }
    .nav-links.open { display: flex; }
    .nav-links a { padding: 13px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); border-left: none; font-size: 15px; min-height: 48px; }
    .nav-links a.active { border-left: 3px solid var(--warning); background: rgba(255,255,255,0.1); }
    .nav-user { font-size: 11px; }
    .nav-username { display: none; }
    .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
    .card { padding: 12px; }
    .actions-bar { flex-direction: column; }
    .actions-bar .btn { width: 100%; }
    .sku-fields { grid-template-columns: 1fr 1fr; }
    .page-header > div { flex-direction: column; align-items: stretch; width: 100%; }
    .page-header > div > div { width: 100%; }
    .page-header > div > div button, .page-header > div > div select { width: 100%; }
    .sku-marca-row { grid-template-columns: 1fr; }
    .filters-bar { flex-direction: column; }
    .filters-bar .form-group { min-width: 100%; }
    .table-responsive { position: relative; }
    table { min-width: 480px; }
    th, td { padding: 8px 7px; font-size: 12px; }
    .login-container { margin: 30px auto; }
    .login-card { padding: 24px 18px; }
    .page-header { flex-direction: column; align-items: flex-start; }
    .detail-grid { grid-template-columns: 1fr; }
    .modal { padding: 18px 14px; }
    [id^="dd_"] { position: fixed !important; left: 10px !important; right: 10px !important; width: auto !important; top: auto !important; max-height: 60vh !important; }
    h1 { font-size: 18px; }
}
@media (max-width: 400px) {
    .role-badge { display: none; }
    .btn-logout { padding: 4px 8px; font-size: 11px; }
}
'''

JS_COMMON = '''
function toggleNav(){var n=document.getElementById('navLinks');n.classList.toggle('open');}
document.addEventListener('click',function(e){var n=document.getElementById('navLinks');if(n&&n.classList.contains('open')&&!e.target.closest('.topnav')){n.classList.remove('open');}});
function formatCRC(n){
    if(isNaN(n))return "₡0.00";
    return "₡"+Number(n).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function showAlert(msg,type){
    var d=document.createElement('div');
    d.className='alert alert-'+type;
    d.textContent=msg;
    var c=document.querySelector('.container');
    if(c)c.insertBefore(d,c.firstChild);
    setTimeout(function(){d.remove();},5000);
}
function confirmAction(msg){return confirm(msg);}

async function apiPost(url, data){
    try{
        const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
        return await r.json();
    }catch(e){return {ok:false,error:e.message};}
}
async function apiGet(url){
    try{
        const r=await fetch(url);
        return await r.json();
    }catch(e){return {ok:false,error:e.message};}
}
'''

# ==================== Page Templates ====================

def page_login(error=''):
    err_html = f'<div class="alert alert-danger">{esc(error)}</div>' if error else ''
    content = f'''
    <div class="login-container">
        <div class="login-card">
            <h1>COFERSA</h1>
            <div class="subtitle">Sistema de Negociación Especial</div>
            {err_html}
            <form method="POST" action="/login">
                <div class="form-group">
                    <label>Usuario</label>
                    <input type="text" name="username" class="form-control" placeholder="usuario (sin @cofersa.cr)" required autofocus>
                </div>
                <div class="form-group">
                    <label>Contraseña</label>
                    <input type="password" name="password" class="form-control" required>
                </div>
                <button type="submit" class="btn btn-primary w-100" style="padding:12px;font-size:16px;margin-top:10px;">Ingresar</button>
            </form>
            <div style="margin-top:16px;border-top:1px solid #eee;padding-top:14px;">
                <a href="/solicitar-reset" style="font-size:13px;color:#888;text-decoration:none;">
                    ¿Olvidaste tu contraseña? <span style="color:#1a5276;font-weight:600;">Solicitar reseteo</span>
                </a>
            </div>
        </div>
    </div>'''
    return layout('Ingresar', content)

def estado_badge(estado):
    cls_map = {
        'borrador': 'badge-draft', 'pendiente': 'badge-pending',
        'en_revision': 'badge-review', 'escalada': 'badge-escalated',
        'aprobada': 'badge-approved', 'parcialmente_aprobada': 'badge-escalated',
        'rechazada': 'badge-rejected', 'cancelada': 'badge-cancelled',
    }
    labels = {
        'borrador': 'Borrador', 'pendiente': 'Pendiente',
        'en_revision': 'En Revisión', 'escalada': 'Escalada',
        'aprobada': 'Aprobada', 'parcialmente_aprobada': 'Parcial',
        'rechazada': 'Rechazada', 'cancelada': 'Cancelada',
    }
    cls = cls_map.get(estado, 'badge-draft')
    lbl = labels.get(estado, estado)
    return f'<span class="badge {cls}">{lbl}</span>'

def page_home(user, stats):
    role = user.get('role', '')
    cards = ''
    
    if role == 'vendedor':
        cards = f'''
        <div class="grid-3">
            <div class="kpi-card"><div class="kpi-value">{stats.get('mis_pendientes',0)}</div><div class="kpi-label">Mis Pendientes</div></div>
            <div class="kpi-card"><div class="kpi-value" style="color:var(--success);">{stats.get('mis_aprobadas',0)}</div><div class="kpi-label">Mis Aprobadas (mes)</div></div>
            <div class="kpi-card"><div class="kpi-value">{format_crc(stats.get('mi_gasto_mes',0))}</div><div class="kpi-label">Mi Gasto Desc. (mes)</div></div>
        </div>
        <div class="grid-2" style="margin-top:16px;">
            <div class="card"><a href="/solicitud/nueva" class="btn btn-primary w-100" style="font-size:15px;padding:12px;justify-content:center;">+ Nueva Solicitud</a></div>
            <div class="card"><a href="/mis-solicitudes" class="btn btn-outline w-100" style="font-size:15px;padding:12px;justify-content:center;">📋 Mis Solicitudes</a></div>
        </div>'''
    elif role in ('supervisor', 'gerente_ventas', 'compras'):
        cards = f'''
        <div class="grid-4">
            <div class="kpi-card"><div class="kpi-value" style="color:var(--warning);">{stats.get('por_aprobar',0)}</div><div class="kpi-label">Por Aprobar</div></div>
            <div class="kpi-card"><div class="kpi-value" style="color:var(--success);">{stats.get('aprobadas_mes',0)}</div><div class="kpi-label">Aprobadas (mes)</div></div>
            <div class="kpi-card"><div class="kpi-value">{format_crc(stats.get('gasto_mes',0))}</div><div class="kpi-label">Gasto Desc. (mes)</div></div>
            <div class="kpi-card"><div class="kpi-value">{format_pct(stats.get('consumo_ppto',0))}</div><div class="kpi-label">Consumo Ppto.</div></div>
        </div>
        <div class="grid-2" style="margin-top:16px;">
            <div class="card"><a href="/bandeja" class="btn btn-primary w-100" style="font-size:15px;padding:12px;justify-content:center;">Bandeja de Aprobación</a></div>
            <div class="card"><a href="/dashboard" class="btn btn-outline w-100" style="font-size:15px;padding:12px;justify-content:center;">📊 Dashboard</a></div>
        </div>'''
    else:  # admin
        cards = f'''
        <div class="grid-4">
            <div class="kpi-card"><div class="kpi-value">{stats.get('total_pendientes',0)}</div><div class="kpi-label">Pendientes Totales</div></div>
            <div class="kpi-card"><div class="kpi-value">{stats.get('total_mes',0)}</div><div class="kpi-label">Solicitudes (mes)</div></div>
            <div class="kpi-card"><div class="kpi-value">{format_crc(stats.get('gasto_mes',0))}</div><div class="kpi-label">Gasto Desc. (mes)</div></div>
            <div class="kpi-card"><div class="kpi-value">{stats.get('usuarios_activos',0)}</div><div class="kpi-label">Usuarios Activos</div></div>
        </div>
        <div class="grid-2" style="margin-top:20px;">
            <div class="card"><a href="/admin/solicitudes" class="btn btn-primary">Ver Todas las Solicitudes</a></div>
            <div class="card"><a href="/dashboard" class="btn btn-primary">Ver Dashboard</a></div>
        </div>'''
    
    content = f'''
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
        <h1 style="margin:0;">Bienvenido, {esc(user.get("nombre",""))} {esc(user.get("apellido",""))}</h1>
        <span style="background:#1a5276;color:white;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;">{APP_VERSION}</span>
    </div>
    {cards}'''
    return layout('Inicio', content, user, 'inicio')
