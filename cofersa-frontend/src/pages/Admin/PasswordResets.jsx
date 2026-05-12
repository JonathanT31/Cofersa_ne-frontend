import React, { useState } from 'react';
import { formatCRC, formatPct, EstadoBadge } from "../../components/common/UIComponents";
import Layout from '../../components/layout/Layout';

const initialResets = [
  { id: 1, username: 'j.perez', nombre: 'Juan', apellido: 'Perez', email: 'jperez@cofersa.cr', role: 'vendedor', estado: 'pendiente', requested_at: '2026-05-07 08:30', resolved_by_name: '', resolved_at: '' },
  { id: 2, username: 'm.gomez', nombre: 'Maria', apellido: 'Gomez', email: 'mgomez@cofersa.cr', role: 'vendedor', estado: 'atendida', requested_at: '2026-05-06 14:20', resolved_by_name: 'Admin Prueba', resolved_at: '2026-05-06 15:00' },
  { id: 3, username: 'c.ruiz', nombre: 'Carlos', apellido: 'Ruiz', email: 'cruiz@cofersa.cr', role: 'supervisor', estado: 'rechazada', requested_at: '2026-05-05 09:10', resolved_by_name: 'Admin Prueba', resolved_at: '2026-05-05 10:00' }
];

const PasswordResets = () => {
  const [resets, setResets] = useState(initialResets);
  const [selectedIds, setSelectedIds] = useState([]);

  const pendientesCount = resets.filter(r => r.estado === 'pendiente').length;

  const handleSelectAll = () => {
    const pendingIds = resets.filter(r => r.estado === 'pendiente').map(r => r.id);
    setSelectedIds(pendingIds);
  };

  const toggleSelect = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleApprove = (id) => {
    window.alert(`Contraseña reseteada a: Cofersa123!\nComuníquela al usuario de forma segura.`);
    setResets(resets.map(r => r.id === id ? { ...r, estado: 'atendida', resolved_by_name: 'Admin Actual', resolved_at: new Date().toISOString().substring(0,16).replace('T', ' ') } : r));
    setSelectedIds(selectedIds.filter(x => x !== id));
  };

  const handleReject = (id) => {
    if (window.confirm('¿Rechazar esta solicitud?')) {
      setResets(resets.map(r => r.id === id ? { ...r, estado: 'rechazada', resolved_by_name: 'Admin Actual', resolved_at: new Date().toISOString().substring(0,16).replace('T', ' ') } : r));
      setSelectedIds(selectedIds.filter(x => x !== id));
    }
  };

  const handleBulkApprove = () => {
    if (selectedIds.length === 0) {
      window.alert('Selecciona al menos una solicitud.');
      return;
    }
    if (window.confirm(`¿Aprobar ${selectedIds.length} solicitud(es)?`)) {
      const msg = selectedIds.map(id => {
        const u = resets.find(r => r.id === id);
        return `${u.username}: Cofersa123!`;
      }).join('\n');
      
      window.alert(`Contraseñas reseteadas:\n${msg}\n\nComuníquelas a los usuarios de forma segura.`);
      
      setResets(resets.map(r => selectedIds.includes(r.id) ? { ...r, estado: 'atendida', resolved_by_name: 'Admin Actual', resolved_at: new Date().toISOString().substring(0,16).replace('T', ' ') } : r));
      setSelectedIds([]);
    }
  };

  const getBadgeClass = (estado) => {
    switch(estado) {
      case 'pendiente': return 'badge-pending';
      case 'atendida': return 'badge-approved';
      case 'rechazada': return 'badge-rejected';
      default: return 'badge-draft';
    }
  };

  return (
    <Layout title="Reseteos PW" active="pwresets">
      <div className="page-header">
        <h1>Reseteos de Contraseña</h1>
        <span className="badge badge-pending">{pendientesCount} pendientes</span>
      </div>
      
      <div className="card">
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
          <button className="btn btn-success btn-sm" onClick={handleBulkApprove}>✓ Aprobar Seleccionados</button>
          <button className="btn btn-outline btn-sm" onClick={handleSelectAll}>Seleccionar pendientes</button>
        </div>
        
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30px' }}></th>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Solicitado</th>
                <th>Resuelto por</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resets.map(r => (
                <tr key={r.id}>
                  <td>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(r.id)}
                      onChange={() => toggleSelect(r.id)}
                      disabled={r.estado !== 'pendiente'}
                      style={{ cursor: r.estado === 'pendiente' ? 'pointer' : 'default' }}
                    />
                  </td>
                  <td>{r.username}</td>
                  <td>{r.nombre} {r.apellido}</td>
                  <td>{r.email}</td>
                  <td>{r.role}</td>
                  <td><span className={`badge ${getBadgeClass(r.estado)}`}>{r.estado}</span></td>
                  <td>{r.requested_at}</td>
                  <td className="font-sm">{r.resolved_by_name ? `${r.resolved_by_name} ${r.resolved_at}` : ''}</td>
                  <td>
                    {r.estado === 'pendiente' && (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="btn btn-success btn-sm" onClick={() => handleApprove(r.id)}>✓ Aprobar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleReject(r.id)}>✕ Rechazar</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {resets.length === 0 && (
                <tr>
                  <td colSpan="9" className="text-center color-muted">Sin solicitudes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default PasswordResets;
