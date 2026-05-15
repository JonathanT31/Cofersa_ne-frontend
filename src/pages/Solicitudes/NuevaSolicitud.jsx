import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { infocomprasService } from '../../api/infocomprasService';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const NuevaSolicitud = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [clienteCodigo, setClienteCodigo] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [justificacion, setJustificacion] = useState('');
  
  const [skus, setSkus] = useState([]);
  const [skuCounter, setSkuCounter] = useState(0);

  const [searchMode, setSearchMode] = useState('single');
  const [infocSearch, setInfocSearch] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  
  const [marcas, setMarcas] = useState([]);
  const [infocStatus, setInfocStatus] = useState('loading');
  const [formErrors, setFormErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Load Infocompras data
    const loadInfoc = async () => {
      try {
        setInfocStatus('loading');
        await infocomprasService.loadData();
        setInfocStatus('ready');
      } catch (err) {
        setInfocStatus('error');
      }
    };
    
    // Fetch available brands from rules
    const fetchMarcas = async () => {
      const { data, error } = await supabase
        .from('reglas')
        .select('marca');
      if (!error && data) {
        const uniqueMarcas = [...new Set(data.map(r => r.marca))].sort();
        setMarcas(uniqueMarcas);
      }
    };

    loadInfoc();
    fetchMarcas();
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
        bdf: initialData.bdf || '',
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

  const enviarSolicitud = async () => {
    const errors = [];
    if (!clienteCodigo.trim()) errors.push('Código de cliente es requerido.');
    if (!clienteNombre.trim()) errors.push('Nombre de cliente es requerido.');
    if (!justificacion.trim()) errors.push('Justificación es requerida.');
    if (!skus.length) errors.push('Debe agregar al menos una línea de SKU.');

    skus.forEach((s) => {
      if (!s.marca) errors.push(`Línea #${s.id}: Seleccione una marca.`);
      if (!s.codigo_sku.trim()) errors.push(`Línea #${s.id}: Código SKU requerido.`);
      if (parseFloat(s.cantidad) <= 0) errors.push(`Línea #${s.id}: Cantidad debe ser mayor a 0.`);
      if (parseFloat(s.precio_base) <= 0) errors.push(`Línea #${s.id}: Precio LPV debe ser mayor a 0.`);
    });

    setFormErrors(errors);

    if (errors.length === 0) {
      setSubmitting(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/solicitudes/crear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cliente_codigo: clienteCodigo,
            cliente_nombre: clienteNombre,
            numero_pedido: numeroPedido,
            justificacion,
            skus: skus.map(s => ({
              marca: s.marca,
              codigo_sku: s.codigo_sku,
              descripcion: s.descripcion,
              cantidad: parseFloat(s.cantidad),
              precio_base: parseFloat(s.precio_base),
              porcentaje_descuento_sol: parseFloat(s.pct),
              monto_descuento: s.mdesc,
              bdf: s.bdf
            })),
            vendedor_id: user?.id
          })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Error al crear solicitud');

        alert("Solicitud creada con éxito.");
        navigate('/mis-solicitudes');
      } catch (err) {
        console.error('Error submitting:', err);
        setFormErrors([err.message]);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const searchResults = infocomprasService.search(infocSearch);

  const handleAddFromInfocompras = (producto) => {
    addSkuRow({
      marca: producto.MARCA,
      codigo_sku: producto.ARTICULO1,
      descripcion: producto.DESCRIPCION,
      precio_mayoreo: producto.PRECIO_MAYOREO,
      precio_base: producto.PRECIO_MAYOREO, // Often used as base or from another column
      bdf: producto.BDF
    });
    setInfocSearch('');
  };

  const handleBulkAdd = () => {
    const lines = bulkCodes.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    let addedCount = 0;
    lines.forEach(code => {
      const match = infocomprasService.data.find(p => p.ARTICULO1 === code);
      if (match) {
        handleAddFromInfocompras(match);
        addedCount++;
      }
    });
    alert(`Se agregaron ${addedCount} productos de ${lines.length} códigos ingresados.`);
    setBulkCodes('');
  };

  return (
    <Layout title="Nueva Solicitud" active="nueva">
      <h1>Nueva Solicitud de Negociación Especial</h1>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">👤 Datos del Cliente</div>
        <div className="grid-3">
          <div className="form-group">
            <label>Código de Cliente *</label>
            <input type="text" className="form-control" value={clienteCodigo} onChange={e => setClienteCodigo(e.target.value)} disabled={submitting} />
          </div>
          <div className="form-group">
            <label>Nombre de Cliente *</label>
            <input type="text" className="form-control" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} disabled={submitting} />
          </div>
          <div className="form-group">
            <label>Número de Pedido</label>
            <input type="text" className="form-control" value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} placeholder="Opcional" disabled={submitting} />
          </div>
        </div>
        <div className="form-group">
          <label>Justificación / Motivo *</label>
          <textarea className="form-control" rows="2" value={justificacion} onChange={e => setJustificacion(e.target.value)} disabled={submitting}></textarea>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '14px', border: '2px solid #1a5276' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          <strong style={{ fontSize: '14px' }}>🔍 Búsqueda de Productos — Infocompras</strong>
          <span style={{ fontSize: '12px', color: infocStatus === 'error' ? 'red' : '#888' }}>
            {infocStatus === 'loading' ? 'Cargando Infocompras...' : 
             infocStatus === 'error' ? 'Error al cargar Infocompras' : 
             `${infocomprasService.data.length.toLocaleString()} productos cargados`}
          </span>
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
                disabled={infocStatus !== 'ready' || submitting}
              />
              {infocSearch && searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  {searchResults.map(p => (
                    <div 
                      key={p.ARTICULO1} 
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '13px' }}
                      onClick={() => handleAddFromInfocompras(p)}
                    >
                      <strong style={{ color: '#1a5276' }}>{p.ARTICULO1}</strong> - {p.DESCRIPCION} <span style={{ color: '#888' }}>({p.MARCA})</span>
                      <div style={{ fontSize: '11px', color: '#555' }}>Precio: {formatCRC(p.PRECIO_MAYOREO)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <textarea 
              className="form-control" 
              placeholder="Ingresa códigos..." 
              style={{ minHeight: '100px' }}
              value={bulkCodes}
              onChange={e => setBulkCodes(e.target.value)}
              disabled={infocStatus !== 'ready' || submitting}
            ></textarea>
            <button className="btn btn-primary" onClick={handleBulkAdd} disabled={submitting}>Agregar Masivo</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="page-header" style={{ marginBottom: '14px' }}>
          <h3>Líneas de SKU</h3>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => addSkuRow()} disabled={submitting}>+ Agregar Manual</button>
        </div>
        
        {skus.map(s => (
          <div className="sku-row card" key={s.id} style={{ marginBottom: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <strong>Línea #{s.id}</strong>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSkuRow(s.id)} disabled={submitting}>✕</button>
            </div>
            <div className="grid-3">
              <div className="form-group">
                <label>Marca *</label>
                <select className="form-control" value={s.marca} onChange={e => updateSku(s.id, 'marca', e.target.value)} disabled={submitting}>
                  <option value="">-- Seleccione --</option>
                  {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Código SKU *</label>
                <input type="text" className="form-control" value={s.codigo_sku} onChange={e => updateSku(s.id, 'codigo_sku', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Descripción *</label>
                <input type="text" className="form-control" value={s.descripcion} onChange={e => updateSku(s.id, 'descripcion', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Cantidad *</label>
                <input type="number" className="form-control" value={s.cantidad} onChange={e => updateSku(s.id, 'cantidad', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Precio LPV ₡ *</label>
                <input type="number" className="form-control" value={s.precio_base} onChange={e => updateSku(s.id, 'precio_base', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>% Desc. Sol. *</label>
                <input type="number" className="form-control" value={s.pct} onChange={e => updateSku(s.id, 'pct', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Monto Desc. ₡</label>
                <input type="text" className="form-control" readOnly style={{ background: '#f8f8f8' }} value={formatCRC(s.mdesc)} />
              </div>
            </div>
          </div>
        ))}

        <div className="actions-bar" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-success" onClick={enviarSolicitud} disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar Solicitud'}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => navigate('/')} disabled={submitting}>Cancelar</button>
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
