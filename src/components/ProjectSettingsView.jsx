import { useState } from "react";
import { updateProject, saveProjectCredentials } from "../db";
import { encodeCredentials, testFmxConnection } from "../fmxSync";

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const GREEN = '#1A7F4E';

export default function ProjectSettingsView({ selectedProject, onProjectUpdated }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlVal, setUrlVal] = useState('');
  const [saving, setSaving] = useState(false);

  // Credentials
  const [showCredForm, setShowCredForm] = useState(false);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credConnStatus, setCredConnStatus] = useState(null);
  const [credConnMsg, setCredConnMsg] = useState('');
  const [credConnLoading, setCredConnLoading] = useState(false);
  const [credSaving, setCredSaving] = useState(false);

  const inputStyle = {
    padding: '9px 12px', fontSize: 14, borderRadius: 6,
    border: '1px solid #D1D5DB', outline: 'none',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    width: '100%', boxSizing: 'border-box',
  };

  const handleNameSave = async () => {
    if (nameVal.trim() && nameVal !== selectedProject.name) {
      setSaving(true);
      const updated = await updateProject(selectedProject.id, { name: nameVal.trim() });
      if (updated && onProjectUpdated) onProjectUpdated(updated);
      setSaving(false);
    }
    setEditingName(false);
  };

  const handleUrlSave = async () => {
    if (urlVal.trim() && urlVal !== selectedProject.fmx_site_url) {
      setSaving(true);
      const updated = await updateProject(selectedProject.id, { fmx_site_url: urlVal.trim() });
      if (updated && onProjectUpdated) onProjectUpdated(updated);
      setSaving(false);
    }
    setEditingUrl(false);
  };

  const handleTestCred = async () => {
    const url = editingUrl ? urlVal : selectedProject?.fmx_site_url;
    if (!url) return;
    setCredConnLoading(true);
    setCredConnStatus(null);
    const result = await testFmxConnection(url, credEmail, credPassword);
    setCredConnStatus(result.success ? 'ok' : 'fail');
    setCredConnMsg(result.message);
    setCredConnLoading(false);
  };

  const handleSaveCred = async () => {
    setCredSaving(true);
    const encoded = encodeCredentials(credEmail, credPassword);
    const verified = credConnStatus === 'ok';
    const updated = await saveProjectCredentials(selectedProject.id, encoded, verified);
    if (updated && onProjectUpdated) onProjectUpdated(updated);
    setShowCredForm(false);
    setCredEmail(''); setCredPassword(''); setCredConnStatus(null);
    setCredSaving(false);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Project Name */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
          Project Name
        </label>
        {editingName ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
              style={inputStyle}
            />
            <button onClick={handleNameSave} disabled={saving}
              style={{ padding: '9px 16px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditingName(false)}
              style={{ padding: '9px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: NAVY }}>{selectedProject?.name}</span>
            <button onClick={() => { setEditingName(true); setNameVal(selectedProject?.name || ''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', textDecoration: 'underline', padding: 0 }}>
              Edit
            </button>
          </div>
        )}
      </div>

      {/* FMX Site URL */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
          FMX Site URL
        </label>
        {editingUrl ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              autoFocus
              value={urlVal}
              onChange={e => setUrlVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleUrlSave(); if (e.key === 'Escape') setEditingUrl(false); }}
              placeholder="yoursite.gofmx.com"
              style={inputStyle}
            />
            <button onClick={handleUrlSave} disabled={saving}
              style={{ padding: '9px 16px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button onClick={() => setEditingUrl(false)}
              style={{ padding: '9px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, color: selectedProject?.fmx_site_url ? NAVY : '#9CA3AF' }}>
              {selectedProject?.fmx_site_url || 'Not set'}
            </span>
            {selectedProject?.fmx_connection_verified && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#E6F4EE', color: GREEN }}>
                ✓ FMX Connected
              </span>
            )}
            <button onClick={() => { setEditingUrl(true); setUrlVal(selectedProject?.fmx_site_url || ''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', textDecoration: 'underline', padding: 0 }}>
              Edit
            </button>
          </div>
        )}
      </div>

      {/* API Credentials */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            API Credentials
          </label>
          {selectedProject?.fmx_credentials && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: '#E6F4EE', color: GREEN }}>
              {selectedProject?.fmx_connection_verified ? '✓ Verified' : 'Saved'}
            </span>
          )}
        </div>
        <button
          onClick={() => { setShowCredForm(v => !v); setCredConnStatus(null); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#6B7280', padding: 0, textDecoration: 'underline' }}
        >
          {showCredForm ? 'Cancel' : (selectedProject?.fmx_credentials ? 'Update credentials' : 'Add credentials')}
        </button>

        {showCredForm && (
          <div style={{ marginTop: 14 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>API email</label>
              <input style={inputStyle} type="email" placeholder="admin@example.com"
                value={credEmail} onChange={e => { setCredEmail(e.target.value); setCredConnStatus(null); }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>API password</label>
              <input style={inputStyle} type="password" placeholder="••••••••"
                value={credPassword} onChange={e => { setCredPassword(e.target.value); setCredConnStatus(null); }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <button
                onClick={handleTestCred}
                disabled={!credEmail || !credPassword || credConnLoading || !selectedProject?.fmx_site_url}
                style={{ fontSize: 13, padding: '7px 16px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {credConnLoading ? 'Testing…' : 'Test connection'}
              </button>
              {credConnStatus && (
                <span style={{ fontSize: 13, color: credConnStatus === 'ok' ? GREEN : '#DC2626', fontWeight: 500 }}>
                  {credConnMsg}
                </span>
              )}
            </div>
            <button
              onClick={handleSaveCred}
              disabled={!credEmail || !credPassword || credSaving}
              style={{ padding: '9px 20px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 500, opacity: (!credEmail || !credPassword) ? 0.5 : 1, fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {credSaving ? 'Saving…' : 'Save credentials'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
