from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import os
from typing import List, Dict, Any, Optional

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the actual domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from api.infocompras import infocompras_service

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "COFERSA NE API is running"}

@app.get("/api/infocompras")
async def get_infocompras():
    products = await infocompras_service.get_products()
    return {"success": True, "count": len(products), "products": products}

from api.solicitudes_service import create_solicitud, SolicitudCreate, get_solicitudes, get_solicitud_detalle

@app.get("/api/solicitudes")
async def api_get_solicitudes(
    vendedor_id: Optional[str] = Query(None),
    aprobador_id: Optional[str] = Query(None),
    x_user_id: str = Header(None)
):
    # If no specific filter, default to user's own if vendedor
    # This is simplified; real logic should check roles
    target_vendedor = vendedor_id or (x_user_id if not aprobador_id else None)
    results = await get_solicitudes(vendedor_id=target_vendedor, aprobador_id=aprobador_id)
    return {"success": True, "data": results}

@app.get("/api/solicitudes/{sol_id}")
async def api_get_solicitud(sol_id: int):
    result = await get_solicitud_detalle(sol_id)
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud not found")
    return {"success": True, "data": result}

from api.solicitudes_service import update_solicitud_estado

@app.post("/api/solicitudes/{sol_id}/aprobar")
async def api_aprobar_solicitud(sol_id: int, data: Dict[str, Any], x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    res = await update_solicitud_estado(sol_id, 'aprobada', data.get("comentario"), x_user_id)
    return {"success": True, "data": res}

@app.post("/api/solicitudes/{sol_id}/rechazar")
async def api_rechazar_solicitud(sol_id: int, data: Dict[str, Any], x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    res = await update_solicitud_estado(sol_id, 'rechazada', data.get("comentario"), x_user_id)
    return {"success": True, "data": res}

@app.post("/api/solicitudes")
async def api_create_solicitud(data: SolicitudCreate, x_user_id: str = Header(None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    try:
        result = await create_solicitud(data, x_user_id)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/reglas")
async def get_reglas():
    from api.supabase_client import get_scoped_supabase
    supabase = get_scoped_supabase()
    res = supabase.table("reglas").select("*").order("marca").execute()
    return {"success": True, "data": res.data}

@app.get("/api/marcas")
async def get_marcas():
    from api.supabase_client import get_scoped_supabase
    supabase = get_scoped_supabase()
    res = supabase.table("reglas").select("marca").execute()
    marcas = sorted(list(set(r["marca"] for r in res.data))) if res.data else []
    return {"success": True, "marcas": marcas}

@app.get("/api/presupuesto")
async def get_presupuesto():
    from api.supabase_client import get_scoped_supabase
    supabase = get_scoped_supabase()
    res = supabase.table("presupuesto").select("*").execute()
    return {"success": True, "data": res.data}

@app.get("/api/usuarios")
async def get_usuarios():
    from api.supabase_client import get_scoped_supabase
    supabase = get_scoped_supabase()
    res = supabase.table("profiles").select("*").execute()
    return {"success": True, "data": res.data}

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(x_user_id: str = Header(None)):
    from api.supabase_client import get_scoped_supabase
    supabase = get_scoped_supabase()

    # Simplified stats for migration demonstration
    # In a real app, these would be filtered by role and period
    res = supabase.table("solicitudes").select("estado", count="exact").execute()

    total = len(res.data) if res.data else 0
    aprobadas = len([s for s in res.data if s['estado'] == 'aprobada']) if res.data else 0
    pendientes = len([s for s in res.data if s['estado'] == 'pendiente']) if res.data else 0
    rechazadas = len([s for s in res.data if s['estado'] == 'rechazada']) if res.data else 0

    return {
        "success": True,
        "stats": {
            "total_solicitudes": total,
            "aprobadas": aprobadas,
            "pendientes": pendientes,
            "rechazadas": rechazadas,
            "gasto_aprobado": 0, # Should sum from DB
            "cumplimiento_sla": 100
        }
    }

# Vercel requires the app to be named 'app'
