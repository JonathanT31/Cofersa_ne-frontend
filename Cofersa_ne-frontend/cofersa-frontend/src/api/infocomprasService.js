const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || '';

export const infocomprasService = {
  async search(query, clientCode, clientName, listaPrecios) {
    if (!N8N_WEBHOOK_URL) {
      console.warn('VITE_N8N_WEBHOOK_URL is not defined in .env');
      return [];
    }
    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'search',
          query,
          client_code: clientCode,
          client_name: clientName,
          lista_precios: listaPrecios
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      
      const items = Array.isArray(json) ? json : (json.rows || json.results || []);
      
      return items.map(row => ({
        ARTICULO1:      row.ARTICULO      || row.articulo      || '',
        CODIGO_AFV:     row.CODIGO_AFV     || row.codigo_afv    || '',
        DESCRIPCION:    row.DESCRIPCION    || row.descripcion   || '',
        MARCA:          row.MARCA          || row.marca         || '',
        BDF:            row.BDF            || row.bdf           || '',
        PRECIO: parseFloat(row.PRECIO || row.precio || 0)
      }));
    } catch (err) {
      console.error('[infocomprasService] Search failed:', err);
      throw err;
    }
  },

  async bulkSearch(codes, clientCode, clientName) {
    if (!N8N_WEBHOOK_URL) {
      console.warn('VITE_N8N_WEBHOOK_URL is not defined in .env');
      return [];
    }
    try {
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'bulk',
          codes,
          client_code: clientCode,
          client_name: clientName,
          lista_precios: listaPrecios
        })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      
      const items = Array.isArray(json) ? json : (json.rows || json.results || []);
      
      return items.map(row => ({
        ARTICULO1:      row.ARTICULO1      || row.articulo      || '',
        CODIGO_AFV:     row.CODIGO_AFV     || row.codigo_afv    || '',
        DESCRIPCION:    row.DESCRIPCION    || row.descripcion   || '',
        MARCA:          row.MARCA          || row.marca         || '',
        BDF:            row.BDF            || row.bdf           || '',
        PRECIO: parseFloat(row.PRECIO || row.precio || 0)
      }));
    } catch (err) {
      console.error('[infocomprasService] Bulk search failed:', err);
      throw err;
    }
  }
};
