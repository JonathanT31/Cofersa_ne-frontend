import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const Reglas = () => {
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);

  useEffect(() => {
    fetchReglas();
  }, []);

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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/import-reglas`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error al importar archivo');
      
      const result = await response.json();
      alert(`Éxito: Se importaron ${result.count} reglas.`);
      fetchReglas();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImporting(false);
      setFile(null);
    }
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
        const updated = { ...r, [field]: value };
        if (field === 'limite_supervisor') {
          const num = parseFloat(value);
          updated.limite_compras = isNaN(num) ? 0 : parseFloat((num + 0.01).toFixed(2));
        }
        return updated;
      }
      return r;
    }));
  };

  const handleCellBlur = async (row, field, value) => {
    const isNew = typeof row.id === 'string' && row.id.startsWith('new-');
    
    if (isNew) {
      if (!row.marca || !row.marca.trim()) {
        return; // Esperar a que ingresen una marca para insertar
      }
      try {
        const { id, ...dataToInsert } = row;
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
        const updateData = { [field]: value };
        if (field === 'limite_supervisor') {
          const num = parseFloat(value);
          updateData.limite_compras = isNaN(num) ? 0 : parseFloat((num + 0.01).toFixed(2));
        }
        
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

  return (
    <Layout title="Reglas de Aprobación" active="reglas">
      <h1>Reglas de Aprobación por Marca</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={handleImport}>
            <input 
                type="file" 
                accept=".xlsx" 
                className="form-control" 
                style={{ maxWidth: '300px' }} 
                onChange={(e) => setFile(e.target.files[0])}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!file || importing}>
                {importing ? 'Importando...' : 'Importar Excel/CSV'}
            </button>
          </form>
          
          <button className="btn btn-outline btn-sm" onClick={handleExportCSV}>Exportar CSV</button>
          <button className="btn btn-success btn-sm" onClick={handleAddRow} disabled={loading}>+ Agregar Fila</button>
          
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
              ) : reglas.map((r, index) => {
                const comprasLimit = r.limite_supervisor ? `≥ ${(parseFloat(r.limite_supervisor) + 0.01).toFixed(2)}%` : '—';
                return (
                  <tr key={r.id}>
                    <td>{index + 1}</td>
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
                    <td style={{ padding: '8px', fontSize: '13px', color: '#555' }}>
                      <strong>{comprasLimit}</strong>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button>
                    </td>
                  </tr>
                );
              })}
              {!loading && reglas.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center color-muted">No hay reglas definidas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Reglas;
