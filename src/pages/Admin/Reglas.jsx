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

  const handleAddRow = () => {
    setReglas([{
      id: 'new-' + Date.now(),
      marca: '',
      clasificacion: '',
      limite_vendedor: 0,
      limite_supervisor: 0,
      limite_compras: 0
    }, ...reglas]);
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
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={handleImport}>
            <input 
                type="file" 
                accept=".xlsx" 
                className="form-control" 
                style={{ maxWidth: '300px' }} 
                onChange={(e) => setFile(e.target.files[0])}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!file || importing}>
                {importing ? 'Importando...' : 'Importar Excel'}
            </button>
          </form>
          
          <button className="btn btn-success btn-sm" onClick={handleAddRow} disabled={loading}>+ Agregar Fila</button>
          
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Marca</th>
                <th>Clasificación</th>
                <th>Lím. Vendedor %</th>
                <th>Lím. Supervisor %</th>
                <th>Lím. Compras %</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center">Cargando reglas...</td></tr>
              ) : reglas.map(r => (
                <tr key={r.id}>
                  <td>{r.marca}</td>
                  <td>{r.clasificacion}</td>
                  <td>{r.limite_vendedor}%</td>
                  <td>{r.limite_supervisor}%</td>
                  <td>{r.limite_compras}%</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!loading && reglas.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center color-muted">No hay reglas definidas</td>
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
