import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { FMX_SCHEMAS, getBaseSchemaType } from "./schemas";
import { FMX_API_STANDARD_FIELDS } from "./fmxFieldSchema";
import { parseCSV, buildMappedRows, computeCellErrors, downloadCSV, suggestMapping } from "./utils";
import { C } from "./theme";
import { supabase } from "./supabase";
import { getMappingSuggestions, getSavedRulesForSchema, getProjectImports, getImportRows, getAllDependencyCaches } from "./db";
import { syncFmxDataForProject, fetchAllDependencies } from "./fmxSync";
import { callClaude } from "./claudeClient";
import { getFieldTypeCategory } from "./fmxFieldTypes";
import DataPreviewModal from "./components/DataPreviewModal";
import TransformModal from "./components/TransformModal";
import ProjectScreen from "./components/ProjectScreen";
import SchemaOverview from "./components/SchemaOverview";
import DependenciesView from "./components/DependenciesView";
import ProjectSettingsView from "./components/ProjectSettingsView";
import StepUpload from "./components/StepUpload";
import StepMapFields from "./components/StepMapFields";
import StepValidate from "./components/StepValidate";
import StepExport from "./components/StepExport";
import AuthScreen from "./components/AuthScreen";

const WIZARD_STEPS = ["Select Type", "Upload CSV", "Map Fields", "Validate & Edit", "Export"];

