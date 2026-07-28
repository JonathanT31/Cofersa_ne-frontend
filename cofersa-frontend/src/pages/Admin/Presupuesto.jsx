import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const SearchableSelect = ({ value, onChange, onBlur, options, placeholder, maxResults = 30 }) => {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const matched = options.find(o => o.value === value);
    setSearch(matched ? matched.label : value || '');
  }, [value, options]);

  // Filtrado de opciones
  const filtered = options.filter(o => 
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    o.value.toLowerCase().includes(search.toLowerCase())
  );

  // Se limita la cantidad de elementos renderizados para no congelar/sobrecargar el navegador
  const visibleOptions = filtered.slice(0, maxResults);

  const handleSelect = (option) => {
    onChange(option.value);
    setSearch(option.label);
    setIsOpen(false);
    if (onBlur) {
      onBlur(option.value);
    }
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearch('');
    setIsOpen(false);
    if (onBlur) onBlur('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e) => {
      if (!e.target.closest('.search-select-container')) {
        setIsOpen(false);
        const matched = options.find(o => o.value === value);
        setSearch(matched ? matched.label : value || '');
        if (onBlur) onBlur(value);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, value, options]);

  return (
    <div className="search-select-container" style={{ position: 'relative', minWidth: '180px' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input 
          type="text" 
          className="form-control" 
          value={search} 
          onChange={e => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          style={{ width: '100%', paddingRight: search ? '24px' : '8px' }}
        />
        {search && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: '8px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '12px',
              padding: '0 4px'
            }}
          >
            ✕
          </button>
        )}
      </div>
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          zIndex: 1000,
          maxHeight: '200px',
          overflowY: 'auto',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
        }}>
          {visibleOptions.length > 0 ? (
            <>
              {visibleOptions.map(opt => (
                <div 
                  key={opt.value} 
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                  onClick={() => handleSelect(opt)}
                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {opt.label}
                </div>
              ))}
              {filtered.length > maxResults && (
                <div style={{ padding: '6px 12px', color: '#64748b', fontSize: '11px', textAlign: 'center', background: '#f8fafc' }}>
                  Mostrando {maxResults} de {filtered.length} opciones. Escribe para filtrar más.
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '12px' }}>No se encontraron opciones</div>
          )}
        </div>
      )}
    </div>
  );
};

