import React, { useState } from 'react';
import Layout from '../../components/layout/Layout';

const initialPpto = [
  { id: 1, supervisor: 's.lopez', asesor: 'j.perez', marca: 'Marca A', ppto_mensual_crc: 1500000 },
  { id: 2, supervisor: 's.lopez', asesor: 'j.perez', marca: 'Marca B', ppto_mensual_crc: 800000 },
  { id: 3, supervisor: 'm.gomez', asesor: 'c.ruiz', marca: 'Marca C', ppto_mensual_crc: 2000000 }
];

const Presupuesto = () => {
  const [presupuesto, setPresupuesto] = useState(initialPpto);

  const handleAddRow = () => {
    const newId = presupuesto.length > 0 ? Math.max(...presupuesto.map(p => p.id)) + 1 : 1;
    setPresupuesto([...presupuesto, {
      id: newId, supervisor: '', asesor: '', marca: '', ppto_mensual_crc: 0
    }]);
  };

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar?')) {
      setPresupuesto(presupuesto.filter(p => p.id !== id));
    }
  };

  const handleChange = (id, field, value) => {
    setPresupuesto(presupuesto.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const handleBlur = (e) => {
    const el = e.target;
    el.style.borderColor = '#27ae60';
    setTimeout(() => { if (el) el.style.borderColor = ''; }, 1000);
  };

  return (
    <Layout title="Presupuesto" active="presupuesto">
      <h1>Presupuesto Mensual por Marca/Asesor</h1>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <form style={{ display: 'flex', gap: '10px', alignItems: 'center' }} onSubmit={e => e.preventDefault()}>
            <input type="file" accept=".xlsx,.csv" className="form-control" style={{ maxWidth: '300px' }} />
            <button type="button" className="btn btn-primary btn-sm">Importar Excel/CSV</button>
          </form>
          <button className="btn btn-outline btn-sm">Exportar CSV</button>
          <button className="btn btn-success btn-sm" onClick={handleAddRow}>+ Agregar Fila</button>
        </div>
        
        <p style={{ fontSize: '12px', color: '#888' }}>Total: {presupuesto.length} registros | Página 1 de 1</p>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Supervisor</th>
                <th>Asesor</th>
                <th>Marca</th>
                <th>Ppto Mensual CRC</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {presupuesto.map(p => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>
                    <input type="text" className="form-control" value={p.supervisor} 
                      onChange={e => handleChange(p.id, 'supervisor', e.target.value)}
                      onBlur={handleBlur} style={{ minWidth: '120px' }} />
                  </td>
                  <td>
                    <input type="text" className="form-control" value={p.asesor} 
                      onChange={e => handleChange(p.id, 'asesor', e.target.value)}
                      onBlur={handleBlur} style={{ minWidth: '120px' }} />
                  </td>
                  <td>
                    <input type="text" className="form-control" value={p.marca} 
                      onChange={e => handleChange(p.id, 'marca', e.target.value)}
                      onBlur={handleBlur} style={{ minWidth: '100px' }} />
                  </td>
                  <td>
                    <input type="number" className="form-control" value={p.ppto_mensual_crc} step="1"
                      onChange={e => handleChange(p.id, 'ppto_mensual_crc', parseFloat(e.target.value) || 0)}
                      onBlur={handleBlur} style={{ width: '120px' }} />
                  </td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>✕</button>
                  </td>
                </tr>
              ))}
              {presupuesto.length === 0 && (
                <tr><td colSpan="6" className="text-center color-muted">No hay registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: '10px' }}>
          <button className="btn btn-primary btn-sm">1</button>
        </div>
      </div>
    </Layout>
  );
};

export default Presupuesto;
