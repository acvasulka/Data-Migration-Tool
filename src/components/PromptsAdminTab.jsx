import { useState, useEffect, useMemo } from 'react';
import {
  getAllPrompts,
  createPromptVersion,
  activatePromptVersion,
  getExamplesForPrompt,
  setExampleEnabled,
  deleteExample,
  listRecentRunsForReplay,
} from '../db';
import { buildSystemPrompt, estimateDryRunCost } from '../promptTemplates';
import { runExtractionDryRun, runMappingDryRun } from '../promptDryRun';
import PromptDiffModal from './PromptDiffModal';
import DryRunDiffPanel from './DryRunDiffPanel';

const NAVY = '#041662';
const ORANGE = '#CF4A12';
const BORDER = '#E5E7EB';

// Every import type supported by the app. Mirrors IMPORT_ORDER in src/schemas.js
// so the dropdown lists all static + active data types, not just the top five.
// Admins can still type a free-form custom type below if an FMX customer needs
// a non-standard migration.
const SUGGESTED_TYPES = [
  'Building', 'Resource', 'User', 'Equipment Type', 'Equipment', 'Inventory',
  'Work Request', 'Schedule Request', 'Work Task',
  'Transportation Request', 'Accounting Account',
  'Requisition', 'Utility Provider', 'Equipment Log',
  'Inventory Adjustment', 'Inventory Transfer',
];

