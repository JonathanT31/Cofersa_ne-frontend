import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';

import { ENDPOINTS } from '../../api/endpoints';
import { httpClient } from '../../api/httpClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const NuevaSolicitud = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clienteCodigo, setClienteCodigo] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [justificacion, setJustificacion] = useState('');
  
  const [skus, setSkus] = useState([]);
  const [skuCounter, setSkuCounter] = useState(0);

  const [searchMode, setSearchMode] = useState('single');
  const [infocSearch, setInfocSearch] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  const [infocomprasData, setInfocomprasData] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [loadingInfoc, setLoadingInfoc] = useState(false);

  const [formErrors, setFormErrors] = useState([]);

  React.useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingInfoc(true);
        const resInfoc = await httpClient(ENDPOINTS.catalogo.buscar);
        setInfocomprasData(resInfoc.products || []);

        const resMarcas = await httpClient(ENDPOINTS.catalogo.marcas);
        setMarcas(resMarcas.marcas || []);
      } catch (err) {
        console.error("Error loading initial data:", err);
      } finally {
        setLoadingInfoc(false);
      }
    };
    loadData();
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
        precio_mayoreo: initialData.precio_mayoreo || '',
        precio_base: initialData.precio_base || '',
        pct: '',
        psol: '',
        mdesc: 0,
        bdf: '',
        lastEdited: 'pct'
      }
    ]);
  };

  const removeSkuRow = (id) => {
    setSkus(skus.filter(s => s.id !== id));
  };

  const updateSku = (id, field, value) => {
    setSkus(skus.map(s => {
      if (s.id !== id) return s;
      const updated = { ...s, [field]: value };

      // Cálculos si los números cambian
      if (['cantidad', 'precio_base', 'pct', 'psol'].includes(field)) {
        const cant = parseFloat(updated.cantidad) || 1;
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

    skus.forEach((s) => {
      const lpv = parseFloat(s.precio_base) || 0;
      const pct = parseFloat(s.pct) || 0;
      const psol = parseFloat(s.psol) || 0;
      const cant = parseFloat(s.cantidad) || 0;
      const mdesc = s.mdesc;

      if (!s.marca) errors.push(`Línea #${s.id}: Seleccione una marca.`);
      if (!s.codigo_sku.trim()) errors.push(`Línea #${s.id}: Código SKU requerido.`);
      if (!s.descripcion.trim()) errors.push(`Línea #${s.id}: Descripción requerida.`);
      if (cant <= 0) errors.push(`Línea #${s.id}: Cantidad debe ser mayor a 0.`);
      if (lpv <= 0) errors.push(`Línea #${s.id}: Precio LPV debe ser mayor a 0.`);
      if (pct <= 0) errors.push(`Línea #${s.id}: El % de descuento debe ser mayor a 0.`);
      if (pct > 100) errors.push(`Línea #${s.id}: Descuento no puede ser mayor a 100%.`);
      if (psol >= lpv && pct > 0) errors.push(`Línea #${s.id}: Precio solicitado no puede ser igual o mayor al Precio LPV.`);
      if (mdesc <= 0 && pct > 0) errors.push(`Línea #${s.id}: Monto Desc. ₡ no puede ser cero. Verifique el Precio LPV y % descuento.`);
    });

    setFormErrors(errors);

    if (errors.length === 0) {
      try {
        const payload = {
          cliente_codigo: clienteCodigo,
          cliente_nombre: clienteNombre,
          numero_pedido: numeroPedido,
          justificacion: justificacion,
          skus: skus.map(s => ({
            marca: s.marca,
            codigo_sku: s.codigo_sku,
            descripcion: s.descripcion,
            cantidad: parseFloat(s.cantidad),
            precio_base: parseFloat(s.precio_base),
            porcentaje_descuento_sol: parseFloat(s.pct),
            precio_solicitado: parseFloat(s.psol),
            monto_descuento: s.mdesc,
            bdf: s.bdf
          }))
        };

        const res = await fetch(ENDPOINTS.solicitudes.create, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': user?.id || ''
          },
          body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
          alert("Solicitud enviada con éxito.");
          navigate('/mis-solicitudes');
        } else {
          setFormErrors([result.detail || "Error al enviar la solicitud"]);
        }
      } catch (err) {
        setFormErrors(["Error de conexión con el servidor"]);
      }
    }
  };

  const cancelarNueva = () => {
    if (window.confirm('¿Descartar solicitud? Se perderán los datos ingresados.')) {
      navigate('/');
    }
  };

  const searchResults = infocSearch.trim() === '' ? [] : infocomprasData.filter(p =>
    p.codigo_articulo.toLowerCase().includes(infocSearch.toLowerCase()) ||
    p.descripcion.toLowerCase().includes(infocSearch.toLowerCase()) ||
    p.marca.toLowerCase().includes(infocSearch.toLowerCase()) ||
    p.codigo_afv.toLowerCase().includes(infocSearch.toLowerCase())
  );

  const handleAddFromInfocompras = (producto) => {
    addSkuRow({
      marca: producto.marca,
      codigo_sku: producto.codigo_articulo,
      descripcion: producto.descripcion,
      precio_mayoreo: producto.precio_mayoreo,
      precio_base: producto.precio_lista
    });
    setInfocSearch('');
  };

  const handleBulkAdd = () => {
    const lines = bulkCodes.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    let addedCount = 0;
    lines.forEach(code => {
      const match = infocomprasData.find(p => p.codigo_articulo === code);
      if (match) {
        addSkuRow({
          marca: match.marca,
          codigo_sku: match.codigo_articulo,
          descripcion: match.descripcion,
          precio_mayoreo: match.precio_mayoreo,
          precio_base: match.precio_lista
        });
        addedCount++;
      }
    });
    alert(`Se agregaron ${addedCount} productos de ${lines.length} códigos ingresados.`);
    setBulkCodes('');
  };

  return (
    <Layout title="Nueva Solicitud" active="nueva">
      <h1>Nueva Solicitud de Negociación Especial</h1>

      {/* 1. Sección del cliente primero */}
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

      {/* 2. Tarjeta de búsqueda Infocompras */}
      <div className="card" style={{ marginBottom: '14px', border: '2px solid #1a5276' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <strong style={{ fontSize: '14px' }}>🔍 Búsqueda de Productos — Infocompras</strong>
            <label style={{ fontSize: '12px', color: '#888' }}>
              {loadingInfoc ? 'Conectando con Infocompras...' : `${infocomprasData.length} productos cargados`}
            </label>
        </div>

        <div style={{ display: 'flex', gap: 0, marginBottom: '14px', borderBottom: '2px solid #eee' }}>
          <button 
            className={`infoc-tab ${searchMode === 'single' ? 'active' : ''}`} 
            onClick={() => setSearchMode('single')}
            style={searchMode === 'single' ? { borderBottom: '2px solid #1a5276', color: '#1a5276', fontWeight: 600 } : {}}
          >
            Búsqueda Individual
          </button>
          <button 
            className={`infoc-tab ${searchMode === 'bulk' ? 'active' : ''}`} 
            onClick={() => setSearchMode('bulk')}
            style={searchMode === 'bulk' ? { borderBottom: '2px solid #1a5276', color: '#1a5276', fontWeight: 600 } : {}}
          >
            Ingreso Masivo
          </button>
        </div>

        {searchMode === 'single' ? (
          <div>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Buscar por artículo, descripción, marca o código AFV..." 
                value={infocSearch}
                onChange={e => setInfocSearch(e.target.value)}
              />
              {infocSearch && searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  {searchResults.map(p => (
                    <div 
                      key={p.codigo_articulo} 
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '13px' }}
                      onClick={() => handleAddFromInfocompras(p)}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                    >
                      <strong style={{ color: '#1a5276' }}>{p.codigo_articulo}</strong> - {p.descripcion} <span style={{ color: '#888' }}>({p.marca} | {p.codigo_afv})</span>
                      <div style={{ fontSize: '11px', color: '#555' }}>LPV: {formatCRC(p.precio_lista)} | Mayoreo: {formatCRC(p.precio_mayoreo)}</div>
                    </div>
                  ))}
                </div>
              )}
              {infocSearch && searchResults.length === 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', zIndex: 10, padding: '8px 12px', fontSize: '13px', color: '#888' }}>
                  No se encontraron resultados
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '6px' }}>
              💡 Busca y haz click para agregar un producto a la vez. Marca, código, descripción y precio se llenan automáticamente.
            </div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label style={{ fontSize: '13px', color: '#555' }}>Ingresa códigos de artículos (uno por línea o separados por comas)</label>
              <textarea 
                className="form-control" 
                placeholder={`Ejemplo:\n7008590\n3045020\n5203003\n\nO separados por comas: 7008590, 3045020, 5203003`}
                style={{ minHeight: '130px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                value={bulkCodes}
                onChange={e => setBulkCodes(e.target.value)}
              ></textarea>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={handleBulkAdd}>➕ Agregar Todos a Solicitud</button>
            </div>
            <div style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
              💡 Pega una lista completa de códigos y se agregarán automáticamente.
            </div>
          </div>
        )}
      </div>

      {/* Formulario principal de solicitud */}
      <div className="card" style={{ marginTop: '14px' }}>
        <div id="skuContainer">
          <div className="page-header" style={{ margin: '16px 0 8px' }}>
            <h3>Líneas de SKU</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={addSkuRow}>+ Agregar Línea Manual</button>
          </div>
          
          {skus.map(s => (
            <div className="sku-row" key={s.id} id={`sku_${s.id}`}>
              <div className="sku-header">
                <strong>Línea #{s.id}</strong>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSkuRow(s.id)}>✕ Quitar</button>
              </div>
              <div className="sku-marca-row">
                <div className="form-group">
                  <label>Marca *</label>
                  <select className="form-control sku-marca" value={s.marca} onChange={e => updateSku(s.id, 'marca', e.target.value)}>
                    <option value="">-- Seleccione Marca --</option>
                    {marcas.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <div className="ranges-info" style={{ fontSize: '12px', color: '#555', padding: '6px 0' }}>
                    {s.marca ? `Rangos para ${s.marca} (Simulado)` : 'Seleccione una marca para ver rangos de aprobación'}
                  </div>
                </div>
              </div>
              <div className="sku-fields">
                <div className="form-group"><label>Código SKU *</label><input type="text" className="form-control" value={s.codigo_sku} onChange={e => updateSku(s.id, 'codigo_sku', e.target.value)} /></div>
                <div className="form-group"><label>Descripción *</label><input type="text" className="form-control" value={s.descripcion} onChange={e => updateSku(s.id, 'descripcion', e.target.value)} /></div>
                <div className="form-group"><label>Cantidad *</label><input type="number" className="form-control" min="0.01" step="any" value={s.cantidad} onChange={e => updateSku(s.id, 'cantidad', e.target.value)} /></div>
                <div className="form-group"><label>Precio Mayoreo ₡</label><input type="number" className="form-control" readOnly style={{ background: '#f0f8ff' }} value={s.precio_mayoreo} /></div>
                <div className="form-group"><label>Precio LPV ₡ *</label><input type="number" className="form-control" min="0" step="any" value={s.precio_base} onChange={e => updateSku(s.id, 'precio_base', e.target.value)} title="Precio Lista de Precio de Venta" /></div>
                <div className="form-group"><label>% Desc. Sol. *</label><input type="number" className="form-control" min="0" max="100" step="0.01" value={s.pct} onChange={e => updateSku(s.id, 'pct', e.target.value)} /></div>
                <div className="form-group"><label>Precio Sol. ₡</label><input type="number" className="form-control" min="0" step="any" value={s.psol} onChange={e => updateSku(s.id, 'psol', e.target.value)} /></div>
                <div className="form-group"><label>Monto Desc. ₡</label><input type="text" className="form-control" readOnly style={{ background: '#f8f8f8' }} value={formatCRC(s.mdesc)} /></div>
              </div>
              <div className="form-error" style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '3px' }}>
                {getSkuError(s)}
              </div>
            </div>
          ))}

        </div>
        
        <div className="actions-bar" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-success" style={{ fontSize: '15px' }} onClick={enviarSolicitud}>Enviar Solicitud</button>
          <button type="button" className="btn btn-outline" onClick={cancelarNueva}>Cancelar</button>
        </div>
        
        {formErrors.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <div className="alert alert-danger">
              {formErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default NuevaSolicitud;
