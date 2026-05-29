const PROXY_URL = 'https://script.google.com/macros/s/AKfycbwm8NWADDs3RfqPn87SWzLx8sWKimoe8Qr7q5qKdvy_jTNnitNR0pSjupGXpVqgCKKM/exec';
const CACHE_KEY = 'cofersa_infoc_v1';
const CACHE_TS_KEY = 'cofersa_infoc_ts';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export const infocomprasService = {
  data: [],
  status: 'idle',

  async loadData(forceRefresh = false) {
    // Try cache first
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(CACHE_KEY);
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (cached && ts && (Date.now() - ts) < CACHE_TTL_MS) {
        try {
          this.data = JSON.parse(cached);
          this.status = 'ready';
          console.log('[Infocompras] Loaded from cache:', this.data.length);
          return this.data;
        } catch (e) {
          console.warn('[Infocompras] Cache parse failed');
        }
      }
    }

    // Fetch fresh
    this.status = 'loading';
    try {
      const response = await fetch(PROXY_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      
      if (!json.success) throw new Error(json.error || 'Proxy error');
      
      const mappedData = json.rows.map(row => ({
        ARTICULO1:      row['ARTICULO1']      || '',
        CODIGO_AFV:     row['CODIGO AFV']     || '',
        DESCRIPCION:    row['DESCRIPCION']    || '',
        MARCA:          row['MARCA']          || '',
        BDF:            row['BDF']            || '',
        PRECIO_MAYOREO: parseFloat(row['PRECIO MAYOREO']) || 0
      }));

      this.data = mappedData;
      this.status = 'ready';

      // Store in cache
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(mappedData));
      sessionStorage.setItem(CACHE_TS_KEY, Date.now().toString());

      return mappedData;
    } catch (err) {
      this.status = 'error';
      console.error('[Infocompras] Fetch failed:', err);
      throw err;
    }
  },

  search(query) {
    if (!query) return [];
    const q = query.toLowerCase();
    return this.data.filter(item => 
      item.ARTICULO1.toLowerCase().includes(q) ||
      item.DESCRIPCION.toLowerCase().includes(q) ||
      item.MARCA.toLowerCase().includes(q) ||
      item.CODIGO_AFV.toLowerCase().includes(q)
    ).slice(0, 20); // Limit results
  }
};