const GLOBAL_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; }
  input, select, textarea, button { font-family: system-ui, -apple-system, sans-serif; }
  .fmx-btn-primary {
    background: ${C.orange}; color: ${C.white}; border: none; border-radius: 6px;
    padding: 8px 20px; cursor: pointer; font-size: 14px; font-weight: 500;
    transition: all 0.15s ease;
  }
  .fmx-btn-primary:hover:not(:disabled) { background: ${C.orangeHov}; }
  .fmx-btn-primary:disabled { background: ${C.border}; color: ${C.textLight}; cursor: not-allowed; }
  .fmx-btn-secondary {
    background: ${C.white}; color: ${C.orange}; border: 1px solid ${C.orange};
    border-radius: 6px; padding: 8px 20px; cursor: pointer; font-size: 14px;
    font-weight: 500; transition: all 0.15s ease;
  }
  .fmx-btn-secondary:hover { background: #FFF5F2; }
  .fmx-btn-nav-back {
    background: ${C.white}; color: ${C.navy}; border: 1px solid ${C.navy};
    border-radius: 6px; padding: 8px 20px; cursor: pointer; font-size: 14px;
    font-weight: 500; transition: all 0.15s ease;
  }
  .fmx-btn-nav-back:hover { background: ${C.navyTint}; }
  .fmx-btn-destructive {
    background: ${C.white}; color: #888; border: 1px solid #888;
    border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 13px;
    transition: all 0.15s ease;
  }
  .fmx-btn-destructive:hover { background: ${C.bgPage}; }
  .fmx-btn-xs {
    background: ${C.white}; color: ${C.textMid}; border: 1px solid ${C.border};
    border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 11px;
    transition: all 0.15s ease; white-space: nowrap;
  }
  .fmx-btn-xs:hover { background: ${C.bgPage}; }
  .fmx-btn-xs-rule {
    background: ${C.white}; color: ${C.orange}; border: 1px solid ${C.orange};
    border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 11px;
    transition: all 0.15s ease; white-space: nowrap;
  }
  .fmx-btn-xs-rule:hover { background: #FFF5F2; }
  .fmx-btn-xs-rule.active {
    background: ${C.errBg}; color: ${C.errText}; border-color: ${C.errBorder};
  }
  .fmx-btn-xs-rule.active:hover { background: #FFE5E5; }
  .fmx-input {
    font-size: 13px; padding: 6px 10px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; outline: none;
    transition: border-color 0.15s ease;
  }
  .fmx-input:focus { border-color: ${C.blue}; }
  select.fmx-select {
    font-size: 12px; padding: 4px 8px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; width: 100%;
  }
  textarea.fmx-textarea {
    font-size: 12px; padding: 8px; border-radius: 6px; border: 1px solid ${C.border};
    background: ${C.white}; color: ${C.textDark}; resize: vertical; outline: none;
    width: 100%; box-sizing: border-box; transition: border-color 0.15s ease;
  }
  textarea.fmx-textarea:focus { border-color: ${C.blue}; }
  .fmx-type-card {
    padding: 14px 10px; border-radius: 8px; border: 1px solid ${C.border};
    background: ${C.white}; cursor: pointer; text-align: left; font-size: 13px;
    font-weight: 500; display: flex; flex-direction: column; gap: 6px;
    transition: all 0.15s ease;
  }
  .fmx-type-card:hover { background: ${C.navyTint}; border-color: ${C.navy}; }
  .fmx-tab {
    padding: 12px 16px; font-size: 13px; white-space: nowrap;
    user-select: none; border-bottom: 2px solid transparent;
    transition: all 0.15s ease; cursor: default;
  }
  .fmx-tab-active { font-weight: 700; color: ${C.orange}; border-bottom-color: ${C.orange}; }
  .fmx-tab-completed { color: ${C.blue}; cursor: pointer; }
  .fmx-tab-completed:hover { color: #4ab0cc; }
  .fmx-tab-inactive { color: ${C.textLight}; }
  .fmx-history-card {
    padding: 8px 10px; background: ${C.white}; border-radius: 6px;
    margin-bottom: 8px; border: 1px solid ${C.border};
    border-left: 3px solid ${C.blue};
  }
`;

export default function App() {
  // --- Auth state ---
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [passwordReset, setPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  // --- Wizard state ---
  const [importedData, setImportedData] = useState({});
  const [history, setHistory] = useState([]);
  const [wStep, setWStep] = useState(0);
  const [schemaType, setSchemaType] = useState("");
  const [csv, setCsv] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [mapping, setMapping] = useState({});
  const [transformRules, setTransformRules] = useState({});
  // customFields: array of { name: string, required: boolean }
  const [customFields, setCustomFields] = useState([]);
  const [dynamicRates, setDynamicRates] = useState([]);
  const [mappedRows, setMappedRows] = useState([]);
  const [certified, setCertified] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [transformModal, setTransformModal] = useState(null); // { field, savedRule } | null
  const [memoryMatches, setMemoryMatches] = useState({});
  const [mappingSources, setMappingSources] = useState({});
  const [savedRules, setSavedRules] = useState({});
  // persistentRefs kept for legacy compatibility (no longer used for validation)
  const [persistentRefs, setPersistentRefs] = useState(null); // eslint-disable-line no-unused-vars
  const [depCacheMap, setDepCacheMap] = useState({}); // { [crossSheetType]: string[] } from FMX live dep cache
  const [depAutoSyncing, setDepAutoSyncing] = useState(false);
  const [fmxSyncData, setFmxSyncData] = useState({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0);
  const [activeImportId, setActiveImportId] = useState(null);

  // Overview / tab routing
  const [mainTab, setMainTab] = useState('overview'); // 'overview' | 'dependencies' | 'settings' | 'wizard'
  const [wizardImports, setWizardImports] = useState([]);
  const [wizardViewModal, setWizardViewModal] = useState(null); // { rec, rows } | null
  const [wizardViewLoading, setWizardViewLoading] = useState(false);

  const fileRef = useRef();

  useEffect(() => {
    // Check for password reset in URL hash
    if (window.location.hash.includes('type=recovery')) {
      setPasswordReset(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoadingAuth(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUserMenuOpen(false);
  };

  const handlePasswordUpdate = async e => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setResetMsg('Passwords do not match.'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) { setResetMsg(error.message); return; }
    window.location.hash = '';
    setPasswordReset(false);
    setResetMsg('Password updated — please sign in.');
  };

  const initials = (() => {
    const name = user?.user_metadata?.full_name || user?.email || '';
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  })();

  const fmxCustomFieldIdMap = useMemo(() => {
    const map = {};
    for (const cf of fmxSyncData.customFields || []) {
      if (cf.id && cf.name) map[cf.name] = cf.id;
    }
    return map;
  }, [fmxSyncData.customFields]);

  const schema = schemaType ? FMX_SCHEMAS[getBaseSchemaType(schemaType)] : null;

  // Use API-driven field list when credentials are present and sync has completed
  const hasApiFields = !!selectedProject?.fmx_credentials && fmxSyncData.fromCache !== undefined;
  const baseFields = schemaType
    ? (hasApiFields && FMX_API_STANDARD_FIELDS[getBaseSchemaType(schemaType)]
        ? FMX_API_STANDARD_FIELDS[getBaseSchemaType(schemaType)]
        : (schema?.fields || []))
    : [];

  const allFields = schemaType ? [
    ...baseFields,
    // Manual custom fields only when not using API-driven field list
    ...(!hasApiFields ? customFields.filter(cf => cf.name).map(cf => ({
      name: cf.name, required: cf.required || false, type: "string", group: "Custom Fields",
    })) : []),
    ...dynamicRates.flatMap((_, i) => [
      { name: `Rate ${i + 1} Cost`, required: false, type: "number", group: "Scheduling Rates" },
      { name: `Rate ${i + 1} Unit`, required: false, type: "string", group: "Scheduling Rates" },
    ]),
    // FMX custom fields from live sync (always appended; empty when no credentials)
    ...(fmxSyncData.customFields || []).map(cf => ({
      name: cf.name, required: false, type: getFieldTypeCategory(cf.fieldType), group: "FMX Custom Fields",
      isCustomField: true, customFieldId: cf.id, fieldType: cf.fieldType,
    })),
  ] : [];
  const mappedHeaders = allFields.map(f => f.name);

  const cellErrors = wStep >= 3 ? computeCellErrors(mappedRows, allFields, schemaType, depCacheMap) : {};
  const hasErrors = Object.values(cellErrors).some(v => v === "error");

  const groupedFields = {};
  allFields.forEach(f => {
    const g = f.group || "Core Fields";
    if (!groupedFields[g]) groupedFields[g] = [];
    groupedFields[g].push(f);
  });

  const canProceed = !hasErrors || certified;

  const handleFmxSync = async (type) => {
    console.log('handleFmxSync called, project:', selectedProject?.name, 'creds:', !!selectedProject?.fmx_credentials);
    if (!selectedProject?.fmx_credentials) return;
    setFmxSyncData({ customFields: [], loading: true, fromCache: undefined });
    const result = await syncFmxDataForProject(selectedProject, type);
    setFmxSyncData({ customFields: result.customFields || [], systemFields: result.systemFields || [], loading: false, fromCache: result.fromCache });
  };

  // Maps dependency cache keys to crossSheet field labels used in allFields
  const DEP_KEY_TO_CROSS_SHEET = {
    'buildings':       'Building',
    'equipment-types': 'Equipment Type',
    'resources':       'Resource',
    'equipment':       'Equipment',
    'users':           'User',
    'request-types':   'Request Type',
    'inventory-types': 'Inventory Type',
    'inventory':       'Inventory',
    'user-types':      'User Type',
  };

  const loadDepCacheMap = useCallback(async () => {
    if (!selectedProject?.id) return;
    const rows = await getAllDependencyCaches(selectedProject.id);
    const map = {};
    for (const row of rows) {
      const crossSheet = DEP_KEY_TO_CROSS_SHEET[row.schema_type];
      if (crossSheet && row.extra?.items?.length) {
        map[crossSheet] = row.extra.items.map(i => i.name).filter(Boolean);
      }
    }
    setDepCacheMap(map);
  }, [selectedProject?.id]); // dep: selectedProject.id is the only relevant change trigger

  // Load dep cache whenever selected project changes
  useEffect(() => { loadDepCacheMap(); }, [loadDepCacheMap]);

  const handleSelectType = t => {
    setSchemaType(t); setCustomFields([]); setDynamicRates([]);
    setTransformRules({}); setCertified(false); setFileInfo(null);
    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setWStep(1);
    setMainTab('wizard');
    handleFmxSync(t);
    // Auto-refresh all dependency caches in the background so StepValidate has fresh data
    if (selectedProject?.fmx_connection_verified) {
      setDepAutoSyncing(true);
      fetchAllDependencies(selectedProject, () => {})
        .then(() => loadDepCacheMap())
        .catch(() => {})
        .finally(() => setDepAutoSyncing(false));
    }
  };

  const processCSV = async (csvStr, info) => {
    const parsed = parseCSV(csvStr);
    setCsv(parsed);
    setFileInfo({ ...info, rowCount: parsed.rows.length });
    setAiLoading(true);
    const suggested = suggestMapping(parsed.headers, (FMX_SCHEMAS[getBaseSchemaType(schemaType)]?.fields || []));
    try {
      const [aiRes, memMatches, rules] = await Promise.all([
        callClaude({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `FMX data migration. Suggest best CSV→FMX column mapping. Return ONLY valid JSON object, keys=FMX field names, values=CSV column names or null. CSV headers: ${JSON.stringify(parsed.headers)}. FMX fields: ${JSON.stringify((FMX_SCHEMAS[getBaseSchemaType(schemaType)]?.fields || []).map(f => f.name))}. Already matched: ${JSON.stringify(suggested)}.` }]
        }).catch(() => null),
        getMappingSuggestions(schemaType, parsed.headers),
        getSavedRulesForSchema(schemaType),
      ]);

      // Parse AI result
      let aiResult = {};
      if (aiRes) {
        const clean = (aiRes.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
        try { aiResult = JSON.parse(clean); } catch {}
      }

      // Build final mapping: heuristic < AI < memory (confidence >= 2 wins)
      const finalMapping = { ...suggested, ...aiResult };
      const aiSuggestedFields = new Set(
        Object.entries(aiResult).filter(([, v]) => v).map(([k]) => k)
      );

      // Apply memory overrides
      Object.entries(memMatches).forEach(([sourceHeader, match]) => {
        if (match.confidence >= 2) finalMapping[match.fmxField] = sourceHeader;
      });

      // Build source attribution for badge display
      const sources = {};
      Object.entries(finalMapping).forEach(([fmxField, sourceHeader]) => {
        if (!sourceHeader) return;
        const memMatch = memMatches[sourceHeader];
        if (memMatch?.fmxField === fmxField && memMatch?.confidence >= 2) {
          sources[fmxField] = 'memory';
        } else if (aiSuggestedFields.has(fmxField)) {
          sources[fmxField] = 'ai';
        } else {
          sources[fmxField] = 'auto';
        }
      });

      setMemoryMatches(memMatches);
      setMappingSources(sources);
      setSavedRules(rules);
      setMapping(finalMapping);
    } catch { setMapping(suggested); }
    setAiLoading(false);
    setWStep(2);
  };

  const handleFileAndMap = file => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    if (ext === "csv") {
      reader.onload = e => processCSV(e.target.result, { type: "CSV", sheetName: null });
      reader.readAsText(file);
    } else {
      reader.onload = async e => {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const csvStr = XLSX.utils.sheet_to_csv(ws);
        const typeLabel = ext === "xlsx" ? "Excel (.xlsx)" : ext === "xls" ? "Excel (.xls)" : "ODS";
        await processCSV(csvStr, { type: typeLabel, sheetName });
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const goToValidate = () => {
    setMappedRows(buildMappedRows(csv.rows, mapping, transformRules, allFields));
    setCertified(false);
    setWStep(3);
  };

  const applyNLEdit = (field, code) => {
    setMappedRows(rows => rows.map(row => {
      try {
        const fn = new Function("row", `"use strict"; ${code}`);
        const val = fn(row);
        if (val === null || val === undefined) return row;
        return { ...row, [field]: String(val) };
      } catch { return row; }
    }));
  };

  const handleExport = async (format = "csv") => {
    const refField = schema.crossRef;
    if (refField) {
      const vals = [...new Set(mappedRows.map(r => r[refField]).filter(Boolean))];
      setImportedData(prev => ({ ...prev, [schemaType]: vals }));
    }
    const baseName = schemaType.replace(/\s+/g, "_");
    setHistory(h => [...h, { type: schemaType, rows: mappedRows.length, time: new Date().toLocaleTimeString() }]);
    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(mappedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, schemaType.slice(0, 31));
      XLSX.writeFile(wb, `${baseName}_FMX_Import.xlsx`);
    } else {
      downloadCSV(`${baseName}_FMX_Import.csv`, mappedHeaders, mappedRows);
    }
  };

  const openTransformModal = (fieldName, savedRule = null) => {
    setTransformModal({ field: fieldName, savedRule });
  };

  const handleRefsLoaded = (merged) => {
    setPersistentRefs(merged);
  };

  const handleImportComplete = ({ schemaType: st, referenceValues }) => {
    const refField = FMX_SCHEMAS[st]?.crossRef;
    if (refField) {
      const vals = referenceValues
        .filter(r => r.fieldName === refField)
        .map(r => r.value);
      setImportedData(prev => ({
        ...prev,
        [st]: [...new Set([...(prev[st] || []), ...vals])],
      }));
    }
    setChecklistRefreshKey(k => k + 1);
    if (selectedProject?.id) {
      getProjectImports(selectedProject.id).then(d => setWizardImports(d || []));
    }
  };

  const handleResumeFromWizard = async (rec, step = 3) => {
    const rows = await getImportRows(rec.id);
    const schemaFieldNames = new Set((FMX_SCHEMAS[rec.schema_type]?.fields || []).map(f => f.name));
    const rowKeys = Object.keys((rows && rows[0]) || {});
    const extraFields = rowKeys.filter(k => !schemaFieldNames.has(k));
    setSchemaType(rec.schema_type);
    setMapping(rec.mapping_snapshot || {});
    setMappedRows(rows || []);
    setCustomFields(extraFields.map(name => ({ name, required: false, type: 'string' })));
    setDynamicRates([]);
    setTransformRules({});
    setCertified(false);
    setPersistentRefs(null);
    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setWStep(step);
    setMainTab('wizard');
  };

  const handleViewFromWizard = async (rec) => {
    setWizardViewLoading(true);
    setWizardViewModal({ rec, rows: [] });
    const rows = await getImportRows(rec.id);
    setWizardViewModal({ rec, rows: rows || [] });
    setWizardViewLoading(false);
  };

  const handleResumeImport = ({ schemaType: st, mappedRows: rows, mapping: m, wStep: step = 3 }) => {
    // Derive any extra columns from saved rows that aren't in the static schema
    const schemaFieldNames = new Set((FMX_SCHEMAS[st]?.fields || []).map(f => f.name));
    const rowKeys = Object.keys((rows && rows[0]) || {});
    const extraFields = rowKeys.filter(k => !schemaFieldNames.has(k));
    setSchemaType(st);
    setMapping(m || {});
    setMappedRows(rows || []);
    setCustomFields(extraFields.map(name => ({ name, required: false, type: 'string' })));
    setDynamicRates([]);
    setTransformRules({});
    setCertified(false);
    setPersistentRefs(null);
    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setShowProjectScreen(false);
    setWStep(step);
  };

  const reset = () => {
    setWStep(0); setSchemaType(""); setCsv(null); setFileInfo(null); setMapping({});
    setTransformRules({}); setCustomFields([]); setDynamicRates([]);
    setMappedRows([]); setCertified(false);
    setMemoryMatches({}); setMappingSources({}); setSavedRules({});
    setPersistentRefs(null);
    setFmxSyncData({ customFields: [], loading: false, fromCache: undefined });
    setMainTab('overview');
  };

  const goToProjects = () => {
    reset();
    setShowProjectScreen(true);
  };

  const handleBack = () => {
    if (wStep <= 1) { setMainTab('overview'); setWStep(0); }
    else setWStep(wStep - 1);
  };

  // Loading spinner
  if (loadingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', background: C.bgPage }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 36, height: 36, border: `4px solid ${C.border}`, borderTopColor: C.orange, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: 14, color: C.textMid, fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  // Password reset modal (after clicking email link)
  if (passwordReset) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', overflow: 'hidden', width: '100%', maxWidth: 400 }}>
          <div style={{ height: 52, background: C.navy, display: 'flex', alignItems: 'center', paddingLeft: 20 }}>
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
          </div>
          <form onSubmit={handlePasswordUpdate} style={{ padding: '24px 28px' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 18 }}>Set new password</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>New password</label>
              <input type="password" required minLength={8} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6, border: '1px solid #D1D5DB', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 4 }}>Confirm password</label>
              <input type="password" required minLength={8} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', fontSize: 14, borderRadius: 6, border: '1px solid #D1D5DB', boxSizing: 'border-box' }} />
            </div>
            {resetMsg && <p style={{ color: resetMsg.startsWith('Password updated') ? '#16A34A' : '#DC2626', fontSize: 13, margin: '0 0 12px' }}>{resetMsg}</p>}
            <button type="submit" style={{ width: '100%', padding: 10, fontSize: 14, fontWeight: 500, background: C.orange, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Update password
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!user) return <AuthScreen />;

  // Project management screen
  if (showProjectScreen) {
    return (
      <ProjectScreen
        onSelectProject={(project) => {
          setSelectedProject(project);
          setShowProjectScreen(false);
          setMainTab('overview');
          getProjectImports(project.id).then(d => setWizardImports(d || []));
        }}
        onResumeImport={handleResumeImport}
      />
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPage, minHeight: "100vh", color: C.textDark }}>
      <style>{GLOBAL_STYLES}</style>

      {preview && <DataPreviewModal header={preview.header} values={preview.values} onClose={() => setPreview(null)} />}
      {transformModal && (
        <TransformModal
          fieldName={transformModal.field}
          csvHeaders={csv?.headers || []}
          currentRule={transformRules[transformModal.field]}
          savedRule={transformModal.savedRule}
          onSave={rule => { setTransformRules(r => ({ ...r, [transformModal.field]: { ...rule, type: "formula" } })); setTransformModal(null); }}
          onClose={() => setTransformModal(null)}
        />
      )}

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, height: 52, background: C.navy, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
          <span style={{ color: C.white, fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
          {selectedProject && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 10px', fontSize: 15 }}>|</span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 400 }}>{selectedProject.name}</span>
              <button
                onClick={goToProjects}
                style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', marginLeft: 14, padding: '2px 0' }}
              >
                ← Projects
              </button>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* User avatar */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: C.navy,
                border: '2px solid rgba(255,255,255,0.4)', color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {initials}
            </button>
            {userMenuOpen && (
              <div style={{
                position: 'absolute', top: 44, right: 0, background: '#fff',
                border: '1px solid #E5E7EB', borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 200,
              }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>
                    {user.user_metadata?.full_name || 'User'}
                  </div>
                  <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>{user.email}</div>
                </div>
                <button
                  onClick={handleSignOut}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 14px',
                    fontSize: 13, background: 'none', border: 'none',
                    cursor: 'pointer', color: '#DC2626',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar — only when project is open */}
      {selectedProject && (
        <div style={{
          background: '#fff', borderBottom: '1px solid #E5E7EB',
          padding: '0 24px', display: 'flex', alignItems: 'center',
          position: 'sticky', top: 52, zIndex: 90,
        }}>
          {['overview', 'dependencies', 'settings'].map(tab => {
            const isActive = mainTab === tab || (tab === 'overview' && mainTab === 'wizard');
            return (
              <button
                key={tab}
                onClick={() => setMainTab(tab)}
                style={{
                  padding: '10px 18px', fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? C.orange : '#6B7280',
                  background: 'none', border: 'none',
                  borderBottom: isActive ? `2px solid ${C.orange}` : '2px solid transparent',
                  cursor: 'pointer', fontFamily: 'system-ui, -apple-system, sans-serif',
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab === 'overview' && mainTab === 'wizard' ? '← Overview' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            );
          })}
          {mainTab === 'wizard' && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9CA3AF', paddingRight: 4 }}>
              {schemaType} — step {wStep} of 4
            </span>
          )}
        </div>
      )}

      {/* Page content */}
      <div style={{ padding: '1.5rem 24px 2rem' }}>

        {/* Overview tab */}
        {mainTab === 'overview' && (
          <SchemaOverview
            imports={wizardImports}
            hasCreds={!!selectedProject?.fmx_credentials}
            onSelectType={handleSelectType}
            onResume={(rec) => handleResumeFromWizard(rec, 3)}
            onRepush={(rec) => handleResumeFromWizard(rec, 4)}
            onViewImport={handleViewFromWizard}
            history={history}
            fmxModules={selectedProject?.fmx_modules}
            cardSettings={selectedProject?.card_settings || {}}
            projectId={selectedProject?.id}
            onProjectUpdated={(u) => setSelectedProject(u)}
          />
        )}

        {/* Dependencies tab */}
        {mainTab === 'dependencies' && (
          <DependenciesView
            projectId={selectedProject?.id}
            refreshKey={checklistRefreshKey}
          />
        )}

        {/* Settings tab */}
        {mainTab === 'settings' && (
          <ProjectSettingsView
            selectedProject={selectedProject}
            onProjectUpdated={(u) => setSelectedProject(u)}
          />
        )}

        {/* Wizard */}
        {mainTab === 'wizard' && (
          <div>
            {/* Wizard step tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: '1.5rem', overflowX: 'auto' }}>
              {WIZARD_STEPS.slice(1).map((label, i) => {
                const stepIdx = i + 1;
                return (
                  <div
                    key={stepIdx}
                    className={`fmx-tab ${stepIdx === wStep ? 'fmx-tab-active' : stepIdx < wStep ? 'fmx-tab-completed' : 'fmx-tab-inactive'}`}
                    onClick={() => stepIdx < wStep && setWStep(stepIdx)}
                  >
                    {i + 1}. {label}
                  </div>
                );
              })}
            </div>

            {wStep === 1 && (
              <StepUpload
                schemaType={schemaType}
                aiLoading={aiLoading}
                fileInfo={fileInfo}
                dragOver={dragOver}
                setDragOver={setDragOver}
                fileRef={fileRef}
                handleFileAndMap={handleFileAndMap}
                fmxSyncLoading={fmxSyncData.loading}
                fmxSyncFromCache={fmxSyncData.fromCache}
              />
            )}

            {wStep === 2 && schema && (
              <StepMapFields
                csv={csv}
                schemaType={schemaType}
                allFields={allFields}
                groupedFields={groupedFields}
                mapping={mapping}
                setMapping={setMapping}
                transformRules={transformRules}
                setTransformRules={setTransformRules}
                customFields={customFields}
                setCustomFields={setCustomFields}
                dynamicRates={dynamicRates}
                setDynamicRates={setDynamicRates}
                fileInfo={fileInfo}
                setPreview={setPreview}
                openTransformModal={openTransformModal}
                memoryMatches={memoryMatches}
                mappingSources={mappingSources}
                savedRules={savedRules}
                fmxSyncData={fmxSyncData}
              />
            )}

            {wStep === 3 && (
              <StepValidate
                mappedHeaders={mappedHeaders}
                mappedRows={mappedRows}
                setMappedRows={setMappedRows}
                cellErrors={cellErrors}
                allFields={allFields}
                hasErrors={hasErrors}
                certified={certified}
                setCertified={setCertified}
                applyNLEdit={applyNLEdit}
                onRowsUpdated={(rows) => setMappedRows(rows)}
                projectId={selectedProject?.id}
                schemaType={schemaType}
                depCacheMap={depCacheMap}
                depAutoSyncing={depAutoSyncing}
              />
            )}

            {wStep === 4 && (
              <StepExport
                schemaType={schemaType}
                mappedRows={mappedRows}
                setMappedRows={setMappedRows}
                mappedHeaders={mappedHeaders}
                allFields={allFields}
                handleExport={handleExport}
                mapping={mapping}
                transformRules={transformRules}
                projectId={selectedProject?.id}
                onImportComplete={handleImportComplete}
                selectedProject={selectedProject}
                userEmail={user?.email}
                customFieldIdMap={fmxCustomFieldIdMap}
                customFieldMetadata={fmxSyncData?.customFields || []}
                fileInfo={fileInfo}
              />
            )}

            {/* Sticky footer nav */}
            <div style={{
              position: 'sticky', bottom: 0, background: C.white,
              borderTop: `1px solid ${C.border}`, padding: '12px 0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 24, zIndex: 50,
            }}>
              <button className="fmx-btn-nav-back" onClick={handleBack}>← Back</button>
              <div>
                {wStep === 2 && (
                  <button className="fmx-btn-primary" onClick={goToValidate}>Validate →</button>
                )}
                {wStep === 3 && (
                  <button className="fmx-btn-primary" onClick={() => setWStep(4)} disabled={!canProceed}>
                    Review & export →
                  </button>
                )}
                {wStep === 4 && (
                  <button className="fmx-btn-secondary" onClick={reset}>Import another sheet</button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import row viewer modal */}
      {wizardViewModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#fff', borderRadius: 12,
            width: '90vw', maxWidth: 1100, maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 15, color: C.navy }}>
                  {wizardViewModal.rec.import_name || wizardViewModal.rec.schema_type}
                </span>
                <span style={{ fontSize: 13, color: '#6B7280', marginLeft: 12 }}>
                  {wizardViewLoading ? 'Loading…' : `${wizardViewModal.rows.length} rows`}
                </span>
              </div>
              <button
                onClick={() => setWizardViewModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1, padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0 0 8px' }}>
              {wizardViewLoading ? (
                <p style={{ padding: '24px', color: '#9CA3AF', fontSize: 13 }}>Loading rows…</p>
              ) : wizardViewModal.rows.length === 0 ? (
                <p style={{ padding: '24px', color: '#9CA3AF', fontSize: 13 }}>No rows saved for this import.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                      {Object.keys(wizardViewModal.rows[0]).map(col => (
                        <th key={col} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: C.navy, borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wizardViewModal.rows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '1px solid #F3F4F6', background: ri % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        {Object.values(row).map((val, ci) => (
                          <td key={ci} style={{ padding: '6px 12px', color: C.textDark, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {val ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
