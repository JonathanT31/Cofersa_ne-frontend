import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { supabase } from '../../api/supabaseClient';

const formatCRC = (n) => {
  if (isNaN(n)) return "₡0.00";
  return "₡" + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const Presupuesto = () => {
  const [presupuesto, setPresupuesto] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState(null);

  useEffect(() => {
    fetchPresupuesto();
  }, []);

  const fetchPresupuesto = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('presupuesto')
        .select('*')
        .order('supervisor', { ascending: true });
      
      if (error) throw error;
      setPresupuesto(data || []);
    } catch (err) {
      console.error('Error fetching presupuesto:', err);
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

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/admin/import-presupuesto`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error al importar archivo');
      
      const result = await response.json();
      alert(`Éxito: Se importaron ${result.count} registros de presupuesto.`);
      fetchPresupuesto();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setImporting(false);
      setFile(null);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Eliminar este registro permanentemente?')) {
      const { error } = await supabase.from('presupuesto').delete().eq('id', id);
      if (error) alert('Error: ' + error.message);
      else fetchPresupuesto();
    }
  };

  return (
    <Layout title="Presupuesto" active="presupuesto">
      <h1>Presupuesto Mensual por Marca/Asesor</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={handleImport}>
            <input 
                type="file" 
                accept=".xlsx" 
                className="form-control" 
                style={{ maxWidth: '300px' }} 
                onChange={e => setFile(e.target.files[0])}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={!file || importing}>
                {importing ? 'Importando...' : 'Importar Excel'}
            </button>
          </form>
          <button className="btn btn-success btn-sm" onClick={() => alert('Próximamente')} disabled={loading}>+ Agregar Fila</button>
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Asesor</th>
                <th>Marca</th>
                <th className="text-right">Ppto Mensual</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center">Cargando presupuesto...</td></tr>
              ) : presupuesto.map(p => (
                <tr key={p.id}>
                  <td>{p.supervisor}</td>
                  <td>{p.asesor}</td>
                  <td>{p.marca}</td>
                  <td className="text-right">{formatCRC(p.ppto_mensual)}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {!loading && presupuesto.length === 0 && (
                <tr><td colSpan="5" className="text-center color-muted">No hay registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Presupuesto;
