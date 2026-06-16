import os
import json
import urllib.request
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, HTTPException, Body, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv

# Import services
from services.email_service import send_email, build_solicitud_email
from utils.xlsx_reader import import_reglas_from_xlsx, import_presupuesto_from_xlsx

load_dotenv()

def send_n8n_webhook(event_type: str, solicitud: Dict[str, Any], skus: List[Dict[str, Any]], extra_info: Dict[str, Any] = None) -> bool:
    """Send payload to n8n webhook on request creation or approval."""
    url = os.getenv("N8N_EMAIL_WEBHOOK_URL", "https://sandboxn8n.mayoreo.biz/webhook-test/28efcada-13fd-4552-abe2-7aace29324b6")
    payload = {
        "event": event_type,  # "creada" o "aprobada"
        "solicitud": solicitud,
        "skus": skus,
        "extra_info": extra_info or {},
        "timestamp": datetime.now().isoformat()
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read().decode('utf-8')
            print(f"n8n webhook success: {res_body}")
            return True
    except Exception as e:
        print(f"Error calling n8n webhook: {e}")
        return False



# --- CONFIGURACIÓN GLOBAL ---
app = FastAPI(title="COFERSA NE API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_PUBLISHABLE_KEY")
supabase: Client = create_client(
    SUPABASE_URL, 
    SUPABASE_KEY, 
    options=ClientOptions(schema="negociaciones_especiales")
)

SMTP_CONFIG = {
    "host": os.getenv("SMTP_HOST", "smtp.gmail.com"),
    "port": os.getenv("SMTP_PORT", "587"),
    "user": os.getenv("SMTP_USER", ""),
    "password": os.getenv("SMTP_PASS", ""),
    "from": os.getenv("SMTP_USER", "")
}
BASE_URL = os.getenv("VITE_BASE_URL", "http://localhost:5173")
COMPRAS_EMAIL = os.getenv("COMPRAS_EMAIL", "compras@cofersa.cr")


# --- FUNCIONES DE AYUDA (BUSINESS LOGIC) ---

def add_business_hours(start_dt, hours):
    """Calcula el SLA basándose en el horario de Cofersa (L-V 07:00-16:30)."""
    WORK_START = 7    # 07:00
    WORK_END   = 16   # 16:30
    WORK_END_MINS = 30

    remaining = hours
    current = start_dt

    def next_business_start(dt):
        while dt.weekday() >= 5:  # Sábado o Domingo
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0) + timedelta(days=1)
        if dt.hour < WORK_START:
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
        elif dt.hour > WORK_END or (dt.hour == WORK_END and dt.minute >= WORK_END_MINS):
            dt = dt + timedelta(days=1)
            dt = dt.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
            while dt.weekday() >= 5:
                dt = dt + timedelta(days=1)
        return dt

    current = next_business_start(current)
    while remaining > 0:
        end_of_day = current.replace(hour=WORK_END, minute=WORK_END_MINS, second=0, microsecond=0)
        mins_left_today = (end_of_day - current).total_seconds() / 3600
        if remaining <= mins_left_today:
            current = current + timedelta(hours=remaining)
            remaining = 0
        else:
            remaining -= mins_left_today
            current = current + timedelta(days=1)
            current = current.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
            while current.weekday() >= 5:
                current = current + timedelta(days=1)
    return current

async def log_audit(user_id: str, username: str, action: str, entity_type: str = None, entity_id: int = None, details: str = None):
    """Registra una acción en la tabla audit_log."""
    try:
        supabase.table("audit_log").insert({
            "user_id": user_id,
            "username": username,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.now().isoformat()
        }).execute()
    except Exception as e:
        print(f"Audit Log Error: {e}")

