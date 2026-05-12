import httpx
import time
from typing import List, Dict, Any

PROXY_URL = 'https://script.google.com/macros/s/AKfycbwm8NWADDs3RfqPn87SWzLx8sWKimoe8Qr7q5qKdvy_jTNnitNR0pSjupGXpVqgCKKM/exec'

class InfocomprasService:
    _cache: List[Dict[str, Any]] = []
    _last_fetch: float = 0
    _cache_ttl: int = 4 * 60 * 60  # 4 hours

    @classmethod
    async def get_products(cls) -> List[Dict[str, Any]]:
        now = time.time()
        if cls._cache and (now - cls._last_fetch) < cls._cache_ttl:
            return cls._cache

        async with httpx.AsyncClient(follow_redirects=True) as client:
            try:
                response = await client.get(PROXY_URL)
                response.raise_for_status()
                json_data = response.json()

                if json_data.get("success"):
                    cls._cache = cls._parse_rows(json_data.get("rows", []))
                    cls._last_fetch = now
                    return cls._cache
                else:
                    print(f"Proxy error: {json_data.get('error')}")
                    return cls._cache or []
            except Exception as e:
                print(f"Failed to fetch Infocompras: {e}")
                return cls._cache or []

    @staticmethod
    def _parse_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        parsed = []
        for row in rows:
            parsed.append({
                "codigo_articulo": row.get('ARTICULO1', ''),
                "codigo_afv":      row.get('CODIGO AFV', ''),
                "descripcion":     row.get('DESCRIPCION', ''),
                "marca":           row.get('MARCA', ''),
                "bdf":             row.get('BDF', ''),
                "precio_mayoreo":  float(row.get('PRECIO MAYOREO', 0) or 0),
                "precio_lista":    float(row.get('PRECIO LISTA', 0) or row.get('PRECIO MAYOREO', 0) or 0) # Fallback
            })
        return parsed

infocompras_service = InfocomprasService()
