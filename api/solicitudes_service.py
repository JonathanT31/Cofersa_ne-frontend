from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from api.supabase_client import get_scoped_supabase as get_supabase
from api.utils import add_business_hours
from datetime import datetime

class SkuItem(BaseModel):
    marca: str
    codigo_sku: str
    descripcion: str
    cantidad: float
    precio_base: float
    porcentaje_descuento_sol: float
    precio_solicitado: float
    monto_descuento: float
    bdf: Optional[str] = None

class SolicitudCreate(BaseModel):
    cliente_codigo: str
    cliente_nombre: str
    numero_pedido: Optional[str] = None
    justificacion: str
    skus: List[SkuItem]

async def create_solicitud(data: SolicitudCreate, user_id: str):
    supabase = get_supabase()

    # 1. Determine routing and level (Simplified for now)
    # In a real scenario, fetch limits from 'reglas' table
    aprobador_nivel = 'supervisor'
    aprobador_id = None # Logic to find supervisor_id from profiles

    # Fetch user profile to get supervisor
    profile = supabase.table("profiles").select("*").eq("id", user_id).single().execute()
    if profile.data:
        aprobador_id = profile.data.get("supervisor_id")

    # 2. SLA Calculation
    sla_deadline = add_business_hours(datetime.now(), 8).isoformat()

    monto_total = sum(sku.monto_descuento for sku in data.skus)

    # 3. Insert Solicitud
    sol_res = supabase.table("solicitudes").insert({
        "cliente_codigo": data.cliente_codigo,
        "cliente_nombre": data.cliente_nombre,
        "numero_pedido": data.numero_pedido,
        "justificacion": data.justificacion,
        "vendedor_id": user_id,
        "aprobador_actual_id": aprobador_id,
        "aprobador_nivel": aprobador_nivel,
        "monto_total_descuento": monto_total,
        "sla_deadline": sla_deadline,
        "estado": "pendiente"
    }).execute()

    if not sol_res.data:
        raise Exception("Failed to create solicitud")

    sol_id = sol_res.data[0]["id"]

    # 4. Insert SKUs
    sku_data = []
    for sku in data.skus:
        sku_dict = sku.dict()
        sku_dict["solicitud_id"] = sol_id
        sku_data.append(sku_dict)

    supabase.table("solicitud_skus").insert(sku_data).execute()

    return sol_res.data[0]

async def get_solicitudes(vendedor_id: Optional[str] = None, aprobador_id: Optional[str] = None):
    supabase = get_supabase()
    query = supabase.table("solicitudes").select("*, profiles!vendedor_id(nombre, apellido)")

    if vendedor_id:
        query = query.eq("vendedor_id", vendedor_id)
    if aprobador_id:
        query = query.eq("aprobador_actual_id", aprobador_id)

    res = query.order("created_at", desc=True).execute()
    return res.data or []

async def get_solicitud_detalle(sol_id: int):
    supabase = get_supabase()
    sol = supabase.table("solicitudes").select("*, profiles!vendedor_id(nombre, apellido)").eq("id", sol_id).single().execute()
    skus = supabase.table("solicitud_skus").select("*").eq("solicitud_id", sol_id).execute()

    if not sol.data:
        return None

    return {
        "solicitud": sol.data,
        "skus": skus.data or []
    }

async def update_solicitud_estado(sol_id: int, estado: str, comentario: Optional[str] = None, user_id: Optional[str] = None):
    supabase = get_supabase()
    update_data = {
        "estado": estado,
        "comentario_aprobador": comentario,
        "updated_at": datetime.now().isoformat()
    }

    if estado == 'aprobada':
        update_data["approved_at"] = datetime.now().isoformat()
        update_data["aprobador_final_id"] = user_id
        # Folio generation logic could be ported here too

    res = supabase.table("solicitudes").update(update_data).eq("id", sol_id).execute()
    return res.data[0] if res.data else None
