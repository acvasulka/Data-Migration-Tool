import { useState, useRef, useEffect } from "react";
import { FMX_SCHEMAS } from "./schemas";
import { parseCSV, buildMappedRows, computeCellErrors, downloadCSV, suggestMapping } from "./utils";
import { C } from "./theme";
import { supabase } from "./supabase";
import DataPreviewModal from "./components/DataPreviewModal";
import TransformModal from "./components/TransformModal";
import ProjectChecklist from "./components/ProjectChecklist";
import ProjectScreen from "./components/ProjectScreen";
import StepSelectType from "./components/StepSelectType";
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
  const [orgId, setOrgId] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectScreen, setShowProjectScreen] = useState(true);
  const [orgIdRetryCount, setOrgIdRetryCount] = useState(0);
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
  const [transformModal, setTransformModal] = useState(null);
  const fileRef = useRef();

  const fetchOrgId = async (uid) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', uid)
      .single();

    if (profile?.org_id) {
      setOrgId(profile.org_id);
      return;
    }

    // org_id is null — may be a race condition on first login
    setOrgId(null);
  };

  useEffect(() => {
    // Check for password reset in URL hash
    if (window.location.hash.includes('type=recovery')) {
      setPasswordReset(true);
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        fetchOrgId(session.user.id);
      }
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        setOrgIdRetryCount(0);
        fetchOrgId(session.user.id);
      } else {
        setUser(null);
        setOrgId(null);
        setOrgIdRetryCount(0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Retry fetching orgId every 2s (up to 5 times) if user is logged in but orgId is still null
  useEffect(() => {
    if (!user || orgId || orgIdRetryCount >= 5) return;
    const timer = setTimeout(() => {
      fetchOrgId(user.id);
      setOrgIdRetryCount(c => c + 1);
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, orgId, orgIdRetryCount]);

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

  const schema = schemaType ? FMX_SCHEMAS[schemaType] : null;
  const allFields = schema ? [
    ...schema.fields,
    ...customFields.filter(cf => cf.name).map(cf => ({
      name: cf.name, required: cf.required || false, type: "string", group: "Custom Fields",
    })),
    ...dynamicRates.flatMap((_, i) => [
      { name: `Rate ${i + 1} Cost`, required: false, type: "number", group: "Scheduling Rates" },
      { name: `Rate ${i + 1} Unit`, required: false, type: "string", group: "Scheduling Rates" },
    ]),
  ] : [];
  const mappedHeaders = allFields.map(f => f.name);

  const cellErrors = wStep >= 3 ? computeCellErrors(mappedRows, allFields, importedData) : {};
  const hasErrors = Object.values(cellErrors).some(v => v === "error");

  const groupedFields = {};
  allFields.forEach(f => {
    const g = f.group || "Core Fields";
    if (!groupedFields[g]) groupedFields[g] = [];
    groupedFields[g].push(f);
  });

  const canProceed = !hasErrors || certified;

  const handleSelectType = t => {
    setSchemaType(t); setCustomFields([]); setDynamicRates([]);
    setTransformRules({}); setCertified(false); setFileInfo(null); setWStep(1);
  };

  const processCSV = async (csvStr, info) => {
    const parsed = parseCSV(csvStr);
    setCsv(parsed);
    setFileInfo({ ...info, rowCount: parsed.rows.length });
    setAiLoading(true);
    const suggested = suggestMapping(parsed.headers, FMX_SCHEMAS[schemaType].fields);
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: `FMX data migration. Suggest best CSV→FMX column mapping. Return ONLY valid JSON object, keys=FMX field names, values=CSV column names or null. CSV headers: ${JSON.stringify(parsed.headers)}. FMX fields: ${JSON.stringify(FMX_SCHEMAS[schemaType].fields.map(f => f.name))}. Already matched: ${JSON.stringify(suggested)}.` }]
        })
      });
      const data = await res.json();
      const clean = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
      setMapping({ ...suggested, ...JSON.parse(clean) });
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

  const reset = () => {
    setWStep(0); setSchemaType(""); setCsv(null); setFileInfo(null); setMapping({});
    setTransformRules({}); setCustomFields([]); setDynamicRates([]);
    setMappedRows([]); setCertified(false);
  };

  const goToProjects = () => {
    reset();
    setShowProjectScreen(true);
  };

  const handleBack = () => {
    if (wStep > 0) setWStep(wStep - 1);
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

  // User is logged in but orgId not yet resolved
  if (!orgId) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif', background: C.bgPage }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ width: 36, height: 36, border: `4px solid ${C.border}`, borderTopColor: C.orange, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ marginTop: 14, color: C.textMid, fontSize: 14 }}>
          {orgIdRetryCount >= 5 ? 'Unable to load your organization. Please sign out and try again.' : 'Setting up your account…'}
        </p>
        {orgIdRetryCount >= 5 && (
          <button onClick={handleSignOut} style={{ marginTop: 12, background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer', color: C.textMid }}>
            Sign out
          </button>
        )}
      </div>
    );
  }

  // Project management screen
  if (showProjectScreen) {
    return (
      <ProjectScreen
        orgId={orgId}
        onSelectProject={(project) => {
          setSelectedProject(project);
          setShowProjectScreen(false);
        }}
      />
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: C.bgPage, minHeight: "100vh", color: C.textDark }}>
      <style>{GLOBAL_STYLES}</style>

      {preview && <DataPreviewModal header={preview.header} values={preview.values} onClose={() => setPreview(null)} />}
      {transformModal && (
        <TransformModal
          fieldName={transformModal}
          csvHeaders={csv?.headers || []}
          currentRule={transformRules[transformModal]}
          onSave={rule => { setTransformRules(r => ({ ...r, [transformModal]: { ...rule, type: "formula" } })); setTransformModal(null); }}
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
          <span style={{ color: C.blue, fontSize: 13 }}>Step {wStep + 1} — {WIZARD_STEPS[wStep]}</span>
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

      {/* Page content */}
      <div style={{ padding: "1.5rem 24px 0" }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Main wizard area */}
          <div style={{ flex: 1, minWidth: 0 }}>

            {/* Step tabs */}
            <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: "1.5rem", overflowX: "auto" }}>
              {WIZARD_STEPS.map((label, i) => (
                <div
                  key={i}
                  className={`fmx-tab ${i === wStep ? "fmx-tab-active" : i < wStep ? "fmx-tab-completed" : "fmx-tab-inactive"}`}
                  onClick={() => i < wStep && setWStep(i)}
                >
                  {i + 1}. {label}
                </div>
              ))}
            </div>

            {wStep === 0 && <StepSelectType history={history} onSelectType={handleSelectType} />}

            {wStep === 1 && (
              <StepUpload
                schemaType={schemaType}
                aiLoading={aiLoading}
                fileInfo={fileInfo}
                dragOver={dragOver}
                setDragOver={setDragOver}
                fileRef={fileRef}
                handleFileAndMap={handleFileAndMap}
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
                setTransformModal={setTransformModal}
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
              />
            )}

            {/* Sticky footer nav */}
            {wStep > 0 && (
              <div style={{
                position: "sticky", bottom: 0, background: C.white,
                borderTop: `1px solid ${C.border}`, padding: "12px 0",
                display: "flex", justifyContent: "space-between", alignItems: "center",
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
            )}
          </div>

          <ProjectChecklist history={history} projectId={selectedProject?.id} />
        </div>
      </div>
    </div>
  );
}