async def generate_folio():
    """Genera el folio oficial NE-YYYYMM-XXXXXX."""
    now = datetime.now()
    prefix = f"NE-{now.strftime('%Y%m')}-"
    try:
        res = supabase.table("solicitudes").select("folio").like("folio", f"{prefix}%").order("folio", desc=True).limit(1).execute()
        new_num = 1
        if res.data:
            last_folio = res.data[0]["folio"]
            new_num = int(last_folio.split("-")[-1]) + 1
        return f"{prefix}{new_num:06d}"
    except:
        return f"{prefix}000001"

# --- RUTAS DE LA API ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "COFERSA NE API v2.0 (Migration Logic Enabled)"}

@app.get("/api/dashboard/stats")
async def get_stats(user_id: str, role: str):
    try:
        query = supabase.table("solicitudes").select("id, estado")
        if role == 'vendedor':
            query = query.eq("vendedor_id", user_id)
        elif role == 'supervisor':
            query = query.eq("aprobador_actual_id", user_id)
        
        result = query.execute()
        data = result.data
        return {
            "total_solicitudes": len(data),
            "aprobadas": len([s for s in data if s['estado'] == 'aprobada']),
            "rechazadas": len([s for s in data if s['estado'] == 'rechazada']),
            "pendientes": len([s for s in data if s['estado'] in ('pendiente', 'en_revision', 'escalada')]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/solicitudes/crear")
async def crear_solicitud(data: Dict[str, Any]):
    vendedor_id = data.get("vendedor_id")
    skus = data.get("skus", [])
    
    # 1. Datos base
    user_res = supabase.table("profiles").select("*").eq("id", vendedor_id).single().execute()
    user = user_res.data
    reglas_res = supabase.table("reglas").select("*").execute()
    reglas = {r['marca']: r for r in reglas_res.data}

    # 2. Ruteo de 3 niveles (Lógica oficial)
    aprobador_nivel = "vendedor"
    max_pcts = {}
    for sku in skus:
        m, p = sku.get("marca"), float(sku.get("porcentaje_descuento_sol") or 0)
        max_pcts[m] = max(p, max_pcts.get(m, 0))
            
    for marca, pct in max_pcts.items():
        regla = reglas.get(marca)
        if regla:
            lv = float(regla.get('limite_vendedor') or regla.get('limite_supervisor') or 0)
            ls = float(regla.get('limite_supervisor') or 0)
            if pct > ls: aprobador_nivel = "compras"; break
            elif pct > lv: aprobador_nivel = "supervisor"

    # 3. Estado y Aprobador
    estado = "pendiente"
    aprobador_id = user.get("supervisor_id") if aprobador_nivel == "supervisor" else None
    if aprobador_nivel == "vendedor": 
        estado = "aprobada" # Auto-aprobación si está bajo límite vendedor
    
    folio = await generate_folio()
    monto_total = sum(float(s.get("monto_descuento") or 0) for s in skus)
    sla = add_business_hours(datetime.now(), 48)

    # 4. Insertar Cabecera
    sol_res = supabase.table("solicitudes").insert({
        "folio": folio,
        "cliente_codigo": data.get("cliente_codigo"),
        "cliente_nombre": data.get("cliente_nombre"),
        "numero_pedido": data.get("numero_pedido"),
        "justificacion": data.get("justificacion"),
        "vendedor_id": vendedor_id,
        "estado": estado,
        "monto_total_descuento": monto_total,
        "aprobador_nivel": aprobador_nivel,
        "aprobador_actual_id": aprobador_id,
        "sla_deadline": sla.isoformat(),
        "created_at": datetime.now().isoformat()
    }).execute()
    solicitud = sol_res.data[0]

    # Auditoría
    await log_audit(vendedor_id, user.get("full_name", "Vendedor"), "crear_solicitud", "solicitud", solicitud["id"], f"Folio: {folio}")

    # 5. Insertar SKUs
    for sku in skus:
        pb, pd = float(sku.get("precio_base") or 0), float(sku.get("porcentaje_descuento_sol") or 0)
        supabase.table("solicitud_skus").insert({
            "solicitud_id": solicitud["id"],
            "marca": sku.get("marca"),
            "codigo_sku": sku.get("codigo_sku"),
            "descripcion": sku.get("descripcion"),
            "cantidad": sku.get("cantidad"),
            "precio_base": pb,
            "porcentaje_descuento_sol": pd,
            "precio_solicitado": pb * (1 - (pd / 100)),
            "monto_descuento": sku.get("monto_descuento"),
            "bdf": sku.get("bdf")
        }).execute()

    # Call n8n webhook on creation — include recipient email so n8n knows where to send
    # Determine who receives the email notification
    aprobador_info = {}
    email_destinatario = None

    if aprobador_nivel == "supervisor" and aprobador_id:
        try:
            sup_res = supabase.table("profiles").select("*").eq("id", aprobador_id).single().execute()
            aprobador_info = sup_res.data or {}
            email_destinatario = aprobador_info.get("email")
        except Exception as e:
            print(f"No se pudo obtener perfil del supervisor: {e}")
    elif aprobador_nivel == "compras":
        # Fall back to the compras email defined in .env
        email_destinatario = COMPRAS_EMAIL
        # Try to get the compras profile for richer info
        try:
            compras_res = supabase.table("profiles").select("*").eq("role", "compras").eq("status", "activo").limit(1).execute()
            if compras_res.data:
                aprobador_info = compras_res.data[0]
                email_destinatario = aprobador_info.get("email") or COMPRAS_EMAIL
        except Exception as e:
            print(f"No se pudo obtener perfil de compras: {e}")

    send_n8n_webhook("creada", solicitud, skus, {
        "vendedor": user,
        "aprobador_nivel": aprobador_nivel,
        "aprobador": aprobador_info,
        "email_destinatario": email_destinatario,
    })

    return {"status": "success", "solicitud_id": solicitud["id"], "folio": folio}


@app.post("/api/solicitudes/aprobar")
async def aprobar_solicitud(sol_id: int, user_id: str, comentario: str = Body(None)):
    update_res = supabase.table("solicitudes").update({
        "estado": "aprobada",
        "comentario_aprobador": comentario,
        "approved_at": datetime.now().isoformat(),
        "aprobador_final_id": user_id
    }).eq("id", sol_id).execute()
    
    user_res = supabase.table("profiles").select("full_name").eq("id", user_id).single().execute()
    await log_audit(user_id, user_res.data.get("full_name", "Aprobador"), "aprobar_solicitud", "solicitud", sol_id, comentario)
    
    # Send n8n webhook on approval
    try:
        sol_upd = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute().data
        skus_upd = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute().data
        vendedor_res = supabase.table("profiles").select("*").eq("id", sol_upd["vendedor_id"]).single().execute()
        vendedor_info = vendedor_res.data if vendedor_res.data else {}
        aprobador_info = supabase.table("profiles").select("*").eq("id", user_id).single().execute().data

        send_n8n_webhook("aprobada", sol_upd, skus_upd, {
            "vendedor": vendedor_info,
            "aprobador": aprobador_info,
            "email_destinatario": vendedor_info.get("email")
        })
    except Exception as e:
        print(f"Error triggering approval webhook in legacy endpoint: {e}")

    return {"status": "success"}

@app.post("/api/solicitudes/rechazar")
async def rechazar_solicitud(sol_id: int, user_id: str, comentario: str = Body(...)):
    update_res = supabase.table("solicitudes").update({
        "estado": "rechazada",
        "comentario_aprobador": comentario,
        "updated_at": datetime.now().isoformat()
    }).eq("id", sol_id).execute()
    
    user_res = supabase.table("profiles").select("full_name").eq("id", user_id).single().execute()
    await log_audit(user_id, user_res.data.get("full_name", "Aprobador"), "rechazar_solicitud", "solicitud", sol_id, comentario)

    # Send n8n webhook on rejection
    try:
        sol_upd = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute().data
        skus_upd = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute().data
        vendedor_res = supabase.table("profiles").select("*").eq("id", sol_upd["vendedor_id"]).single().execute()
        vendedor_info = vendedor_res.data if vendedor_res.data else {}
        aprobador_info = supabase.table("profiles").select("*").eq("id", user_id).single().execute().data

        send_n8n_webhook("rechazada", sol_upd, skus_upd, {
            "vendedor": vendedor_info,
            "aprobador": aprobador_info,
            "email_destinatario": vendedor_info.get("email")
        })
    except Exception as e:
        print(f"Error triggering rejection webhook in legacy endpoint: {e}")

    return {"status": "success"}

@app.post("/api/solicitudes/procesar")
async def procesar_solicitud(data: Dict[str, Any]):
    sol_id = data.get("sol_id")
    user_id = data.get("user_id")
    comentario = data.get("comentario", "")
    sku_actions = data.get("sku_actions", {})       # {sku_id: 'aprobar'|'rechazar'|'pendiente'}
    sku_adjustments = data.get("sku_adjustments", {}) # {sku_id: percentage}

    if not sol_id or not user_id:
        raise HTTPException(status_code=400, detail="Faltan datos requeridos (sol_id, user_id)")

    # 1. Fetch user profile
    user_res = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if not user_res.data:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user = user_res.data
    role = user.get("role")

    # 2. Fetch solicitud
    sol_res = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute()
    if not sol_res.data:
        raise HTTPException(status_code=404, detail="Solicitud no encontrada")
    sol = sol_res.data

    if sol["estado"] not in ('pendiente', 'en_revision', 'escalada', 'parcialmente_aprobada'):
        raise HTTPException(status_code=400, detail=f"La solicitud en estado '{sol['estado']}' no puede ser procesada")

    # 3. Load all SKUs
    skus_res = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute()
    all_skus = skus_res.data or []

    # 4. Check for escalation if any pending SKU is being approved
    needs_escalation = False
    reglas_res = supabase.table("reglas").select("*").execute()
    reglas = {r['marca']: r for r in reglas_res.data} if reglas_res.data else {}

    for s in all_skus:
        if s.get("sku_estado", "pendiente") in ('aprobado', 'rechazado'):
            continue
        sid = str(s["id"])
        action = sku_actions.get(sid, "aprobar")
        if action in ('rechazar', 'pendiente'):
            continue

        adj_pct = float(sku_adjustments.get(sid, s.get("porcentaje_descuento_sol") or 0))
        marca = s.get("marca")
        regla = reglas.get(marca)
        if regla:
            lv = float(regla.get('limite_vendedor') or regla.get('limite_supervisor') or 0)
            ls = float(regla.get('limite_supervisor') or 0)
            if role == 'vendedor' and adj_pct > lv:
                needs_escalation = True
            elif role == 'supervisor' and adj_pct > ls:
                needs_escalation = True

    # 5. Escalate if needed
    if needs_escalation and role not in ('admin', 'compras', 'gerente_ventas'):
        next_level = 'compras'
        # Get active compras user
        compras_res = supabase.table("profiles").select("*").eq("role", "compras").eq("status", "activo").limit(1).execute()
        if not compras_res.data:
            # Fallback to any active admin
            compras_res = supabase.table("profiles").select("*").eq("role", "admin").eq("status", "activo").limit(1).execute()
        
        if not compras_res.data:
            raise HTTPException(status_code=400, detail="No hay aprobador disponible para compras o admin.")
        
        next_approver = compras_res.data[0]
        sla_h_esc = 8
        sla_deadline = add_business_hours(datetime.now(), sla_h_esc)

        supabase.table("solicitudes").update({
            "estado": "escalada",
            "aprobador_actual_id": next_approver["id"],
            "aprobador_nivel": next_level,
            "sla_deadline": sla_deadline.isoformat(),
            "comentario_aprobador": comentario,
            "updated_at": datetime.now().isoformat()
        }).eq("id", sol_id).execute()

        await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "solicitud_escalada", "solicitud", sol_id, f"Escalada a {next_level} - Comentario: {comentario}")

        # Send email notification
        # Fetch updated solicitud and skus
        sol_upd = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute().data
        skus_upd = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute().data
        vendedor_res = supabase.table("profiles").select("*").eq("id", sol["vendedor_id"]).single().execute()
        vendedor_info = vendedor_res.data if vendedor_res.data else {}

        subj, html_body = build_solicitud_email(sol_upd, skus_upd, BASE_URL, vendedor_info, next_approver)
        if next_approver.get("email"):
            send_email(SMTP_CONFIG, [next_approver["email"]], subj, html_body)

        return {
            "status": "escalated", 
            "message": f"Solicitud escalada a {next_level} por superar límites de descuento.",
            "escalated": True
        }

    # 6. Process each SKU
    now_ts = datetime.now().isoformat()
    for s in all_skus:
        if s.get("sku_estado", "pendiente") in ('aprobado', 'rechazado'):
            continue
        
        sid = str(s["id"])
        action = sku_actions.get(sid, "aprobar")

        if action == "rechazar":
            supabase.table("solicitud_skus").update({
                "sku_estado": "rechazado",
                "sku_comentario": comentario,
                "aprobado_por": user_id,
                "aprobado_at": now_ts
            }).eq("id", s["id"]).execute()
            await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "sku_rechazado", "solicitud", sol_id, f"SKU {s['codigo_sku']} ({s['marca']}) rechazado")

        elif action == "pendiente":
            pass

        else: # 'aprobar'
            adj_pct = float(sku_adjustments.get(sid, s.get("porcentaje_descuento_sol") or 0))
            # Capped
            max_pct = float(s.get("porcentaje_descuento_sol") or 0)
            adj_pct = max(0.0, min(adj_pct, max_pct))
            precio_base = float(s.get("precio_base") or 0)
            cantidad = float(s.get("cantidad") or 0)
            precio_aprobado = precio_base * (1 - adj_pct / 100)
            monto_aprobado = (precio_base - precio_aprobado) * cantidad

            supabase.table("solicitud_skus").update({
                "porcentaje_aprobado": round(adj_pct, 2),
                "precio_aprobado": round(precio_aprobado, 2),
                "monto_aprobado": round(monto_aprobado, 2),
                "sku_estado": "aprobado",
                "sku_comentario": comentario,
                "aprobado_por": user_id,
                "aprobado_at": now_ts
            }).eq("id", s["id"]).execute()
            await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "sku_aprobado", "solicitud", sol_id, f"SKU {s['codigo_sku']} ({s['marca']}) aprobado {adj_pct:.2f}%")

    # 7. Recalculate status of the request
    counts_res = supabase.table("solicitud_skus").select("sku_estado, monto_aprobado").eq("solicitud_id", sol_id).execute()
    skus_state = counts_res.data or []

    pend = sum(1 for sk in skus_state if sk.get("sku_estado", "pendiente") == "pendiente")
    apro = sum(1 for sk in skus_state if sk.get("sku_estado") == "aprobado")
    rech = sum(1 for sk in skus_state if sk.get("sku_estado") == "rechazado")
    monto = sum(float(sk.get("monto_aprobado") or 0) for sk in skus_state)

    if pend > 0:
        # Still has pending SKUs -> partially approved
        supabase.table("solicitudes").update({
            "estado": "parcialmente_aprobada",
            "monto_total_aprobado": round(monto, 2),
            "comentario_aprobador": comentario,
            "updated_at": now_ts
        }).eq("id", sol_id).execute()
        await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "solicitud_parcialmente_aprobada", "solicitud", sol_id, f"{apro} aprobados, {rech} rechazados, {pend} pendientes")
        return {
            "status": "partial",
            "message": f"{apro} SKU(s) procesados. {pend} aún pendientes.",
            "pending_count": pend
        }

    # All SKUs processed
    if apro == 0:
        # All rejected
        supabase.table("solicitudes").update({
            "estado": "rechazada",
            "comentario_aprobador": comentario,
            "updated_at": now_ts
        }).eq("id", sol_id).execute()
        await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "solicitud_rechazada", "solicitud", sol_id, "Todos los SKUs rechazados")
        
        # Send rejection email via n8n webhook and fallback
        sol_upd = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute().data
        skus_upd = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute().data
        vendedor_res = supabase.table("profiles").select("*").eq("id", sol["vendedor_id"]).single().execute()
        vendedor_info = vendedor_res.data if vendedor_res.data else {}
        
        # Trigger n8n webhook
        send_n8n_webhook("rechazada", sol_upd, skus_upd, {
            "vendedor": vendedor_info,
            "aprobador": user,
            "email_destinatario": vendedor_info.get("email")
        })

        # Fallback email
        try:
            subj, html_body = build_solicitud_email(sol_upd, skus_upd, BASE_URL, vendedor_info, user)
            recipients = []
            if vendedor_info.get("email"): recipients.append(vendedor_info["email"])
            if user.get("email"): recipients.append(user["email"])
            if recipients:
                send_email(SMTP_CONFIG, recipients, subj, html_body)
        except Exception as mail_err:
            print(f"Fallback email failed: {mail_err}")

        return {"status": "rejected", "message": "Solicitud rechazada en su totalidad"}

    # At least one approved and all processed -> approved
    # Generate folio
    now = datetime.now()
    prefix = f"NE-{now.strftime('%Y%m')}-"
    try:
        res = supabase.table("solicitudes").select("folio").like("folio", f"{prefix}%").order("folio", desc=True).limit(1).execute()
        new_num = 1
        if res.data:
            last_folio = res.data[0]["folio"]
            new_num = int(last_folio.split("-")[-1]) + 1
        folio = f"{prefix}{new_num:06d}"
    except:
        folio = f"{prefix}000001"

    supabase.table("solicitudes").update({
        "estado": "aprobada",
        "folio": folio,
        "aprobador_final_id": user_id,
        "monto_total_aprobado": round(monto, 2),
        "comentario_aprobador": comentario,
        "approved_at": now_ts,
        "updated_at": now_ts
    }).eq("id", sol_id).execute()

    await log_audit(user_id, user.get("full_name") or user.get("username", "Aprobador"), "solicitud_aprobada", "solicitud", sol_id, f"Folio: {folio}, Monto Aprobado: {monto:.2f}")

    # Send approval webhook
    sol_upd = supabase.table("solicitudes").select("*").eq("id", sol_id).single().execute().data
    skus_upd = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute().data
    vendedor_res = supabase.table("profiles").select("*").eq("id", sol["vendedor_id"]).single().execute()
    vendedor_info = vendedor_res.data if vendedor_res.data else {}

    send_n8n_webhook("aprobada", sol_upd, skus_upd, {
        "vendedor": vendedor_info,
        "aprobador": user,
        "email_destinatario": vendedor_info.get("email")
    })

    return {"status": "success", "message": "Solicitud aprobada con éxito", "folio": folio}

@app.post("/api/admin/import-reglas")
async def import_reglas(file: UploadFile = File(...)):
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as f: f.write(await file.read())
    reglas = import_reglas_from_xlsx(file_path)
    os.remove(file_path)
    supabase.table("reglas").delete().neq("id", -1).execute()
    supabase.table("reglas").insert(reglas).execute()
    return {"status": "success", "count": len(reglas)}

@app.post("/api/admin/import-presupuesto")
async def import_presupuesto(file: UploadFile = File(...)):
    file_path = f"temp_{file.filename}"
    with open(file_path, "wb") as f: f.write(await file.read())
    pptos = import_presupuesto_from_xlsx(file_path)
    os.remove(file_path)
    supabase.table("presupuesto").delete().neq("id", -1).execute()
    supabase.table("presupuesto").insert(pptos).execute()
    return {"status": "success", "count": len(pptos)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