const Presupuesto = () => {
  const { user } = useAuth();
  const [presupuesto, setPresupuesto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);
  const [cache, setCache] = useState({});
  const [totalCount, setTotalCount] = useState(0);

  // States for search dropdowns
  const [profiles, setProfiles] = useState([]);
  const [marcas, setMarcas] = useState([]);

  // States for filters & pagination
  const [filterMarca, setFilterMarca] = useState('');
  const [filterAsesor, setFilterAsesor] = useState('');
  const [filterSupervisor, setFilterSupervisor] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    fetchPresupuesto(currentPage);
  }, [currentPage, filterMarca, filterAsesor, filterSupervisor]);

  useEffect(() => {
    fetchSupportData();
  }, []);

  const invalidateCacheAndReload = () => {
    setCache({});
    fetchPresupuesto(currentPage, true);
  };

  const fetchPresupuesto = async (page = currentPage, forceFetch = false) => {
    // Generamos una clave única para la combinación actual de filtros y página
    const cacheKey = `${filterMarca}_${filterAsesor}_${filterSupervisor}_page_${page}`;

    // Si ya existe en caché y no se fuerza recarga (por insert/update/delete), no consultamos la DB
    if (!forceFetch && cache[cacheKey]) {
      setPresupuesto(cache[cacheKey].data);
      setTotalCount(cache[cacheKey].count);
      return;
    }

    try {
      setLoading(true);
      const pageSize = 50;
      const totalPages = Math.ceil(totalCount / pageSize);
      const indexOfFirstItem = (currentPage - 1) * pageSize;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Construcción dinámica de la consulta con filtros en el servidor
      let query = supabase
        .from('presupuesto')
        .select('*', { count: 'exact' })
        .order('supervisor', { ascending: true })
        .range(from, to);

      if (filterMarca) query = query.eq('marca', filterMarca);
      if (filterAsesor) query = query.eq('asesor', filterAsesor);
      if (filterSupervisor) query = query.eq('supervisor', filterSupervisor);

      const { data, error, count } = await query;
      if (error) throw error;

      const fetchedData = data || [];
      setPresupuesto(fetchedData);
      setTotalCount(count || 0);

      // Guardar resultado en el caché en memoria
      setCache(prev => ({
        ...prev,
        [cacheKey]: { data: fetchedData, count: count || 0 }
      }));
    } catch (err) {
      console.error('Error fetching presupuesto:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSupportData = async () => {
    try {
      const { data: profs } = await supabase
        .from('profiles')
        .select('username, nombre, apellido, role, status');
      setProfiles(profs || []);

      const { data: rules } = await supabase
        .from('reglas')
        .select('marca');
      if (rules) {
        const uniqueMarcas = [...new Set(rules.map(r => r.marca))].sort();
        setMarcas(uniqueMarcas);
      }
    } catch (err) {
      console.error('Error fetching support data:', err);
    }
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) return;

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', file);

      // Obtener el token de la sesión activa de Supabase
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token;

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/import-presupuesto`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Error al importar archivo' }));
        throw new Error(errorData.detail || errorData.message || 'Error al importar archivo');
      }
      
      const result = await response.json();
      alert(`Éxito: Se importaron ${result.count} registros de presupuesto.`);
      invalidateCacheAndReload();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImporting(false);
      setFile(null);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('🚨 ¡ATENCIÓN! ¿Está seguro de que desea eliminar TODOS los registros de presupuesto permanentemente? Esta acción no se puede deshacer.')) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('presupuesto')
          .delete()
          .neq('id', -1);
        if (error) throw error;
        alert('Todos los registros de presupuesto han sido eliminados.');
        invalidateCacheAndReload();
      } catch (err) {
        alert('Error al borrar los registros: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadTemplate = () => {
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/template-presupuesto`;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_presupuesto.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleExportCSV = () => {
    if (presupuesto.length === 0) return;
    const headers = ['Supervisor', 'Asesor', 'Marca', 'Ppto Mensual'];
    const rows = presupuesto.map(p => [
      p.supervisor || '',
      p.asesor || '',
      p.marca || '',
      p.ppto_mensual ?? 0
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `presupuesto_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddRow = () => {
    setPresupuesto([{
      id: 'new-' + Date.now(),
      supervisor: '',
      asesor: '',
      marca: '',
      ppto_mensual: 0
    }, ...presupuesto]);
  };

  const handleCellChange = (id, field, value) => {
    setPresupuesto(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, [field]: value };
      }
      return p;
    }));
  };

  const handleCellBlur = async (row, field, value) => {
    const isNew = typeof row.id === 'string' && row.id.startsWith('new-');
    
    if (isNew) {
      // Get the latest row from state and apply the new blurred value to avoid stale closures
      const latestRow = presupuesto.find(p => p.id === row.id) || row;
      const updatedRow = { ...latestRow, [field]: value };

      // We only insert if both marca and asesor have values
      if (!updatedRow.marca || !updatedRow.marca.trim() || !updatedRow.asesor || !updatedRow.asesor.trim()) {
        return; 
      }
      try {
        const { id, ...dataToInsert } = updatedRow;
        const { data, error } = await supabase
          .from('presupuesto')
          .insert([dataToInsert])
          .select();
        
        if (error) throw error;
        if (data && data.length > 0) {
          setPresupuesto(prev => prev.map(p => p.id === row.id ? data[0] : p));
        }
      } catch (err) {
        console.error('Error inserting budget row:', err);
        alert('Error al insertar presupuesto: ' + err.message);
      }
    } else {
      try {
        const { error } = await supabase
          .from('presupuesto')
          .update({ [field]: value })
          .eq('id', row.id);
        
        if (error) throw error;
      } catch (err) {
        console.error('Error updating budget row:', err);
        alert('Error al actualizar presupuesto: ' + err.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (typeof id === 'string' && id.startsWith('new-')) {
      setPresupuesto(presupuesto.filter(p => p.id !== id));
      return;
    }

    if (window.confirm('¿Eliminar este registro permanentemente?')) {
      const { error } = await supabase.from('presupuesto').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else invalidateCacheAndReload();
    }
  };

  // Prepare options for select fields
  // Any user who is not a vendedor can be a supervisor
  const { supervisorOptions, asesorOptions, marcaOptions } = React.useMemo(() => {
    let baseSupervisores = profiles.filter(p => p.role !== 'vendedor' && p.status === 'activo');
    let baseAsesores = profiles.filter(p => p.role === 'vendedor' || p.role === 'admin');
    let baseMarcas = [...marcas];

    // Si hay un Vendedor seleccionado -> Filtrar Supervisores y Marcas asociadas a él
    if (filterAsesor) {
      const supervisoresDelAsesor = [...new Set(presupuesto.filter(p => p.asesor === filterAsesor).map(p => p.supervisor))];
      if (supervisoresDelAsesor.length > 0) {
        baseSupervisores = baseSupervisores.filter(p => supervisoresDelAsesor.includes(p.username));
      }

      const marcasDelAsesor = [...new Set(presupuesto.filter(p => p.asesor === filterAsesor).map(p => p.marca))];
      if (marcasDelAsesor.length > 0) {
        baseMarcas = baseMarcas.filter(m => marcasDelAsesor.includes(m));
      }
    }

    // Si hay un Supervisor seleccionado -> Filtrar Vendedores a su cargo y sus Marcas
    if (filterSupervisor) {
      const asesoresDelSupervisor = [...new Set(presupuesto.filter(p => p.supervisor === filterSupervisor).map(p => p.asesor))];
      if (asesoresDelSupervisor.length > 0) {
        baseAsesores = baseAsesores.filter(p => asesoresDelSupervisor.includes(p.username));
      }

      const marcasDelSupervisor = [...new Set(presupuesto.filter(p => p.supervisor === filterSupervisor).map(p => p.marca))];
      if (marcasDelSupervisor.length > 0) {
        baseMarcas = baseMarcas.filter(m => marcasDelSupervisor.includes(m));
      }
    }

    // Si hay una Marca seleccionada -> Filtrar Vendedores y Supervisores con esa Marca
    if (filterMarca) {
      const asesoresDeMarca = [...new Set(presupuesto.filter(p => p.marca === filterMarca).map(p => p.asesor))];
      if (asesoresDeMarca.length > 0) {
        baseAsesores = baseAsesores.filter(p => asesoresDeMarca.includes(p.username));
      }

      const supervisoresDeMarca = [...new Set(presupuesto.filter(p => p.marca === filterMarca).map(p => p.supervisor))];
      if (supervisoresDeMarca.length > 0) {
        baseSupervisores = baseSupervisores.filter(p => supervisoresDeMarca.includes(p.username));
      }
    }

    return {
      supervisorOptions: baseSupervisores.map(p => ({ value: p.username, label: `${p.nombre} ${p.apellido} (${p.username})` })),
      asesorOptions: baseAsesores.map(p => ({ value: p.username, label: `${p.nombre} ${p.apellido} (${p.username})` })),
      marcaOptions: baseMarcas.map(m => ({ value: m, label: m }))
    };
  }, [profiles, marcas, presupuesto, filterAsesor, filterSupervisor, filterMarca]);



  const pageSize = 50;
  const totalPages = Math.ceil(totalCount / pageSize);
  const indexOfFirstItem = (currentPage - 1) * pageSize;

  return (
    <Layout title="Presupuesto" active="presupuesto">
      <h1>Presupuesto Mensual por Marca/Asesor</h1>
      
      <div className="card">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '12px', 
          marginBottom: '20px', 
          flexWrap: 'wrap' 
        }}>
          {/* Grupo de Acciones Principales */}
          <div style={{ 
            display: 'flex', 
            gap: '10px', 
            flexWrap: 'wrap', 
            alignItems: 'center', 
            flex: '1 1 auto' 
          }}>
            <form style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }} onSubmit={handleImport}>
              <input 
                  type="file" 
                  accept=".xlsx" 
                  className="form-control" 
                  style={{ maxWidth: '240px', minWidth: '150px' }} 
                  onChange={e => setFile(e.target.files[0])}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!file || importing}>
                  {importing ? 'Importando...' : 'Importar Excel'}
              </button>
            </form>
            
            <button 
              className="btn btn-outline btn-sm" 
              onClick={handleDownloadTemplate}
              title="Descarga la plantilla XLSX con el formato correcto para importar"
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              ⬇️ Plantilla
            </button>
            <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>Exportar CSV</button>
            <button className="btn btn-success btn-sm" onClick={handleAddRow} disabled={loading}>+ Agregar Fila</button>
          </div>

          {/* Grupo de Acciones de Peligro / Admin */}
          {user?.role === 'admin' && (
            <div style={{ flex: '0 0 auto' }}>
              <button className="btn btn-danger btn-sm" onClick={handleClearAll}>
                🗑️ Borrar Todo
              </button>
            </div>
          )}
        </div>

        {/* Filtros de Búsqueda */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap', background: '#f8f9fa', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Supervisor</label>
            <SearchableSelect 
              value={filterSupervisor}
              onChange={val => { 
                setFilterSupervisor(val); 
                setCurrentPage(1); 
              }}
              options={supervisorOptions}
              placeholder="Todos los supervisores..."
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Vendedor</label>
            <SearchableSelect 
              value={filterAsesor}
              onChange={val => { 
                setFilterAsesor(val); 
                setCurrentPage(1); 
              }}
              options={asesorOptions}
              placeholder="Todos los vendedores..."
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Marca</label>
            <SearchableSelect 
              value={filterMarca}
              onChange={val => { 
                setFilterMarca(val); 
                setCurrentPage(1); 
              }}
              options={marcaOptions}
              placeholder="Todas las marcas..."
            />
          </div>
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Supervisor</th>
                <th>Asesor</th>
                <th>Marca</th>
                <th className="text-right" style={{ width: '180px' }}>Ppto Mensual</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Cargando presupuesto...</td></tr>
              ) : presupuesto.map((p, index) => (
                <tr key={p.id}>
                  <td>{indexOfFirstItem + index + 1}</td>
                  <td>
                    <SearchableSelect 
                      value={p.supervisor}
                      onChange={val => handleCellChange(p.id, 'supervisor', val)}
                      onBlur={val => handleCellBlur(p, 'supervisor', val)}
                      options={supervisorOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td>
                    <SearchableSelect 
                      value={p.asesor}
                      onChange={val => handleCellChange(p.id, 'asesor', val)}
                      onBlur={val => handleCellBlur(p, 'asesor', val)}
                      options={asesorOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td>
                    <SearchableSelect 
                      value={p.marca}
                      onChange={val => handleCellChange(p.id, 'marca', val)}
                      onBlur={val => handleCellBlur(p, 'marca', val)}
                      options={marcaOptions}
                      placeholder="Seleccionar..."
                    />
                  </td>
                  <td className="text-right">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                      <span style={{ fontSize: '13px', color: '#777' }}>₡</span>
                      <input 
                        type="number" 
                        className="form-control text-right" 
                        value={p.ppto_mensual}
                        onChange={e => handleCellChange(p.id, 'ppto_mensual', parseFloat(e.target.value) || 0)}
                        onBlur={e => handleCellBlur(p, 'ppto_mensual', parseFloat(e.target.value) || 0)}
                        style={{ width: '130px', minHeight: '34px', height: '34px' }}
                      />
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!loading && presupuesto.length === 0 && (
                <tr><td colSpan="6" className="text-center color-muted">No hay registros</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '15px' }}>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
            >
              Anterior
            </button>
            <span style={{ fontSize: '13px' }}>
              Página {currentPage} de {totalPages} ({totalCount} registros en total)
            </span>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || loading}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Presupuesto;
