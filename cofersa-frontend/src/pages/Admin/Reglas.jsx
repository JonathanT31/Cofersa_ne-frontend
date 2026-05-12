import React, { useState, useEffect } from 'react';
import Layout from '../../components/layout/Layout';
import { ENDPOINTS } from '../../api/endpoints';
import { httpClient } from '../../api/httpClient';

const Reglas = () => {
  const [reglas, setReglas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReglas = async () => {
      try {
        const res = await httpClient(ENDPOINTS.admin.reglas);
        if (res.success) setReglas(res.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReglas();
  }, []);

  const handleAddRow = () => {
    const newId = reglas.length > 0 ? Math.max(...reglas.map(r => r.id)) + 1 : 1;
    setReglas([...reglas, {
      id: newId,
      marca: '',
      clasificacion: '',
      limite_vendedor: 0,
      limite_supervisor: 0,
      limite_compras: 0
    }]);
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar esta regla?')) {
      setReglas(reglas.filter(r => r.id !== id));
    }
  };

  const handleChange = (id, field, value) => {
    setReglas(reglas.map(r => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    }));
    
    // En una aplicación real, haríamos una llamada a la API aquí.
    // Podemos simular un efecto de éxito en el input sin hacer nada,
    // ya que React maneja el estado de forma limpia.
  };

  const handleBlur = (e) => {
    // Simular visualmente un guardado exitoso como en la versión de Python
    const el = e.target;
    el.style.borderColor = '#27ae60';
    setTimeout(() => {
      if (el) el.style.borderColor = '';
    }, 1000);
  };

if (loading) return <Layout title="Cargando..." active="reglas"><div className="text-center" style={{padding:'40px'}}>Cargando reglas...</div></Layout>;

  return (
    <Layout title="Reglas de Aprobación" active="reglas">
      <h1>Reglas de Aprobación por Marca</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={(e) => e.preventDefault()}>
            <input type="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="button" className="btn btn-primary btn-sm">Importar Excel/CSV</button>
          </form>
          
          <button className="btn btn-outline btn-sm">Exportar CSV</button>
          <button className="btn btn-success btn-sm" onClick={handleAddRow}>+ Agregar Fila</button>
          
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Marca</th>
                <th>Clasificación</th>
                <th>Lím. Vendedor %</th>
                <th>Lím. Supervisor %</th>
                <th>Compras (≥ Lím. Supervisor)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reglas.map(r => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={r.marca} 
                      onChange={(e) => handleChange(r.id, 'marca', e.target.value)}
                      onBlur={handleBlur}
                      style={{ minWidth: '120px' }} 
                    />
                  </td>
                  <td>
                    <input 
                      type="text" 
                      className="form-control" 
                      value={r.clasificacion} 
                      onChange={(e) => handleChange(r.id, 'clasificacion', e.target.value)}
                      onBlur={handleBlur}
                      style={{ minWidth: '80px' }} 
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={r.limite_vendedor} 
                      step="0.01"
                      onChange={(e) => handleChange(r.id, 'limite_vendedor', parseFloat(e.target.value) || 0)}
                      onBlur={handleBlur}
                      style={{ width: '80px' }} 
                    />
                  </td>
                  <td>
                    <input 
                      type="number" 
                      className="form-control" 
                      value={r.limite_supervisor} 
                      step="0.01"
                      onChange={(e) => handleChange(r.id, 'limite_supervisor', parseFloat(e.target.value) || 0)}
                      onBlur={handleBlur}
                      style={{ width: '80px' }} 
                    />
                  </td>
                  <td style={{ padding: '8px', fontSize: '13px', color: '#555' }}>
                    ≥ <strong>{r.limite_compras}%</strong>
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {reglas.length === 0 && (
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
