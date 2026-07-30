import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const Reglas = () => {
  const { user } = useAuth();
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);
  const [equivalencias, setEquivalencias] = useState([]);

  // States for filters & pagination
  const [filterMarca, setFilterMarca] = useState('');
  const [filterClasificacion, setFilterClasificacion] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    fetchReglas();
    fetchEquivalencias();
  }, []);

  const fetchEquivalencias = async () => {
    try {
      const { data, error } = await supabase
        .from('equivalencias_marcas')
        .select('*');
      if (error) throw error;
      setEquivalencias(data || []);
    } catch (err) {
      console.error('Error fetching equivalencias:', err);
    }
  };

  const mapBrandName = (name) => {
    if (!name) return '';
    const normalized = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const matched = equivalencias.find(eq => eq.grupo_marca.toLowerCase().replace(/\s+/g, ' ').trim() === normalized);
    return matched ? matched.equivalente_tabla_2 : name.trim();
  };

  const fetchReglas = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('reglas')
        .select('*')
        .order('marca', { ascending: true });
      
      if (error) throw error;
      setReglas(data || []);
    } catch (err) {
      console.error('Error fetching reglas:', err);
    } finally {
      setLoading(false);
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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/import-reglas`, {
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
      let msg = `✅ Éxito: Se importaron ${result.count} reglas.`;
      if (result.duplicates_ignored > 0) {
        msg += `\n\n⚠️ Advertencia: Se ignoraron ${result.duplicates_ignored} fila(s) duplicadas del Excel (misma marca + clasificación). Revisa tu archivo si esto no era esperado.`;
      }
      alert(msg);
      fetchReglas();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImporting(false);
      setFile(null);
    }
  };

  const handleClearAll = async () => {
    if (window.confirm('🚨 ¡ATENCIÓN! ¿Está seguro de que desea eliminar TODAS las reglas de aprobación permanentemente? Esta acción no se puede deshacer.')) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('reglas')
          .delete()
          .neq('id', -1);
        if (error) throw error;
        alert('Todas las reglas han sido eliminadas.');
        fetchReglas();
      } catch (err) {
        alert('Error al borrar los registros: ' + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDownloadTemplate = () => {
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/template-reglas`;
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_reglas.xlsx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleExportCSV = () => {
    if (reglas.length === 0) return;
    const headers = ['Marca', 'Clasificación', 'Límite Vendedor', 'Límite Supervisor', 'Límite Compras'];
    const rows = reglas.map(r => [
      r.marca || '',
      r.clasificacion || '',
      r.limite_vendedor ?? 0,
      r.limite_supervisor ?? 0,
      r.limite_compras ?? 0
    ]);
    
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reglas_aprobacion_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddRow = () => {
    setReglas([{
      id: 'new-' + Date.now(),
      marca: '',
      clasificacion: '1 Alto',
      limite_vendedor: 3.0,
      limite_supervisor: 5.0,
      limite_compras: 5.01
    }, ...reglas]);
  };

  const handleCellChange = (id, field, value) => {
    setReglas(prev => prev.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  };

  const handleCellBlur = async (row, field, value) => {
    const isNew = typeof row.id === 'string' && row.id.startsWith('new-');
    
    let finalValue = value;
    if (field === 'marca') {
      finalValue = mapBrandName(value);
      handleCellChange(row.id, 'marca', finalValue);
    }
    
    if (isNew) {
      // Get the latest row from state and apply the new blurred value to avoid stale closures
      const latestRow = reglas.find(r => r.id === row.id) || row;
      const updatedRow = { ...latestRow, [field]: finalValue };

      if (!updatedRow.marca || !updatedRow.marca.trim()) {
        return; // Esperar a que ingresen una marca para insertar
      }
      try {
        const { id, ...dataToInsert } = updatedRow;
        const { data, error } = await supabase
          .from('reglas')
          .insert([dataToInsert])
          .select();
        
        if (error) throw error;
        if (data && data.length > 0) {
          setReglas(prev => prev.map(r => r.id === row.id ? data[0] : r));
        }
      } catch (err) {
        console.error('Error inserting rule:', err);
        alert('Error al insertar regla: ' + err.message);
      }
    } else {
      try {
        const updateData = { [field]: finalValue };
        
        const { error } = await supabase
          .from('reglas')
          .update(updateData)
          .eq('id', row.id);
        
        if (error) throw error;
      } catch (err) {
        console.error('Error updating rule:', err);
        alert('Error al actualizar regla: ' + err.message);
      }
    }
  };

  const handleDelete = async (id) => {
    if (typeof id === 'string' && id.startsWith('new-')) {
        setReglas(reglas.filter(r => r.id !== id));
        return;
    }

    if (window.confirm('¿Eliminar esta regla permanentemente?')) {
      const { error } = await supabase.from('reglas').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchReglas();
    }
  };

  const filteredReglas = reglas.filter(r => {
    const matchMarca = !filterMarca || (r.marca || '').toLowerCase().includes(filterMarca.toLowerCase());
    const matchClasif = !filterClasificacion || r.clasificacion === filterClasificacion;
    return matchMarca && matchClasif;
  });

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredReglas.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredReglas.length / itemsPerPage);

  const uniqueClasificaciones = [...new Set(reglas.map(r => r.clasificacion).filter(Boolean))].sort();

  return (
    <Layout title="Reglas de Aprobación" active="reglas">
      <h1>Reglas de Aprobación por Marca</h1>
      
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
                  onChange={(e) => setFile(e.target.files[0])}
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
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Marca</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="Buscar marca..." 
              value={filterMarca} 
              onChange={e => { setFilterMarca(e.target.value); setCurrentPage(1); }}
              style={{ height: '34px', padding: '4px 8px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', color: '#475569' }}>Filtrar por Clasificación</label>
            <select 
              className="form-control" 
              value={filterClasificacion} 
              onChange={e => { setFilterClasificacion(e.target.value); setCurrentPage(1); }}
              style={{ height: '34px', padding: '4px 8px' }}
            >
              <option value="">Todas</option>
              {uniqueClasificaciones.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Marca</th>
                <th>Clasificación</th>
                <th>Lím. Vendedor %</th>
                <th>Lím. Supervisor %</th>
                <th>Compras (≥ Lím. Supervisor)</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center">Cargando reglas...</td></tr>
              ) : currentItems.map((r, index) => {
                return (
                  <tr key={r.id}>
                    <td>{indexOfFirstItem + index + 1}</td>
                    <td>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={r.marca} 
                        onChange={e => handleCellChange(r.id, 'marca', e.target.value)}
                        onBlur={e => handleCellBlur(r, 'marca', e.target.value)}
                        style={{ minWidth: '120px' }}
                      />
                    </td>
                    <td>
                      <input 
                        type="text" 
                        className="form-control" 
                        value={r.clasificacion} 
                        onChange={e => handleCellChange(r.id, 'clasificacion', e.target.value)}
                        onBlur={e => handleCellBlur(r, 'clasificacion', e.target.value)}
                        style={{ minWidth: '120px' }}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={r.limite_vendedor} 
                        step="0.01"
                        onChange={e => handleCellChange(r.id, 'limite_vendedor', parseFloat(e.target.value) || 0)}
                        onBlur={e => handleCellBlur(r, 'limite_vendedor', parseFloat(e.target.value) || 0)}
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={r.limite_supervisor} 
                        step="0.01"
                        onChange={e => handleCellChange(r.id, 'limite_supervisor', parseFloat(e.target.value) || 0)}
                        onBlur={e => handleCellBlur(r, 'limite_supervisor', parseFloat(e.target.value) || 0)}
                        style={{ width: '80px' }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontWeight: 'bold' }}>≥</span>
                        <input 
                          type="number" 
                          className="form-control" 
                          value={r.limite_compras} 
                          step="0.01"
                          onChange={e => handleCellChange(r.id, 'limite_compras', parseFloat(e.target.value) || 0)}
                          onBlur={e => handleCellBlur(r, 'limite_compras', parseFloat(e.target.value) || 0)}
                          style={{ width: '80px' }}
                        />
                        <span>%</span>
                      </div>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredReglas.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center color-muted">No hay reglas definidas</td>
                </tr>
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
              disabled={currentPage === 1}
            >
              Anterior
            </button>
            <span style={{ fontSize: '13px' }}>Página {currentPage} de {totalPages} ({filteredReglas.length} registros en total)</span>
            <button 
              className="btn btn-outline btn-sm" 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Reglas;
