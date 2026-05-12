import os
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from fastapi import FastAPI, Header, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from api.infocompras import infocompras_service
from api.solicitudes_service import (
    create_solicitud,
    SolicitudCreate,
    get_solicitudes,
    get_solicitud_detalle,
    update_solicitud_estado
)
from api.supabase_client import get_scoped_supabase

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="COFERSA NE API")

# Configure CORS
# For development, we allow all origins. In production, this should be restricted.
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-User-Id"],
)

class SolicitudAction(BaseModel):
    comentario: Optional[str] = None

async def get_auth_user_id(x_user_id: Optional[str] = Header(None)) -> str:
    """Dependency to extract and verify the user ID from headers."""
    if not x_user_id:
        raise HTTPException(status_code=401, detail="User ID required")
    return x_user_id

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "COFERSA NE API is running"}

@app.get("/api/infocompras")
async def api_get_infocompras():
    try:
        products = await infocompras_service.get_products()
        return {"success": True, "count": len(products), "products": products}
    except Exception as e:
        logger.error(f"Error in infocompras: {e}")
        return {"success": False, "error": "Failed to fetch products"}

@app.get("/api/solicitudes")
async def api_get_solicitudes(
    vendedor_id: Optional[str] = Query(None),
    aprobador_id: Optional[str] = Query(None),
    user_id: str = Depends(get_auth_user_id)
):
    # Determine the target based on user ID if no specific filter is provided
    target_vendedor = vendedor_id or (user_id if not aprobador_id else None)
    results = await get_solicitudes(vendedor_id=target_vendedor, aprobador_id=aprobador_id)
    return {"success": True, "data": results}

@app.get("/api/solicitudes/{sol_id}")
async def api_get_solicitud_by_id(sol_id: int):
    result = await get_solicitud_detalle(sol_id)
    if not result:
        raise HTTPException(status_code=404, detail="Solicitud not found")
    return {"success": True, "data": result}

@app.post("/api/solicitudes/{sol_id}/aprobar")
async def api_aprobar_solicitud(
    sol_id: int,
    data: SolicitudAction,
    user_id: str = Depends(get_auth_user_id)
):
    res = await update_solicitud_estado(sol_id, 'aprobada', data.comentario, user_id)
    if not res:
        raise HTTPException(status_code=400, detail="Failed to approve solicitud")
    return {"success": True, "data": res}

@app.post("/api/solicitudes/{sol_id}/rechazar")
async def api_rechazar_solicitud(
    sol_id: int,
    data: SolicitudAction,
    user_id: str = Depends(get_auth_user_id)
):
    res = await update_solicitud_estado(sol_id, 'rechazada', data.comentario, user_id)
    if not res:
        raise HTTPException(status_code=400, detail="Failed to reject solicitud")
    return {"success": True, "data": res}

@app.post("/api/solicitudes")
async def api_create_solicitud(
    data: SolicitudCreate,
    user_id: str = Depends(get_auth_user_id)
):
    try:
        result = await create_solicitud(data, user_id)
        return {"success": True, "data": result}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Unexpected error creating solicitud: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/reglas")
def get_reglas():
    supabase = get_scoped_supabase()
    res = supabase.table("reglas").select("*").order("marca").execute()
    return {"success": True, "data": res.data}

@app.get("/api/marcas")
def get_marcas():
    supabase = get_scoped_supabase()
    res = supabase.table("reglas").select("marca").execute()
    marcas = sorted(list(set(r["marca"] for r in res.data))) if res.data else []
    return {"success": True, "marcas": marcas}

@app.get("/api/presupuesto")
def get_presupuesto():
    supabase = get_scoped_supabase()
    res = supabase.table("presupuesto").select("*").execute()
    return {"success": True, "data": res.data}

@app.get("/api/usuarios")
def get_usuarios():
    supabase = get_scoped_supabase()
    res = supabase.table("profiles").select("*").execute()
    return {"success": True, "data": res.data}

@app.get("/api/dashboard/stats")
def get_dashboard_stats(user_id: str = Depends(get_auth_user_id)):
    supabase = get_scoped_supabase()
    res = supabase.table("solicitudes").select("estado").execute()

    data = res.data or []
    total = len(data)
    aprobadas = sum(1 for s in data if s['estado'] == 'aprobada')
    pendientes = sum(1 for s in data if s['estado'] == 'pendiente')
    rechazadas = sum(1 for s in data if s['estado'] == 'rechazada')

    return {
        "success": True,
        "stats": {
            "total_solicitudes": total,
            "aprobadas": aprobadas,
            "pendientes": pendientes,
            "rechazadas": rechazadas,
            "gasto_aprobado": 0,
            "cumplimiento_sla": 100
        }
    }

# Vercel requires the app to be named 'app'
