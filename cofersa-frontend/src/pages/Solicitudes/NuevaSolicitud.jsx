import React, { useState, useEffect } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { infocomprasService } from '../../services/infocomprasService';


const normalizeText = (t) => {
  return (t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ');
};

const scoreProduct = (p, terms, normQuery) => {
  const desc = normalizeText(p.DESCRIPCION);
  const art  = normalizeText(p.ARTICULO1);
  const afv  = normalizeText(p.CODIGO_AFV);
  const mrca = normalizeText(p.MARCA);
  let s = 0;

  if (normQuery.length > 2 && desc.includes(normQuery)) s += 100;
  if (normQuery.length > 2 && art.includes(normQuery))  s += 80;

  if (terms.length > 1) {
    if (terms.every(t => desc.includes(t))) s += 50;
    if (terms.every(t => art.includes(t)))  s += 40;
    if (terms.every(t => afv.includes(t)))  s += 35;
  }

  terms.forEach(t => {
    if (desc.includes(t)) s += 10;
    if (art.includes(t))  s += 8;
    if (afv.includes(t))  s += 5;
    if (mrca.includes(t)) s += 3;
  });

  return s;
};

const NuevaSolicitud = () => {
  const navigate = useNavigate();
  const [clienteCodigo, setClienteCodigo] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [justificacion, setJustificacion] = useState('');
  
  const [skus, setSkus] = useState([]);
  const [skuCounter, setSkuCounter] = useState(0);
  const [marcas, setMarcas] = useState([]);

  const [searchMode, setSearchMode] = useState('single');
  const [infocSearch, setInfocSearch] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [infocData, setInfocData] = useState([]);
  const [infocStatus, setInfocStatus] = useState('idle');

  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    infocomprasService.init();
    const unsubscribe = infocomprasService.subscribe((status, data) => {
      setInfocStatus(status);
      setInfocData(data);
    });

    fetch('/api/marcas')
      .then(res => res.json())
      .then(data => {
        if (data.ok) setMarcas(data.marcas);
      })
      .catch(err => console.error('Error fetching marcas:', err));

    return unsubscribe;
  }, []);

  const addSkuRow = (initialData = {}) => {
    const newId = skuCounter + 1;
    setSkuCounter(newId);
    setSkus(prev => [
      ...prev,
      {
        id: newId,
        marca: initialData.marca || '',
        codigo_sku: initialData.codigo_sku || '',
        descripcion: initialData.descripcion || '',
        cantidad: 1,
        precio_mayoreo: initialData.precio_mayoreo || 0,
        precio_base: initialData.precio_base || initialData.precio_mayoreo || 0,
        pct: '',
        psol: '',
        mdesc: 0,
        bdf: initialData.bdf || '',
        lastEdited: 'pct'
      }
    ]);
  };

  const removeSkuRow = (id) => {
    setSkus(skus.filter(s => s.id !== id));
  };

  const updateSku = (id, field, value) => {
    setSkus(prev => prev.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };

      if (['cantidad', 'precio_base', 'pct', 'psol'].includes(field)) {
        const cant = parseFloat(updated.cantidad) || 0;
        const lpv = parseFloat(updated.precio_base) || 0;
        
        if (field === 'pct' || (field === 'precio_base' && updated.lastEdited === 'pct')) {
          updated.lastEdited = 'pct';
          const pct = parseFloat(updated.pct) || 0;
          if (lpv > 0) {
            const psol = lpv * (1 - pct / 100);
            updated.psol = psol.toFixed(2);
            updated.mdesc = (lpv - psol) * cant;
          } else {
            updated.mdesc = 0;
          }
        } else if (field === 'psol' || (field === 'precio_base' && updated.lastEdited === 'psol')) {
          updated.lastEdited = 'psol';
          const psol = parseFloat(updated.psol) || 0;
          if (lpv > 0) {
            const pct = (1 - psol / lpv) * 100;
            updated.pct = pct.toFixed(2);
            updated.mdesc = (lpv - psol) * cant;
          } else {
            updated.mdesc = 0;
          }
        } else if (field === 'cantidad') {
           const psol = parseFloat(updated.psol) || 0;
           if (lpv > 0) {
             updated.mdesc = (lpv - psol) * cant;
           }
        }
      }
      return updated;
    }));
  };

  const getSkuError = (s) => {
    const lpv = parseFloat(s.precio_base) || 0;
    const pct = parseFloat(s.pct) || 0;
    const psol = parseFloat(s.psol) || 0;
    const msgs = [];
    if (pct < 0) msgs.push('Descuento no puede ser negativo.');
    if (pct > 100) msgs.push('Descuento no puede ser mayor a 100%.');
    if (psol > lpv) msgs.push('Precio solicitado no puede superar Precio LPV.');
    return msgs.join(' ');
  };

  const enviarSolicitud = async () => {
    const errors = [];
    if (!clienteCodigo.trim()) errors.push('Código de cliente es requerido.');
    if (!clienteNombre.trim()) errors.push('Nombre de cliente es requerido.');
    if (!justificacion.trim()) errors.push('Justificación es requerida.');
    if (!skus.length) errors.push('Debe agregar al menos una línea de SKU.');

    const cleanSkus = skus.map((s, i) => {
      const lpv = parseFloat(s.precio_base) || 0;
      const pct = parseFloat(s.pct) || 0;
      const psol = parseFloat(s.psol) || 0;
      const cant = parseFloat(s.cantidad) || 0;
      const mdesc = (lpv - psol) * cant;

      if (!s.marca) errors.push(`Línea #${i + 1}: Seleccione una marca.`);
      if (!s.codigo_sku.trim()) errors.push(`Línea #${i + 1}: Código SKU requerido.`);
      if (!s.descripcion.trim()) errors.push(`Línea #${i + 1}: Descripción requerida.`);
      if (cant <= 0) errors.push(`Línea #${i + 1}: Cantidad debe ser mayor a 0.`);
      if (lpv <= 0) errors.push(`Línea #${i + 1}: Precio LPV debe ser mayor a 0.`);
      if (pct <= 0) errors.push(`Línea #${i + 1}: El % de descuento debe ser mayor a 0.`);
      if (pct > 100) errors.push(`Línea #${i + 1}: Descuento no puede ser mayor a 100%.`);
      if (psol >= lpv && pct > 0) errors.push(`Línea #${i + 1}: Precio solicitado no puede ser igual o mayor al Precio LPV.`);
      if (mdesc <= 0 && pct > 0) errors.push(`Línea #${i + 1}: Monto Desc. no puede ser cero.`);

      return {
        marca: s.marca,
        codigo_sku: s.codigo_sku,
        descripcion: s.descripcion,
        bdf: s.bdf,
        cantidad: cant,
        precio_base: lpv,
        porcentaje_descuento_sol: pct,
        precio_solicitado: psol,
        monto_descuento: mdesc
      };
    });

    setFormErrors(errors);
    if (errors.length > 0) return;

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/solicitud/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_codigo: clienteCodigo,
          cliente_nombre: clienteNombre,
          numero_pedido: numeroPedido,
          justificacion: justificacion,
          skus: cleanSkus
        })
      });
      const result = await response.json();
      if (result.ok) {
        if (result.mailto) window.location.href = result.mailto;
        setTimeout(() => navigate(`/solicitud/${result.solicitud_id}`), 500);
      } else {
        setFormErrors([result.error || 'Error al enviar solicitud']);
      }
    } catch (e) {
      setFormErrors(['Error de conexión: ' + e.message]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddFromInfocompras = (p) => {
    addSkuRow({
      marca: p.MARCA,
      codigo_sku: p.ARTICULO1 || p.CODIGO_AFV,
      descripcion: p.DESCRIPCION,
      precio_mayoreo: p.PRECIO_MAYOREO,
      bdf: p.BDF
    });
    setInfocSearch('');
  };

  const handleBulkAdd = () => {
    const codes = bulkCodes.split(/[\n,]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    let addedCount = 0;
    codes.forEach(code => {
      const p = infocData.find(x =>
        x.ARTICULO1.toLowerCase() === code ||
        (x.CODIGO_AFV && x.CODIGO_AFV.toLowerCase() === code)
      );
      if (p) {
        addSkuRow({
          marca: p.MARCA,
          codigo_sku: p.ARTICULO1 || p.CODIGO_AFV,
          descripcion: p.DESCRIPCION,
          precio_mayoreo: p.PRECIO_MAYOREO,
          bdf: p.BDF
        });
        addedCount++;
      }
    });
    alert(`Se agregaron ${addedCount} productos.`);
    setBulkCodes('');
  };

  const rawTerms = infocSearch.trim().split(/[^a-z0-9à-ÿ]+/i).filter(t => t.length >= 2);
  const terms = rawTerms.map(normalizeText);
  const normQuery = normalizeText(infocSearch.trim());

  const searchResults = terms.length === 0 ? [] : infocData
    .filter(p => terms.some(t =>
      normalizeText(p.DESCRIPCION).includes(t) ||
      normalizeText(p.ARTICULO1).includes(t) ||
      normalizeText(p.CODIGO_AFV).includes(t) ||
      normalizeText(p.MARCA).includes(t)
    ))
    .map(p => ({ p, s: scoreProduct(p, terms, normQuery) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)
    .map(x => x.p);

  return (
    <Layout title="Nueva Solicitud" active="nueva">
      <h1>Nueva Solicitud de Negociación Especial</h1>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">👤 Datos del Cliente</div>
        <div className="grid-3">
          <div className="form-group">
            <label>Código de Cliente *</label>
            <input type="text" className="form-control" value={clienteCodigo} onChange={e => setClienteCodigo(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Nombre de Cliente *</label>
            <input type="text" className="form-control" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Número de Pedido</label>
            <input type="text" className="form-control" value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="form-group">
          <label>Justificación / Motivo *</label>
          <textarea className="form-control" rows="2" value={justificacion} onChange={e => setJustificacion(e.target.value)} required></textarea>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '14px', border: '2px solid #1a5276' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <strong style={{ fontSize: '14px' }}>🔍 Búsqueda de Productos — Infocompras</strong>
          <span style={{ fontSize: '12px', color: '#888' }}>
            {infocStatus === 'loading' ? 'Cargando Infocompras...' :
             infocStatus === 'ready' ? `✓ ${infocData.length.toLocaleString()} productos cargados` :
             infocStatus === 'error' ? '⚠ Error al cargar Infocompras' : 'Conectando...'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 0, marginBottom: '14px', borderBottom: '2px solid #eee' }}>
          <button className={`infoc-tab ${searchMode === 'single' ? 'active' : ''}`} onClick={() => setSearchMode('single')} style={searchMode === 'single' ? { borderBottom: '2px solid #1a5276', color: '#1a5276', fontWeight: 600 } : {}}>Búsqueda Individual</button>
          <button className={`infoc-tab ${searchMode === 'bulk' ? 'active' : ''}`} onClick={() => setSearchMode('bulk')} style={searchMode === 'bulk' ? { borderBottom: '2px solid #1a5276', color: '#1a5276', fontWeight: 600 } : {}}>Ingreso Masivo</button>
        </div>

        {searchMode === 'single' ? (
          <div>
            <div style={{ position: 'relative' }}>
              <input type="text" className="form-control" placeholder="Buscar por artículo, descripción, marca o código AFV..." value={infocSearch} onChange={e => setInfocSearch(e.target.value)} disabled={infocStatus !== 'ready'} />
              {infocSearch && searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', zIndex: 500, maxHeight: '320px', overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                  {searchResults.map(p => (
                    <div key={p.ARTICULO1 || p.CODIGO_AFV} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }} onClick={() => handleAddFromInfocompras(p)} onMouseEnter={e => e.currentTarget.style.background = '#f0f4f8'} onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.ARTICULO1 || p.CODIGO_AFV} &nbsp;·&nbsp; <span style={{ color: '#1a5276' }}>{p.MARCA}</span> {p.PRECIO_MAYOREO > 0 && ` — ${formatCRC(p.PRECIO_MAYOREO)}`}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{p.DESCRIPCION.substring(0, 90)} {p.BDF && <span style={{ color: '#1a5276', fontSize: '11px' }}>[BDF: {p.BDF}]</span>}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label style={{ fontSize: '13px', color: '#555' }}>Ingresa códigos de artículos (uno por línea o separados por comas)</label>
              <textarea className="form-control" placeholder="Ejemplo: 7008590, 3045020" style={{ minHeight: '130px', fontFamily: 'monospace' }} value={bulkCodes} onChange={e => setBulkCodes(e.target.value)} disabled={infocStatus !== 'ready'}></textarea>
            </div>
            <button className="btn btn-primary" onClick={handleBulkAdd} disabled={infocStatus !== 'ready'}>➕ Agregar Todos a Solicitud</button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '14px' }}>
        <div id="skuContainer">
          <div className="page-header" style={{ margin: '16px 0 8px' }}>
            <h3>Líneas de SKU</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => addSkuRow()}>+ Agregar Línea Manual</button>
          </div>
          
          {skus.map(s => (
            <div className="sku-row" key={s.id}>
              <div className="sku-header">
                <strong>Línea #{s.id}</strong>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSkuRow(s.id)}>✕ Quitar</button>
              </div>
              <div className="sku-marca-row">
                <div className="form-group">
                  <label>Marca *</label>
                  <select className="form-control" value={s.marca} onChange={e => updateSku(s.id, 'marca', e.target.value)}>
                    <option value="">-- Seleccione Marca --</option>
                    {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {s.bdf && <div style={{ fontSize: '11px', color: '#555', margin: '-4px 0 6px' }}>BDF: <strong style={{ color: '#1a5276' }}>{s.bdf}</strong></div>}
              </div>
              <div className="sku-fields">
                <div className="form-group"><label>Código SKU *</label><input type="text" className="form-control" value={s.codigo_sku} onChange={e => updateSku(s.id, 'codigo_sku', e.target.value)} /></div>
                <div className="form-group"><label>Descripción *</label><input type="text" className="form-control" value={s.descripcion} onChange={e => updateSku(s.id, 'descripcion', e.target.value)} /></div>
                <div className="form-group"><label>Cantidad *</label><input type="number" className="form-control" value={s.cantidad} onChange={e => updateSku(s.id, 'cantidad', e.target.value)} /></div>
                <div className="form-group"><label>Precio Mayoreo</label><input type="number" className="form-control" readOnly style={{ background: '#f0f8ff' }} value={s.precio_mayoreo} /></div>
                <div className="form-group"><label>Precio LPV *</label><input type="number" className="form-control" value={s.precio_base} onChange={e => updateSku(s.id, 'precio_base', e.target.value)} /></div>
                <div className="form-group"><label>% Desc. Sol. *</label><input type="number" className="form-control" value={s.pct} onChange={e => updateSku(s.id, 'pct', e.target.value)} /></div>
                <div className="form-group"><label>Precio Sol.</label><input type="number" className="form-control" value={s.psol} onChange={e => updateSku(s.id, 'psol', e.target.value)} /></div>
                <div className="form-group"><label>Monto Desc.</label><input type="text" className="form-control" readOnly value={formatCRC(s.mdesc)} /></div>
              </div>
              <div className="form-error">{getSkuError(s)}</div>
            </div>
          ))}
        </div>
        
        <div className="actions-bar" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-success" onClick={enviarSolicitud} disabled={isSubmitting}>{isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}</button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/')}>Cancelar</button>
        </div>
        
        {formErrors.length > 0 && (
          <div className="alert alert-danger" style={{ marginTop: '10px' }}>
            {formErrors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NuevaSolicitud;
