import { useState, useEffect, useMemo } from 'react';
import {
  getAllPrompts,
  createPromptVersion,
  activatePromptVersion,
  getExamplesForPrompt,
  setExampleEnabled,
  deleteExample,
} from '../db';
import PromptDiffModal from './PromptDiffModal';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const BORDER = '#E5E7EB';

// Migration types that are candidates for PDF extraction. Admins can still
// create prompts for other types by typing a free-form type below.
const SUGGESTED_TYPES = ['Building', 'Resource', 'Equipment', 'Inventory', 'User'];

export default function PromptsAdminTab({ currentUserId }) {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('Building');
  const [editingBody, setEditingBody] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [customType, setCustomType] = useState('');
  const [examples, setExamples] = useState([]);
  const [diffVersion, setDiffVersion] = useState(null); // prompt row to compare against active

  const load = async () => {
    setLoading(true);
    const rows = await getAllPrompts();
    setPrompts(rows);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // All prompts for the selected migration type, newest-version first.
  const versionsForType = useMemo(
    () => prompts
      .filter(p => p.migration_type === selectedType && p.stage === 'extraction')
      .sort((a, b) => b.version - a.version),
    [prompts, selectedType],
  );

  const activeVersion = versionsForType.find(v => v.active) || versionsForType[0] || null;

  // When the selected type changes, prefill the editor with the active version's body.
  useEffect(() => {
    if (activeVersion) {
      setEditingBody(activeVersion.body);
      setEditingNotes('');
    } else {
      setEditingBody('');
      setEditingNotes('');
    }
  }, [selectedType, activeVersion?.id]);

  // Load examples attached to the active prompt for the selected type.
  useEffect(() => {
    if (!activeVersion?.id) { setExamples([]); return; }
    let cancelled = false;
    (async () => {
      const rows = await getExamplesForPrompt(activeVersion.id);
      if (!cancelled) setExamples(rows);
    })();
    return () => { cancelled = true; };
  }, [activeVersion?.id]);

  const handleToggleExample = async (id, enabled) => {
    await setExampleEnabled(id, enabled);
    if (activeVersion?.id) setExamples(await getExamplesForPrompt(activeVersion.id));
  };
  const handleDeleteExample = async (id) => {
    if (!window.confirm('Delete this example? The source correction will become promotable again.')) return;
    await deleteExample(id);
    if (activeVersion?.id) setExamples(await getExamplesForPrompt(activeVersion.id));
  };

  const allTypes = useMemo(() => {
    const set = new Set([...SUGGESTED_TYPES, ...prompts.map(p => p.migration_type)]);
    return Array.from(set).sort();
  }, [prompts]);

  const handleSaveNewVersion = async () => {
    if (!editingBody.trim()) {
      setErrorMsg('Prompt body is empty.');
      return;
    }
    setErrorMsg('');
    setBusy(true);
    const result = await createPromptVersion({
      migrationType: selectedType,
      stage: 'extraction',
      body: editingBody,
      notes: editingNotes || null,
      makeActive: true,
      createdBy: currentUserId,
    });
    if (!result) setErrorMsg('Failed to save. You may not have admin permission.');
    await load();
    setBusy(false);
  };

  const handleActivate = async (promptId) => {
    setBusy(true);
    await activatePromptVersion(promptId);
    await load();
    setBusy(false);
  };

  const handleAddCustomType = () => {
    const t = customType.trim();
    if (!t) return;
    setSelectedType(t);
    setEditingBody(
      `You are extracting structured tabular data from a page of a PDF report about ${t} records.\n\n` +
      `Return ONLY JSON: { "fields": [...], "rows": [{...}], "notes": "..." }`
    );
    setCustomType('');
  };

  return (
    <div style={{ padding: '16px 28px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, flex: 1 }}>
      <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>
        These prompts drive PDF-to-spreadsheet extraction. Claude reads each page image with the <strong>active</strong> prompt
        for the migration type. Every edit creates a new version; older versions are kept for audit and rollback.
      </div>

      {/* Type selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Migration type:</label>
        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          style={{ fontSize: 13, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB` }}
        >
          {allTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>
          Active: <strong style={{ color: NAVY }}>
            {activeVersion ? `v${activeVersion.version}` : 'none'}
          </strong>
          {versionsForType.length > 0 && ` · ${versionsForType.length} version${versionsForType.length === 1 ? '' : 's'}`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="text"
            value={customType}
            onChange={e => setCustomType(e.target.value)}
            placeholder="Add custom type…"
            style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB`, width: 160 }}
          />
          <button
            onClick={handleAddCustomType}
            disabled={!customType.trim()}
            style={{ fontSize: 11, padding: '5px 10px', borderRadius: 5, background: '#fff', border: '1px solid #D1D5DB', cursor: customType.trim() ? 'pointer' : 'not-allowed' }}
          >+ Add</button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 12, borderRadius: 5 }}>
          {errorMsg}
        </div>
      )}

      {/* Editor */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>
          Prompt body (sent as system prompt to Claude vision)
        </label>
        <textarea
          value={editingBody}
          onChange={e => setEditingBody(e.target.value)}
          rows={12}
          style={{
            fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace',
            padding: 10, borderRadius: 6, border: `1px solid #D1D5DB`,
            background: '#FAFAFA', resize: 'vertical', lineHeight: 1.45,
          }}
        />
        <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginTop: 4 }}>
          Notes / changelog (optional)
        </label>
        <input
          type="text"
          value={editingNotes}
          onChange={e => setEditingNotes(e.target.value)}
          placeholder="e.g. Tightened row extraction for asset-tag columns"
          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 5, border: `1px solid #D1D5DB` }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => { setEditingBody(activeVersion?.body || ''); setEditingNotes(''); }}
            disabled={busy || !activeVersion}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 5, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
          >Revert</button>
          <button
            onClick={handleSaveNewVersion}
            disabled={busy || !editingBody.trim()}
            style={{ fontSize: 12, padding: '6px 14px', borderRadius: 5, background: ORANGE, color: '#fff', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.7 : 1 }}
          >{busy ? 'Saving…' : 'Save as new version & activate'}</button>
        </div>
      </div>

      {/* Few-shot examples attached to the active prompt */}
      {activeVersion && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Few-shot examples (applied on top of active prompt)
          </div>
          {examples.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
              None yet. Promote user corrections on the Corrections tab to add examples.
            </div>
          ) : (
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', maxHeight: 180 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>Label</th>
                    <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>Hint</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}>Used</th>
                    <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}></th>
                  </tr>
                </thead>
                <tbody>
                  {examples.map(ex => (
                    <tr key={ex.id} style={{ borderBottom: `1px solid #F3F4F6` }}>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="checkbox"
                          checked={ex.enabled}
                          onChange={e => handleToggleExample(ex.id, e.target.checked)}
                          style={{ marginRight: 6 }}
                        />
                        {ex.label || '(untitled)'}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#6B7280', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={ex.example_json?.hint || JSON.stringify(ex.example_json)}>
                        {ex.example_json?.hint || JSON.stringify(ex.example_json).slice(0, 120)}
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: '#6B7280' }}>{ex.use_count}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteExample(ex.id)}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#fff', border: '1px solid #FECACA', color: '#DC2626', cursor: 'pointer' }}
                        >Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Version history */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: NAVY, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Version history
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</div>
        ) : versionsForType.length === 0 ? (
          <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>
            No versions yet — save one above to create v1.
          </div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'auto', maxHeight: 200 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>Version</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>Notes</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: `1px solid ${BORDER}` }}>Created</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: `1px solid ${BORDER}` }}></th>
                </tr>
              </thead>
              <tbody>
                {versionsForType.map(v => (
                  <tr key={v.id} style={{ borderBottom: `1px solid #F3F4F6` }}>
                    <td style={{ padding: '6px 10px' }}>
                      v{v.version}
                      {v.active && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 8, background: '#DCFCE7', color: '#166534' }}>
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '6px 10px', color: '#6B7280' }}>{v.notes || '—'}</td>
                    <td style={{ padding: '6px 10px', color: '#9CA3AF' }}>
                      {v.created_at ? new Date(v.created_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => { setEditingBody(v.body); setEditingNotes(''); }}
                        style={{ fontSize: 11, padding: '3px 8px', marginRight: 4, borderRadius: 4, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
                      >Load</button>
                      {!v.active && activeVersion && (
                        <button
                          onClick={() => setDiffVersion(v)}
                          style={{ fontSize: 11, padding: '3px 8px', marginRight: 4, borderRadius: 4, background: '#fff', border: '1px solid #D1D5DB', cursor: 'pointer' }}
                          title={`Compare v${v.version} against active v${activeVersion.version}`}
                        >Diff</button>
                      )}
                      {!v.active && (
                        <button
                          onClick={() => handleActivate(v.id)}
                          disabled={busy}
                          style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: NAVY, color: '#fff', border: 'none', cursor: 'pointer' }}
                        >Activate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {diffVersion && activeVersion && (
        <PromptDiffModal
          leftLabel={`v${diffVersion.version} (historical)`}
          leftBody={diffVersion.body}
          rightLabel={`v${activeVersion.version} (active)`}
          rightBody={activeVersion.body}
          onClose={() => setDiffVersion(null)}
        />
      )}
    </div>
  );
}
