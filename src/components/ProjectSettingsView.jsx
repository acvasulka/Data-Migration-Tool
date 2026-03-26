import { useState } from "react";
import { updateProject, saveProjectCredentials, updateProjectModules, updateCardSetting } from "../db";
import { encodeCredentials, testFmxConnection, fetchFmxModules, normalizeModules, mergeModules } from "../fmxSync";
import { getImportOrder, getSchemaDisplayName } from "../schemas";

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const GREEN = '#1A7F4E';

export default function ProjectSettingsView({ selectedProject, onProjectUpdated }) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlVal, setUrlVal] = useState('');
  const [saving, setSaving] = useState(false);

  // Modules
  const [modulesDetecting, setModulesDetecting] = useState(false);
  const [modulesMsg, setModulesMsg] = useState('');
  const [editingModules, setEditingModules] = useState(false);
  // editModulesVal: { workRequestModules:[{slug,label}], scheduleRequestModules:[{slug,label}], workTaskModules:[{slug,label}] }
  const [editModulesVal, setEditModulesVal] = useState({});

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

    // Auto-detect modules immediately after a verified credential save.
    // Read url/email/pw from the fresh DB row and local closure values
    // (not from selectedProject which may be stale on new projects).
    if (updated && verified) {
      const url = updated.fmx_site_url;   // fresh DB row — never stale
      const email = credEmail;             // capture before React state clears
      const pw = credPassword;
      if (url && email && pw) {
        try {
          const fresh = await fetchFmxModules(url, email, pw);
          const existing = normalizeModules(updated.fmx_modules);
          const { merged, changed } = mergeModules(existing, fresh);
          if (changed) {
            const withMods = await updateProjectModules(updated.id, merged);
            if (withMods && onProjectUpdated) onProjectUpdated(withMods);
          }
        } catch (err) {
          console.error('Auto-detect modules failed:', err);
        }
      }
    }
  };

  const handleAutoDetectModules = async () => {
    const { email, password } = (() => {
      try {
        if (!selectedProject?.fmx_credentials) return { email: '', password: '' };
        const decoded = atob(selectedProject.fmx_credentials);
        const idx = decoded.indexOf(':');
        return idx === -1
          ? { email: '', password: '' }
          : { email: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
      } catch { return { email: '', password: '' }; }
    })();
    const url = selectedProject?.fmx_site_url;
    if (!url || !email) { setModulesMsg('Site URL and credentials are required.'); return; }
    setModulesDetecting(true);
    setModulesMsg('');
    try {
      const fresh = await fetchFmxModules(url, email, password);
      const existing = normalizeModules(selectedProject?.fmx_modules);
      const { merged, changed } = mergeModules(existing, fresh);

      if (!changed) {
        setModulesMsg('✓ Already up to date — no module changes detected.');
        setModulesDetecting(false);
        return;
      }

      const updated = await updateProjectModules(selectedProject.id, merged);
      if (updated && onProjectUpdated) onProjectUpdated(updated);

      // Build summary message
      const pl = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`;
      const activeWr  = merged.workRequestModules.filter(m => !m.disabled);
      const disabledWr = merged.workRequestModules.filter(m => m.disabled);
      const activeSr  = merged.scheduleRequestModules.filter(m => !m.disabled);
      const activeWt  = merged.workTaskModules.filter(m => !m.disabled);
      const disabledWt = merged.workTaskModules.filter(m => m.disabled);

      let msg = `✓ Updated — ${pl(activeWr.length, 'work request module')}: ${activeWr.map(m => m.label).join(', ')}`;
      msg += ` · ${pl(activeSr.length, 'schedule module')}: ${activeSr.map(m => m.label).join(', ')}`;
      msg += ` · ${pl(activeWt.length, 'work task module')}: ${activeWt.map(m => m.label).join(', ')}`;
      if (disabledWr.length + disabledWt.length > 0) {
        const disabledLabels = [...disabledWr, ...disabledWt].map(m => m.label).join(', ');
        msg += ` · Disabled: ${disabledLabels}`;
      }
      setModulesMsg(msg);
    } catch {
      setModulesMsg('✕ Could not auto-detect modules.');
    }
    setModulesDetecting(false);
  };

  const handleSaveModules = async () => {
    const updated = await updateProjectModules(selectedProject.id, editModulesVal);
    if (updated && onProjectUpdated) onProjectUpdated(updated);
    setEditingModules(false);
    setModulesMsg('');
  };

  // Helpers for editing module arrays
  const updateModuleEntry = (key, idx, field, value) => {
    setEditModulesVal(prev => {
      const arr = [...(prev[key] || [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...prev, [key]: arr };
    });
  };
  const addModuleEntry = (key) => {
    setEditModulesVal(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), { slug: '', label: '' }],
    }));
  };
  const removeModuleEntry = (key, idx) => {
    setEditModulesVal(prev => {
      const arr = [...(prev[key] || [])];
      arr.splice(idx, 1);
      return { ...prev, [key]: arr };
    });
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
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
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
      {/* FMX Modules — only show when credentials are saved */}
      {selectedProject?.fmx_credentials && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              FMX Module Names
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {!editingModules && (
                <button
                  onClick={() => {
                    const normalized = normalizeModules(selectedProject?.fmx_modules) || {
                      workRequestModules:    [{ slug: 'maintenance', label: 'Maintenance' }],
                      scheduleRequestModules: [{ slug: 'scheduling',  label: 'Scheduling'  }],
                      workTaskModules:       [{ slug: 'maintenance', label: 'Maintenance' }],
                    };
                    setEditModulesVal(JSON.parse(JSON.stringify(normalized)));
                    setEditingModules(true);
                    setModulesMsg('');
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#6B7280', textDecoration: 'underline', padding: 0 }}
                >
                  Edit
                </button>
              )}
              <button
                onClick={handleAutoDetectModules}
                disabled={modulesDetecting}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {modulesDetecting ? 'Detecting…' : 'Auto-detect'}
              </button>
            </div>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
            FMX uses org-specific URL slugs. Each module creates its own import card. Auto-detect reads all available modules from your org's API, or configure them manually.
          </p>

          {editingModules ? (
            <div>
              {[
                { key: 'workRequestModules', label: 'Work Request Modules', placeholder: 'maintenance' },
                { key: 'scheduleRequestModules', label: 'Schedule Request Modules', placeholder: 'scheduling' },
                { key: 'workTaskModules', label: 'Work Task Modules', placeholder: 'maintenance' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{label}</div>
                  {(editModulesVal[key] || []).map((entry, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <input
                        style={{ ...inputStyle, fontSize: 12, flex: 1 }}
                        placeholder={`URL slug (e.g. ${placeholder})`}
                        value={entry.slug || ''}
                        onChange={e => updateModuleEntry(key, idx, 'slug', e.target.value)}
                      />
                      <input
                        style={{ ...inputStyle, fontSize: 12, flex: 1 }}
                        placeholder="Display label (e.g. Maintenance)"
                        value={entry.label || ''}
                        onChange={e => updateModuleEntry(key, idx, 'label', e.target.value)}
                      />
                      <button
                        onClick={() => removeModuleEntry(key, idx)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9CA3AF', padding: '0 4px', lineHeight: 1 }}
                        title="Remove"
                      >×</button>
                    </div>
                  ))}
                  <button
                    onClick={() => addModuleEntry(key)}
                    style={{ fontSize: 12, color: ORANGE, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                  >+ Add module</button>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={handleSaveModules}
                  style={{ padding: '8px 16px', background: ORANGE, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  Save
                </button>
                <button onClick={() => { setEditingModules(false); setModulesMsg(''); }}
                  style={{ padding: '8px 14px', background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (() => {
            const mods = normalizeModules(selectedProject?.fmx_modules);
            const sections = [
              { key: 'workRequestModules', label: 'Work Request Modules' },
              { key: 'scheduleRequestModules', label: 'Schedule Request Modules' },
              { key: 'workTaskModules', label: 'Work Task Modules' },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {sections.map(({ key, label }) => {
                  const entries = mods?.[key] || [];
                  return (
                    <div key={key}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                      {entries.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {entries.map((m, i) => (
                            <div key={i} style={{
                              background: m.disabled ? '#F9FAFB' : '#F3F4F6',
                              borderRadius: 6, padding: '6px 10px', fontSize: 12,
                              border: m.disabled ? '1px solid #E5E7EB' : 'none',
                              opacity: m.disabled ? 0.7 : 1,
                            }}>
                              <span style={{ fontWeight: 600, color: m.disabled ? '#9CA3AF' : NAVY }}>{m.label}</span>
                              <span style={{ color: '#9CA3AF', marginLeft: 4 }}>({m.slug})</span>
                              {m.disabled && <span style={{ marginLeft: 6, fontSize: 10, color: '#DC2626', fontWeight: 600 }}>disabled</span>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>default</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {modulesMsg && (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: modulesMsg.startsWith('✓') ? GREEN : '#DC2626' }}>
              {modulesMsg}
            </p>
          )}
        </div>
      )}

      {/* Card Visibility */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '20px 24px' }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
          Card Visibility
        </label>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
          Toggle cards off to hide them from the Overview tab.
        </p>
        {(() => {
          const mods = normalizeModules(selectedProject?.fmx_modules);
          const order = getImportOrder(mods);
          const settings = selectedProject?.card_settings || {};
          return order.map(schema => {
            const isHidden = settings[schema]?.hidden || false;
            return (
              <div key={schema} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ fontSize: 13, color: isHidden ? '#9CA3AF' : NAVY, fontWeight: 500 }}>
                  {getSchemaDisplayName(schema)}
                </span>
                <button
                  onClick={async () => {
                    const updated = await updateCardSetting(selectedProject.id, schema, 'hidden', !isHidden);
                    if (updated) onProjectUpdated(updated);
                  }}
                  style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: isHidden ? '#D1D5DB' : GREEN,
                    position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0,
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 2,
                    left: isHidden ? 2 : 18, transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}