export default function PromptsAdminTab({ currentUserId }) {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState('Building');
  // Prompts are keyed by (migration_type, stage). 'extraction' drives PDF
  // vision; 'field_mapping' drives the CSV column-mapping AI call.
  const [selectedStage, setSelectedStage] = useState('extraction');
  const [editingBody, setEditingBody] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [customType, setCustomType] = useState('');
  const [examples, setExamples] = useState([]);
  const [diffVersion, setDiffVersion] = useState(null); // prompt row to compare against active

  // Preview & Dry-Run state
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [draftExampleEnabled, setDraftExampleEnabled] = useState({}); // { [exampleId]: boolean } — local override, does not touch DB
  const [replayRuns, setReplayRuns] = useState([]);
  const [replayRunId, setReplayRunId] = useState('');
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunProgress, setDryRunProgress] = useState('');
  const [dryRunResult, setDryRunResult] = useState(null);
  const [dryRunError, setDryRunError] = useState('');
  const [dryRunSourceRun, setDryRunSourceRun] = useState(null);

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
      .filter(p => p.migration_type === selectedType && p.stage === selectedStage)
      .sort((a, b) => b.version - a.version),
    [prompts, selectedType, selectedStage],
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
  }, [selectedType, selectedStage, activeVersion?.id]);

  // Load examples attached to the active prompt for the selected type.
  useEffect(() => {
    if (!activeVersion?.id) { setExamples([]); setDraftExampleEnabled({}); return; }
    let cancelled = false;
    (async () => {
      const rows = await getExamplesForPrompt(activeVersion.id);
      if (cancelled) return;
      setExamples(rows);
      // Initialize draft toggle state from the stored `enabled` flag.
      const initial = {};
      for (const ex of rows) initial[ex.id] = !!ex.enabled;
      setDraftExampleEnabled(initial);
    })();
    return () => { cancelled = true; };
  }, [activeVersion?.id]);

  // Load replayable runs whenever the (type, stage) changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listRecentRunsForReplay(selectedType, selectedStage, 25);
      if (!cancelled) {
        setReplayRuns(rows);
        setReplayRunId(rows[0]?.id || '');
      }
    })();
    // Reset any previous dry-run output when switching context.
    setDryRunResult(null);
    setDryRunSourceRun(null);
    setDryRunError('');
    return () => { cancelled = true; };
  }, [selectedType, selectedStage]);

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
      stage: selectedStage,
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

  // Build the draft system prompt exactly as it would be sent to Claude.
  // Uses the currently-selected replay run (if any) for realistic vars; falls
  // back to representative samples so admins can preview even before picking
  // a source run.
  const draftExamplesList = useMemo(
    () => examples.filter(ex => draftExampleEnabled[ex.id]),
    [examples, draftExampleEnabled]
  );

  const selectedReplayRun = useMemo(
    () => replayRuns.find(r => r.id === replayRunId) || null,
    [replayRuns, replayRunId]
  );

  const interpolatedPreview = useMemo(() => {
    if (!editingBody) return '';
    const vars = { MIGRATION_TYPE: selectedType };
    if (selectedStage === 'field_mapping') {
      const snap = selectedReplayRun?.result_json || {};
      vars.CSV_HEADERS = snap.csvHeaders || ['Building Name', 'Address', 'Square Feet'];
      vars.FMX_FIELDS = snap.fmxFieldNames || ['name', 'location', 'area_sqft'];
      vars.SUGGESTED = snap.suggested || { name: 'Building Name' };
    }
    return buildSystemPrompt({ body: editingBody, vars, examples: draftExamplesList });
  }, [editingBody, selectedType, selectedStage, selectedReplayRun, draftExamplesList]);

  const costEstimate = useMemo(
    () => estimateDryRunCost(selectedReplayRun),
    [selectedReplayRun]
  );

  const handleRunDryRun = async () => {
    if (!selectedReplayRun || !editingBody.trim()) return;
    const msg = `Estimated cost: ~$${(costEstimate.costUsd || 0).toFixed(4)} ` +
      `(${costEstimate.basis === 'source-tokens' ? 'based on the source run\'s token usage' : 'coarse estimate'}). ` +
      `Run dry-run?`;
    if (!window.confirm(msg)) return;

    setDryRunBusy(true);
    setDryRunError('');
    setDryRunResult(null);
    setDryRunSourceRun(selectedReplayRun);
    setDryRunProgress('Starting…');

    try {
      const runner = selectedStage === 'field_mapping' ? runMappingDryRun : runExtractionDryRun;
      const result = await runner({
        sourceRun: selectedReplayRun,
        draftBody: editingBody,
        draftExamples: draftExamplesList,
        migrationType: selectedType,
        projectId: null,
        userId: currentUserId,
        onProgress: (label) => setDryRunProgress(label || ''),
      });
      setDryRunResult(result);
    } catch (err) {
      setDryRunError(err?.message || String(err));
    } finally {
      setDryRunBusy(false);
      setDryRunProgress('');
    }
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
        {selectedStage === 'extraction' ? (
          <>These prompts drive <strong>PDF-to-spreadsheet extraction</strong>. Claude reads each page image with the active prompt for the migration type.</>
        ) : (
          <>These prompts drive the <strong>CSV column-mapping</strong> AI call on the Map Fields step. Template placeholders <code>{'{{MIGRATION_TYPE}}'}</code>, <code>{'{{CSV_HEADERS}}'}</code>, <code>{'{{FMX_FIELDS}}'}</code>, <code>{'{{SUGGESTED}}'}</code> are filled in automatically.</>
        )}
        {' '}Every edit creates a new version; older versions are kept for audit and rollback.
      </div>

      {/* Stage selector */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>Stage:</label>
        {['extraction', 'field_mapping'].map(s => (
          <button
            key={s}
            onClick={() => setSelectedStage(s)}
            style={{
              fontSize: 12, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
              background: selectedStage === s ? NAVY : '#fff',
              color: selectedStage === s ? '#fff' : '#374151',
              border: `1px solid ${selectedStage === s ? NAVY : '#D1D5DB'}`,
            }}
          >{s === 'extraction' ? 'PDF extraction' : 'CSV field mapping'}</button>
        ))}
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

      {/* Preview & Dry-Run */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, background: '#fff' }}>
        <button
          type="button"
          onClick={() => setPreviewExpanded(x => !x)}
          style={{
            width: '100%', textAlign: 'left', padding: '8px 12px', cursor: 'pointer',
            background: '#F9FAFB', border: 'none', borderBottom: previewExpanded ? `1px solid ${BORDER}` : 'none',
            borderRadius: previewExpanded ? '6px 6px 0 0' : 6, fontSize: 12, fontWeight: 600, color: NAVY,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ transform: previewExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▸</span>
          Preview & Dry-Run
          <span style={{ fontSize: 10, color: '#6B7280', fontWeight: 400, marginLeft: 6 }}>
            See the exact system prompt and test it against a past run before saving.
          </span>
        </button>
        {previewExpanded && (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Draft example toggles */}
            {examples.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                  Examples to include in this preview / dry-run (draft-only — does not change stored settings):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {examples.map(ex => (
                    <label
                      key={ex.id}
                      style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 4,
                        border: `1px solid ${draftExampleEnabled[ex.id] ? NAVY : '#D1D5DB'}`,
                        background: draftExampleEnabled[ex.id] ? '#EEF0F8' : '#fff',
                        cursor: 'pointer', userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!draftExampleEnabled[ex.id]}
                        onChange={e => setDraftExampleEnabled(d => ({ ...d, [ex.id]: e.target.checked }))}
                        style={{ marginRight: 4 }}
                      />
                      {ex.label || '(untitled)'}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Interpolated preview */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4 }}>
                Final system prompt (as Claude will see it):
              </div>
              <pre style={{
                margin: 0, padding: 10, background: '#0F172A', color: '#E2E8F0',
                borderRadius: 5, fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace',
                maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.5,
              }}>{interpolatedPreview || '(empty prompt)'}</pre>
            </div>

            {/* Replay picker + run button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: '#374151' }}>Replay source run:</label>
              <select
                value={replayRunId}
                onChange={e => setReplayRunId(e.target.value)}
                disabled={replayRuns.length === 0 || dryRunBusy}
                style={{ fontSize: 12, padding: '5px 8px', borderRadius: 5, border: `1px solid #D1D5DB`, minWidth: 280 }}
              >
                {replayRuns.length === 0 && <option value="">No replayable runs yet</option>}
                {replayRuns.map(r => {
                  const when = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
                  const headerCount = (r.result_json?.headers?.length) ?? (r.result_json?.csvHeaderCount) ?? '?';
                  const label = selectedStage === 'field_mapping'
                    ? `${r.source_filename || '(unnamed)'} · ${headerCount} headers · ${when}`
                    : `${r.source_filename || '(unnamed)'} · ${r.page_count ?? '?'} pp · ${when}`;
                  return <option key={r.id} value={r.id}>{label}</option>;
                })}
              </select>
              {selectedReplayRun && (
                <span style={{ fontSize: 11, color: '#6B7280' }}>
                  Est. cost: ~${(costEstimate.costUsd || 0).toFixed(4)}
                  <span style={{ color: '#9CA3AF', marginLeft: 4 }}>
                    ({costEstimate.basis === 'source-tokens' ? 'from source tokens' : 'rough estimate'})
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={handleRunDryRun}
                disabled={dryRunBusy || !selectedReplayRun || !editingBody.trim()}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: dryRunBusy ? '#9CA3AF' : NAVY, color: '#fff',
                  cursor: dryRunBusy || !selectedReplayRun ? 'not-allowed' : 'pointer',
                }}
              >{dryRunBusy ? 'Running…' : 'Run dry-run'}</button>
              {dryRunProgress && <span style={{ fontSize: 11, color: '#6B7280' }}>{dryRunProgress}</span>}
            </div>

            {selectedStage === 'field_mapping' && selectedReplayRun && !selectedReplayRun.result_json?.csvHeaders && (
              <div style={{ fontSize: 11, color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: 5 }}>
                This run was logged before migration 14 and doesn't include the CSV header / FMX field snapshot. New CSV mapping runs will be replayable.
              </div>
            )}

            {dryRunError && (
              <div style={{ padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 12, borderRadius: 5 }}>
                {dryRunError}
              </div>
            )}

            {dryRunResult && dryRunSourceRun && (
              <DryRunDiffPanel
                stage={selectedStage}
                sourceRun={dryRunSourceRun}
                dryRunResult={dryRunResult}
              />
            )}
          </div>
        )}
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
