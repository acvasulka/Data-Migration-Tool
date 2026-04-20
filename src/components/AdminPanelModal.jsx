import { useState, useMemo } from 'react';
import { updateProfileRole, deleteUserViaEdgeFunction, createUserViaEdgeFunction } from '../db';
import PromptsAdminTab from './PromptsAdminTab';
import CorrectionsAdminTab from './CorrectionsAdminTab';
import RunsAdminTab from './RunsAdminTab';

const NAVY = '#041662';
const ORANGE = '#CF4A12';

export default function AdminPanelModal({ currentUser, currentProfile, allProfiles, projects, onClose, onProfilesChanged }) {
  const [busy, setBusy] = useState(null); // userId currently being operated on
  const [errorMsg, setErrorMsg] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'prompts'

  // Add-user form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newPassword, setNewPassword] = useState('');

  const resetAddForm = () => {
    setNewEmail('');
    setNewFullName('');
    setNewRole('user');
    setNewPassword('');
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setAddBusy(true);
    const result = await createUserViaEdgeFunction({
      email: newEmail.trim(),
      fullName: newFullName.trim(),
      role: newRole,
      password: newPassword,
    });
    if (result?.error) {
      setErrorMsg(result.error);
    } else {
      await onProfilesChanged?.();
      resetAddForm();
      setShowAddForm(false);
    }
    setAddBusy(false);
  };

  // Count admins to prevent demoting the last one
  const adminCount = useMemo(
    () => allProfiles.filter(p => p.role === 'admin').length,
    [allProfiles]
  );

  // Count projects per user
  const projectCountByUser = useMemo(() => {
    const map = {};
    for (const p of projects || []) {
      if (p.user_id) map[p.user_id] = (map[p.user_id] || 0) + 1;
    }
    return map;
  }, [projects]);

  const handleRoleChange = async (userId, newRole) => {
    setErrorMsg('');
    setBusy(userId);
    const result = await updateProfileRole(userId, newRole);
    if (!result) setErrorMsg('Could not update role. You may not have permission.');
    await onProfilesChanged?.();
    setBusy(null);
  };

  const handleDelete = async (userId) => {
    setErrorMsg('');
    setBusy(userId);
    const result = await deleteUserViaEdgeFunction(userId);
    if (result?.error) {
      setErrorMsg(result.error);
    } else {
      await onProfilesChanged?.();
    }
    setDeleteConfirmId(null);
    setBusy(null);
  };

  // Sort: current user first, then admins, then by name
  const sorted = useMemo(() => {
    return [...allProfiles].sort((a, b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '');
    });
  }, [allProfiles, currentUser.id]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 12px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: NAVY, margin: 0 }}>Admin Settings</h2>
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '4px 0 0' }}>
              {activeTab === 'users' ? `${allProfiles.length} users` : 'PDF extraction prompts'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeTab === 'users' && (
              <button
                onClick={() => { setErrorMsg(''); setShowAddForm(v => !v); }}
                style={{ fontSize: 12, padding: '6px 12px', borderRadius: 5, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                {showAddForm ? 'Cancel' : '+ Add user'}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          {[
            { id: 'users', label: 'Users' },
            { id: 'prompts', label: 'PDF Prompts' },
            { id: 'corrections', label: 'Corrections' },
            { id: 'runs', label: 'Extraction Runs' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setErrorMsg(''); }}
              style={{
                fontSize: 12, padding: '10px 20px',
                background: 'none', border: 'none',
                borderBottom: activeTab === tab.id ? `2px solid ${NAVY}` : '2px solid transparent',
                color: activeTab === tab.id ? NAVY : '#6B7280',
                fontWeight: activeTab === tab.id ? 600 : 500,
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >{tab.label}</button>
          ))}
        </div>

        {activeTab === 'prompts' && (
          <PromptsAdminTab currentUserId={currentUser.id} />
        )}
        {activeTab === 'corrections' && (
          <CorrectionsAdminTab currentUserId={currentUser.id} />
        )}
        {activeTab === 'runs' && (
          <RunsAdminTab allProfiles={allProfiles} currentUserId={currentUser.id} />
        )}

        {activeTab === 'users' && (<>
        {/* Add-user form */}
        {showAddForm && (
          <form
            onSubmit={handleAddUser}
            style={{ padding: '14px 28px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
          >
            <div>
              <label style={addLabel}>Full name</label>
              <input
                type="text" required
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                placeholder="Jane Smith"
                style={addInput}
              />
            </div>
            <div>
              <label style={addLabel}>Email</label>
              <input
                type="email" required
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="jane@example.com"
                style={addInput}
              />
            </div>
            <div>
              <label style={addLabel}>Role</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                style={addInput}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={addLabel}>Temporary password</label>
              <input
                type="text" required minLength={8}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                style={addInput}
              />
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => { resetAddForm(); setShowAddForm(false); setErrorMsg(''); }}
                disabled={addBusy}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 5, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
              >Cancel</button>
              <button
                type="submit"
                disabled={addBusy}
                style={{ fontSize: 12, padding: '6px 14px', borderRadius: 5, background: ORANGE, color: '#fff', border: 'none', cursor: addBusy ? 'not-allowed' : 'pointer', opacity: addBusy ? 0.7 : 1 }}
              >{addBusy ? 'Creating…' : 'Create user'}</button>
            </div>
          </form>
        )}

        {/* Error */}
        {errorMsg && (
          <div style={{ padding: '10px 28px', background: '#FEF2F2', borderBottom: '1px solid #FECACA', color: '#DC2626', fontSize: 13 }}>
            {errorMsg}
          </div>
        )}

        {/* Table */}
        <div style={{ overflow: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                <th style={th}>User</th>
                <th style={th}>Role</th>
                <th style={{ ...th, textAlign: 'center' }}>Projects</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const isSelf = p.id === currentUser.id;
                const isLastAdmin = p.role === 'admin' && adminCount <= 1;
                const busyThis = busy === p.id;
                const showDeleteConfirm = deleteConfirmId === p.id;

                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    {/* User */}
                    <td style={td}>
                      <div style={{ fontWeight: 500, color: '#111827' }}>
                        {p.full_name || '—'}
                        {isSelf && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#EEF0F8', color: NAVY }}>You</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{p.email || '—'}</div>
                    </td>

                    {/* Role */}
                    <td style={td}>
                      <select
                        value={p.role || 'user'}
                        onChange={e => handleRoleChange(p.id, e.target.value)}
                        disabled={busyThis || (isSelf && isLastAdmin)}
                        title={isSelf && isLastAdmin ? 'Cannot demote the last admin' : ''}
                        style={{
                          fontSize: 12, padding: '4px 8px', borderRadius: 5,
                          border: '1px solid #D1D5DB', background: '#fff',
                          cursor: (busyThis || (isSelf && isLastAdmin)) ? 'not-allowed' : 'pointer',
                          opacity: (isSelf && isLastAdmin) ? 0.5 : 1,
                        }}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>

                    {/* Project count */}
                    <td style={{ ...td, textAlign: 'center', color: '#6B7280' }}>
                      {projectCountByUser[p.id] || 0}
                    </td>

                    {/* Actions */}
                    <td style={{ ...td, textAlign: 'right' }}>
                      {isSelf ? (
                        <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>—</span>
                      ) : showDeleteConfirm ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                          {(projectCountByUser[p.id] || 0) > 0 && (
                            <span style={{ fontSize: 10, color: '#B45309', fontStyle: 'italic', maxWidth: 220, textAlign: 'right' }}>
                              Owns {projectCountByUser[p.id]} project{projectCountByUser[p.id] === 1 ? '' : 's'} — will become unassigned
                            </span>
                          )}
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={busyThis}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#DC2626', color: '#fff', border: 'none', cursor: busyThis ? 'not-allowed' : 'pointer' }}
                            >{busyThis ? 'Deleting…' : 'Yes, delete'}</button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              disabled={busyThis}
                              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
                            >Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(p.id)}
                          style={{ fontSize: 11, padding: '4px 10px', borderRadius: 4, background: 'none', border: '1px solid #FECACA', color: '#DC2626', cursor: 'pointer' }}
                        >Delete</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        </>)}

        {/* Footer */}
        <div style={{ padding: '12px 28px', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ fontSize: 13, padding: '8px 20px', borderRadius: 6, background: ORANGE, color: '#fff', border: 'none', cursor: 'pointer' }}
          >Done</button>
        </div>
      </div>
    </div>
  );
}

const th = {
  padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: NAVY,
  borderBottom: '1px solid #E5E7EB', fontSize: 12, whiteSpace: 'nowrap',
};
const td = { padding: '10px 16px', verticalAlign: 'middle' };

const addLabel = { display: 'block', fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 3 };
const addInput = {
  width: '100%', padding: '6px 9px', fontSize: 13, borderRadius: 5,
  border: '1px solid #D1D5DB', outline: 'none', boxSizing: 'border-box',
  background: '#fff',
};
