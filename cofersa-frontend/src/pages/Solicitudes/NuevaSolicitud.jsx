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

const dropdownStyle = {
  position: 'absolute',
  top: '100%',
  left: 0,
  right: 0,
  background: 'rgba(255, 255, 255, 0.96)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(226, 232, 240, 0.8)',
  borderRadius: '8px',
  zIndex: 100,
  maxHeight: '220px',
  overflowY: 'auto',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  marginTop: '4px',
};

const dropdownItemStyle = {
  padding: '10px 14px',
  cursor: 'pointer',
  borderBottom: '1px solid #f1f5f9',
  fontSize: '13px',
  transition: 'all 0.2s ease',
  color: '#334155',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center'
};

const NuevaSolicitud = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [clienteCodigo, setClienteCodigo] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const [numeroPedido, setNumeroPedido] = useState('');
  const [justificacion, setJustificacion] = useState('');
  
  // Autocomplete states for clients
  const [clientesList, setClientesList] = useState([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [showCodigoDropdown, setShowCodigoDropdown] = useState(false);
  const [showNombreDropdown, setShowNombreDropdown] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  const [skus, setSkus] = useState([]);
  const [skuCounter, setSkuCounter] = useState(0);

  const [searchMode, setSearchMode] = useState('single');
  const [infocSearch, setInfocSearch] = useState('');
  const [bulkCodes, setBulkCodes] = useState('');
  
  const [marcas, setMarcas] = useState([]);
  const [reglasDict, setReglasDict] = useState({});
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
        .select('*');
      if (!error && data) {
        const rulesMap = {};
        data.forEach(r => rulesMap[r.marca] = r);
        setReglasDict(rulesMap);
        
        const uniqueMarcas = [...new Set(data.map(r => r.marca))].sort();
        setMarcas(uniqueMarcas);
      }
    };

    loadInfoc();
    fetchMarcas();
  }, []);

  // Handle clicking outside to close client dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.client-autocomplete-container')) {
        setShowCodigoDropdown(false);
        setShowNombreDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search for Código de Cliente
  useEffect(() => {
    if (selectedClient && selectedClient.cod_cliente === clienteCodigo) {
      return;
    }
    if (!clienteCodigo.trim()) {
      setClientesList([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoadingClientes(true);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('cod_cliente, nombre_cliente')
          .ilike('cod_cliente', `%${clienteCodigo}%`)
          .limit(15);
        if (!error && data) {
          setClientesList(data);
        }
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoadingClientes(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [clienteCodigo, selectedClient]);

  // Debounced search for Nombre de Cliente
  useEffect(() => {
    if (selectedClient && selectedClient.nombre_cliente === clienteNombre) {
      return;
    }
    if (!clienteNombre.trim()) {
      setClientesList([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoadingClientes(true);
      try {
        const { data, error } = await supabase
          .from('clientes')
          .select('cod_cliente, nombre_cliente')
          .ilike('nombre_cliente', `%${clienteNombre}%`)
          .limit(15);
        if (!error && data) {
          setClientesList(data);
        }
      } catch (err) {
        console.error('Error fetching clients:', err);
      } finally {
        setLoadingClientes(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [clienteNombre, selectedClient]);

  const handleSelectCliente = (cli) => {
    setClienteCodigo(cli.cod_cliente);
    setClienteNombre(cli.nombre_cliente);
    setSelectedClient(cli);
    setShowCodigoDropdown(false);
    setShowNombreDropdown(false);
  };


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
          <div className="form-group client-autocomplete-container" style={{ position: 'relative' }}>
            <label>Código de Cliente *</label>
            <input 
              type="text" 
              className="form-control" 
              value={clienteCodigo} 
              onChange={e => {
                setClienteCodigo(e.target.value);
                setSelectedClient(null);
                setShowCodigoDropdown(true);
                setShowNombreDropdown(false);
              }} 
              onFocus={() => {
                if (clienteCodigo && (!selectedClient || selectedClient.cod_cliente !== clienteCodigo)) {
                  setShowCodigoDropdown(true);
                }
              }}
              disabled={submitting} 
              placeholder="Escriba el código..."
              autoComplete="off"
            />
            {showCodigoDropdown && (clientesList.length > 0 || loadingClientes) && (
              <div style={dropdownStyle}>
                {loadingClientes ? (
                  <div style={{ padding: '12px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>
                    🔍 Buscando...
                  </div>
                ) : (
                  clientesList.map(cli => (
                    <div 
                      key={cli.cod_cliente} 
                      style={dropdownItemStyle}
                      onClick={() => handleSelectCliente(cli)}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'inherit'; }}
                    >
                      <strong style={{ color: '#1a5276' }}>{cli.cod_cliente}</strong>
                      <span style={{ fontSize: '11px', color: '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }}>{cli.nombre_cliente}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="form-group client-autocomplete-container" style={{ position: 'relative' }}>
            <label>Nombre de Cliente *</label>
            <input 
              type="text" 
              className="form-control" 
              value={clienteNombre} 
              onChange={e => {
                setClienteNombre(e.target.value);
                setSelectedClient(null);
                setShowNombreDropdown(true);
                setShowCodigoDropdown(false);
              }} 
              onFocus={() => {
                if (clienteNombre && (!selectedClient || selectedClient.nombre_cliente !== clienteNombre)) {
                  setShowNombreDropdown(true);
                }
              }}
              disabled={submitting} 
              placeholder="Escriba el nombre..."
              autoComplete="off"
            />
            {showNombreDropdown && (clientesList.length > 0 || loadingClientes) && (
              <div style={dropdownStyle}>
                {loadingClientes ? (
                  <div style={{ padding: '12px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>
                    🔍 Buscando...
                  </div>
                ) : (
                  clientesList.map(cli => (
                    <div 
                      key={cli.cod_cliente} 
                      style={dropdownItemStyle}
                      onClick={() => handleSelectCliente(cli)}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'inherit'; }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: '500', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '200px' }}>{cli.nombre_cliente}</span>
                      <strong style={{ color: '#1a5276', fontSize: '11px' }}>{cli.cod_cliente}</strong>
                    </div>
                  ))
                )}
              </div>
            )}
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

            {/* Reglas de Aprobación */}
            {reglasDict[s.marca] && (
              <div style={{ marginBottom: '15px', padding: '8px 12px', backgroundColor: '#f8f9fa', borderRadius: '4px', borderLeft: '4px solid #1a5276', fontSize: '13px' }}>
                <span style={{ color: '#28a745' }}>• Vendedor hasta {reglasDict[s.marca].limite_vendedor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                <span style={{ color: '#ffc107' }}>• Supervisor hasta {reglasDict[s.marca].limite_supervisor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                <span style={{ color: '#dc3545' }}>• Compras ≥ {reglasDict[s.marca].limite_compras}%</span>
                <div style={{ marginTop: '4px', color: '#666', fontSize: '11px' }}>
                  {new Date().toLocaleString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase()} — {s.marca} <br/>
                </div>
              </div>
            )}

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

            {/* Estimado y Alerta de Aprobación */}
            {reglasDict[s.marca] && (
              <div style={{ marginTop: '15px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
                  Estimado gasto total ({s.marca}): <span style={{ color: '#28a745' }}>{formatCRC((parseFloat(s.cantidad) || 0) * (parseFloat(s.precio_base) || 0))}</span>
                </div>

                {(() => {
                  const pct = parseFloat(s.pct) || 0;
                  
                  if (pct <= reglasDict[s.marca].limite_vendedor) {
                    return (
                      <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #c3e6cb' }}>
                        ✓ Esta solicitud puede autoaprobarse por el vendedor.
                      </div>
                    );
                  } else if (pct <= reglasDict[s.marca].limite_supervisor) {
                    return (
                      <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #ffeeba' }}>
                        ⚠️ Esta solicitud requiere la aprobación del SUPERVISOR.
                      </div>
                    );
                  } else {
                    return (
                      <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #f5c6cb' }}>
                        ❌ Esta solicitud requiere la aprobación de COMPRAS.
                      </div>
                    );
                  }
                })()}
              </div>
            )}
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
