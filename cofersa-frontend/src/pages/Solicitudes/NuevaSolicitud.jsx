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
  
  const [marcas, setMarcas] = useState([]);
  const [reglasDict, setReglasDict] = useState({});
  const [presupuestoDict, setPresupuestoDict] = useState({});
  const [gastoDict, setGastoDict] = useState({});
  const [searchResults, setSearchResults] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [formErrors, setFormErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);

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

  // Fetch budget (presupuesto) and consumed amount (gasto) for the logged-in salesperson,
  // broken down by brand. Budget is matched by asesor name == profile full_name.
  // Gasto = approved + pending discount amounts for the current calendar month (rejected excluded).
  useEffect(() => {
    if (!user?.id) return;

    const fetchBudget = async () => {
      try {
        // 1. Presupuesto por marca para este vendedor
        const usernameVendedor = (user.username || '').trim();
        const pdict = {};
        if (usernameVendedor) {
          const { data: ppto, error: pptoErr } = await supabase
            .from('presupuesto')
            .select('marca, ppto_mensual, asesor')
            .eq('asesor', usernameVendedor);
          if (!pptoErr && ppto) {
            ppto.forEach(p => {
              if (p.marca) pdict[p.marca] = parseFloat(p.ppto_mensual) || 0;
            });
          }
        }
        setPresupuestoDict(pdict);

        // 2. Gasto del mes actual (aprobado + pendiente, excluye rechazadas)
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data: sols, error: solErr } = await supabase
          .from('solicitudes')
          .select('id, estado, created_at')
          .eq('vendedor_id', user.id)
          .gte('created_at', monthStart)
          .neq('estado', 'rechazada');

        const gdict = {};
        const ids = (!solErr && sols ? sols : []).map(s => s.id);
        if (ids.length) {
          const { data: skuRows, error: skuErr } = await supabase
            .from('solicitud_skus')
            .select('marca, monto_aprobado, monto_descuento, sku_estado')
            .in('solicitud_id', ids);
          if (!skuErr && skuRows) {
            skuRows.forEach(sk => {
              if (sk.sku_estado === 'rechazado') return;
              const val = (sk.monto_aprobado !== null && sk.monto_aprobado !== undefined && sk.monto_aprobado !== '')
                ? parseFloat(sk.monto_aprobado) || 0
                : parseFloat(sk.monto_descuento) || 0;
              const m = sk.marca || '';
              gdict[m] = (gdict[m] || 0) + val;
            });
          }
        }
        setGastoDict(gdict);
      } catch (err) {
        console.error('Error fetching presupuesto/gasto:', err);
      }
    };

    fetchBudget();
  }, [user?.id]);

  // Auto-dismiss validation errors/alerts after 6 seconds
  useEffect(() => {
    if (formErrors.length > 0) {
      const timer = setTimeout(() => {
        setFormErrors([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [formErrors]);

  // Debounced search for products (n8n Webhook)
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
        const results = await infocomprasService.search(infocSearch, clienteCodigo, clienteNombre, listaPrecios);
        setSearchResults(results);
      } catch (err) {
        console.error('Error fetching products from webhook:', err);
      } finally {
        setLoadingProducts(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [infocSearch, clienteCodigo, clienteNombre, listaPrecios]);

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
        pct: '0',
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
      
      let cleanedValue = value;
      if (value === '') {
        cleanedValue = 0; 
      }
      if (field === 'mdesc' && typeof value === 'string') {
        cleanedValue = value.replace(/[^0-9.-]/g, '');
      }
      
      if (field === 'pct') {
        const valNum = parseFloat(cleanedValue || value).toFixed(2);
        if (valNum < 0) cleanedValue = '0';
      }
      if (field === 'mdesc') {
        const valNum = parseFloat(cleanedValue).toFixed(2);
        if (valNum < 0) cleanedValue = '0';
      }
      
      const updated = { ...s, [field]: value === '' ? '' : (cleanedValue || value) };

      if (['cantidad', 'precio_base', 'pct', 'psol', 'mdesc'].includes(field)) {
        const cant = parseFloat(updated.cantidad).toFixed(2) || 0;
        const lpv = parseFloat(updated.precio_base).toFixed(2) || 0;
        
        if (field === 'pct' || (field === 'precio_base' && updated.lastEdited === 'pct')) {
          updated.lastEdited = 'pct';
          const pct = parseFloat(updated.pct).toFixed(2) || 0;
          if (lpv > 0) {
            const psol = lpv * (1 - pct / 100);
            updated.psol = Number.parseFloat(psol).toFixed(2);
            updated.mdesc = Number.parseFloat((lpv - psol) * cant).toFixed(2);
          } else {
            updated.mdesc = 0;
          }
        } else if (field === 'psol' || (field === 'precio_base' && updated.lastEdited === 'psol')) {
          updated.lastEdited = 'psol';
          const psol = parseFloat(updated.psol).toFixed(2) || 0;
          if (lpv > 0) {
            const pct = (1 - psol / lpv) * 100;
            updated.pct = pct.toFixed(2);
            updated.mdesc = (lpv - psol) * cant;
          } else {
            updated.mdesc = 0;
          }
        } else if (field === 'mdesc' || (field === 'precio_base' && updated.lastEdited === 'mdesc')) {
          updated.lastEdited = 'mdesc';
          const mdescTotal = parseFloat(updated.mdesc).toFixed(2) || 0;
          if (lpv > 0 && cant > 0) {
            const mdescPorUnidad = mdescTotal / cant;
            const pct = (mdescPorUnidad / lpv) * 100;
            updated.pct = pct.toFixed(2);
            const psol = lpv * (1 - pct / 100);
            updated.psol = psol.toFixed(2);
          } else if (lpv > 0) {
            // Si cantidad es 0, calcular porcentaje basado en monto total directamente
            const pct = (mdescTotal / lpv) * 100;
            updated.pct = pct.toFixed(2);
            const psol = lpv * (1 - pct / 100);
            updated.psol = psol.toFixed(2);
          } else {
            updated.pct = '0';
            updated.psol = '';
          }
        } else if (field === 'cantidad') {
          // Si lastEdited era 'mdesc', mantener el monto total constante y recalcular porcentaje
          if (updated.lastEdited === 'mdesc') {
            const mdescTotal = parseFloat(updated.mdesc).toFixed(2) || 0;
            if (lpv > 0 && cant > 0) {
              const mdescPorUnidad = mdescTotal / cant;
              const pct = (mdescPorUnidad / lpv) * 100;
              updated.pct = pct.toFixed(2);
              const psol = lpv * (1 - pct / 100);
              updated.psol = psol.toFixed(2);
            } else if (lpv > 0) {
              // Si cantidad es 0, mantener el porcentaje actual
              const pct = parseFloat(updated.pct).toFixed(2) || 0;
              updated.psol = (lpv * (1 - pct / 100)).toFixed(2);
              updated.mdesc = 0;
            }
          } else {
            // Recalcular mdesc basado en psol actual (comportamiento original)
            const psol = parseFloat(updated.psol).toFixed(2) || 0;
            if (lpv > 0) {
              updated.mdesc = (lpv - psol) * cant;
            }
          }
        }
      }
      return updated;
    }));
  };

  const isBrandBudgetExceeded = (marca) => {
    if (!marca) return false;
    const mdescTotal = skus
      .filter(s => s.marca === marca)
      .reduce((sum, s) => sum + (parseFloat(s.mdesc) || 0), 0);
    
    if (mdescTotal < 0.01) return false;

    const ppto = presupuestoDict[marca];
    if (ppto === undefined || ppto === null || ppto <= 0) return true;
    const gastado = gastoDict[marca] || 0;
    return Math.round((gastado + mdescTotal) * 100) / 100 > Math.round(ppto * 100) / 100;
  };

  const getBrandBudgetWarning = (marca) => {
    // Los usuarios con roles de compras, supervisor y admin no deben restringirse ni alertarse innecesariamente por falta de presupuesto
    if (user?.role && user.role !== 'vendedor') return null;
    if (!marca) return null;

    // Calcular el descuento total solicitado en este formulario para esta marca
    const mdescTotal = skus
      .filter(s => s.marca === marca)
      .reduce((sum, s) => sum + (parseFloat(s.mdesc) || 0), 0);

    if (mdescTotal < 0.01) return null;

    const ppto = presupuestoDict[marca];
    if (ppto === undefined || ppto === null || ppto <= 0) {
      return `⚠️ No hay presupuesto asignado para la marca ${marca}.`;
    }

    const gastado = gastoDict[marca] || 0;
    if (Math.round((gastado + mdescTotal) * 100) / 100 > Math.round(ppto * 100) / 100) {
      const disponible = Math.max(0, ppto - gastado);
      return `⚠️ El descuento acumulado solicitado para la marca ${marca} (${formatCRC(mdescTotal)}) supera el presupuesto disponible (${formatCRC(disponible)}).`;
    }

    return null;
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
              monto_descuento: Math.round(parseFloat(s.mdesc || 0) * 100) / 100,
              bdf: s.bdf
            })),
            vendedor_id: user?.id
          })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Error al crear solicitud');

        navigate('/mis-solicitudes', { state: { emailSent: true } });
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
      bdf: producto.BDF,
      pct: 0
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
              placeholder="LPV del cliente"
              disabled={submitting}
              autoComplete="off"
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
              <input 
                type="text" 
                className="form-control" 
                placeholder={clienteCodigo.trim() && clienteNombre.trim() ? "Buscar por artículo, descripción, marca..." : "⚠️ Debe seleccionar un cliente antes de buscar..."} 
                value={infocSearch}
                onChange={e => setInfocSearch(e.target.value)}
                disabled={!clienteCodigo.trim() || !clienteNombre.trim() || submitting}
              />
              {infocSearch && (loadingProducts || searchResults.length > 0 || (infocSearch.trim().length >= 3 && !loadingProducts)) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ccc', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                  {loadingProducts ? (
                    <div style={{ padding: '12px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>
                      🔍 Buscando productos...
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map(p => (
                      <div 
                        key={p.ARTICULO1} 
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', fontSize: '13px' }}
                        onClick={() => handleAddFromInfocompras(p)}
                      >
                        <strong style={{ color: '#1a5276' }}>{p.ARTICULO1}</strong> - {p.DESCRIPCION} <span style={{ color: '#888' }}>({p.MARCA})</span>
                        <div style={{ fontSize: '11px', color: '#555' }}>Precio: {formatCRC(p.PRECIO)}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '12px', color: '#64748b', textAlign: 'center', fontSize: '13px' }}>
                      No se encontraron productos.
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
          {/* 
          <button type="button" className="btn btn-outline btn-sm" onClick={() => addSkuRow()} disabled={submitting}>+ Agregar Manual</button>
          */}
        </div>
        
        {skus.map(s => (
          <div className="sku-row card" key={s.id} style={{ marginBottom: '10px', padding: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <strong>Línea #{s.id}</strong>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSkuRow(s.id)} disabled={submitting}>✕</button>
            </div>

            {/* Reglas de Aprobación + Presupuesto */}
            {s.marca && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '15px' }}>

                {/* Porcentajes límite — ocultos para el rol vendedor */}
                {user?.role !== 'vendedor' && reglasDict[s.marca] && (
                  <div style={{ flex: '1 1 280px', padding: '8px 12px', backgroundColor: '#f8f9fa', borderRadius: '4px', borderLeft: '4px solid #1a5276', fontSize: '13px' }}>
                    <span style={{ color: '#28a745' }}>• Vendedor hasta {reglasDict[s.marca].limite_vendedor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                    <span style={{ color: '#ffc107' }}>• Supervisor hasta {reglasDict[s.marca].limite_supervisor}%</span> <span style={{ color: '#ccc' }}>|</span>{' '}
                    <span style={{ color: '#dc3545' }}>• Compras ≥ {reglasDict[s.marca].limite_compras}%</span>
                    <div style={{ marginTop: '4px', color: '#666', fontSize: '11px' }}>
                      {new Date().toLocaleString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase()} — {s.marca} <br/>
                    </div>
                  </div>
                )}

                {/* Presupuesto / Gasto / Consumo — visible para todos los roles */}
                <div style={{ flex: '1 1 320px', padding: '8px 12px', backgroundColor: '#eef7ff', borderRadius: '4px', borderLeft: '4px solid #2980b9', fontSize: '13px' }}>
                  {(() => {
                    const ppto = presupuestoDict[s.marca];
                    const gasto = gastoDict[s.marca] || 0;
                    const hasPpto = ppto !== undefined && ppto !== null && ppto > 0;
                    const consumo = hasPpto ? (gasto / ppto * 100) : null;
                    const consumoColor = consumo == null ? '#666' : consumo >= 100 ? '#dc3545' : consumo >= 80 ? '#f39c12' : '#27ae60';
                    return (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: '11px', color: '#666' }}>Presupuesto (Colones)</div>
                            <strong style={{ color: '#1a5276' }}>{hasPpto ? formatCRC(ppto) : 'Sin presupuesto'}</strong>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#666' }}>Gasto (Colones)</div>
                            <strong>{formatCRC(gasto)}</strong>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: '#666' }}>Consumo (% Presupuesto gastado)</div>
                            <strong style={{ color: consumoColor }}>{consumo != null ? consumo.toFixed(1) + '%' : 'N/A'}</strong>
                          </div>
                        </div>
                        <div style={{ marginTop: '4px', color: '#666', fontSize: '11px' }}>
                          {new Date().toLocaleString('es-ES', { month: 'short', year: 'numeric' }).replace('.', '').toUpperCase()} — {s.marca}
                        </div>
                      </>
                    );
                  })()}
                </div>

              </div>
            )}

            <div className="grid-3">
              <div className="form-group">
                <label>Marca *</label>
                <select className="form-control" value={s.marca} onChange={e => updateSku(s.id, 'marca', e.target.value)} disabled={true}>
                  <option value="">-- Seleccione --</option>
                  {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Código SKU *</label>
                <input type="text" className="form-control" readOnly value={s.codigo_sku} onChange={e => updateSku(s.id, 'codigo_sku', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Descripción *</label>
                <input type="text" className="form-control" readOnly value={s.descripcion} onChange={e => updateSku(s.id, 'descripcion', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Cantidad *</label>
                <input type="number" className="form-control" value={s.cantidad} onChange={e => updateSku(s.id, 'cantidad', e.target.value)} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Precio LPV ₡ *</label>
                <input type="number" className="form-control" readOnly value={s.precio_base} /*onChange={e => updateSku(s.id, 'precio_base', e.target.value)}*/ disabled={submitting} />
              </div>
              <div className="form-group">
                <label>% Desc. Sol. *</label>
                <input type="number" className="form-control" value={s.pct} onChange={e => updateSku(s.id, 'pct', e.target.value)} min="0" max={100} disabled={submitting} />
              </div>
              <div className="form-group">
                <label>Monto Desc. ₡</label>
                <input type="number" className="form-control" value={s.mdesc === 0 ? '' : s.mdesc} style={{ background: '#f8f8f8' }}  onChange={e => updateSku(s.id, 'mdesc', e.target.value)} min="0" step="0.01" />
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
                  const role = user?.role;
                  const regla = reglasDict[s.marca];
                  
                  if (role === 'compras' || role === 'admin') {
                    return (
                      <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #c3e6cb' }}>
                        ✓ Esta solicitud se autoaprobará automáticamente por compras/admin.
                      </div>
                    );
                  }
                  
                  if (role === 'supervisor') {
                    if (pct <= regla.limite_supervisor) {
                      return (
                        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #c3e6cb' }}>
                          ✓ Esta solicitud puede autoaprobarse por el supervisor.
                        </div>
                      );
                    } else {
                      return (
                        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #f5c6cb' }}>
                          ❌ Esta solicitud requiere la aprobación de COMPRAS.
                        </div>
                      );
                    }
                  }
                  
                  // Rol Vendedor / otros
                  const budgetExceeded = isBrandBudgetExceeded(s.marca);
                  if (budgetExceeded) {
                    if (pct <= regla.limite_supervisor) {
                      return (
                        <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #ffeeba' }}>
                          ⚠️ Por falta/exceso de presupuesto, esta solicitud requiere la aprobación del SUPERVISOR.
                        </div>
                      );
                    } else {
                      return (
                        <div style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #f5c6cb' }}>
                          ❌ Esta solicitud requiere la aprobación de COMPRAS.
                        </div>
                      );
                    }
                  } else {
                    if (pct <= regla.limite_vendedor) {
                      return (
                        <div style={{ backgroundColor: '#d4edda', color: '#155724', padding: '8px 12px', borderRadius: '4px', fontSize: '13px', border: '1px solid #c3e6cb' }}>
                          ✓ Esta solicitud puede autoaprobarse por el vendedor.
                        </div>
                      );
                    } else if (pct <= regla.limite_supervisor) {
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
                  }
                })()}
              </div>
            )}

            {/* Advertencia de Presupuesto (Inline e Interactiva) */}
            {(() => {
              const warningMsg = getBrandBudgetWarning(s.marca);
              if (!warningMsg) return null;
              return (
                <div style={{ 
                  marginTop: '10px', 
                  backgroundColor: '#fff3cd', 
                  color: '#856404', 
                  padding: '8px 12px', 
                  borderRadius: '4px', 
                  fontSize: '13px', 
                  border: '1px solid #ffeeba',
                  fontWeight: '500'
                }}>
                  {warningMsg}
                </div>
              );
            })()}
          </div>
        ))}

        <div className="actions-bar" style={{ marginTop: '20px' }}>
          <button type="button" className={submitting ? "btn btn-success-loading" : "btn btn-success"} onClick={enviarSolicitud} disabled={submitting}>
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
