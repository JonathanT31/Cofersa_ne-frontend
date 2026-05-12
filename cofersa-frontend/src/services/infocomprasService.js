/**
 * COFERSA-Frontend — Infocompras Service
 * Ported from original cofersa_ne/static/infocompras.js
 */

const PROXY_URL = 'https://script.google.com/macros/s/AKfycbwm8NWADDs3RfqPn87SWzLx8sWKimoe8Qr7q5qKdvy_jTNnitNR0pSjupGXpVqgCKKM/exec';
const CACHE_KEY = 'cofersa_infoc_v1';
const CACHE_TS_KEY = 'cofersa_infoc_ts';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

class InfocomprasService {
  constructor() {
    this.ready = false;
    this.data = [];
    this.status = 'idle';
    this.listeners = [];
  }

  _parseRow(row) {
    return {
      ARTICULO1:      row['ARTICULO1']      || '',
      CODIGO_AFV:     row['CODIGO AFV']     || '',
      DESCRIPCION:    row['DESCRIPCION']    || '',
      MARCA:          row['MARCA']          || '',
      BDF:            row['BDF']            || '',
      PRECIO_MAYOREO: parseFloat(row['PRECIO MAYOREO']) || 0
    };
  }

  async init() {
    if (this.ready) return this.data;

    // Try sessionStorage cache first
    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      const ts = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
      if (cached && ts && (Date.now() - ts) < CACHE_TTL_MS) {
        const data = JSON.parse(cached);
        if (data && data.length > 0) {
          this.data = data;
          this.ready = true;
          this.status = 'ready';
          console.log(`[Infocompras] Restored ${data.length} rows from cache`);
          this._notifyListeners();
          return this.data;
        }
      }
    } catch (e) {
      console.warn('[Infocompras] sessionStorage read failed:', e);
    }

    return this.loadFromProxy();
  }

  async loadFromProxy() {
    this.status = 'loading';
    this._notifyListeners();
    console.log('[Infocompras] Fetching from proxy...');

    try {
      const res = await fetch(PROXY_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Proxy error');

      const data = json.rows.map(this._parseRow);
      this.data = data;
      this.ready = true;
      this.status = 'ready';

      // Cache in sessionStorage
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        sessionStorage.setItem(CACHE_TS_KEY, Date.now().toString());
        console.log(`[Infocompras] Cached ${data.length} rows in sessionStorage`);
      } catch (e) {
        console.warn('[Infocompras] sessionStorage write failed:', e);
      }

      this._notifyListeners();
      return this.data;
    } catch (err) {
      this.status = 'error';
      console.error('[Infocompras] Load failed:', err.message);
      this._notifyListeners();
      throw err;
    }
  }

  _notifyListeners() {
    this.listeners.forEach(fn => fn(this.status, this.data));
  }

  subscribe(fn) {
    this.listeners.push(fn);
    fn(this.status, this.data);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  refresh() {
    try {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.removeItem(CACHE_TS_KEY);
    } catch (e) {}
    this.ready = false;
    this.data = [];
    this.status = 'idle';
    return this.loadFromProxy();
  }

  clearCache() {
    try {
      sessionStorage.removeItem(CACHE_KEY);
      sessionStorage.removeItem(CACHE_TS_KEY);
    } catch (e) {}
    this.ready = false;
    this.data = [];
    this.status = 'idle';
  }
}

export const infocomprasService = new InfocomprasService();
