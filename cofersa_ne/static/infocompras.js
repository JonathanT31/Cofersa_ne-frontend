/**
 * COFERSA NE — Infocompras Global Cache
 * Loads once per browser session (sessionStorage) and stays available
 * across ALL modules until the tab is closed or the user logs out.
 *
 * Usage from any page:
 *   window.INFOC.ready  → true once loaded
 *   window.INFOC.data   → array of product objects
 *   window.INFOC.status → 'loading' | 'ready' | 'error'
 *   window.INFOC.onReady(fn) → calls fn() immediately if ready, else queues it
 */
(function() {
    'use strict';

    var PROXY_URL = 'https://script.google.com/macros/s/AKfycbwm8NWADDs3RfqPn87SWzLx8sWKimoe8Qr7q5qKdvy_jTNnitNR0pSjupGXpVqgCKKM/exec';
    var CACHE_KEY = 'cofersa_infoc_v1';
    var CACHE_TS_KEY = 'cofersa_infoc_ts';
    var CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

    // Global namespace
    window.INFOC = window.INFOC || {
        ready:    false,
        data:     [],
        status:   'idle',
        _queue:   [],
        onReady: function(fn) {
            if (this.ready) { try { fn(); } catch(e) {} }
            else this._queue.push(fn);
        },
        _fire: function() {
            this.ready = true;
            this.status = 'ready';
            var q = this._queue.slice(); this._queue = [];
            q.forEach(function(fn){ try { fn(); } catch(e) {} });
            // Notify any status elements on the page
            _updateStatusElements();
            console.log('[Infocompras] Ready — ' + window.INFOC.data.length + ' products');
        }
    };

    function _parseRow(row) {
        return {
            ARTICULO1:      row['ARTICULO1']      || '',
            CODIGO_AFV:     row['CODIGO AFV']     || '',
            DESCRIPCION:    row['DESCRIPCION']    || '',
            MARCA:          row['MARCA']          || '',
            BDF:            row['BDF']            || '',
            PRECIO_MAYOREO: parseFloat(row['PRECIO MAYOREO']) || 0
        };
    }

    function _updateStatusElements() {
        // Update any #infocStatus element currently on the page
        var els = document.querySelectorAll('#infocStatus');
        els.forEach(function(el) {
            if (window.INFOC.status === 'ready') {
                el.innerHTML = '<span style="color:#27ae60;">&#10003; ' +
                    window.INFOC.data.length.toLocaleString() + ' productos cargados</span>';
            } else if (window.INFOC.status === 'error') {
                el.innerHTML = '<span style="color:#e74c3c;">&#9888; Sin conexi&#243;n con Infocompras</span>';
            } else {
                el.textContent = 'Cargando Infocompras...';
            }
        });
        // Enable search inputs
        if (window.INFOC.status === 'ready') {
            var inp = document.getElementById('infocSearch');
            if (inp) { inp.disabled = false; inp.style.background = ''; }
            var bulk = document.getElementById('bulkCodesInput');
            if (bulk) bulk.disabled = false;
            var btn = document.getElementById('bulkAddBtn');
            if (btn) btn.disabled = false;
        }
    }

    function _loadFromProxy() {
        window.INFOC.status = 'loading';
        console.log('[Infocompras] Fetching from proxy...');
        fetch(PROXY_URL)
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function(json) {
                if (!json.success) throw new Error(json.error || 'Proxy error');
                var data = json.rows.map(_parseRow);
                window.INFOC.data = data;

                // Cache in sessionStorage
                try {
                    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
                    sessionStorage.setItem(CACHE_TS_KEY, Date.now().toString());
                    console.log('[Infocompras] Cached ' + data.length + ' rows in sessionStorage');
                } catch(e) {
                    console.warn('[Infocompras] sessionStorage write failed:', e);
                }

                window.INFOC._fire();
            })
            .catch(function(err) {
                window.INFOC.status = 'error';
                console.error('[Infocompras] Load failed:', err.message);
                _updateStatusElements();
            });
    }

    function init() {
        // Already loaded in this page execution? Skip.
        if (window.INFOC.ready) {
            _updateStatusElements();
            return;
        }

        // Try sessionStorage cache first
        try {
            var cached = sessionStorage.getItem(CACHE_KEY);
            var ts     = parseInt(sessionStorage.getItem(CACHE_TS_KEY) || '0', 10);
            if (cached && ts && (Date.now() - ts) < CACHE_TTL_MS) {
                var data = JSON.parse(cached);
                if (data && data.length > 0) {
                    window.INFOC.data = data;
                    window.INFOC._fire();
                    console.log('[Infocompras] Restored ' + data.length + ' rows from sessionStorage cache');
                    return;
                }
            }
        } catch(e) {
            console.warn('[Infocompras] sessionStorage read failed:', e);
        }

        // Fetch fresh from proxy
        _loadFromProxy();
    }

    // ── Public refresh function (clears cache and reloads) ───────────────────
    window.INFOC.refresh = function() {
        try {
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS_KEY);
        } catch(e) {}
        window.INFOC.ready  = false;
        window.INFOC.data   = [];
        window.INFOC.status = 'idle';
        _loadFromProxy();
    };

    // ── Clear cache on logout ────────────────────────────────────────────────
    window.INFOC.clearCache = function() {
        try {
            sessionStorage.removeItem(CACHE_KEY);
            sessionStorage.removeItem(CACHE_TS_KEY);
        } catch(e) {}
        window.INFOC.ready  = false;
        window.INFOC.data   = [];
        window.INFOC.status = 'idle';
    };

    // Run on every page load — instant from cache, or fetch if needed
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
