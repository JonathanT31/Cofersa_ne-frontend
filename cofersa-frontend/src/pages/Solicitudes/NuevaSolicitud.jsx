import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/layout/Layout';
import { infocomprasService } from '../../api/infocomprasService';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import { fuzzySearch, highlightText, MOCK_PRODUCTS } from '../../utils/searchMatcher.jsx';

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
  const [listaPrecios, setListaPrecios] = useState('');
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
  
  const [presupuestoByMarca, setPresupuestoByMarca] = useState({});
  const [gastoByMarca, setGastoByMarca] = useState({});
  
  const [marcas, setMarcas] = useState([]);
  const [reglasDict, setReglasDict] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef(null);

  // Brand Badge Style Helper
  const getBrandBadgeStyle = (brand) => {
    const b = (brand || '').toUpperCase();
    let bg = '#f1f5f9', text = '#475569', border = '#e2e8f0';
    if (b.includes('3M')) { bg = '#fee2e2'; text = '#ef4444'; border = '#fca5a5'; }
    else if (b.includes('BOSCH')) { bg = '#e0f2fe'; text = '#0284c7'; border = '#bae6fd'; }
    else if (b.includes('WD') || b.includes('40')) { bg = '#fef3c7'; text = '#d97706'; border = '#fde68a'; }
    else if (b.includes('STAN') || b.includes('STA')) { bg = '#fffbeb'; text = '#b45309'; border = '#fef3c7'; }
    else if (b.includes('AMA')) { bg = '#ccfbf1'; text = '#0d9488'; border = '#99f6e4'; }
    else if (b.includes('URR')) { bg = '#f3e8ff'; text = '#7c3aed'; border = '#e9d5ff'; }
    else if (b.includes('SUR')) { bg = '#dcfce7'; text = '#15803d'; border = '#bbf7d0'; }
    return {
      backgroundColor: bg,
      color: text,
      border: `1px solid ${border}`,
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
      display: 'inline-block'
    };
  };

  useEffect(() => {
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

    fetchMarcas();
  }, []);

  useEffect(() => {
    const fetchPresupuestoYGasto = async () => {
      if (!user) return;
      
      try {
        const { data: profilesData } = await supabase.from('profiles').select('*');
        const profilesMap = {};
        if (profilesData) {
          profilesData.forEach(p => profilesMap[p.id] = p);
        }

        const { data: pptoData } = await supabase.from('presupuesto').select('*');
        const budgetMap = {};
        if (pptoData) {
          pptoData.forEach(p => {
            const pptoVal = p.ppto_mensual_crc || p.ppto_mensual || 0;
            
            const matchName = (field, targetStr) => {
              if (!field || !targetStr) return false;
              return field.trim().toLowerCase() === targetStr.trim().toLowerCase();
            };

            const matchAsesor = p.asesor && user && (
              matchName(p.asesor, user.username) || 
              matchName(p.asesor, user.nombre) || 
              matchName(p.asesor, user.email)
            );

            // Siempre mostrar solo el presupuesto del usuario logueado como asesor
            if (matchAsesor) {
              budgetMap[p.marca] = (budgetMap[p.marca] || 0) + pptoVal;
            }
          });
        }
        setPresupuestoByMarca(budgetMap);

        const { data: skusData } = await supabase.from('solicitud_skus')
          .select(`
            marca, 
            monto_aprobado, 
            monto_descuento,
            solicitud:solicitudes(id, vendedor_id, estado)
          `);

        const gastoMap = {};
        if (skusData && skusData.length > 0) {
          skusData.forEach(sku => {
            const s = sku.solicitud;
            if (!s || s.estado === 'rechazada' || s.estado === 'cancelada') return;

            // Siempre mostrar solo el gasto de las solicitudes creadas por el usuario logueado
            if (s.vendedor_id === user.id && sku.marca) {
              const val = sku.monto_aprobado || sku.monto_descuento || 0;
              gastoMap[sku.marca] = (gastoMap[sku.marca] || 0) + val;
            }
          });
        }
        setGastoByMarca(gastoMap);
      } catch(err) {
        console.error("Error fetching ppto/gasto", err);
      }
    };
    
    fetchPresupuestoYGasto();
  }, [user]);

  // Debounced search for products (Smart Webhook + Fuzzy Filter + Fallback)
  useEffect(() => {
    if (!infocSearch.trim()) {
      setSearchResults([]);
      return;
    }
    if (!clienteCodigo.trim() || !clienteNombre.trim() || !listaPrecios.trim()) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setLoadingProducts(true);
      try {
        let results = [];
        // Extract the primary query token. We prioritize non-brand tokens, and numeric/specific tokens to prevent query truncation.
        const tokens = infocSearch.trim().split(/\s+/).filter(Boolean);
        const nonBrandTokens = tokens.filter(t => {
          const upperT = t.toUpperCase();
          return !marcas.some(m => m.toUpperCase() === upperT || m.toUpperCase().includes(upperT));
        });
        
        const candidates = nonBrandTokens.length > 0 ? nonBrandTokens : tokens;
        let primaryToken = "";
        
        // Prioritize numeric tokens, otherwise the longest token
        const numericToken = candidates.find(t => /^\d+$/.test(t));
        if (numericToken) {
          primaryToken = numericToken;
        } else {
          primaryToken = candidates.reduce((max, t) => t.length > max.length ? t : max, "");
        }
        
        if (primaryToken) {
          results = await infocomprasService.search(/*primaryToken*/infocSearch, clienteCodigo, clienteNombre, listaPrecios);
        }
        
        // Filter and score the candidates locally using our fuzzy out-of-order search
        let filtered = fuzzySearch(results, infocSearch);
        
        // Fallback to local catalog if no matches or if service returns empty
        if (filtered.length === 0) {
          filtered = fuzzySearch(MOCK_PRODUCTS, infocSearch);
        }
        
        setSearchResults(filtered);
      } catch (err) {
        console.warn('Webhook search failed; falling back to local catalog search:', err);
        const filtered = fuzzySearch(MOCK_PRODUCTS, infocSearch);
        setSearchResults(filtered);
      } finally {
        setLoadingProducts(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [infocSearch, clienteCodigo, clienteNombre, listaPrecios]);

  // Reset focus index when results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchResults, infocSearch]);

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
          .select('cod_cliente, nombre_cliente, lista_precios')
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
          .select('cod_cliente, nombre_cliente, lista_precios')
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
    setListaPrecios(cli.lista_precios);
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
        precio: initialData.precio || '',
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

  // Función para verificar si un SKU excede el presupuesto disponible
  const checkPresupuestoExcedido = (sku) => {
    if (!sku.marca) return false;
    
    const presupuestoTotal = presupuestoByMarca[sku.marca] || 0;
    const gastoActual = gastoByMarca[sku.marca] || 0;
    const presupuestoDisponible = presupuestoTotal - gastoActual;
    
    // Calcular el monto total de esta solicitud para la misma marca
    const montoTotalSolicitud = skus
      .filter(s => s.marca === sku.marca && s.id !== sku.id)
      .reduce((total, s) => total + (parseFloat(s.mdesc) || 0), 0);
    
    const montoEsteSku = parseFloat(sku.mdesc) || 0;
    const montoTotalMarca = montoTotalSolicitud + montoEsteSku;
    
    return montoTotalMarca > presupuestoDisponible;
  };

  const enviarSolicitud = async () => {
    const errors = [];
    if (!clienteCodigo.trim()) errors.push('Código de cliente es requerido.');
    if (!clienteNombre.trim()) errors.push('Nombre de cliente es requerido.');
    if (!justificacion.trim()) errors.push('Justificación es requerida.');
    if (!skus.length) errors.push('Debe agregar al menos una línea de SKU.');

    // Validación de presupuesto en frontend
    const excedidosPresupuesto = [];
    const montoPorMarca = {};
    
    // Calcular monto total por marca en la solicitud
    skus.forEach((s) => {
      if (!s.marca) errors.push(`Línea #${s.id}: Seleccione una marca.`);
      if (!s.codigo_sku.trim()) errors.push(`Línea #${s.id}: Código SKU requerido.`);
      if (parseFloat(s.cantidad) <= 0) errors.push(`Línea #${s.id}: Cantidad debe ser mayor a 0.`);
      if (parseFloat(s.precio_base) <= 0) errors.push(`Línea #${s.id}: Precio LPV debe ser mayor a 0.`);
      
      if (s.marca) {
        const monto = parseFloat(s.mdesc) || 0;
        montoPorMarca[s.marca] = (montoPorMarca[s.marca] || 0) + monto;
      }
    });

    // Verificar presupuesto para cada marca
    Object.keys(montoPorMarca).forEach(marca => {
      const presupuestoTotal = presupuestoByMarca[marca] || 0;
      const gastoActual = gastoByMarca[marca] || 0;
      const montoSolicitud = montoPorMarca[marca];
      const disponible = presupuestoTotal - gastoActual;
      
      if (presupuestoTotal <= 0) {
        excedidosPresupuesto.push(`**${marca}**: No tiene presupuesto asignado. Solicitud: ₡${montoSolicitud.toFixed(2)}`);
      } else if (montoSolicitud > disponible) {
        excedidosPresupuesto.push(`**${marca}**: Solicitud ₡${montoSolicitud.toFixed(2)} > Disponible ₡${disponible.toFixed(2)} (Total: ₡${presupuestoTotal.toFixed(2)}, Gasto: ₡${gastoActual.toFixed(2)})`);
      }
    });

    if (excedidosPresupuesto.length > 0) {
      errors.push('⚠️ **PRESUPUESTO INSUFICIENTE**');
      errors.push(...excedidosPresupuesto);
      errors.push('Por favor, ajuste los montos de descuento o contacte a su supervisor.');
    }

    setFormErrors(errors);

    if (errors.length === 0) {
      setSubmitting(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/solicitudes/crear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo_solicitud: 'Crear',
            cliente_codigo: clienteCodigo,
            cliente_nombre: clienteNombre,
            lista_precios: listaPrecios,
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

  const handleAddFromInfocompras = (producto) => {
    addSkuRow({
      marca: producto.MARCA,
      codigo_sku: producto.ARTICULO1,
      descripcion: producto.DESCRIPCION,
      precio: producto.PRECIO,
      precio_base: producto.PRECIO,
      bdf: producto.BDF
    });
    setInfocSearch('');
  };

  const handleBulkAdd = async () => {
    if (!clienteCodigo.trim() || !clienteNombre.trim() || !listaPrecios.trim()) {
      alert("Debe seleccionar un cliente con una lista de precios válida antes de agregar productos masivamente.");
      return;
    }
    
    const lines = bulkCodes.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 0) return;

    setSubmitting(true);
    try {
      const matches = await infocomprasService.bulkSearch(lines, clienteCodigo, clienteNombre, listaPrecios);
      
      if (matches.length === 0) {
        alert("No se encontraron productos coincidentes para los códigos ingresados.");
        return;
      }

      let addedCount = 0;
      setSkus(prevSkus => {
        let currentIdBase = prevSkus.length > 0 ? Math.max(...prevSkus.map(s => s.id)) : 0;
        
        const newRows = matches.map(match => {
          currentIdBase++;
          addedCount++;
          return {
            id: currentIdBase,
            marca: match.MARCA || '',
            codigo_sku: match.ARTICULO || '',
            descripcion: match.DESCRIPCION || '',
            cantidad: 1,
            precio: match.PRECIO || '',
            precio_base: match.PRECIO || '',
            pct: '',
            psol: '',
            mdesc: 0,
            bdf: match.BDF || '',
            lastEdited: 'pct'
          };
        });

        setSkuCounter(currentIdBase);
        
        return [...prevSkus, ...newRows];
      });
      
      alert(`Se agregaron ${lines.length} productos exitosamente.`);
      setBulkCodes('');
    } catch (err) {
      console.error('Error in bulk search execution:', err);
      alert('Ocurrió un error al procesar la búsqueda masiva en el servidor.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="Nueva Solicitud" active="nueva">
      <h1>Nueva Solicitud de Negociación Especial</h1>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-header">👤 Datos del Cliente</div>
        <div className="grid-4">
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
            <label>Lista de Precios</label>
            <input 
              type="text" 
              className="form-control" 
              value={listaPrecios} 
              onChange={e => setListaPrecios(e.target.value)} 
              placeholder="LPV1" 
              disabled={submitting} 
            />
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
          <strong style={{ fontSize: '14px' }}>🔍 Búsqueda de Productos — Webhook n8n</strong>
          <span style={{ fontSize: '12px', color: !clienteCodigo.trim() || !clienteNombre.trim() ? '#dc3545' : '#888' }}>
            {!clienteCodigo.trim() || !clienteNombre.trim() ? '⚠️ Seleccione un cliente primero' : 
             loadingProducts ? 'Buscando...' : 'Listo'}
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
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input 
                  ref={searchInputRef}
                  type="text" 
                  className="form-control" 
                  style={{ paddingRight: infocSearch ? '36px' : '12px' }}
                  placeholder={clienteCodigo.trim() && clienteNombre.trim() ? "Buscar por artículo, descripción, marca..." : "⚠️ Debe seleccionar un cliente antes de buscar..."} 
                  value={infocSearch}
                  onChange={e => setInfocSearch(e.target.value)}
                  onKeyDown={e => {
                    if (searchResults.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setFocusedIndex(prev => (prev + 1) % searchResults.length);
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setFocusedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (focusedIndex >= 0 && focusedIndex < searchResults.length) {
                        handleAddFromInfocompras(searchResults[focusedIndex]);
                        setFocusedIndex(-1);
                      }
                    } else if (e.key === 'Escape') {
                      setSearchResults([]);
                      setFocusedIndex(-1);
                    }
                  }}
                  disabled={!clienteCodigo.trim() || !clienteNombre.trim() || submitting}
                  autoComplete="off"
                />
                {infocSearch && (
                  <button 
                    type="button"
                    onClick={() => { setInfocSearch(''); setSearchResults([]); setFocusedIndex(-1); searchInputRef.current?.focus(); }}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      borderRadius: '50%'
                    }}
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>
              {infocSearch && (loadingProducts || searchResults.length > 0 || (infocSearch.trim().length >= 2 && !loadingProducts)) && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(12px)',
                  border: '1px solid rgba(26, 82, 118, 0.2)',
                  borderRadius: '8px',
                  zIndex: 100,
                  maxHeight: '260px',
                  overflowY: 'auto',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  marginTop: '6px'
                }}>
                  {/* Dropdown Header Info */}
                  <div style={{ padding: '6px 12px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc' }}>
                    <span>💡 Búsqueda Inteligente</span>
                    <span>{searchResults.length} {searchResults.length === 1 ? 'coincidencia' : 'coincidencias'}</span>
                  </div>
                  
                  {loadingProducts ? (
                    <div style={{ padding: '16px', color: '#64748b', textAlign: 'center', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <span className="animate-spin">⏳</span> Buscando productos...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((p, index) => {
                      const isFocused = index === focusedIndex;
                      return (
                        <div 
                          key={p.ARTICULO1} 
                          style={{
                            padding: '10px 14px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f1f5f9',
                            fontSize: '13px',
                            backgroundColor: isFocused ? '#f1f5f9' : 'transparent',
                            color: isFocused ? '#0f172a' : '#334155',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onClick={() => handleAddFromInfocompras(p)}
                          onMouseEnter={() => setFocusedIndex(index)}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: 'left' }}>
                            <div>
                              <strong style={{ color: '#1a5276', fontFamily: 'monospace' }}>{highlightText(p.ARTICULO1, infocSearch)}</strong>
                              <span style={{ margin: '0 6px', color: '#cbd5e1' }}>|</span>
                              <span>{highlightText(p.DESCRIPCION, infocSearch)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                              <span style={getBrandBadgeStyle(p.MARCA)}>
                                {highlightText(p.MARCA, infocSearch)}
                              </span>
                              {p.BDF === 'S' && (
                                <span style={{ backgroundColor: '#ffedd5', color: '#ea580c', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                  BDF
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a', paddingLeft: '12px' }}>
                            {formatCRC(p.PRECIO)}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '16px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>
                      No se encontraron productos coincidentes. Intente con otros términos.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <textarea 
              className="form-control" 
              placeholder={clienteCodigo.trim() && clienteNombre.trim() ? "Ingresar códigos..." : "⚠️ Debe seleccionar un cliente antes de ingresar códigos..."} 
              style={{ minHeight: '100px' }}
              value={bulkCodes}
              onChange={e => setBulkCodes(e.target.value)}
              disabled={!clienteCodigo.trim() || !clienteNombre.trim() || submitting}
            ></textarea>
            <button className="btn btn-primary" onClick={handleBulkAdd} disabled={!clienteCodigo.trim() || !clienteNombre.trim() || submitting}>Agregar Masivo</button>
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

            {/* Reglas de Aprobación y Presupuesto */}
            {reglasDict[s.marca] && (
              <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px', borderLeft: '4px solid #1a5276', fontSize: '13px' }}>
                
                {user?.role !== 'vendedor' && (
                  <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0' }}>
                    <span style={{ color: '#28a745', fontWeight: 600 }}>• Vendedor hasta {reglasDict[s.marca].limite_vendedor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                    <span style={{ color: '#ffc107', fontWeight: 600 }}>• Supervisor hasta {reglasDict[s.marca].limite_supervisor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                    <span style={{ color: '#dc3545', fontWeight: 600 }}>• Compras ≥ {reglasDict[s.marca].limite_compras}%</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Presupuesto {s.marca}</span>
                    <strong style={{ fontSize: '14px', color: '#1e293b' }}>{formatCRC(presupuestoByMarca[s.marca] || 0)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Gasto Acumulado</span>
                    <strong style={{ fontSize: '14px', color: '#e74c3c' }}>{formatCRC(gastoByMarca[s.marca] || 0)}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Disponible</span>
                    <strong style={{ fontSize: '14px', color: (presupuestoByMarca[s.marca] > 0 && (presupuestoByMarca[s.marca] - (gastoByMarca[s.marca] || 0)) / presupuestoByMarca[s.marca] < 0.1) ? '#dc3545' : '#28a745' }}>
                      {formatCRC((presupuestoByMarca[s.marca] || 0) - (gastoByMarca[s.marca] || 0))}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Consumo</span>
                    <strong style={{ fontSize: '14px', color: (presupuestoByMarca[s.marca] > 0 && (gastoByMarca[s.marca] || 0) / presupuestoByMarca[s.marca] > 0.9) ? '#dc3545' : '#28a745' }}>
                      {presupuestoByMarca[s.marca] > 0 ? (((gastoByMarca[s.marca] || 0) / presupuestoByMarca[s.marca]) * 100).toFixed(1) + '%' : '0.0%'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                     <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>Fecha Base</span>
                     <strong style={{ fontSize: '14px', color: '#1e293b' }}>{new Date().toLocaleString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase()}</strong>
                  </div>
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
