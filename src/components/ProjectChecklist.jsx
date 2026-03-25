import { useState, useEffect } from "react";
import { C } from "../theme";
import { getProjectStatus } from "../db";
import { IMPORT_ORDER } from "../schemas";

export default function ProjectChecklist({ history, projectId }) {
  const [dbStatus, setDbStatus] = useState({});

  useEffect(() => {
    if (!projectId) return;
    getProjectStatus(projectId).then(s => setDbStatus(s || {}));
  }, [projectId]);

  if (!projectId) {
    // Session-only fallback
    return (
      <div style={{ width: 180, flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Session History
        </p>
        {history.length === 0
          ? <p style={{ fontSize: 12, color: C.textLight }}>No exports yet</p>
          : history.map((h, i) => (
            <div key={i} className="fmx-history-card">
              <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 500, color: C.navy }}>{h.type}</p>
              <p style={{ margin: 0, fontSize: 11, color: C.textMid }}>{h.rows} rows · {h.time}</p>
            </div>
          ))
        }
      </div>
    );
  }

  // Session exports this session (for merging)
  const sessionByType = {};
  history.forEach(h => { sessionByType[h.type] = h; });

  return (
    <div style={{ width: 180, flexShrink: 0 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: C.navy, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        Project Checklist
      </p>
      {IMPORT_ORDER.map((schema, i) => {
        const db = dbStatus[schema];
        const session = sessionByType[schema];
        const done = db?.complete || !!session;
        const isCurrent = !done && IMPORT_ORDER.slice(0, i).every(s => dbStatus[s]?.complete || sessionByType[s]);

        return (
          <div key={schema} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
            {done
              ? <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#1A7F4E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>
                </div>
              : isCurrent
                ? <div style={{ width: 14, height: 14, borderRadius: '50%', background: C.orange, flexShrink: 0, marginTop: 2 }} />
                : <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #D1D5DB', flexShrink: 0, marginTop: 2 }} />
            }
            <div>
              <span style={{ fontSize: 12, fontWeight: done ? 600 : isCurrent ? 600 : 400, color: done ? C.navy : isCurrent ? C.navy : C.textLight }}>
                {schema}
              </span>
              {session && (
                <div style={{ fontSize: 10, color: C.textMid }}>{session.rows} rows · {session.time}</div>
              )}
              {!session && db?.complete && (
                <div style={{ fontSize: 10, color: C.textMid }}>{db.rowCount} rows</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
