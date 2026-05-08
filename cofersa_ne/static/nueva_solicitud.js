// COFERSA NE v4.1 — Nueva Solicitud JS
// Infocompras search (individual + bulk), Precio Mayoreo, Precio LPV, calcs from LPV

var infocData  = [];
var infocReady = false;
var reglasCache = {};
var skuCounter = 0;
var lastEdited = {};

// infocProxyUrl: managed by /static/infocompras.js (global)

// ── Utilities ─────────────────────────────────────────────────────────────────
function normalizeText(t) {
    return (t || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ');
}

function esc_html(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;')
                    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Load Infocompras — delegates to global window.INFOC (infocompras.js) ─────
// The global script loads at login and caches data in sessionStorage.
// This function just connects the local page state to the global cache.
function loadInfocompras() {
    // Sync local vars from global cache if already ready
    function _syncFromGlobal() {
        if (window.INFOC && window.INFOC.ready) {
            infocData  = window.INFOC.data;
            infocReady = true;

            var inp = document.getElementById('infocSearch');
            if (inp) { inp.disabled = false; inp.style.background = ''; }
            var bulk = document.getElementById('bulkCodesInput');
            if (bulk) bulk.disabled = false;
            var btn  = document.getElementById('bulkAddBtn');
            if (btn) btn.disabled = false;

            var status = document.getElementById('infocStatus');
            if (status) status.innerHTML =
                '<span style="color:#27ae60;">&#10003; ' +
                infocData.length.toLocaleString() + ' productos cargados</span>';
        }
    }

    if (window.INFOC) {
        if (window.INFOC.ready) {
            // Already loaded — instant
            _syncFromGlobal();
            console.log('[NuevaSol] Infocompras already ready, ' + infocData.length + ' products');
        } else {
            // Queue: will fire once the global script finishes loading
            window.INFOC.onReady(function() {
                _syncFromGlobal();
                console.log('[NuevaSol] Infocompras ready callback, ' + infocData.length + ' products');
            });
            // Also update status to show loading
            var status = document.getElementById('infocStatus');
            if (status && window.INFOC.status === 'loading') {
                status.textContent = 'Cargando productos desde Infocompras...';
            } else if (status && window.INFOC.status === 'error') {
                status.innerHTML = '<span style="color:#e74c3c;">&#9888; Sin conexi&#243;n Infocompras</span>';
            }
        }
    } else {
        // Fallback: global script not loaded yet (shouldn't happen), wait briefly
        console.warn('[NuevaSol] window.INFOC not ready, retrying in 500ms');
        setTimeout(loadInfocompras, 500);
    }
}

// ── Search mode tabs ──────────────────────────────────────────────────────────
function switchSearchMode(mode) {
    document.querySelectorAll('.infoc-tab').forEach(function(t) {
        t.classList.remove('active');
    });
    if (mode === 'single') {
        document.getElementById('infocTabSingle').classList.add('active');
        document.getElementById('singleSearchMode').style.display = 'block';
        document.getElementById('bulkSearchMode').style.display  = 'none';
    } else {
        document.getElementById('infocTabBulk').classList.add('active');
        document.getElementById('singleSearchMode').style.display = 'none';
        document.getElementById('bulkSearchMode').style.display  = 'block';
    }
}

// ── Individual search ─────────────────────────────────────────────────────────
// ── Relevance scoring for a single product ───────────────────────────────────
function scoreProduct(p, terms, normQuery) {
    var desc = normalizeText(p.DESCRIPCION);
    var art  = normalizeText(p.ARTICULO1);
    var afv  = normalizeText(p.CODIGO_AFV);
    var mrca = normalizeText(p.MARCA);
    var s = 0;

    // Highest: full normalized query appears as a phrase in description or article code
    if (normQuery.length > 2 && desc.includes(normQuery)) s += 100;
    if (normQuery.length > 2 && art.includes(normQuery))  s += 80;

    // All terms present in a single field
    var n = terms.length;
    if (n > 1) {
        if (terms.every(function(t){ return desc.includes(t); })) s += 50;
        if (terms.every(function(t){ return art.includes(t);  })) s += 40;
        if (terms.every(function(t){ return afv.includes(t);  })) s += 35;
    }

    // Per-term field contribution (weighted by field importance)
    terms.forEach(function(t) {
        if (desc.includes(t)) s += 10;
        if (art.includes(t))  s += 8;
        if (afv.includes(t))  s += 5;
        if (mrca.includes(t)) s += 3;
    });

    return s;
}

function onInfocSearch(val) {
    var sug = document.getElementById('infocSuggestions');
    if (!infocReady) { sug.style.display = 'none'; return; }

    // Split on non-alphanumeric separators → multi-term search
    var rawTerms = val.trim().split(/[^a-z0-9à-ÿ]+/i).filter(function(t){ return t.length >= 2; });
    if (!rawTerms.length) { sug.style.display = 'none'; return; }
    var terms     = rawTerms.map(normalizeText);
    var normQuery = normalizeText(val.trim());

    // Filter: product matches if ANY term appears in ANY of the 4 fields
    var candidates = infocData.filter(function(p) {
        var art  = normalizeText(p.ARTICULO1);
        var desc = normalizeText(p.DESCRIPCION);
        var afv  = normalizeText(p.CODIGO_AFV);
        var mrca = normalizeText(p.MARCA);
        return terms.some(function(t) {
            return desc.includes(t) || art.includes(t) || afv.includes(t) || mrca.includes(t);
        });
    });

    // Score and sort by relevance — best matches first
    var scored = candidates.map(function(p) {
        return { p: p, s: scoreProduct(p, terms, normQuery) };
    });
    scored.sort(function(a, b) { return b.s - a.s; });

    var matches = scored.slice(0, 12).map(function(x) { return x.p; });

    if (!matches.length) {
        sug.innerHTML = '<div style="padding:10px 14px;color:#888;font-size:13px;">Sin resultados para "' + esc_html(val) + '"</div>';
    } else {
        sug.innerHTML = matches.map(function(p) {
            var code  = p.ARTICULO1 || p.CODIGO_AFV;
            var price = p.PRECIO_MAYOREO > 0
                ? ' &mdash; &#x20a1;' + p.PRECIO_MAYOREO.toLocaleString('es-CR', {minimumFractionDigits: 2})
                : '';
            var safe  = code.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
            return '<div class="infoc-item" style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #f0f0f0;"'
                 + ' onmouseover="this.style.background=\'#f0f4f8\'" onmouseout="this.style.background=\'\'"'
                 + ' onclick="addFromInfoc(\'' + safe + '\')">'
                 + '<div style="font-weight:600;font-size:13px;">' + esc_html(code)
                 + ' &nbsp;&middot;&nbsp; <span style="color:#1a5276;">' + esc_html(p.MARCA) + '</span>' + price + '</div>'
                 + '<div style="font-size:12px;color:#666;margin-top:2px;">' + esc_html(p.DESCRIPCION.substring(0, 90)) + (p.BDF ? ' <span style="color:#1a5276;font-size:11px;">[BDF: ' + esc_html(p.BDF) + ']</span>' : '') + '</div>'
                 + '</div>';
        }).join('');
    }
    sug.style.display = 'block';
}

document.addEventListener('click', function(e) {
    var card = document.getElementById('infocCard');
    var sug  = document.getElementById('infocSuggestions');
    if (card && !card.contains(e.target) && sug) sug.style.display = 'none';
});

function addFromInfoc(articleCode) {
    var product = infocData.find(function(p) {
        return p.ARTICULO1 === articleCode || p.CODIGO_AFV === articleCode;
    });
    if (!product) return;

    var inp = document.getElementById('infocSearch');
    if (inp) inp.value = '';
    var sug = document.getElementById('infocSuggestions');
    if (sug) sug.style.display = 'none';

    skuCounter++;
    addSkuRowWithData(skuCounter, product.MARCA, product.ARTICULO1 || product.CODIGO_AFV,
                      product.DESCRIPCION, product.PRECIO_MAYOREO, product.BDF || '');
}

// ── Bulk input (same logic as cotizador addBulkProducts) ──────────────────────
function addBulkProducts() {
    var input = document.getElementById('bulkCodesInput');
    var statusEl = document.getElementById('bulkStatus');
    var raw = (input ? input.value.trim() : '');
    if (!raw) { alert('Por favor ingresa al menos un c\u00f3digo de art\u00edculo.'); return; }

    var codes = raw.split(/[\n,]+/).map(function(c) { return c.trim(); }).filter(function(c) { return c.length > 0; });
    var added = 0, notFound = [], duplicates = 0;

    codes.forEach(function(code) {
        var product = infocData.find(function(p) {
            return p.ARTICULO1.toLowerCase() === code.toLowerCase() ||
                   (p.CODIGO_AFV && p.CODIGO_AFV.toLowerCase() === code.toLowerCase());
        });
        if (!product) { notFound.push(code); return; }

        // Check duplicate (by codigo in existing rows)
        var existing = document.querySelector('.sku-codigo[value="' + esc_html(product.ARTICULO1) + '"]');
        if (existing) { duplicates++; return; }

        skuCounter++;
        addSkuRowWithData(skuCounter, product.MARCA, product.ARTICULO1 || product.CODIGO_AFV,
                          product.DESCRIPCION, product.PRECIO_MAYOREO, product.BDF || '');
        added++;
    });

    var msg = '\u2713 ' + added + ' producto(s) agregado(s)';
    if (duplicates > 0) msg += ' | ' + duplicates + ' ya exist\u00edan';
    if (notFound.length > 0) msg += ' | No encontrados: ' + notFound.join(', ');

    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.style.color = notFound.length > 0 ? '#e67e22' : '#27ae60';
    }

    if (input) input.value = '';

    // Switch to form view if products were added
    if (added > 0) {
        var container = document.getElementById('skuContainer');
        if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ── SKU row builder ───────────────────────────────────────────────────────────
function addSkuRow() {
    skuCounter++;
    addSkuRowWithData(skuCounter, '', '', '', 0, '');
}

function addSkuRowWithData(id, marca, codigo, descripcion, precioMayoreo, bdf) {
    var opts = '<option value="">-- Seleccione Marca --</option>' +
        (window.marcasDisponibles || []).map(function(m) {
            return '<option value="' + esc_html(m) + '"' + (m === marca ? ' selected' : '') + '>' + esc_html(m) + '</option>';
        }).join('');

    var row = document.createElement('div');
    row.className = 'sku-row';
    row.id = 'sku_' + id;
    row.innerHTML =
        '<div class="sku-header">'
      + '<strong>L&#237;nea #' + id + '</strong>'
      + '<button type="button" class="btn btn-danger btn-sm" onclick="removeSkuRow(' + id + ')">&#10005; Quitar</button>'
      + '</div>'
      + '<div class="sku-marca-row">'
      +   '<div class="form-group"><label>Marca *</label>'
      +   '<select class="form-control sku-marca" data-id="' + id + '" onchange="onMarcaChange(' + id + ')">' + opts + '</select></div>'
      +   '<div class="form-group"><div class="ranges-info" id="ranges_' + id + '" style="font-size:12px;color:#555;padding:6px 0;">Seleccione una marca para ver rangos de aprobaci&#243;n</div><div id="ppto_' + id + '" style="margin-top:2px;"></div></div>'
      + (bdf ? '<div style="font-size:11px;color:#555;margin:-4px 0 6px;">BDF: <strong style="color:#1a5276;">' + esc_html(bdf) + '</strong></div>' : '')
      + '</div>'
      + '<div class="sku-fields">'
      +   '<div class="form-group"><label>C&#243;digo SKU *</label>'
      +   '<input type="text" class="form-control sku-codigo" data-id="' + id + '" value="' + esc_html(codigo) + '"></div>'
      +   '<input type="hidden" class="sku-bdf" data-id="' + id + '" value="' + esc_html(bdf || '') + '">'
      +   '<div class="form-group"><label>Descripci&#243;n *</label>'
      +   '<input type="text" class="form-control sku-desc" data-id="' + id + '" value="' + esc_html(descripcion) + '"></div>'
      +   '<div class="form-group"><label>Cantidad *</label>'
      +   '<input type="number" class="form-control sku-cant" data-id="' + id + '" min="0.01" step="any" value="1" oninput="calcFromPct(' + id + ')"></div>'
      +   '<div class="form-group"><label>Precio Mayoreo &#x20a1;</label>'
      +   '<input type="number" class="form-control sku-pmayoreo" data-id="' + id + '" min="0" step="any"'
      +   ' value="' + (precioMayoreo > 0 ? precioMayoreo : '') + '" style="background:#f0f8ff;" readonly tabindex="-1"></div>'
      +   '<div class="form-group"><label>Precio LPV &#x20a1; *</label>'
      +   '<input type="number" class="form-control sku-pbase" data-id="' + id + '" min="0" step="any"'
      +   ' value="' + (precioMayoreo > 0 ? precioMayoreo : '') + '" oninput="calcFromBase(' + id + ')"'
      +   ' title="Precio Lista de Precio de Venta — base para c&#225;lculo de descuentos"></div>'
      +   '<div class="form-group"><label>% Desc. Sol. *</label>'
      +   '<input type="number" class="form-control sku-pct" data-id="' + id + '" min="0" max="100" step="0.01" oninput="calcFromPct(' + id + ')"></div>'
      +   '<div class="form-group"><label>Precio Sol. &#x20a1;</label>'
      +   '<input type="number" class="form-control sku-psol" data-id="' + id + '" min="0" step="any" oninput="calcFromPsol(' + id + ')"></div>'
      +   '<div class="form-group"><label>Monto Desc. &#x20a1;</label>'
      +   '<input type="text" class="form-control sku-mdesc" data-id="' + id + '" readonly style="background:#f8f8f8;"></div>'
      + '</div>'
      + '<div class="sku-estimado" style="margin-top:8px;padding:5px 0 2px;"></div>'
      + '<div id="approvalInd_' + id + '"></div>'
      + '<div class="form-error sku-error" id="err_' + id + '"></div>';

    document.getElementById('skuContainer').appendChild(row);
    if (marca) onMarcaChange(id);
}

function removeSkuRow(id) {
    var el = document.getElementById('sku_' + id);
    if (el) el.remove();
}

// ── Approval ranges ───────────────────────────────────────────────────────────
async function onMarcaChange(id) {
    var marca = document.querySelector('#sku_' + id + ' .sku-marca').value;
    var info  = document.getElementById('ranges_' + id);
    if (!marca) {
        if (info) info.textContent = 'Seleccione una marca para ver rangos de aprobaci\u00f3n';
        return;
    }
    // Load approval ranges
    if (reglasCache[marca]) { showRanges(id, reglasCache[marca]); }
    else {
        try {
            var r = await apiGet('/api/reglas/marca?marca=' + encodeURIComponent(marca));
            if (r.ok) { reglasCache[marca] = r.data; showRanges(id, r.data); }
            else if (info) info.textContent = 'No se encontraron rangos para esta marca';
        } catch(e) { if (info) info.textContent = 'Error al cargar rangos'; }
    }
    // Load budget info for this marca+user
    loadPptoMarca(id, marca);
    updateApprovalIndicator(id);
}

function showRanges(id, data) {
    if (window.currentUserRole === 'vendedor') {
        // Vendedor: do NOT show ranges — only trigger approval indicator
        updateApprovalIndicator(id);
        return;
    }
    var info = document.getElementById('ranges_' + id);
    if (!info) return;
    var lv = data.limite_vendedor   || 0;
    var ls = data.limite_supervisor || 0;
    var lc = data.limite_compras    || 0;
    info.innerHTML =
        '<span style="color:#27ae60;">&#9679;</span> Vendedor hasta <strong>' + lv + '%</strong>'
      + ' &nbsp;|&nbsp; <span style="color:#e67e22;">&#9679;</span> Supervisor hasta <strong>' + ls + '%</strong>'
      + ' &nbsp;|&nbsp; <span style="color:#e74c3c;">&#9679;</span> Compras &ge;<strong>' + lc + '%</strong>';
    // Trigger approval level indicator if pct already entered
    updateApprovalIndicator(id);
}

// ── Real-time approval level indicator ───────────────────────────────────────
function updateApprovalIndicator(id) {
    // Determine indicator for a single SKU row, then update ALL rows of same marca
    var marca = (document.querySelector('#sku_' + id + ' .sku-marca') || {}).value || '';
    _updateApprovalIndicatorForMarca(marca);
}

function _updateApprovalIndicatorForMarca(marca) {
    if (!marca) return;
    var data  = reglasCache[marca];
    var pptoD = pptoCache[marca];
    if (!data) return;

    var lv   = parseFloat(data.limite_vendedor   || 0);
    var ls   = parseFloat(data.limite_supervisor || 0);
    var ppto = pptoD && pptoD.ok ? parseFloat(pptoD.ppto || 0) : 0;
    var gast = pptoD && pptoD.ok ? parseFloat(pptoD.gasto || 0) : 0;

    // Compute max pct AND total monto across ALL rows of this marca in the form
    var maxPct          = 0;
    var totalMarcaMonto = 0;
    document.querySelectorAll('.sku-row').forEach(function(row) {
        var rowMarca = row.querySelector('.sku-marca') ? row.querySelector('.sku-marca').value : '';
        if (rowMarca !== marca) return;
        var rid  = row.id.replace('sku_', '');
        var pct2 = parseFloat(getSkuField(rid, 'pct'))   || 0;
        var lpv2 = parseFloat(getSkuField(rid, 'pbase')) || 0;
        var ps2  = parseFloat(getSkuField(rid, 'psol'))  || 0;
        var qt2  = parseFloat(getSkuField(rid, 'cant'))  || 1;
        var md2  = (lpv2 - ps2) * qt2;
        if (pct2 > maxPct) maxPct = pct2;
        if (md2 > 0) totalMarcaMonto += md2;
    });

    // Budget check uses ESTIMADO: already spent + what this request would add
    var estimadoTotal = gast + totalMarcaMonto;
    var budgetOk = (ppto <= 0) || (estimadoTotal <= ppto);

    var color, msg;
    if (maxPct <= lv && budgetOk) {
        color = '#27ae60';
        msg   = '&#10003; Esta solicitud puede autoaprobarse por el vendedor.';
    } else if (maxPct <= lv && !budgetOk) {
        color = '#e67e22';
        msg   = '&#9888; Requiere aprobaci&#243;n del supervisor: el estimado excede el presupuesto disponible de la marca.';
    } else if (maxPct <= ls) {
        color = '#e67e22';
        msg   = '&#9654; Esta solicitud requiere aprobaci&#243;n del supervisor.';
    } else {
        color = '#e74c3c';
        msg   = '&#9654; Esta solicitud requiere aprobaci&#243;n de compras.';
    }

    var html = '<div style="margin-top:6px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:600;'
        + 'background:' + color + '22;border:1px solid ' + color + '44;color:' + color + ';">'
        + msg + '</div>';

    // Update ALL rows of this marca
    document.querySelectorAll('.sku-row').forEach(function(row) {
        var rowMarca = row.querySelector('.sku-marca') ? row.querySelector('.sku-marca').value : '';
        if (rowMarca !== marca) return;
        var rid   = row.id.replace('sku_', '');
        var indEl = document.getElementById('approvalInd_' + rid);
        if (indEl) indEl.innerHTML = html;
    });
}

// ── Price calculations — based on Precio LPV (sku-pbase) ─────────────────────
function calcFromPct(id) {
    lastEdited[id] = 'pct';
    var lpv  = parseFloat(getSkuField(id, 'pbase')) || 0;
    var pct  = parseFloat(getSkuField(id, 'pct'))   || 0;
    var cant = parseFloat(getSkuField(id, 'cant'))   || 1;
    if (lpv > 0) {
        var psol  = lpv * (1 - pct / 100);
        var mdesc = (lpv - psol) * cant;
        setSkuField(id, 'psol',  psol.toFixed(2));
        setSkuField(id, 'mdesc', formatCRC(mdesc));
        validateSku(id, lpv, pct, psol);
    }
    var marca = getSkuField(id, 'marca') || (document.querySelector('#sku_'+id+' .sku-marca')||{}).value || '';
    if (marca) updateEstimado(marca);
    updateApprovalIndicator(id);
}

function calcFromPsol(id) {
    lastEdited[id] = 'psol';
    var lpv  = parseFloat(getSkuField(id, 'pbase')) || 0;
    var psol = parseFloat(getSkuField(id, 'psol'))  || 0;
    var cant = parseFloat(getSkuField(id, 'cant'))  || 1;
    if (lpv > 0) {
        var pct   = (1 - psol / lpv) * 100;
        var mdesc = (lpv - psol) * cant;
        setSkuField(id, 'pct',   pct.toFixed(2));
        setSkuField(id, 'mdesc', formatCRC(mdesc));
        validateSku(id, lpv, pct, psol);
    }
    var marca = (document.querySelector('#sku_'+id+' .sku-marca')||{}).value || '';
    if (marca) updateEstimado(marca);
    updateApprovalIndicator(id);
}

function calcFromBase(id) {
    if ((lastEdited[id] || 'pct') === 'psol') calcFromPsol(id);
    else calcFromPct(id);
}

function validateSku(id, lpv, pct, psol) {
    var msgs = [];
    if (pct < 0)      msgs.push('Descuento no puede ser negativo.');
    if (pct > 100)    msgs.push('Descuento no puede ser mayor a 100%.');
    if (psol > lpv)   msgs.push('Precio solicitado no puede superar Precio LPV.');
    var err = document.getElementById('err_' + id);
    if (err) err.textContent = msgs.join(' ');
}

function getSkuField(id, f) {
    var el = document.querySelector('#sku_' + id + ' .sku-' + f);
    return el ? el.value : '';
}
function setSkuField(id, f, v) {
    var el = document.querySelector('#sku_' + id + ' .sku-' + f);
    if (el) el.value = v;
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function enviarSolicitud() {
    var errDiv = document.getElementById('formErrors');
    errDiv.innerHTML = '';

    var clienteCodigo = document.getElementById('cliente_codigo').value.trim();
    var clienteNombre = document.getElementById('cliente_nombre').value.trim();
    var numeroPedido  = document.getElementById('numero_pedido').value.trim();
    var justificacion = document.getElementById('justificacion').value.trim();
    var errors = [];

    if (!clienteCodigo) errors.push('C\u00f3digo de cliente es requerido.');
    if (!clienteNombre) errors.push('Nombre de cliente es requerido.');
    // numero_pedido is optional
    if (!justificacion) errors.push('Justificaci\u00f3n es requerida.');

    var skuRows = document.querySelectorAll('.sku-row');
    if (!skuRows.length) errors.push('Debe agregar al menos una l\u00ednea de SKU.');

    var skus = [];
    skuRows.forEach(function(row) {
        var id     = row.id.replace('sku_', '');
        var marca  = row.querySelector('.sku-marca').value;
        var codigo = row.querySelector('.sku-codigo').value.trim();
        var desc   = row.querySelector('.sku-desc').value.trim();
        var cant   = parseFloat(row.querySelector('.sku-cant').value)    || 0;
        var lpv    = parseFloat(row.querySelector('.sku-pbase').value)   || 0;   // LPV = precio_base in DB
        var pct    = parseFloat(row.querySelector('.sku-pct').value)     || 0;
        var psol   = parseFloat(row.querySelector('.sku-psol').value)    || 0;
        var mdesc  = (lpv - psol) * cant;

        if (!marca)     errors.push('L\u00ednea #' + id + ': Seleccione una marca.');
        if (!codigo)    errors.push('L\u00ednea #' + id + ': C\u00f3digo SKU requerido.');
        if (!desc)      errors.push('L\u00ednea #' + id + ': Descripci\u00f3n requerida.');
        if (cant <= 0)  errors.push('L\u00ednea #' + id + ': Cantidad debe ser mayor a 0.');
        if (lpv <= 0)   errors.push('L\u00ednea #' + id + ': Precio LPV debe ser mayor a 0.');
        if (pct < 0)    errors.push('L\u00ednea #' + id + ': Descuento no puede ser negativo.');
        if (pct > 100)  errors.push('L\u00ednea #' + id + ': Descuento no puede ser mayor a 100%.');
        if (psol > lpv) errors.push('L\u00ednea #' + id + ': Precio solicitado no puede exceder Precio LPV.');
        // P5: require a real discount — both % and resulting monto must be set
        if (pct <= 0) errors.push('L\u00ednea #' + id + ': El % de descuento debe ser mayor a 0.');
        if (pct > 0 && (psol <= 0 || psol >= lpv)) errors.push('L\u00ednea #' + id + ': Precio solicitado no puede ser igual o mayor al Precio LPV.');
        if (pct > 0 && mdesc <= 0)  errors.push('L\u00ednea #' + id + ': Monto Desc. \u20a1 no puede ser cero. Verifique el Precio LPV y % descuento.');

        var bdf_val = row.querySelector('.sku-bdf') ? row.querySelector('.sku-bdf').value : '';
        skus.push({
            marca: marca, codigo_sku: codigo, descripcion: desc, bdf: bdf_val,
            cantidad: cant, precio_base: lpv,
            porcentaje_descuento_sol: pct,
            precio_solicitado: psol,
            monto_descuento: mdesc
        });
    });

    if (errors.length > 0) {
        errDiv.innerHTML = '<div class="alert alert-danger">' + errors.join('<br>') + '</div>';
        errDiv.scrollIntoView({ behavior: 'smooth' });
        return;
    }

    try {
        errDiv.innerHTML = '<div class="alert alert-info">Enviando solicitud...</div>';
        var result = await apiPost('/api/solicitud/crear', {
            cliente_codigo: clienteCodigo, cliente_nombre: clienteNombre,
            numero_pedido: numeroPedido,   justificacion: justificacion,
            skus: skus
        });
        if (result.ok) {
            if (result.mailto) window.location.href = result.mailto;
            setTimeout(function() {
                window.location = '/solicitud/' + result.solicitud_id + '?msg=creada';
            }, 500);
        } else {
            errDiv.innerHTML = '<div class="alert alert-danger">Error: ' + (result.error || 'Error desconocido') + '</div>';
        }
    } catch(e) {
        errDiv.innerHTML = '<div class="alert alert-danger">Error de conexi\u00f3n: ' + e.message + '</div>';
    }
}


// ── Budget info per marca ─────────────────────────────────────────────────────
var pptoCache  = {};   // marca → {ppto, gasto, pct, month}

async function loadPptoMarca(id, marca) {
    if (!marca) return;
    var infoEl = document.getElementById('ppto_' + id);
    if (!infoEl) return;
    infoEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Cargando presupuesto...</span>';

    if (!pptoCache[marca]) {
        try {
            var r = await apiGet('/api/ppto/marca?marca=' + encodeURIComponent(marca));
            if (r.ok) pptoCache[marca] = r;
        } catch(e) { /* ignore */ }
    }

    var d = pptoCache[marca];
    if (!d || !d.ok) {
        if (window.currentUserRole !== 'vendedor') {
            infoEl.innerHTML = '<span style="color:#aaa;font-size:11px;">Sin presupuesto asignado para esta marca</span>';
        } else {
            infoEl.innerHTML = '';
        }
        // Still update indicator (budget unavailable = no auto-approve)
        document.querySelectorAll('.sku-row').forEach(function(row) {
            var rm = row.querySelector('.sku-marca'); if (rm && rm.value===marca) {
                var rid = row.id.replace('sku_',''); updateApprovalIndicator(rid); }
        });
        return;
    }

    if (window.currentUserRole !== 'vendedor') {
        var pct   = d.pct;
        var color = pct < 80 ? '#27ae60' : (pct < 100 ? '#e67e22' : '#e74c3c');
        infoEl.innerHTML =
            '<div style="font-size:11px;padding:5px 0;">' +
            '<strong style="color:#1a5276;">' + d.month + ' — ' + marca + '</strong><br>' +
            'Presupuesto: <strong>' + formatCRC(d.ppto) + '</strong> &nbsp;|&nbsp; ' +
            'Gastado: <strong>' + formatCRC(d.gasto) + '</strong> &nbsp;|&nbsp; ' +
            '% Consumo: <strong style="color:' + color + ';">' + pct + '%</strong>' +
            '</div>';
    } else {
        infoEl.innerHTML = '';
    }

    updateEstimado(marca);
    document.querySelectorAll('.sku-row').forEach(function(row) {
        var rm = row.querySelector('.sku-marca'); if (rm && rm.value===marca) {
            var rid = row.id.replace('sku_',''); updateApprovalIndicator(rid); }
    });
}

// ── Estimado del gasto total — sum of all SKUs of same marca in this solicitud ─
function updateEstimado(marca) {
    if (!marca) return;
    var d = pptoCache[marca];
    var gastoBase = d && d.ok ? d.gasto : 0;

    // Sum monto_descuento of all SKU rows with this marca
    var totalMarcaRequest = 0;
    document.querySelectorAll('.sku-row').forEach(function(row) {
        var rowMarca = row.querySelector('.sku-marca') ? row.querySelector('.sku-marca').value : '';
        if (rowMarca !== marca) return;
        var id2   = row.id.replace('sku_', '');
        var lpv2  = parseFloat(getSkuField(id2, 'pbase'))  || 0;
        var psol2 = parseFloat(getSkuField(id2, 'psol'))   || 0;
        var cant2 = parseFloat(getSkuField(id2, 'cant'))   || 1;
        var md    = (lpv2 - psol2) * cant2;
        if (md > 0) totalMarcaRequest += md;
    });

    var estimado = gastoBase + totalMarcaRequest;

    // Update estimado display in ALL rows of same marca
    document.querySelectorAll('.sku-row').forEach(function(row) {
        var rowMarca = row.querySelector('.sku-marca') ? row.querySelector('.sku-marca').value : '';
        if (rowMarca !== marca) return;
        var estEl = row.querySelector('.sku-estimado');
        if (!estEl) return;
        if (totalMarcaRequest > 0 && window.currentUserRole !== 'vendedor') {
            var ppto2 = d && d.ok ? d.ppto : 0;
            var color2 = ppto2 > 0 && estimado > ppto2 ? '#e74c3c' : '#27ae60';
            estEl.innerHTML =
                '<span style="font-size:12px;color:#555;">Estimado gasto total (' + marca + '): ' +
                '<strong style="color:' + color2 + ';">' + formatCRC(estimado) + '</strong>' +
                (ppto2 > 0 ? ' de ' + formatCRC(ppto2) : '') +
                '</span>';
        } else if (window.currentUserRole === 'vendedor') {
            estEl.innerHTML = '';  // hidden for vendedor
        } else {
            estEl.innerHTML = '';
        }
    });
    // Keep approval indicator in sync with estimado changes
    _updateApprovalIndicatorForMarca(marca);
}


// Cancel button helper (avoids quote-in-quote issues in Python string builder)
function cancelarNueva() {
    if (confirm('\u00bfDescartar solicitud? Se perder\u00e1n los datos ingresados.'))
        window.location = '/';
}
