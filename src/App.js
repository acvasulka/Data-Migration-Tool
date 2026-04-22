import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { getBaseSchemaType } from "./schemas";
import { buildFieldDefinitions, hasEnrichments } from "./fmxFieldMetadata";
import { parseCSV, buildMappedRows, computeCellErrors, downloadCSV, suggestMapping } from "./utils";
import { C } from "./theme";
import { supabase } from "./supabase";
import { getMappingSuggestions, getSavedRulesForSchema, getProjectImports, getImportRows, getAllDependencyCaches, saveFmxReferenceCache, getCurrentProfile, getAllProfiles, getProjects, getActivePrompt, getEnabledExamplesForPrompt, createExtractionRun, completeExtractionRun, recordCorrections, incrementExampleUsage, getFieldOverrides } from "./db";
import { buildSystemPrompt, extractUsage } from "./promptTemplates";
import UserMenu from "./components/UserMenu";
import ProfileEditModal from "./components/ProfileEditModal";
import AdminPanelModal from "./components/AdminPanelModal";
import WorkspaceSidebar from "./components/WorkspaceSidebar";
import { syncFmxDataForProject, fetchAllDependencies, getDepKeysForSchema } from "./fmxSync";
import { getFieldTypeCategory } from "./fmxFieldTypes";
import { claudeFetch, parseClaudeText } from "./apiClient";
import { extractPdfToSheet } from "./pdfExtract";
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
// User-facing step labels (Step 0 "Select Type" is implicit — happens when
// the user clicks "Start new import" on a schema detail pane, before the wizard opens)
const WIZARD_LABELS = ["Upload", "Map", "Validate", "Export"];

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
  const [currentProfile, setCurrentProfile] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [passwordReset, setPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  // --- Wizard state ---
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
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  // Tags the current csv as coming from a PDF extraction so downstream edits
  // can be captured as `corrections` for the learning loop.
  const [pdfSource, setPdfSource] = useState(null); // { runId, migrationType } | null
  // Tracks the admin-prompt run id for the CSV field-mapping call so mapping
  // edits in step 2 can be captured as `mapping_change` corrections against
  // that run (mirrors pdfSource, but for the field_mapping stage).
  const [mappingRun, setMappingRun] = useState(null); // { runId, migrationType, initialMapping } | null
  const [preview, setPreview] = useState(null);
  const [transformModal, setTransformModal] = useState(null); // { field, savedRule } | null
  const [memoryMatches, setMemoryMatches] = useState({});
  const [mappingSources, setMappingSources] = useState({});
  const [savedRules, setSavedRules] = useState({});
  const [depCacheMap, setDepCacheMap] = useState({}); // { [crossSheetType]: string[] } from FMX live dep cache
  // Admin-editable required-flag overrides keyed by schema_type → field_name.
  // Loaded once at app boot; admin edits in FieldRulesAdminTab call
  // setFieldOverrides so all open projects see the new precedence immediately.
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [depAutoSyncing, setDepAutoSyncing] = useState(false);
  const [fmxSyncData, setFmxSyncData] = useState({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
  const [checklistRefreshKey, setChecklistRefreshKey] = useState(0);
  const [xlsxWorkbook, setXlsxWorkbook] = useState(null); // { wb, typeLabel } when sheet picker active

  // Overview / tab routing
  const [mainTab, setMainTab] = useState('overview'); // 'overview' | 'dependencies' | 'settings' | 'wizard'
  const [selectedSchema, setSelectedSchema] = useState(null); // which schema's detail pane is shown in Overview
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
  };

  // Load profile + all profiles + all projects (for admin panel counts) whenever the user changes
  useEffect(() => {
    if (!user?.id) { setCurrentProfile(null); setAllProfiles([]); setAllProjects([]); return; }
    getCurrentProfile(user.id).then(setCurrentProfile);
    getAllProfiles().then(setAllProfiles);
    getProjects().then(setAllProjects);
  }, [user?.id]);

  const reloadProfiles = async () => {
    if (!user?.id) return;
    const [prof, all, projs] = await Promise.all([
      getCurrentProfile(user.id),
      getAllProfiles(),
      getProjects(),
    ]);
    setCurrentProfile(prof);
    setAllProfiles(all);
    setAllProjects(projs);
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

  const fmxCustomFieldIdMap = useMemo(() => {
    const map = {};
    for (const cf of fmxSyncData.customFields || []) {
      if (cf.id && cf.name) map[cf.name] = cf.id;
    }
    return map;
  }, [fmxSyncData.customFields]);

  // Use API-driven field list when credentials are present and sync has completed
  const hasApiFields = !!selectedProject?.fmx_credentials && fmxSyncData.fromCache !== undefined;
  const baseType = schemaType ? getBaseSchemaType(schemaType) : null;
  const baseFields = useMemo(() => {
    if (!schemaType) return [];
    // Dynamic: merge live systemFields from /post-options with enrichment metadata
    if (hasApiFields && fmxSyncData.systemFields?.length && hasEnrichments(baseType)) {
      return buildFieldDefinitions(baseType, fmxSyncData.systemFields, fieldOverrides, schemaType) || [];
    }
    return []; // No fallback — API fields required
  }, [schemaType, hasApiFields, baseType, fmxSyncData.systemFields, fieldOverrides]);

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
      name: cf.name, required: cf.isRequired || false, type: getFieldTypeCategory(cf.fieldType), group: "FMX Custom Fields",
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
    if (!selectedProject?.fmx_credentials) return;
    setFmxSyncData({ customFields: [], loading: true, fromCache: undefined });
    const result = await syncFmxDataForProject(selectedProject, type);
    setFmxSyncData({ customFields: result.customFields || [], systemFields: result.systemFields || [], loading: false, fromCache: result.fromCache });
  };

  // Maps dependency cache keys to crossSheet field labels used in allFields.
  // Module-scoped caches (e.g. `request-types:maintenance`,
  // `work-task-instruction-sets:fit-inspections`) are also surfaced in
  // depCacheMap under suffixed keys like `Request Type:maintenance` so the
  // validate-step combobox can pick the right list for the current module.
  const DEP_KEY_TO_CROSS_SHEET = {
    'buildings':                  'Building',
    'equipment-types':            'Equipment Type',
    'resources':                  'Resource',
    'equipment':                  'Equipment',
    'users':                      'User',
    'request-types':              'Request Type',
    'inventory-types':            'Inventory Type',
    'inventory':                  'Inventory',
    'user-types':                 'User Type',
    'work-task-instruction-sets': 'Instruction Set',
  };

  const handleCustomFieldTypeChange = useCallback(async (fieldId, newType) => {
    const updated = (fmxSyncData.customFields || []).map(cf =>
      cf.id === fieldId ? { ...cf, fieldType: newType } : cf
    );
    setFmxSyncData(prev => ({ ...prev, customFields: updated }));
    if (selectedProject?.id && schemaType) {
      await saveFmxReferenceCache(selectedProject.id, schemaType, updated, fmxSyncData.systemFields || []);
    }
  }, [fmxSyncData, selectedProject, schemaType]);

  const loadDepCacheMap = useCallback(async () => {
    if (!selectedProject?.id) return;
    const rows = await getAllDependencyCaches(selectedProject.id);
    const map = {};
    for (const row of rows) {
      // Split off any `:slug` suffix so module-scoped caches still match
      // the base dep key (e.g. `request-types:maintenance` → `request-types`).
      const [baseKey, moduleSlug] = row.schema_type.split(':');
      const crossSheet = DEP_KEY_TO_CROSS_SHEET[baseKey];
      if (!crossSheet || !row.extra?.items?.length) continue;
      const names = row.extra.items.map(i => i.name).filter(Boolean);
      if (moduleSlug) {
        // Module-scoped entry: e.g. `Request Type:maintenance`
        map[`${crossSheet}:${moduleSlug}`] = names;
      } else {
        map[crossSheet] = names;
      }
    }
    setDepCacheMap(map);
  }, [selectedProject?.id]); // dep: selectedProject.id is the only relevant change trigger

  // Load dep cache whenever selected project changes
  useEffect(() => { loadDepCacheMap(); }, [loadDepCacheMap]);

  // Load admin-editable field overrides once per session. Reloaded when the
  // admin panel saves changes via the exposed setter.
  const loadFieldOverrides = useCallback(async () => {
    const map = await getFieldOverrides();
    setFieldOverrides(map);
  }, []);
  useEffect(() => { loadFieldOverrides(); }, [loadFieldOverrides]);

  // Keyboard shortcuts for wizard navigation: ← prev step, → next step, Escape to Overview
  useEffect(() => {
    if (mainTab !== 'wizard') return;
    const handleKey = (e) => {
      // Skip when user is typing in an input/textarea/contenteditable
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.activeElement?.isContentEditable) return;
      // Skip with modifiers (avoid clobbering browser shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (wStep > 1) setWStep(wStep - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        // Only advance when the step's forward-guard is satisfied
        if (wStep === 1 && csv && !aiLoading) suggestAndAdvance();
        else if (wStep === 2) setWStep(3); // simplified: step 2→3 (goToValidate builds rows on click, keyboard just advances)
        else if (wStep === 3 && (!hasErrors || certified)) setWStep(4);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMainTab('overview');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mainTab, wStep, csv, hasErrors, certified]);

  const handleSelectType = t => {
    setSchemaType(t); setCustomFields([]); setDynamicRates([]);
    setTransformRules({}); setCertified(false); setFileInfo(null);
    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setWStep(1);
    setMainTab('wizard');
    handleFmxSync(t);
    // Auto-refresh only the dep types this schema actually needs (parallel, schema-aware)
    if (selectedProject?.fmx_connection_verified) {
      const depKeys = getDepKeysForSchema(t); // [] for self-imports, null = all
      if (depKeys === null || depKeys.length > 0) {
        setDepAutoSyncing(true);
        fetchAllDependencies(selectedProject, () => {}, depKeys)
          .then(() => loadDepCacheMap())
          .catch(() => {})
          .finally(() => setDepAutoSyncing(false));
      }
    }
  };

  // Parse file and show spreadsheet preview — stays on step 1
  const parseAndPreview = (csvStr, info) => {
    const parsed = parseCSV(csvStr);
    setCsv(parsed);
    setFileInfo({ ...info, rowCount: parsed.rows.length });
  };

  // Run AI/memory/heuristic mapping suggestions using current csv state, then advance to step 2
  const suggestAndAdvance = async () => {
    if (!csv) return;
    setAiLoading(true);
    const suggested = suggestMapping(csv.headers, allFields);
    // Route the mapping call through the admin-editable prompt system so admins
    // can tune it and we capture token usage + corrections alongside PDF runs.
    const baseType = getBaseSchemaType(schemaType);
    const fmxFieldNames = allFields.map(f => f.name);
    const mappingStart = Date.now();
    let mappingPromptRow = null;
    let mappingExamples = [];
    let mappingRunId = null;
    try {
      mappingPromptRow = await getActivePrompt(baseType, 'field_mapping');
      if (mappingPromptRow?.id) {
        mappingExamples = await getEnabledExamplesForPrompt(mappingPromptRow.id);
        const runRow = await createExtractionRun({
          projectId: selectedProject?.id,
          userId: user?.id,
          migrationType: baseType,
          stage: 'field_mapping',
          sourceFilename: fileInfo?.name || null,
          pageCount: null,
          promptId: mappingPromptRow.id,
          promptVersion: mappingPromptRow.version,
        });
        mappingRunId = runRow?.id || null;
      }
    } catch { /* non-fatal — fall back to legacy inline prompt */ }

    // Build the system prompt. If no admin prompt exists (fresh DB, migration
    // 12 not yet run), fall back to the previous inline wording so mapping
    // still works — same output contract either way.
    const systemPrompt = mappingPromptRow?.body
      ? buildSystemPrompt({
          body: mappingPromptRow.body,
          vars: {
            MIGRATION_TYPE: baseType,
            CSV_HEADERS: csv.headers,
            FMX_FIELDS: fmxFieldNames,
            SUGGESTED: suggested,
          },
          examples: mappingExamples,
        })
      : `FMX data migration. Suggest best CSV→FMX column mapping. Return ONLY valid JSON object, keys=FMX field names, values=CSV column names or null. CSV headers: ${JSON.stringify(csv.headers)}. FMX fields: ${JSON.stringify(fmxFieldNames)}. Already matched: ${JSON.stringify(suggested)}.`;

    try {
      const [aiRes, memMatches, rules] = await Promise.all([
        claudeFetch({
          max_tokens: 1000,
          system: mappingPromptRow?.body ? systemPrompt : undefined,
          messages: [{
            role: "user",
            content: mappingPromptRow?.body
              ? `CSV headers: ${JSON.stringify(csv.headers)}\nFMX fields: ${JSON.stringify(fmxFieldNames)}\nHeuristic pre-matches: ${JSON.stringify(suggested)}\n\nReturn ONLY the JSON mapping object.`
              : systemPrompt
          }]
        }).catch(() => null),
        getMappingSuggestions(schemaType, csv.headers),
        getSavedRulesForSchema(schemaType),
      ]);

      // Parse AI result
      let aiResult = {};
      if (aiRes) {
        const clean = parseClaudeText(aiRes) || "{}";
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

      // Snapshot the AI-suggested mapping so later user edits in step 2 can
      // be diffed into `mapping_change` corrections.
      setMappingRun(mappingRunId
        ? { runId: mappingRunId, migrationType: baseType, initialMapping: { ...finalMapping } }
        : null
      );

      // Close out the extraction_run audit row with token usage.
      if (mappingRunId) {
        const usage = extractUsage(aiRes);
        completeExtractionRun(mappingRunId, {
          status: 'complete',
          resultJson: {
            mapping: finalMapping,
            fmxFieldCount: fmxFieldNames.length,
            csvHeaderCount: csv.headers.length,
            // Snapshot inputs so admin dry-runs can replay this mapping call.
            csvHeaders: csv.headers,
            fmxFieldNames,
            suggested,
          },
          durationMs: Date.now() - mappingStart,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostUsd: usage.costUsd,
        });
        if (mappingExamples?.length) incrementExampleUsage(mappingExamples.map(e => e.id));
      }
    } catch (err) {
      setMapping(suggested);
      if (mappingRunId) {
        completeExtractionRun(mappingRunId, {
          status: 'error',
          error: err?.message || String(err),
          durationMs: Date.now() - mappingStart,
        });
      }
    }
    setAiLoading(false);
    setWStep(2);
  };

  // Diffs two mapped-row arrays into per-cell `validate_edit` correction entries.
  // Keeps things reasonable by capping at 100 entries per change (bulk edits
  // shouldn't flood the corrections table).
  const diffRowsToCorrections = (prevRows, nextRows) => {
    const out = [];
    const len = Math.max(prevRows?.length || 0, nextRows?.length || 0);
    for (let i = 0; i < len && out.length < 100; i++) {
      const a = prevRows?.[i] || {};
      const b = nextRows?.[i] || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        const av = a[k] ?? '';
        const bv = b[k] ?? '';
        if (String(av) !== String(bv)) {
          out.push({
            correctionType: 'validate_edit',
            fieldPath: k,
            rowIndex: i,
            originalValue: String(av),
            correctedValue: String(bv),
          });
          if (out.length >= 100) break;
        }
      }
    }
    return out;
  };

  // Wrapped setter for StepValidate. Fires a batch `recordCorrections` call
  // whenever the user's edits actually change cell values. Attaches to either
  // the PDF extraction run (preferred) or the CSV field_mapping run.
  const handleValidateRowsChange = (updater) => {
    setMappedRows(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const runId = pdfSource?.runId || mappingRun?.runId;
      const migrationType = pdfSource?.migrationType || mappingRun?.migrationType;
      if (runId) {
        try {
          const entries = diffRowsToCorrections(prev, next);
          if (entries.length) {
            recordCorrections({
              extractionRunId: runId,
              migrationType,
              userId: user?.id,
              entries,
            });
          }
        } catch { /* non-fatal */ }
      }
      return next;
    });
  };

  // Wraps setMapping so that user-initiated mapping edits in Step 2 get
  // captured as `mapping_change` corrections linked to the field_mapping run.
  // StepMapFields' dropdown `onChange` calls setMapping(m => ({ ...m, [fmx]: val })),
  // so we support both functional and object updates.
  const handleMappingChange = (updater) => {
    setMapping(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Only capture when we have a live mapping run to attach to.
      if (mappingRun?.runId) {
        try {
          const entries = [];
          const keys = new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]);
          for (const k of keys) {
            const before = prev?.[k] ?? null;
            const after = next?.[k] ?? null;
            if (before !== after) {
              entries.push({
                correctionType: 'mapping_change',
                fieldPath: k,
                rowIndex: null,
                originalValue: before,
                correctedValue: after,
              });
            }
          }
          if (entries.length) {
            recordCorrections({
              extractionRunId: mappingRun.runId,
              migrationType: mappingRun.migrationType,
              userId: user?.id,
              entries,
            });
          }
        } catch { /* non-fatal */ }
      }
      return next;
    });
  };

  const handleFileAndMap = file => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();

    // Any non-PDF replacement invalidates the correction-capture context.
    if (ext !== "pdf") setPdfSource(null);

    if (ext === "pdf") {
      // PDF → Claude vision → {headers, rows}. Uses the admin-editable prompt
      // stored in the `prompts` table for this migration type. The resulting
      // table plugs into the existing mapping/validation/transform flow.
      setPdfExtracting(true);
      setPdfProgress({ label: "Starting…" });
      extractPdfToSheet(file, schemaType, {
        projectId: selectedProject?.id,
        userId: user?.id,
        onProgress: (label, progress) => setPdfProgress({ label, ...progress }),
      }).then(({ headers, rows, pageCount, runId }) => {
        setCsv({ headers, rows });
        setPdfSource({ runId, migrationType: schemaType });
        setFileInfo({
          type: "PDF (OCR)",
          sheetName: null,
          rowCount: rows.length,
          pageCount,
        });
      }).catch(err => {
        console.error("PDF extraction failed:", err);
        alert(`PDF extraction failed: ${err.message || err}`);
      }).finally(() => {
        setPdfExtracting(false);
        setPdfProgress(null);
      });
      return;
    }

    const reader = new FileReader();
    if (ext === "csv") {
      reader.onload = e => parseAndPreview(e.target.result, { type: "CSV", sheetName: null });
      reader.readAsText(file);
    } else {
      reader.onload = async e => {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const typeLabel = ext === "xlsx" ? "Excel (.xlsx)" : ext === "xls" ? "Excel (.xls)" : "ODS";
        if (wb.SheetNames.length <= 1) {
          // Single sheet — proceed immediately
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const csvStr = XLSX.utils.sheet_to_csv(ws);
          parseAndPreview(csvStr, { type: typeLabel, sheetName });
        } else {
          // Multiple sheets — show picker
          setXlsxWorkbook({ wb, typeLabel });
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleSheetSelect = async (selection) => {
    if (!xlsxWorkbook) return;
    const { wb, typeLabel } = xlsxWorkbook;
    const XLSX = await import("xlsx");
    setXlsxWorkbook(null);

    if (selection === '__merge__') {
      // Merge all sheets — prefix each column with "SheetName — ColumnHeader"
      const allRows = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        for (const row of rows) {
          const prefixed = {};
          for (const [col, val] of Object.entries(row)) {
            prefixed[`${sheetName} \u2014 ${col}`] = val;
          }
          allRows.push(prefixed);
        }
      }
      const allHeaders = [...new Set(allRows.flatMap(r => Object.keys(r)))];
      const csvLines = [
        allHeaders.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','),
        ...allRows.map(row =>
          allHeaders.map(h => {
            const v = row[h] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
          }).join(',')
        ),
      ];
      parseAndPreview(csvLines.join('\n'), { type: typeLabel, sheetName: `Merged (${wb.SheetNames.length} sheets)` });
    } else {
      const ws = wb.Sheets[selection];
      const csvStr = XLSX.utils.sheet_to_csv(ws);
      parseAndPreview(csvStr, { type: typeLabel, sheetName: selection });
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
    // no-op: persistentRefs state was removed; callers may still invoke this
  };

  const handleImportComplete = ({ schemaType: st, referenceValues }) => {
    setChecklistRefreshKey(k => k + 1);
    if (selectedProject?.id) {
      getProjectImports(selectedProject.id).then(d => setWizardImports(d || []));
    }
  };

  const handleResumeFromWizard = async (rec, step = 3) => {
    const rows = await getImportRows(rec.id);
    setSchemaType(rec.schema_type);
    setMapping(rec.mapping_snapshot || {});
    setMappedRows(rows || []);
    setCustomFields([]);
    setDynamicRates([]);
    setTransformRules({});
    setCertified(false);

    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setWStep(step);
    setMainTab('wizard');
    handleFmxSync(rec.schema_type);
  };

  const handleViewFromWizard = async (rec) => {
    setWizardViewLoading(true);
    setWizardViewModal({ rec, rows: [] });
    const rows = await getImportRows(rec.id);
    setWizardViewModal({ rec, rows: rows || [] });
    setWizardViewLoading(false);
  };

  const handleResumeImport = ({ schemaType: st, mappedRows: rows, mapping: m, wStep: step = 3 }) => {
    setSchemaType(st);
    setMapping(m || {});
    setMappedRows(rows || []);
    setCustomFields([]);
    setDynamicRates([]);
    setTransformRules({});
    setCertified(false);

    setFmxSyncData({ customFields: [], systemFields: [], loading: false, fromCache: undefined });
    setShowProjectScreen(false);
    setWStep(step);
    handleFmxSync(st);
  };

  const reset = () => {
    setWStep(0); setSchemaType(""); setCsv(null); setFileInfo(null); setMapping({});
    setTransformRules({}); setCustomFields([]); setDynamicRates([]);
    setMappedRows([]); setCertified(false);
    setMemoryMatches({}); setMappingSources({}); setSavedRules({});
    setMappingRun(null); setPdfSource(null);

    setFmxSyncData({ customFields: [], loading: false, fromCache: undefined });
    setMainTab('overview');
  };

  const goToProjects = () => {
    setShowProjectScreen(true);
  };

  const handleBack = () => {
    if (wStep <= 1) {
      // At step 1, "back" returns to Overview but preserves wizard state
      // (so the Wizard tab stays available for resume)
      setMainTab('overview');
    } else {
      setWStep(wStep - 1);
    }
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
        user={user}
        activeProjectId={selectedProject?.id || null}
        activeWizardSchema={schemaType || null}
        onSelectProject={(project) => {
          const isSameProject = selectedProject?.id === project.id;

          if (!isSameProject && schemaType) {
            const confirmed = window.confirm(
              `You have an in-progress "${schemaType}" import on "${selectedProject?.name}". `
              + `Switching projects will discard this work. Continue?`
            );
            if (!confirmed) return;
          }

          if (!isSameProject) {
            reset();
            setMainTab('overview');
          }

          setSelectedProject(project);
          setShowProjectScreen(false);
          getProjectImports(project.id).then(d => setWizardImports(d || []));
        }}
        onResumeImport={handleResumeImport}
      />
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPage, minHeight: "100vh", color: C.textDark }}>
      <style>{GLOBAL_STYLES}</style>

      {showProfileModal && (
        <ProfileEditModal
          user={user}
          profile={currentProfile}
          onClose={() => setShowProfileModal(false)}
          onProfileUpdated={reloadProfiles}
        />
      )}
      {showAdminPanel && (
        <AdminPanelModal
          currentUser={user}
          currentProfile={currentProfile}
          allProfiles={allProfiles}
          projects={allProjects}
          onClose={() => setShowAdminPanel(false)}
          onProfilesChanged={reloadProfiles}
          onFieldOverridesChanged={loadFieldOverrides}
          fieldOverrides={fieldOverrides}
        />
      )}

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
          {selectedProject && (
            <button
              onClick={goToProjects}
              style={{
                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                padding: '4px 12px', borderRadius: 6, marginRight: 14,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
            >
              ← All Projects
            </button>
          )}
          <span style={{ color: C.white, fontWeight: 600, fontSize: 15 }}>FMX Data Migration Tool</span>
          {selectedProject && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.4)', margin: '0 10px', fontSize: 15 }}>|</span>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 400 }}>{selectedProject.name}</span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <UserMenu
            user={user}
            profile={currentProfile}
            onOpenProfile={() => setShowProfileModal(true)}
            onOpenAdminPanel={() => setShowAdminPanel(true)}
            onSignOut={handleSignOut}
          />
        </div>
      </div>

      {/* Owner / connection info strip */}
      {selectedProject && (
        <div style={{
          background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
          padding: '6px 24px', display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 12, color: '#6B7280',
          position: 'sticky', top: 52, zIndex: 95,
          minHeight: 30,
        }}>
          <span>
            Owner:{' '}
            <strong style={{ color: '#374151', fontWeight: 600 }}>
              {allProfiles.find(p => p.id === selectedProject.user_id)?.full_name
                || allProfiles.find(p => p.id === selectedProject.user_id)?.email
                || 'Unassigned'}
            </strong>
          </span>
          {selectedProject.fmx_connection_verified && (
            <span style={{ padding: '1px 7px', borderRadius: 8, background: '#E6F4EE', color: '#1A7F4E', fontSize: 10, fontWeight: 600 }}>✓ FMX Connected</span>
          )}
          {selectedProject.fmx_site_url && (
            <span style={{ color: '#9CA3AF' }}>· {selectedProject.fmx_site_url}</span>
          )}
        </div>
      )}

      {/* Tab bar — only when project is open. Wizard tab only appears when a session is active. */}
      {selectedProject && (
        <div style={{
          background: '#fff', borderBottom: '1px solid #E5E7EB',
          padding: '0 24px', display: 'flex', alignItems: 'center',
          position: 'sticky', top: 82, zIndex: 90,
        }}>
          {(() => {
            const baseTabs = ['overview', 'dependencies', 'settings'];
            const tabs = schemaType ? [...baseTabs, 'wizard'] : baseTabs;
            return tabs.map(tab => {
              const isActive = mainTab === tab;
              const label = tab === 'wizard'
                ? `Wizard · ${schemaType} (${WIZARD_LABELS[wStep - 1] || ''})`
                : tab.charAt(0).toUpperCase() + tab.slice(1);
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
                  {label}
                </button>
              );
            });
          })()}
        </div>
      )}

      {/* Page content */}
      <div style={{ padding: '1.5rem 24px 2rem' }}>

        {/* Overview tab — sidebar + detail pane */}
        {mainTab === 'overview' && (
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <WorkspaceSidebar
              project={selectedProject}
              status={(() => {
                // Derive { [schemaType]: { complete: bool } } from the imports list
                const s = {};
                for (const imp of wizardImports) {
                  if (!s[imp.schema_type]) s[imp.schema_type] = { complete: true };
                }
                return s;
              })()}
              cardSettings={selectedProject?.card_settings || {}}
              selectedSchema={selectedSchema}
              onSelectSchema={setSelectedSchema}
              activeWizardSchema={schemaType || null}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedSchema ? (
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
                  selectedSchema={selectedSchema}
                />
              ) : (
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '32px 28px' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: C.navy, margin: '0 0 10px' }}>Project overview</h2>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 18px' }}>
                    Pick a schema from the left to view its imports and start a new import.
                    {schemaType && (
                      <>
                        {' '}An import is in progress for <strong style={{ color: C.navy }}>{schemaType}</strong> —
                        <button
                          onClick={() => setMainTab('wizard')}
                          style={{ background: 'none', border: 'none', color: C.orange, fontSize: 14, cursor: 'pointer', padding: '0 4px', fontWeight: 600 }}
                        >resume wizard</button>.
                      </>
                    )}
                  </p>
                  <div style={{ fontSize: 13, color: '#9CA3AF' }}>
                    {wizardImports.length} completed import{wizardImports.length === 1 ? '' : 's'} across this project.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dependencies tab */}
{mainTab === 'dependencies' && (
  <DependenciesView
    projectId={selectedProject?.id}
    project={selectedProject}
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
            {/* Breadcrumb step bar with prev/next */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 0,
              padding: '10px 14px', marginBottom: '1.5rem',
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10,
              overflowX: 'auto',
            }}>
              {/* Breadcrumbs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, minWidth: 0 }}>
                {WIZARD_LABELS.map((label, i) => {
                  const stepIdx = i + 1;
                  const isActive = stepIdx === wStep;
                  const isDone = stepIdx < wStep;
                  const clickable = isDone;
                  return (
                    <div key={stepIdx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => clickable && setWStep(stepIdx)}
                        disabled={!clickable}
                        style={{
                          background: 'none', border: 'none',
                          padding: '4px 10px', borderRadius: 6,
                          cursor: clickable ? 'pointer' : 'default',
                          fontSize: 13,
                          fontWeight: isActive ? 700 : 500,
                          color: isActive ? C.orange : isDone ? '#374151' : '#9CA3AF',
                          display: 'flex', alignItems: 'center', gap: 5,
                          fontFamily: 'system-ui, -apple-system, sans-serif',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isDone && (
                          <span style={{
                            width: 14, height: 14, borderRadius: '50%', background: '#1A7F4E',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 9, fontWeight: 700,
                          }}>✓</span>
                        )}
                        {label}
                      </button>
                      {i < WIZARD_LABELS.length - 1 && (
                        <span style={{ color: '#D1D5DB', fontSize: 14, userSelect: 'none' }}>›</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Prev / Next buttons */}
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginLeft: 12 }}>
                <button
                  onClick={handleBack}
                  title="Previous step (←)"
                  style={{
                    background: '#fff', border: '1px solid #D1D5DB', borderRadius: 6,
                    padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: '#374151',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}
                >‹ Prev</button>
                <button
                  onClick={() => {
                    if (wStep === 1 && csv && !aiLoading) { suggestAndAdvance(); return; }
                    if (wStep === 2) goToValidate();
                    else if (wStep === 3 && canProceed) setWStep(4);
                    else if (wStep < 4 && canProceed) setWStep(wStep + 1);
                  }}
                  disabled={(wStep === 1 && (!csv || aiLoading)) || wStep >= 4 || (wStep > 1 && !canProceed)}
                  title="Next step (→)"
                  style={{
                    background: (wStep >= 4 || !canProceed) ? '#E5E7EB' : C.orange,
                    color: (wStep >= 4 || !canProceed) ? '#9CA3AF' : '#fff',
                    border: 'none', borderRadius: 6,
                    padding: '5px 12px', fontSize: 12,
                    cursor: (wStep >= 4 || !canProceed) ? 'not-allowed' : 'pointer',
                    fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500,
                  }}
                >Next ›</button>
              </div>
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
                xlsxSheetNames={xlsxWorkbook ? xlsxWorkbook.wb.SheetNames : null}
                onSheetSelect={handleSheetSelect}
                csv={csv}
                setCsv={setCsv}
                pdfExtracting={pdfExtracting}
                pdfProgress={pdfProgress}
                pdfSource={pdfSource}
                currentUserId={user?.id}
              />
            )}

            {wStep === 2 && allFields.length > 0 && (
              <StepMapFields
                csv={csv}
                schemaType={schemaType}
                allFields={allFields}
                groupedFields={groupedFields}
                mapping={mapping}
                setMapping={handleMappingChange}
                transformRules={transformRules}
                setTransformRules={setTransformRules}
                dynamicRates={dynamicRates}
                setDynamicRates={setDynamicRates}
                fileInfo={fileInfo}
                setPreview={setPreview}
                openTransformModal={openTransformModal}
                memoryMatches={memoryMatches}
                mappingSources={mappingSources}
                savedRules={savedRules}
                fmxSyncData={fmxSyncData}
                onCustomFieldTypeChange={handleCustomFieldTypeChange}
              />
            )}

            {wStep === 3 && (
              <StepValidate
                mappedHeaders={mappedHeaders}
                mappedRows={mappedRows}
                setMappedRows={handleValidateRowsChange}
                cellErrors={cellErrors}
                allFields={allFields}
                hasErrors={hasErrors}
                certified={certified}
                setCertified={setCertified}
                applyNLEdit={applyNLEdit}
                onRowsUpdated={(rows) => handleValidateRowsChange(rows)}
                projectId={selectedProject?.id}
                schemaType={schemaType}
                depCacheMap={depCacheMap}
                depAutoSyncing={depAutoSyncing}
                onCustomFieldTypeChange={handleCustomFieldTypeChange}
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
                systemFieldMetadata={fmxSyncData?.systemFields || []}
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
                {wStep === 1 && csv && (
                  <button className="fmx-btn-primary" onClick={suggestAndAdvance} disabled={aiLoading}>
                    {aiLoading ? 'Analyzing columns…' : 'Map columns →'}
                  </button>
                )}
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
