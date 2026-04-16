import { useState, useEffect, useRef } from "react";
import { db, auth, googleProvider } from "./firebase";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  addDoc, getDoc, query, orderBy, limit,
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const COLORS = ["#6C63FF","#F59E0B","#10B981","#EF4444","#3B82F6","#EC4899","#8B5CF6","#14B8A6"];

const statusConfig = {
  done:          { label: "Completed",   color: "#10B981", bg: "#D1FAE5", darkBg: "#064E3B", icon: "✓" },
  "in-progress": { label: "In Progress", color: "#F59E0B", bg: "#FEF3C7", darkBg: "#78350F", icon: "◑" },
  pending:       { label: "Pending",     color: "#94A3B8", bg: "#F1F5F9", darkBg: "#1E293B", icon: "○" },
  blocked:       { label: "Blocked",     color: "#EF4444", bg: "#FEE2E2", darkBg: "#7F1D1D", icon: "✕" },
};

function getProjectProgress(modules) {
  if (!modules?.length) return 0;
  return Math.round(modules.reduce((a, m) => a + m.progress, 0) / modules.length);
}
function getDaysLeft(deadline) {
  return Math.ceil((new Date(deadline) - new Date()) / 86400000);
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Theme Context ────────────────────────────────────────────────────────────
function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const toggle = () => setDark(d => {
    localStorage.setItem("theme", !d ? "dark" : "light");
    return !d;
  });
  const t = {
    dark,
    bg: dark ? "#0F1629" : "#F0F4F8",
    card: dark ? "#1A2235" : "#FFFFFF",
    cardBorder: dark ? "#2A3550" : "#E2E8F0",
    nav: dark ? "#0A0F1E" : "#0F172A",
    navBorder: dark ? "#1A2235" : "#1E293B",
    text: dark ? "#F1F5F9" : "#0F172A",
    textSub: dark ? "#94A3B8" : "#64748B",
    textMuted: dark ? "#475569" : "#94A3B8",
    input: dark ? "#0F1629" : "#FAFAFA",
    inputBorder: dark ? "#2A3550" : "#E2E8F0",
    hover: dark ? "#1E2D45" : "#F8FAFF",
    tableHeader: dark ? "#111827" : "#F8FAFC",
    tableBorder: dark ? "#1E293B" : "#F1F5F9",
    sidebarBg: dark ? "#111827" : "#FFFFFF",
    statsCard: dark ? "#1A2235" : "#FFFFFF",
    remarkDone: dark ? "#064E3B" : "#F0FDF4",
    remarkActive: dark ? "#78350F" : "#FFFBEB",
    remarkFaculty: dark ? "#1E1B4B" : "#F0F4FF",
  };
  return { ...t, toggle };
}

function CircularProgress({ value, color, size = 44, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="middle"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}
        fill="rgba(255,255,255,0.95)" fontSize={size * 0.2} fontWeight={900} fontFamily="'Segoe UI', sans-serif">
        {value}%
      </text>
    </svg>
  );
}

function ProgressBar({ value, color, height = 8, dark = false }) {
  return (
    <div style={{ background: dark ? "#1E293B" : "#E2E8F0", borderRadius: 99, height, overflow: "hidden", flex: 1, minWidth: 40 }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
    </div>
  );
}

function Badge({ status, dark = false }) {
  const c = statusConfig[status] || statusConfig.pending;
  return (
    <span style={{
      background: dark ? c.darkBg : c.bg, color: c.color,
      borderRadius: 99, padding: "3px 10px", fontSize: 11, fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap",
      border: `1px solid ${c.color}30`,
    }}>
      {c.icon} {c.label}
    </span>
  );
}

function Tag({ label, onRemove, dark = false }) {
  return (
    <span style={{
      background: dark ? "#1E1B4B" : "#EEF2FF", color: "#6C63FF",
      borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 600,
      display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      {label}
      {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.5, fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</span>}
    </span>
  );
}

function getInputStyle(dark) {
  return {
    padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${dark ? "#2A3550" : "#E2E8F0"}`,
    fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
    fontFamily: "inherit", color: dark ? "#F1F5F9" : "#1E293B",
    background: dark ? "#0F1629" : "#FAFAFA", transition: "border-color 0.2s",
  };
}

function Field({ label, children, dark = false }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: dark ? "#64748B" : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      {children}
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setLoading(true);
    try {
      googleProvider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      alert(`Error: ${e.code}`);
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0A0F1E 0%, #0F1629 40%, #141B2D 70%, #0A0F1E 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Segoe UI', system-ui, sans-serif", position: "relative", overflow: "hidden",
    }}>
      {/* Background orbs */}
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(108,99,255,0.15) 0%, transparent 70%)", top: "10%", left: "20%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)", bottom: "20%", right: "15%", pointerEvents: "none" }} />

      <div style={{ textAlign: "center", padding: 32, position: "relative", zIndex: 1 }}>
        {/* Logo */}
        <div style={{ width: 80, height: 80, background: "linear-gradient(135deg, #6C63FF, #3B82F6)", borderRadius: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, margin: "0 auto 20px", boxShadow: "0 0 40px rgba(108,99,255,0.4)" }}>📊</div>
        <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", marginBottom: 6, letterSpacing: "-0.5px" }}>Student Project Tracker</div>
        <div style={{ fontSize: 14, color: "#64748B", marginBottom: 40 }}>Academic Year 2025–26 · RBCET</div>

        {/* Card */}
        <div style={{
          background: "rgba(26, 34, 53, 0.8)", backdropFilter: "blur(20px)",
          borderRadius: 24, padding: 40, border: "1px solid rgba(108,99,255,0.2)",
          maxWidth: 380, boxShadow: "0 32px 64px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)",
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Welcome Back 👋</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 28, lineHeight: 1.6 }}>Sign in to track projects and collaborate with your team</div>

          <button onClick={handleGoogle} disabled={loading} style={{
            width: "100%", padding: "14px 20px", borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.1)",
            background: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.95)",
            color: "#1E293B", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            transition: "all 0.2s", boxShadow: loading ? "none" : "0 4px 20px rgba(255,255,255,0.15)",
          }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}>
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {loading ? "Signing in..." : "Sign in with Google"}
          </button>
          <div style={{ marginTop: 20, fontSize: 11, color: "#475569" }}>🔒 Only authorized team members can access</div>
        </div>
      </div>
    </div>
  );
}

// ─── Activity Log Panel ───────────────────────────────────────────────────────
function ActivityLog({ onClose, dark }) {
  const [logs, setLogs] = useState([]);
  const t = { card: dark ? "#1A2235" : "#fff", cardBorder: dark ? "#2A3550" : "#E2E8F0", text: dark ? "#F1F5F9" : "#0F172A", textSub: dark ? "#94A3B8" : "#64748B", hover: dark ? "#1E2D45" : "#F8FAFC", tableBorder: dark ? "#1E293B" : "#F1F5F9" };

  useEffect(() => {
    const q = query(collection(db, "activity"), orderBy("timestamp", "desc"), limit(50));
    const unsub = onSnapshot(q, snap => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    return () => unsub();
  }, []);

  const actionColor = { updated: "#6C63FF", added: "#10B981", deleted: "#EF4444", created: "#3B82F6" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(5,10,25,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ width: 480, background: t.card, height: "100%", overflowY: "auto", boxShadow: "-8px 0 48px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1.5px solid ${t.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: t.card, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: t.text }}>📋 Activity Log</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>All changes made by team members</div>
          </div>
          <button onClick={onClose} style={{ background: dark ? "#2A3550" : "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: "pointer", color: t.textSub, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
          {logs.length === 0 && <div style={{ textAlign: "center", color: t.textSub, padding: 48, fontSize: 14 }}>No activity yet.</div>}
          {logs.map(log => (
            <div key={log.id} style={{ display: "flex", gap: 12, padding: "12px 14px", background: dark ? "#0F1629" : "#F8FAFC", borderRadius: 12, border: `1px solid ${t.cardBorder}` }}>
              <img src={log.userPhoto} alt="" style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                  <strong>{log.userName}</strong>{" "}
                  <span style={{ color: actionColor[log.action] || "#6C63FF", fontWeight: 700 }}>{log.action}</span>{" "}
                  {log.description}
                </div>
                <div style={{ fontSize: 11, color: t.textSub, marginTop: 4, display: "flex", gap: 8 }}>
                  <span>🕐 {timeAgo(log.timestamp)}</span>
                  <span>·</span>
                  <span>📁 {log.projectName}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Module Side Panel ────────────────────────────────────────────────────────
function ModulePanel({ module, project, onClose, onSave, onDelete, projectUsers = [], dark = false }) {
  const [form, setForm] = useState({ ...module, assignees: [...module.assignees] });
  const [newMember, setNewMember] = useState("");
  const inputStyle = getInputStyle(dark);
  const t = { card: dark ? "#1A2235" : "#fff", cardBorder: dark ? "#2A3550" : "#F1F5F9", text: dark ? "#F1F5F9" : "#0F172A", textSub: dark ? "#94A3B8" : "#64748B" };

  function addMember() {
    const n = newMember.trim();
    if (!n || form.assignees.includes(n)) return;
    setForm(f => ({ ...f, assignees: [...f.assignees, n] }));
    setNewMember("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(5,10,25,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ width: 500, background: t.card, height: "100%", overflowY: "auto", boxShadow: "-8px 0 48px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1.5px solid ${t.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: t.card, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: project.color, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{project.name}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>Edit Module</div>
          </div>
          <button onClick={onClose} style={{ background: dark ? "#2A3550" : "#F1F5F9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: t.textSub, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          <Field label="Module Name" dark={dark}>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} placeholder="e.g. Frontend Development" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Status" dark={dark}>
              <select value={form.status} onChange={e => {
                const s = e.target.value;
                setForm(f => ({ ...f, status: s, progress: s === "done" ? 100 : s === "pending" ? 0 : f.progress }));
              }} style={inputStyle}>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </Field>
            <Field label="Module Deadline" dark={dark}>
              <input type="date" value={form.deadline || ""} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} />
            </Field>
          </div>

          <Field label={`Completion Progress — ${form.progress}%`} dark={dark}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
              <input type="range" min={0} max={100} value={form.progress}
                onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: project.color, height: 4 }} />
              <span style={{ fontSize: 20, fontWeight: 900, color: project.color, minWidth: 46, textAlign: "right" }}>{form.progress}%</span>
            </div>
            <ProgressBar value={form.progress} color={project.color} height={10} dark={dark} />
          </Field>

          <Field label="Assigned Members" dark={dark}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 32, padding: "6px 0" }}>
              {form.assignees.length === 0
                ? <span style={{ color: t.textSub, fontSize: 12 }}>No members assigned yet</span>
                : form.assignees.map(a => (
                    <Tag key={a} label={a} onRemove={() => setForm(f => ({ ...f, assignees: f.assignees.filter(x => x !== a) }))} dark={dark} />
                  ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={newMember} onChange={e => setNewMember(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                <option value="">— Select a member —</option>
                {projectUsers
                  .filter(u => u.assignedProjects?.includes(project.id) && u.role === "member" && !form.assignees.includes(u.name))
                  .map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
              <button onClick={addMember}
                style={{ background: project.color, color: "#fff", border: "none", borderRadius: 10, width: 42, height: 42, fontWeight: 900, fontSize: 22, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px ${project.color}40` }}>+</button>
            </div>
          </Field>

          <div style={{ borderTop: `2px dashed ${dark ? "#2A3550" : "#E2E8F0"}`, margin: "4px 0" }} />
          <div style={{ fontSize: 11, fontWeight: 800, color: t.textSub, textTransform: "uppercase", letterSpacing: "0.08em" }}>📋 Progress Remarks</div>

          <Field label="✅ What's Done" dark={dark}>
            <textarea value={form.whatsDone} onChange={e => setForm(f => ({ ...f, whatsDone: e.target.value }))}
              rows={3} placeholder="List completed tasks..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>
          <Field label="⚡ What's Currently Going On" dark={dark}>
            <textarea value={form.whatsGoingOn} onChange={e => setForm(f => ({ ...f, whatsGoingOn: e.target.value }))}
              rows={3} placeholder="What is the team currently working on?" style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>
          <Field label="📝 Faculty Remarks / Notes" dark={dark}>
            <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              rows={3} placeholder="Add notes or feedback..." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1.5px solid ${t.cardBorder}`, display: "flex", gap: 10, background: t.card, position: "sticky", bottom: 0 }}>
          <button onClick={() => onDelete(form.id)}
            style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #FEE2E2", background: dark ? "#1A1020" : "#fff", color: "#EF4444", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>🗑</button>
          <button onClick={onClose}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: dark ? "#0F1629" : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, color: t.textSub }}>Cancel</button>
          <button onClick={() => onSave(form)}
            style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: `linear-gradient(135deg, ${project.color}, ${project.color}cc)`, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, boxShadow: `0 4px 16px ${project.color}40` }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Modal ────────────────────────────────────────────────────────────
function ProjectModal({ initial, onSave, onClose, dark = false }) {
  const [form, setForm] = useState(initial || { name: "", team: "", deadline: "", color: "#6C63FF" });
  const inputStyle = getInputStyle(dark);
  const t = { card: dark ? "#1A2235" : "#fff", cardBorder: dark ? "#2A3550" : "#E2E8F0", text: dark ? "#F1F5F9" : "#1E293B", textSub: dark ? "#94A3B8" : "#64748B" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(5,10,25,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: t.card, borderRadius: 20, padding: 32, width: 440, boxShadow: "0 32px 64px rgba(0,0,0,0.4)", border: `1px solid ${t.cardBorder}` }}>
        <div style={{ fontWeight: 900, fontSize: 17, color: t.text, marginBottom: 22 }}>{initial ? "✏️ Edit Project" : "➕ New Project"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Project Name" dark={dark}><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. E-Commerce Portal" style={inputStyle} /></Field>
          <Field label="Team Name" dark={dark}><input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} placeholder="e.g. Team Epsilon" style={inputStyle} /></Field>
          <Field label="Deadline" dark={dark}><input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} /></Field>
          <Field label="Project Color" dark={dark}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                    border: form.color === c ? "3px solid #fff" : "3px solid transparent",
                    boxShadow: form.color === c ? `0 0 0 2px ${c}, 0 4px 12px ${c}60` : "none", transition: "all 0.15s" }} />
              ))}
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: dark ? "#0F1629" : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, color: t.textSub }}>Cancel</button>
          <button onClick={() => form.name && form.deadline && onSave(form)}
            style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #0F172A, #1E293B)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
            {initial ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mentor Remarks Panel ─────────────────────────────────────────────────────
function MentorRemarksPanel({ module, project, onClose, onSave, dark = false }) {
  const [remarks, setRemarks] = useState(module.remarks || "");
  const t = { card: dark ? "#1A2235" : "#fff", cardBorder: dark ? "#2A3550" : "#F1F5F9", text: dark ? "#F1F5F9" : "#0F172A", textSub: dark ? "#94A3B8" : "#64748B", bg: dark ? "#0F1629" : "#F8FAFC" };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(5,10,25,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ width: 460, background: t.card, height: "100%", overflowY: "auto", boxShadow: "-8px 0 48px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: `1.5px solid ${t.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: t.card, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: project.color, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{project.name}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: t.text }}>📝 Faculty Remarks</div>
          </div>
          <button onClick={onClose} style={{ background: dark ? "#2A3550" : "#F1F5F9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: t.textSub }}>×</button>
        </div>
        <div style={{ padding: "16px 24px", background: t.bg, borderBottom: `1px solid ${t.cardBorder}` }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 8 }}>{module.name}</div>
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: t.textSub }}>
            <span>Progress: <strong>{module.progress}%</strong></span>
            <span>Status: <strong>{module.status}</strong></span>
          </div>
        </div>
        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
          {module.whatsDone && (
            <div style={{ background: dark ? "#064E3B20" : "#F0FDF4", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #10B981" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>✅ What's Done</div>
              <div style={{ fontSize: 12, color: t.text, lineHeight: 1.65 }}>{module.whatsDone}</div>
            </div>
          )}
          {module.whatsGoingOn && (
            <div style={{ background: dark ? "#78350F20" : "#FFFBEB", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #F59E0B" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⚡ Going On Now</div>
              <div style={{ fontSize: 12, color: t.text, lineHeight: 1.65 }}>{module.whatsGoingOn}</div>
            </div>
          )}
          <div style={{ background: dark ? "#1E1B4B30" : "#F0F4FF", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #6C63FF" }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#6C63FF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>📝 Your Faculty Remarks</div>
            <textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={5}
              placeholder="Add your feedback, guidance, or concerns here..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #C7D2FE", fontSize: 12, outline: "none", resize: "vertical", lineHeight: 1.65, fontFamily: "inherit", boxSizing: "border-box", background: dark ? "#0F1629" : "#fff", color: t.text }} />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: `1.5px solid ${t.cardBorder}`, display: "flex", gap: 10, background: t.card, position: "sticky", bottom: 0 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${t.cardBorder}`, background: dark ? "#0F1629" : "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, color: t.textSub }}>Cancel</button>
          <button onClick={() => onSave({ ...module, remarks })} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #6C63FF, #4F46E5)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, boxShadow: "0 4px 16px rgba(108,99,255,0.4)" }}>Save Remarks</button>
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
function Leaderboard({ onClose, projects }) {
  const [view, setView] = useState("overall");
  const [selectedProject, setSelectedProject] = useState(null);
  const [animateIn, setAnimateIn] = useState(false);
  useEffect(() => { setTimeout(() => setAnimateIn(true), 50); }, []);

  function getBadges(stat, allStats) {
    const badges = [];
    if (allStats[0]?.name === stat.name) badges.push({ icon: "👑", label: "Top Performer" });
    if (stat.completedModules > 0 && stat.completedModules === stat.totalModules) badges.push({ icon: "🎯", label: "Perfectionist" });
    if (stat.hasHundred) badges.push({ icon: "💯", label: "Perfect Score" });
    if (stat.inProgress >= 2) badges.push({ icon: "🔥", label: "On Fire" });
    if (stat.completedModules >= 3) badges.push({ icon: "⚡", label: "Fast Mover" });
    if (stat.multiProject) badges.push({ icon: "🌟", label: "All Rounder" });
    if (stat.earlyBird) badges.push({ icon: "🚀", label: "Early Bird" });
    return badges;
  }

  function getMemberStats(projectList) {
    const stats = {};
    projectList.forEach(p => {
      (p.modules || []).forEach(m => {
        (m.assignees || []).forEach(name => {
          if (!stats[name]) stats[name] = { name, totalModules: 0, completedModules: 0, inProgress: 0, totalProgress: 0, avgProgress: 0, hasHundred: false, earlyBird: false, multiProject: false, projects: new Set() };
          stats[name].totalModules++;
          stats[name].projects.add(p.id);
          if (m.status === "done") stats[name].completedModules++;
          if (m.status === "in-progress") stats[name].inProgress++;
          if (m.progress === 100) stats[name].hasHundred = true;
          if (m.status === "done" && m.deadline && Math.ceil((new Date(m.deadline) - new Date()) / 86400000) > 2) stats[name].earlyBird = true;
          stats[name].totalProgress += m.progress;
        });
      });
    });
    return Object.values(stats).map(s => ({ ...s, multiProject: s.projects.size > 1, avgProgress: s.totalModules > 0 ? Math.round(s.totalProgress / s.totalModules) : 0 })).sort((a, b) => b.avgProgress - a.avgProgress);
  }

  function getProjectHealth(p) {
    const total = p.modules?.length || 0;
    if (total === 0) return { score: 0, label: "No Data", color: "#94A3B8", progress: 0, daysLeft: 0 };
    const progress = Math.round(p.modules.reduce((a, m) => a + m.progress, 0) / total);
    const daysLeft = Math.ceil((new Date(p.deadline) - new Date()) / 86400000);
    const overdueModules = p.modules.filter(m => m.status !== "done" && m.deadline && getDaysLeft(m.deadline) < 0).length;
    let score = Math.max(0, Math.min(100, progress - (daysLeft < 7 ? 15 : 0) - overdueModules * 10));
    return { score, label: score >= 70 ? "Healthy" : score >= 40 ? "At Risk" : "Critical", color: score >= 70 ? "#10B981" : score >= 40 ? "#F59E0B" : "#EF4444", progress, daysLeft };
  }

  const displayProjects = selectedProject ? projects.filter(p => p.id === selectedProject) : projects;
  const memberStats = getMemberStats(displayProjects);
  const medalColors = ["#F59E0B", "#94A3B8", "#CD7C2E"];
  const medalEmoji = ["🥇", "🥈", "🥉"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(5,8,20,0.92)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', system-ui, sans-serif" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(900px, 95vw)", maxHeight: "90vh", background: "linear-gradient(145deg, #0F1629 0%, #141B2D 50%, #0A0F1E 100%)", borderRadius: 24, border: "1px solid rgba(108,99,255,0.3)", boxShadow: "0 0 80px rgba(108,99,255,0.15), 0 32px 64px rgba(0,0,0,0.6)", overflow: "hidden", display: "flex", flexDirection: "column", opacity: animateIn ? 1 : 0, transform: animateIn ? "scale(1) translateY(0)" : "scale(0.95) translateY(20px)", transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
        <div style={{ padding: "24px 28px 20px", background: "linear-gradient(135deg,rgba(108,99,255,0.2),rgba(59,130,246,0.1))", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px", display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 28 }}>🏆</span>Student Leaderboard</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Live rankings · Academic Year 2025–26</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4, display: "flex", gap: 4 }}>
              {["overall", "projects"].map(v => (
                <button key={v} onClick={() => setView(v)} style={{ padding: "6px 14px", borderRadius: 7, border: "none", cursor: "pointer", background: view === v ? "#6C63FF" : "transparent", color: view === v ? "#fff" : "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", transition: "all 0.2s" }}>
                  {v === "overall" ? "🏅 Overall" : "📁 Projects"}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "24px 28px" }}>
          {view === "overall" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                <button onClick={() => setSelectedProject(null)} style={{ padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, background: !selectedProject ? "#6C63FF" : "rgba(255,255,255,0.07)", color: !selectedProject ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.2s" }}>All Projects</button>
                {projects.map(p => <button key={p.id} onClick={() => setSelectedProject(p.id === selectedProject ? null : p.id)} style={{ padding: "5px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 11, background: selectedProject === p.id ? p.color : "rgba(255,255,255,0.07)", color: selectedProject === p.id ? "#fff" : "rgba(255,255,255,0.5)", transition: "all 0.2s" }}>{p.name.length > 20 ? p.name.slice(0, 18) + "…" : p.name}</button>)}
              </div>
              {memberStats.length >= 3 && (
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 12, marginBottom: 32, padding: "0 20px" }}>
                  {[memberStats[1], memberStats[0], memberStats[2]].map((s, i) => {
                    const rank = i === 1 ? 0 : i === 0 ? 1 : 2;
                    const heights = [140, 180, 120];
                    const badges = getBadges(s, memberStats);
                    return (
                      <div key={s.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap", justifyContent: "center" }}>{badges.slice(0, 2).map(b => <span key={b.label} style={{ fontSize: 14 }} title={b.label}>{b.icon}</span>)}</div>
                        <div style={{ width: rank === 0 ? 64 : 52, height: rank === 0 ? 64 : 52, borderRadius: "50%", marginBottom: 8, background: `linear-gradient(135deg,${medalColors[rank]}40,${medalColors[rank]}20)`, border: `2px solid ${medalColors[rank]}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: rank === 0 ? 28 : 22, boxShadow: `0 0 20px ${medalColors[rank]}40` }}>{s.name.charAt(0).toUpperCase()}</div>
                        <div style={{ fontSize: rank === 0 ? 14 : 12, fontWeight: 800, color: "#fff", marginBottom: 4, textAlign: "center" }}>{s.name}</div>
                        <div style={{ fontSize: rank === 0 ? 24 : 18, fontWeight: 900, color: medalColors[rank], marginBottom: 8 }}>{s.avgProgress}%</div>
                        <div style={{ width: "100%", height: heights[i], background: `linear-gradient(180deg,${medalColors[rank]}30,${medalColors[rank]}10)`, border: `1px solid ${medalColors[rank]}40`, borderRadius: "10px 10px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 12, fontSize: 28 }}>{medalEmoji[rank]}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {memberStats.map((s, i) => {
                  const badges = getBadges(s, memberStats);
                  const isTop3 = i < 3;
                  return (
                    <div key={s.name} style={{ background: isTop3 ? `linear-gradient(135deg,${medalColors[i]}10,rgba(255,255,255,0.03))` : "rgba(255,255,255,0.03)", border: `1px solid ${isTop3 ? medalColors[i] + "30" : "rgba(255,255,255,0.06)"}`, borderRadius: 14, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, transition: "all 0.2s" }}>
                      <div style={{ width: 36, textAlign: "center", fontSize: isTop3 ? 20 : 14, fontWeight: 900, color: isTop3 ? medalColors[i] : "rgba(255,255,255,0.3)", flexShrink: 0 }}>{isTop3 ? medalEmoji[i] : `#${i + 1}`}</div>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#6C63FF40,#3B82F620)", border: "1.5px solid rgba(108,99,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 900, color: "#6C63FF" }}>{s.name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{s.name}</span>
                          {badges.map(b => <span key={b.label} title={b.label} style={{ fontSize: 14 }}>{b.icon}</span>)}
                        </div>
                        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${s.avgProgress}%`, height: "100%", borderRadius: 99, background: isTop3 ? `linear-gradient(90deg,${medalColors[i]},${medalColors[i]}cc)` : "linear-gradient(90deg,#6C63FF,#3B82F6)", transition: "width 1s ease", boxShadow: `0 0 8px ${isTop3 ? medalColors[i] : "#6C63FF"}60` }} />
                        </div>
                        <div style={{ display: "flex", gap: 10, marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                          <span>📦 {s.totalModules} modules</span><span>✅ {s.completedModules} done</span><span>⚡ {s.inProgress} active</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: s.avgProgress >= 70 ? "#10B981" : s.avgProgress >= 40 ? "#F59E0B" : "#EF4444" }}>{s.avgProgress}%</div>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>avg progress</div>
                      </div>
                    </div>
                  );
                })}
                {memberStats.length === 0 && <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", padding: 48, fontSize: 14 }}>No member data yet.</div>}
              </div>
            </div>
          )}
          {view === "projects" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[...projects].sort((a, b) => getProjectHealth(b).score - getProjectHealth(a).score).map((p, i) => {
                const health = getProjectHealth(p);
                const teamStats = getMemberStats([p]);
                return (
                  <div key={p.id} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, border: `1px solid ${health.color}30`, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", background: `linear-gradient(135deg,${health.color}15,transparent)`, borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 20 }}>{i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📁"}</div>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                        <div><div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>{p.name}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{p.team}</div></div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: health.color }}>{health.score}</div>
                        <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: health.color, letterSpacing: "0.05em" }}>{health.label}</div>
                      </div>
                    </div>
                    <div style={{ padding: "14px 20px" }}>
                      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 99, height: 8, marginBottom: 12, overflow: "hidden" }}>
                        <div style={{ width: `${health.score}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${health.color},${health.color}99)`, transition: "width 1s ease" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 14 }}>
                        {[{ label: "Progress", value: `${health.progress}%`, color: p.color }, { label: "Modules", value: p.modules?.length || 0, color: "#94A3B8" }, { label: "Done", value: p.modules?.filter(m => m.status === "done").length || 0, color: "#10B981" }, { label: "Days Left", value: health.daysLeft > 0 ? health.daysLeft : "Overdue", color: health.daysLeft < 7 ? "#EF4444" : "#F59E0B" }].map(s => (
                          <div key={s.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                            <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", marginTop: 2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {teamStats.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Team Rankings</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                            {teamStats.map((s, ti) => (
                              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, width: 20, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>#{ti + 1}</span>
                                <span style={{ fontSize: 12, color: "#fff", fontWeight: 700, minWidth: 80 }}>{s.name}</span>
                                <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 99, height: 4 }}>
                                  <div style={{ width: `${s.avgProgress}%`, height: "100%", borderRadius: 99, background: p.color, transition: "width 1s ease" }} />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 900, color: p.color, minWidth: 36, textAlign: "right" }}>{s.avgProgress}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: "12px 28px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>🏅 Rankings update in real-time</div>
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            <span>👑 Top</span><span>🎯 Perfect</span><span>⚡ Fast</span><span>🔥 Fire</span><span>🌟 All-Round</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({ onClose, projects, db, dark = false }) {
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "member", assignedProjects: [], canEdit: true, active: true, course: "", year: "" });
  const [showAddUser, setShowAddUser] = useState(false);
  const inputStyle = getInputStyle(dark);
  const t = { card: dark ? "#1A2235" : "#fff", cardBorder: dark ? "#2A3550" : "#F1F5F9", text: dark ? "#F1F5F9" : "#0F172A", textSub: dark ? "#94A3B8" : "#64748B", bg: dark ? "#0F1629" : "#F8FAFC", hover: dark ? "#1E2D45" : "#F8FAFC" };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => { setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
    return () => unsub();
  }, []);

  async function toggleActive(user) { await setDoc(doc(db, "users", user.id), { active: !user.active }, { merge: true }); }
  async function updateUser(user) { const { id, ...data } = user; await setDoc(doc(db, "users", id), data, { merge: true }); setEditingUser(null); }
  async function addUser() {
    if (!newUser.email || !newUser.name) { alert("Name and email are required!"); return; }
    await setDoc(doc(db, "users", newUser.email), newUser);
    setNewUser({ name: "", email: "", role: "member", assignedProjects: [], canEdit: true, active: true, course: "", year: "" });
    setShowAddUser(false);
  }
  async function deleteUser(userId) { if (!window.confirm("Remove this user?")) return; await deleteDoc(doc(db, "users", userId)); }

  function getMemberStats() {
    const stats = {};
    projects.forEach(p => { p.modules?.forEach(m => { m.assignees?.forEach(name => { if (!stats[name]) stats[name] = { name, totalModules: 0, completedModules: 0, inProgress: 0, avgProgress: 0, totalProgress: 0 }; stats[name].totalModules++; if (m.status === "done") stats[name].completedModules++; if (m.status === "in-progress") stats[name].inProgress++; stats[name].totalProgress += m.progress; stats[name].avgProgress = Math.round(stats[name].totalProgress / stats[name].totalModules); }); }); });
    return Object.values(stats).sort((a, b) => b.avgProgress - a.avgProgress);
  }

  const roleColor = { admin: "#6C63FF", mentor: "#3B82F6", member: "#10B981" };
  const roleBg = { admin: dark ? "#1E1B4B" : "#EEF2FF", mentor: dark ? "#1E3A5F" : "#EFF6FF", member: dark ? "#064E3B" : "#D1FAE5" };
  const tabStyle = (tab) => ({ padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: activeTab === tab ? "#6C63FF" : dark ? "#1A2235" : "#F1F5F9", color: activeTab === tab ? "#fff" : t.textSub, transition: "all 0.2s" });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(5,10,25,0.6)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div style={{ width: 700, background: t.card, height: "100%", overflowY: "auto", boxShadow: "-8px 0 48px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1.5px solid ${t.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: t.card, zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: t.text }}>⚙️ Admin Panel</div>
            <div style={{ fontSize: 11, color: t.textSub, marginTop: 2 }}>Manage users, projects, and view reports</div>
          </div>
          <button onClick={onClose} style={{ background: dark ? "#2A3550" : "#F1F5F9", border: "none", borderRadius: 8, width: 34, height: 34, fontSize: 18, cursor: "pointer", color: t.textSub }}>×</button>
        </div>
        <div style={{ padding: "14px 24px", borderBottom: `1px solid ${t.cardBorder}`, display: "flex", gap: 8 }}>
          <button style={tabStyle("users")} onClick={() => setActiveTab("users")}>👥 Users</button>
          <button style={tabStyle("projects")} onClick={() => setActiveTab("projects")}>📁 Projects</button>
          <button style={tabStyle("reports")} onClick={() => setActiveTab("reports")}>📊 Reports</button>
          <button style={tabStyle("performance")} onClick={() => setActiveTab("performance")}>👤 Performance</button>
        </div>
        <div style={{ padding: "20px 24px", flex: 1 }}>

          {activeTab === "users" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>All Users ({users.length})</div>
                <button onClick={() => setShowAddUser(!showAddUser)} style={{ background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Add User</button>
              </div>
              {showAddUser && (
                <div style={{ background: t.bg, borderRadius: 12, padding: 16, marginBottom: 16, border: `1.5px solid ${t.cardBorder}` }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 12 }}>➕ Add New User</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>NAME</div><input value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} placeholder="Full name" style={inputStyle} /></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>EMAIL</div><input value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} placeholder="email@rbmi.in" style={inputStyle} /></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>ROLE</div><select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} style={inputStyle}><option value="member">Member</option><option value="mentor">Mentor</option><option value="admin">Admin</option></select></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>COURSE</div><input value={newUser.course} onChange={e => setNewUser(u => ({ ...u, course: e.target.value }))} placeholder="B.Tech CSE" style={inputStyle} /></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>YEAR</div><input value={newUser.year} onChange={e => setNewUser(u => ({ ...u, year: e.target.value }))} placeholder="3rd Year" style={inputStyle} /></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>ASSIGN PROJECTS</div><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{projects.map(p => <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer", color: t.text }}><input type="checkbox" checked={newUser.assignedProjects.includes(p.id)} onChange={e => setNewUser(u => ({ ...u, assignedProjects: e.target.checked ? [...u.assignedProjects, p.id] : u.assignedProjects.filter(id => id !== p.id) }))} />{p.name}</label>)}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => setShowAddUser(false)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1.5px solid ${t.cardBorder}`, background: dark ? "#0F1629" : "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", color: t.textSub }}>Cancel</button>
                    <button onClick={addUser} style={{ flex: 2, padding: "8px", borderRadius: 8, border: "none", background: "#6C63FF", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Add User</button>
                  </div>
                </div>
              )}
              {loading ? <div style={{ textAlign: "center", color: t.textSub, padding: 32 }}>Loading...</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {users.sort((a, b) => ({ admin: 0, mentor: 1, member: 2 }[a.role] ?? 3) - ({ admin: 0, mentor: 1, member: 2 }[b.role] ?? 3)).map(u => (
                    <div key={u.id} style={{ background: u.active ? t.bg : dark ? "#2D0A0A" : "#FEF2F2", borderRadius: 12, padding: "12px 16px", border: `1.5px solid ${u.active ? t.cardBorder : "#FEE2E2"}` }}>
                      {editingUser?.id === u.id ? (
                        <div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                            <input value={editingUser.name} onChange={e => setEditingUser(eu => ({ ...eu, name: e.target.value }))} style={inputStyle} placeholder="Name" />
                            <input value={editingUser.email} onChange={e => setEditingUser(eu => ({ ...eu, email: e.target.value }))} style={inputStyle} placeholder="Email" />
                            <select value={editingUser.role} onChange={e => setEditingUser(eu => ({ ...eu, role: e.target.value }))} style={inputStyle}><option value="member">Member</option><option value="mentor">Mentor</option><option value="admin">Admin</option></select>
                            <select value={editingUser.canEdit ? "true" : "false"} onChange={e => setEditingUser(eu => ({ ...eu, canEdit: e.target.value === "true" }))} style={inputStyle}><option value="true">Can Edit</option><option value="false">View Only</option></select>
                            <input value={editingUser.course || ""} onChange={e => setEditingUser(eu => ({ ...eu, course: e.target.value }))} style={inputStyle} placeholder="Course" />
                            <input value={editingUser.year || ""} onChange={e => setEditingUser(eu => ({ ...eu, year: e.target.value }))} style={inputStyle} placeholder="Year" />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>ASSIGNED PROJECTS</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{projects.map(p => <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, cursor: "pointer", background: dark ? "#0F1629" : "#fff", padding: "3px 8px", borderRadius: 6, border: `1px solid ${t.cardBorder}`, color: t.text }}><input type="checkbox" checked={editingUser.assignedProjects?.includes(p.id)} onChange={e => setEditingUser(eu => ({ ...eu, assignedProjects: e.target.checked ? [...(eu.assignedProjects || []), p.id] : eu.assignedProjects.filter(id => id !== p.id) }))} />{p.name}</label>)}</div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setEditingUser(null)} style={{ flex: 1, padding: "7px", borderRadius: 7, border: `1.5px solid ${t.cardBorder}`, background: dark ? "#0F1629" : "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", color: t.textSub }}>Cancel</button>
                            <button onClick={() => updateUser(editingUser)} style={{ flex: 2, padding: "7px", borderRadius: 7, border: "none", background: "#6C63FF", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>Save Changes</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              <span style={{ fontWeight: 800, fontSize: 13, color: u.active ? t.text : t.textSub }}>{u.name}</span>
                              <span style={{ background: roleBg[u.role], color: roleColor[u.role], borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{u.role}</span>
                              {!u.active && <span style={{ background: dark ? "#7F1D1D" : "#FEE2E2", color: "#EF4444", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Inactive</span>}
                              {u.canEdit && u.role === "member" && <span style={{ background: dark ? "#064E3B" : "#D1FAE5", color: "#10B981", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Can Edit</span>}
                            </div>
                            <div style={{ fontSize: 11, color: t.textSub }}>{u.email}</div>
                            {u.course && <div style={{ fontSize: 10, color: t.textSub, marginTop: 2, opacity: 0.7 }}>{u.course} · {u.year}</div>}
                            {u.assignedProjects?.length > 0 && <div style={{ fontSize: 10, color: "#6C63FF", marginTop: 3 }}>📁 {u.assignedProjects.map(pid => projects.find(p => p.id === pid)?.name || pid).join(", ")}</div>}
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => setEditingUser(u)} style={{ background: dark ? "#2A3550" : "#F1F5F9", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: t.textSub }}>✏️</button>
                            <button onClick={() => toggleActive(u)} style={{ background: u.active ? dark ? "#2D0A0A" : "#FEF2F2" : dark ? "#064E3B" : "#D1FAE5", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: u.active ? "#EF4444" : "#10B981" }}>{u.active ? "Deactivate" : "Activate"}</button>
                            <button onClick={() => deleteUser(u.id)} style={{ background: dark ? "#2D0A0A" : "#FEF2F2", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", color: "#EF4444" }}>🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "projects" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 4 }}>All Projects ({projects.length})</div>
              {projects.map(p => {
                const assignedMembers = users.filter(u => u.assignedProjects?.includes(p.id) && u.role === "member");
                const mentor = users.find(u => u.email === p.mentor);
                return (
                  <div key={p.id} style={{ background: t.bg, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${t.cardBorder}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} />
                      <span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{p.name}</span>
                      <span style={{ fontSize: 11, color: t.textSub }}>· {p.team}</span>
                    </div>
                    <div style={{ fontSize: 11, color: t.textSub, marginBottom: 6 }}>👨‍🏫 Mentor: <strong style={{ color: t.text }}>{p.mentor ? (users.find(u => u.email === p.mentor)?.name || p.mentor) : "Not assigned"}</strong></div>
                    <div style={{ fontSize: 11, color: t.textSub, marginBottom: 8 }}>📅 Deadline: {p.deadline}</div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: t.textSub, marginBottom: 4 }}>ASSIGNED MEMBERS ({assignedMembers.length})</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {assignedMembers.length === 0 ? <span style={{ fontSize: 11, color: t.textSub, opacity: 0.5 }}>No members assigned</span> : assignedMembers.map(m => <span key={m.id} style={{ background: dark ? "#1E1B4B" : "#EEF2FF", color: "#6C63FF", borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>👤 {m.name}</span>)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "reports" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: t.text }}>📊 Project Reports</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[{ label: "Total Projects", value: projects.length, color: "#6C63FF" }, { label: "Total Modules", value: projects.reduce((a, p) => a + (p.modules?.length || 0), 0), color: "#F59E0B" }, { label: "Completed", value: projects.reduce((a, p) => a + (p.modules?.filter(m => m.status === "done").length || 0), 0), color: "#10B981" }].map(s => (
                  <div key={s.label} style={{ background: t.bg, borderRadius: 10, padding: "12px 14px", border: `1.5px solid ${t.cardBorder}`, textAlign: "center" }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: t.textSub, fontWeight: 700, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {projects.map(p => {
                const total = p.modules?.length || 0;
                const done = p.modules?.filter(m => m.status === "done").length || 0;
                const inProg = p.modules?.filter(m => m.status === "in-progress").length || 0;
                const pending = p.modules?.filter(m => m.status === "pending").length || 0;
                const progress = total > 0 ? Math.round(p.modules.reduce((a, m) => a + m.progress, 0) / total) : 0;
                const daysLeft = Math.ceil((new Date(p.deadline) - new Date()) / 86400000);
                return (
                  <div key={p.id} style={{ background: t.bg, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${t.cardBorder}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color }} /><span style={{ fontWeight: 800, fontSize: 13, color: t.text }}>{p.name}</span></div>
                      <span style={{ fontSize: 20, fontWeight: 900, color: p.color }}>{progress}%</span>
                    </div>
                    <div style={{ background: dark ? "#1E293B" : "#E2E8F0", borderRadius: 99, height: 6, marginBottom: 10 }}><div style={{ width: `${progress}%`, height: "100%", background: p.color, borderRadius: 99 }} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                      {[{ label: "Total", value: total, color: t.textSub }, { label: "Done", value: done, color: "#10B981" }, { label: "In Progress", value: inProg, color: "#F59E0B" }, { label: "Pending", value: pending, color: "#94A3B8" }].map(s => (
                        <div key={s.label} style={{ textAlign: "center", background: dark ? "#0F1629" : "#fff", borderRadius: 8, padding: "6px" }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 9, color: t.textSub, fontWeight: 700 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 11, color: daysLeft < 7 ? "#EF4444" : t.textSub, fontWeight: daysLeft < 7 ? 700 : 400 }}>{daysLeft > 0 ? `⏰ ${daysLeft} days until deadline` : "⚠️ Deadline passed!"}</div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "performance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: t.text, marginBottom: 4 }}>👤 Member Performance</div>
              <div style={{ fontSize: 11, color: t.textSub, marginBottom: 8 }}>Based on module assignments and progress across all projects</div>
              {getMemberStats().map((s, i) => (
                <div key={s.name} style={{ background: t.bg, borderRadius: 12, padding: "12px 16px", border: `1.5px solid ${t.cardBorder}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: i < 3 ? ["#F59E0B", "#94A3B8", "#CD7C2E"][i] : dark ? "#2A3550" : "#E2E8F0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: i < 3 ? "#fff" : t.textSub, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: t.text, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ background: dark ? "#1E293B" : "#E2E8F0", borderRadius: 99, height: 5, marginBottom: 4 }}><div style={{ width: `${s.avgProgress}%`, height: "100%", background: "#6C63FF", borderRadius: 99 }} /></div>
                    <div style={{ display: "flex", gap: 10, fontSize: 10, color: t.textSub }}><span>📦 {s.totalModules}</span><span>✅ {s.completedModules}</span><span>⚡ {s.inProgress}</span></div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color: s.avgProgress >= 70 ? "#10B981" : s.avgProgress >= 40 ? "#F59E0B" : "#EF4444" }}>{s.avgProgress}%</div>
                    <div style={{ fontSize: 9, color: t.textSub, fontWeight: 700, textTransform: "uppercase" }}>avg</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const theme = useTheme();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [openModuleId, setOpenModuleId] = useState(null);
  const [projectModal, setProjectModal] = useState(null);
  const [expandedRemark, setExpandedRemark] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [mentorRemarksModule, setMentorRemarksModule] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [leaderboardProject, setLeaderboardProject] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [statFilter, setStatFilter] = useState(null);
  const isEditing = useRef(false);

  // ── Auth listener (FIXED: resets selectedId on login) ────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      setSelectedId(null); // ← FIX: reset so correct project is auto-selected
      if (u) {
        const userDoc = await getDoc(doc(db, "users", u.email));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data());
        } else {
          setUserProfile({ role: "public", assignedProjects: [], canEdit: false, active: true });
        }
      } else {
        setUserProfile(null);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Projects listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "projects"), (snapshot) => {
      const loaded = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      setProjects(loaded);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // ── Users listener ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ── Auto-select first visible project ────────────────────────────────────
  useEffect(() => {
    if (projects.length > 0 && userProfile && !selectedId) {
      const visible = userProfile.role === "admin"
        ? projects
        : projects.filter(p => userProfile.assignedProjects?.includes(p.id));
      if (visible.length > 0) setSelectedId(visible[0].id);
    }
  }, [projects, userProfile]);

  // ── Notifications listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "notifications"), orderBy("timestamp", "desc"), limit(20));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.userId === user.email);
      setNotifications(all);
      setUnreadCount(all.filter(n => !n.read).length);
    });
    return () => unsub();
  }, [user]);

  // ── Deadline checker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (projects.length > 0 && user) checkDeadlines(projects);
  }, [projects, user]);

  // ── Close notifications on outside click ─────────────────────────────────
  useEffect(() => {
    function handleClick(e) { if (showNotifications && !e.target.closest("[data-notif]")) setShowNotifications(false); }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications]);

  const selected = projects.find(p => p.id === selectedId);
  // Filter modules based on search and status
  const filteredModules = selected?.modules.filter(m => {
  const matchesSearch = !searchQuery ||
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.assignees.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()));
  const matchesStatus = statusFilter === "all" || m.status === statusFilter;
  return matchesSearch && matchesStatus;
}) || [];
  const openModule = selected?.modules.find(m => m.id === openModuleId) || null;

  const visibleProjects = userProfile?.role === "admin" ? projects
    : userProfile?.role === "mentor" ? projects.filter(p => userProfile.assignedProjects?.includes(p.id))
    : userProfile?.role === "member" ? projects.filter(p => userProfile.assignedProjects?.includes(p.id))
    : projects;

  const canEdit = userProfile?.role === "admin" || (userProfile?.role === "member" && userProfile?.canEdit === true);

  const totalModules = visibleProjects.reduce((a, p) => a + (p.modules?.length || 0), 0);
  const doneModules  = visibleProjects.reduce((a, p) => a + (p.modules?.filter(m => m.status === "done").length || 0), 0);
  const inProg       = visibleProjects.reduce((a, p) => a + (p.modules?.filter(m => m.status === "in-progress").length || 0), 0);
  const overall      = Math.round(visibleProjects.reduce((a, p) => a + getProjectProgress(p.modules), 0) / Math.max(visibleProjects.length, 1));

  async function checkDeadlines(projectsList) {
  if (!user) return;
  for (const project of projectsList) {
    for (const module of project.modules || []) {
      if (!module.deadline || module.status === "done") continue;
      const daysLeft = Math.ceil((new Date(module.deadline) - new Date()) / 86400000);
      const notifId = `${user.email}_${project.id}_${module.id}`;

      // Skip if notification already exists (preserves read status)
      const alreadyExists = notifications.some(n => n.id === notifId);
      if (alreadyExists) continue;

      if (daysLeft < 0) {
        await setDoc(doc(db, "notifications", notifId), {
          userId: user.email, type: "overdue",
          title: `🔴 Overdue: ${module.name}`,
          message: `"${module.name}" in "${project.name}" is overdue by ${Math.abs(daysLeft)} days!`,
          projectName: project.name, moduleName: module.name,
          read: false, timestamp: Date.now(),
        });
      } else if (daysLeft <= 7) {
        await setDoc(doc(db, "notifications", notifId), {
          userId: user.email, type: "warning",
          title: `⚠️ Due Soon: ${module.name}`,
          message: `"${module.name}" in "${project.name}" is due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}!`,
          projectName: project.name, moduleName: module.name,
          read: false, timestamp: Date.now(),
        });
      }
    }
  }
}

  async function logActivity(action, description, projectName) {
    if (!user) return;
    await addDoc(collection(db, "activity"), { action, description, projectName, userName: user.displayName, userPhoto: user.photoURL, userEmail: user.email, timestamp: Date.now() });
  }

  async function saveProjectToFirebase(project) {
    const { id, ...data } = project;
    await setDoc(doc(db, "projects", String(id)), data);
  }

  async function saveMentorRemarks(updated) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const newModules = updatedProject.modules.map(m => m.id === updated.id ? { ...m, remarks: updated.remarks } : m);
    const newProject = { ...updatedProject, modules: newModules };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    await logActivity("updated", `remarks on "${updated.name}"`, updatedProject.name);
    setMentorRemarksModule(null);
  }

  async function saveModule(updated) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const oldModule = updatedProject.modules.find(m => m.id === updated.id);
    const newModules = updatedProject.modules.map(m => m.id === updated.id ? updated : m);
    const newProject = { ...updatedProject, modules: newModules };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    const changes = [];
    if (oldModule.progress !== updated.progress) changes.push(`progress ${oldModule.progress}% → ${updated.progress}%`);
    if (oldModule.status !== updated.status) changes.push(`status to "${statusConfig[updated.status]?.label}"`);
    if (oldModule.name !== updated.name) changes.push(`name to "${updated.name}"`);
    await logActivity("updated", changes.length > 0 ? `"${updated.name}" — ${changes.join(", ")}` : `"${updated.name}"`, updatedProject.name);
    setOpenModuleId(null);
  }

  async function deleteModule(mid) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const mod = updatedProject.modules.find(m => m.id === mid);
    const newProject = { ...updatedProject, modules: updatedProject.modules.filter(m => m.id !== mid) };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    await logActivity("deleted", `module "${mod?.name}"`, updatedProject.name);
    setOpenModuleId(null);
  }

  async function addModule() {
    const newMod = { id: Date.now(), name: "New Module", assignees: [], deadline: "", progress: 0, status: "pending", remarks: "", whatsDone: "", whatsGoingOn: "" };
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const newProject = { ...updatedProject, modules: [...updatedProject.modules, newMod] };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    await logActivity("added", `new module to "${updatedProject.name}"`, updatedProject.name);
    setOpenModuleId(newMod.id);
  }

  async function moveModule(moduleId, direction) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const modules = [...updatedProject.modules];
    const index = modules.findIndex(m => m.id === moduleId);
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === modules.length - 1) return;
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [modules[index], modules[swapIndex]] = [modules[swapIndex], modules[index]];
    const newProject = { ...updatedProject, modules };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
  }

  async function handleProjectSave(form) {
    if (!form.name.trim()) { alert("Project name cannot be empty."); return; }
    if (!form.deadline) { alert("Please set a project deadline."); return; }
    if (projectModal === "new") {
      const id = String(Date.now());
      const newProject = { ...form, id, modules: [] };
      setProjects(ps => [...ps, newProject]);
      setSelectedId(id);
      await saveProjectToFirebase(newProject);
      await logActivity("created", `new project "${form.name}"`, form.name);
    } else {
      const updated = { ...projectModal, ...form };
      setProjects(ps => ps.map(p => p.id === projectModal.id ? updated : p));
      await saveProjectToFirebase(updated);
      await logActivity("updated", `project "${form.name}"`, form.name);
    }
    setProjectModal(null);
  }

  async function deleteProject(id) {
    if (!window.confirm("Delete this project and all its modules?")) return;
    const proj = projects.find(p => p.id === id);
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    setSelectedId(remaining[0]?.id || null);
    await deleteDoc(doc(db, "projects", String(id)));
    await logActivity("deleted", `project "${proj?.name}"`, proj?.name || "");
  }

  // ── Loading states ────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0F1E" }}>
      <div style={{ color: "#6C63FF", fontSize: 16, fontWeight: 700 }}>Loading...</div>
    </div>
  );

  if (!user) return <LoginPage />;

  if (!userProfile) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 36 }}>⏳</div>
      <div style={{ fontWeight: 700, color: "#6C63FF", fontSize: 16 }}>Setting up your account...</div>
    </div>
  );

  if (userProfile.active === false) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F172A", flexDirection: "column", gap: 16, fontFamily: "'Segoe UI', sans-serif" }}>
      <div style={{ fontSize: 48 }}>🚫</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>Account Deactivated</div>
      <div style={{ fontSize: 14, color: "#64748B", textAlign: "center", maxWidth: 320 }}>Your account has been deactivated by the admin. Please contact your project coordinator.</div>
      <button onClick={() => signOut(auth)} style={{ marginTop: 8, background: "#EF4444", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Sign Out</button>
    </div>
  );

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', sans-serif", background: theme.bg, flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 36 }}>📊</div>
      <div style={{ fontWeight: 700, color: "#6C63FF", fontSize: 16 }}>Loading projects...</div>
    </div>
  );

  const dark = theme.dark;

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: theme.bg, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "background 0.3s" }}>

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div style={{ background: theme.nav, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${theme.navBorder}`, position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 20px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, background: "linear-gradient(135deg, #6C63FF, #3B82F6)", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 0 20px rgba(108,99,255,0.4)" }}>📊</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 15, letterSpacing: "-0.3px" }}>Student Project Tracker</div>
            <div style={{ color: "#475569", fontSize: 10, fontWeight: 600 }}>RBCET · Academic Year 2025–26 · {visibleProjects.length} Projects</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Dark mode toggle */}
          <button onClick={theme.toggle}
            style={{ background: dark ? "#1E293B" : "#334155", border: "none", borderRadius: 8, padding: "7px 12px", cursor: "pointer", fontSize: 14, color: "#fff", fontWeight: 700, transition: "all 0.2s" }}
            title={dark ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            {dark ? "☀️" : "🌙"}
          </button>

          {/* Leaderboard */}
          <button onClick={() => setShowLeaderboard(true)}
            style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 9, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            🏆 Leaderboard
          </button>

          {/* Notification Bell */}
          <div style={{ position: "relative" }} data-notif="true">
            <button onClick={() => setShowNotifications(!showNotifications)}
              style={{ background: dark ? "#1E293B" : "#1E293B", color: "#94A3B8", border: "1px solid #334155", borderRadius: 9, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              🔔
              {unreadCount > 0 && <span style={{ background: "#EF4444", color: "#fff", borderRadius: 99, padding: "1px 6px", fontSize: 10, fontWeight: 900 }}>{unreadCount}</span>}
            </button>
            {showNotifications && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 340, background: dark ? "#1A2235" : "#fff", borderRadius: 16, boxShadow: "0 8px 40px rgba(0,0,0,0.3)", zIndex: 500, border: `1px solid ${dark ? "#2A3550" : "#E2E8F0"}`, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${dark ? "#2A3550" : "#F1F5F9"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: dark ? "#F1F5F9" : "#0F172A" }}>🔔 Notifications</div>
                  {unreadCount > 0 && <button onClick={async () => { for (const n of notifications.filter(n => !n.read)) await setDoc(doc(db, "notifications", n.id), { read: true }, { merge: true }); }} style={{ background: "none", border: "none", color: "#6C63FF", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Mark all read</button>}
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {notifications.length === 0 ? <div style={{ padding: 32, textAlign: "center", color: dark ? "#475569" : "#CBD5E1", fontSize: 13 }}>No notifications 🎉</div> : notifications.map(n => (
                    <div key={n.id} onClick={async () => { await setDoc(doc(db, "notifications", n.id), { read: true }, { merge: true }); }}
                      style={{ padding: "12px 16px", borderBottom: `1px solid ${dark ? "#1E293B" : "#F8FAFC"}`, cursor: "pointer", background: n.read ? "transparent" : dark ? "rgba(108,99,255,0.08)" : "#F8F7FF", position: "relative" }}
                      onMouseEnter={e => e.currentTarget.style.background = dark ? "#1E2D45" : "#F1F5F9"}
                      onMouseLeave={e => e.currentTarget.style.background = n.read ? "transparent" : dark ? "rgba(108,99,255,0.08)" : "#F8F7FF"}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: n.type === "overdue" ? "#EF4444" : "#F59E0B", marginBottom: 3 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: dark ? "#64748B" : "#64748B", lineHeight: 1.5 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: dark ? "#475569" : "#94A3B8", marginTop: 4 }}>{timeAgo(n.timestamp)}</div>
                      {!n.read && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6C63FF", position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }} />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Activity Log — admin/mentor only */}
          {(userProfile?.role === "admin" || userProfile?.role === "mentor") && (
            <button onClick={() => setShowLog(true)}
              style={{ background: "#1E293B", color: "#94A3B8", border: "1px solid #334155", borderRadius: 9, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              📋 Activity Log
            </button>
          )}

          {/* Admin Panel */}
          {userProfile?.role === "admin" && (
            <button onClick={() => setShowAdmin(true)}
              style={{ background: "linear-gradient(135deg, #6C63FF, #4F46E5)", color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(108,99,255,0.3)" }}>
              ⚙️ Admin Panel
            </button>
          )}

          {/* New Project */}
          {userProfile?.role === "admin" && (
            <button onClick={() => setProjectModal("new")}
              style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", border: "none", borderRadius: 9, padding: "7px 13px", fontWeight: 700, fontSize: 12, cursor: "pointer", boxShadow: "0 4px 12px rgba(16,185,129,0.3)" }}>
              + New Project
            </button>
          )}

          {/* User info */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4, padding: "6px 12px", background: "#1E293B", borderRadius: 12, border: "1px solid #334155" }}>
            <img src={user.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid #334155" }} />
            <div>
              <div style={{ color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{user.displayName?.split(" ")[0]}</div>
              {userProfile?.role === "mentor" && <div style={{ color: "#3B82F6", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>MENTOR</div>}
              {userProfile?.role === "member" && <div style={{ color: "#10B981", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>MEMBER</div>}
              {userProfile?.role === "admin" && <div style={{ color: "#6C63FF", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>ADMIN</div>}
            </div>
            <button onClick={() => { if (window.confirm("Are you sure you want to sign out?")) signOut(auth); }}
              style={{ background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", marginLeft: 4, fontWeight: 600, padding: "2px 4px" }}>Sign out</button>
          </div>
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "16px 24px 0" }}>
      {[
  { label: "Overall Progress", value: `${overall}%`, icon: "🎯", color: "#6C63FF", bg: dark ? "rgba(108,99,255,0.1)" : "#EEF2FF", filter: null },
  { label: "Total Modules", value: totalModules, icon: "📦", color: "#F59E0B", bg: dark ? "rgba(245,158,11,0.1)" : "#FFFBEB", filter: null },
  { label: "Completed", value: doneModules, icon: "✅", color: "#10B981", bg: dark ? "rgba(16,185,129,0.1)" : "#ECFDF5", filter: "done" },
  { label: "In Progress", value: inProg, icon: "⚡", color: "#3B82F6", bg: dark ? "rgba(59,130,246,0.1)" : "#EFF6FF", filter: "in-progress" },
].map(s => {
  const isActive = statFilter === s.filter && s.filter !== null;
  return (
  <div key={s.label}
    onClick={() => { if (s.filter) { setStatFilter(isActive ? null : s.filter); setStatusFilter(isActive ? "all" : s.filter); }}}
    style={{
      background: isActive ? s.color : theme.statsCard,
      borderRadius: 14, padding: "16px 18px",
      boxShadow: isActive ? `0 8px 24px ${s.color}40` : dark ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
      border: `1px solid ${isActive ? s.color : theme.cardBorder}`,
      display: "flex", alignItems: "center", gap: 14,
      transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
      cursor: s.filter ? "pointer" : "default",
      transform: isActive ? "scale(1.02)" : "scale(1)",
    }}
    onMouseEnter={e => { if (s.filter && !isActive) e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { if (!isActive) e.currentTarget.style.transform = "scale(1)"; }}>            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 900, color: isActive ? "#fff" : s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: isActive ? "rgba(255,255,255,0.8)" : theme.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        );
      })}
      </div>

      {/* ── Main Layout ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "270px 1fr", gap: 16, padding: "16px 24px 24px", flex: 1 }}>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visibleProjects.map(p => {
            const prog = getProjectProgress(p.modules);
            const days = getDaysLeft(p.deadline);
            const isSel = selectedId === p.id;
            const doneCount = p.modules?.filter(m => m.status === "done").length || 0;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                style={{
                  background: isSel ? `linear-gradient(135deg, ${p.color}, ${p.color}dd)` : theme.sidebarBg,
                  borderRadius: 16, padding: "16px", cursor: "pointer",
                  boxShadow: isSel ? `0 8px 24px ${p.color}40` : dark ? "none" : "0 1px 4px rgba(0,0,0,0.06)",
                  border: `1.5px solid ${isSel ? "transparent" : theme.cardBorder}`,
                  transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)",
                  transform: isSel ? "scale(1.01)" : "scale(1)",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: isSel ? "#fff" : theme.text, lineHeight: 1.3, flex: 1, paddingRight: 8 }}>{p.name}</div>
                  {userProfile?.role === "admin" && (
                    <button onClick={e => { e.stopPropagation(); setProjectModal(p); }}
                      style={{ background: isSel ? "rgba(255,255,255,0.15)" : dark ? "#2A3550" : "#F1F5F9", border: "none", color: isSel ? "#fff" : theme.textMuted, cursor: "pointer", fontSize: 12, padding: "4px 6px", lineHeight: 1, borderRadius: 6, flexShrink: 0 }}>✏️</button>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: isSel ? "rgba(255,255,255,0.7)" : theme.textSub, marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>{p.team}</span>
                      <span style={{ fontWeight: 700 }}>{doneCount}/{p.modules?.length || 0} done</span>
                    </div>
                    <ProgressBar value={prog} color={isSel ? "rgba(255,255,255,0.9)" : p.color} height={5} dark={dark} />
                    <div style={{ marginTop: 6, fontSize: 10, color: isSel ? "rgba(255,255,255,0.6)" : theme.textMuted }}>📅 {fmtDate(p.deadline)}</div>
                  </div>
                  {isSel && <CircularProgress value={prog} color={p.color} size={52} strokeWidth={4} />}
                </div>                {days < 14 && (
                  <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: isSel ? "#FEF3C7" : "#EF4444", background: isSel ? "rgba(239,68,68,0.2)" : dark ? "rgba(239,68,68,0.1)" : "#FEF2F2", padding: "4px 8px", borderRadius: 6, textAlign: "center" }}>
                    ⚠️ {days > 0 ? `${days} days left` : "Overdue!"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Module Table */}
        {selected && (
          <div style={{ background: theme.card, borderRadius: 18, boxShadow: dark ? "none" : "0 1px 4px rgba(0,0,0,0.06)", border: `1px solid ${theme.cardBorder}`, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {/* Project Header */}
            <div style={{ padding: "18px 22px", borderBottom: `1.5px solid ${theme.cardBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: dark ? `linear-gradient(135deg, ${selected.color}10, transparent)` : `linear-gradient(135deg, ${selected.color}08, transparent)` }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: selected.color, boxShadow: `0 0 8px ${selected.color}80` }} />
                  <span style={{ fontWeight: 900, fontSize: 17, color: theme.text }}>{selected.name}</span>
                </div>
                <div style={{ fontSize: 12, color: theme.textSub }}>{selected.team} · Due {fmtDate(selected.deadline)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 30, fontWeight: 900, color: selected.color, lineHeight: 1, textShadow: `0 0 20px ${selected.color}40` }}>{getProjectProgress(selected.modules)}%</div>
                  <div style={{ fontSize: 9, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Complete</div>
                </div>
                {canEdit && (
                  <button onClick={addModule}
                    style={{ background: `linear-gradient(135deg, ${selected.color}, ${selected.color}cc)`, color: "#fff", border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", boxShadow: `0 4px 12px ${selected.color}40` }}>
                    + Module
                  </button>
                )}
                {userProfile?.role === "admin" && (
                  <button onClick={() => deleteProject(selected.id)}
                    style={{ background: dark ? "rgba(239,68,68,0.1)" : "#FEF2F2", color: "#EF4444", border: `1.5px solid ${dark ? "rgba(239,68,68,0.2)" : "#FEE2E2"}`, borderRadius: 10, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🗑</button>
                )}
              </div>
            </div>

            {/* Progress Summary */}
            {/* Search + Filter Bar */}
<div style={{ padding: "12px 22px", borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
  {/* Search Input */}
  <div style={{ flex: 1, position: "relative" }}>
    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: theme.textMuted }}>🔍</span>
    <input
      value={searchQuery}
      onChange={e => setSearchQuery(e.target.value)}
      placeholder="Search modules or members..."
      style={{
        width: "100%", padding: "8px 12px 8px 32px", borderRadius: 10,
        border: `1.5px solid ${searchQuery ? "#6C63FF" : theme.cardBorder}`,
        fontSize: 12, outline: "none", boxSizing: "border-box",
        fontFamily: "inherit", color: theme.text, background: theme.input,
        transition: "border-color 0.2s",
      }}
    />
    {searchQuery && (
      <span onClick={() => setSearchQuery("")}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: theme.textMuted, cursor: "pointer" }}>×</span>
    )}
  </div>

  {/* Status Filter Tabs */}
  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
    {[
      { key: "all", label: "All", color: "#6C63FF" },
      { key: "done", label: "✓ Done", color: "#10B981" },
      { key: "in-progress", label: "◑ Active", color: "#F59E0B" },
      { key: "pending", label: "○ Pending", color: "#94A3B8" },
    ].map(f => (
      <button key={f.key} onClick={() => setStatusFilter(f.key)}
        style={{
          padding: "7px 12px", borderRadius: 8, border: "none", cursor: "pointer",
          fontWeight: 700, fontSize: 11, transition: "all 0.2s",
          background: statusFilter === f.key ? f.color : dark ? "#1E293B" : "#F1F5F9",
          color: statusFilter === f.key ? "#fff" : theme.textSub,
          boxShadow: statusFilter === f.key ? `0 4px 12px ${f.color}40` : "none",
        }}>
        {f.label}
      </button>
    ))}
  </div>
</div>
            <div style={{ padding: "10px 22px", background: theme.tableHeader, borderBottom: `1px solid ${theme.cardBorder}`, display: "flex", alignItems: "center", gap: 16 }}>
              <ProgressBar value={getProjectProgress(selected.modules)} color={selected.color} height={7} dark={dark} />
              <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                {Object.entries(statusConfig).map(([k, v]) => {
                  const cnt = selected.modules.filter(m => m.status === k).length;
                  if (!cnt) return null;
                  return <span key={k} style={{ fontSize: 11, color: v.color, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, display: "inline-block" }} />{cnt} {v.label}</span>;
                })}
              </div>
            </div>

            {/* Table Header */}
            <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 120px 90px 1fr 90px", gap: 8, padding: "9px 22px", background: theme.tableHeader, borderBottom: `1.5px solid ${theme.cardBorder}`, fontSize: 10, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <span>Module & Members</span><span>Progress</span><span>Status</span><span>Deadline</span><span>Remarks</span><span>Action</span>
            </div>

            {/* Module Rows */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {selected.modules.length === 0 && (
                    <div style={{ padding: 56, textAlign: "center", color: theme.textMuted, fontSize: 14 }}>
                      No modules yet. Click <strong style={{ color: selected.color }}>+ Module</strong> to get started.
                    </div>
                  )}
                  {filteredModules.length === 0 && selected.modules.length > 0 && (
                    <div style={{ padding: 48, textAlign: "center", color: theme.textMuted, fontSize: 14 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                      No modules match <strong>"{searchQuery || statusFilter}"</strong>
                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}
                          style={{ background: "#6C63FF", color: "#fff", border: "none", borderRadius: 8, padding: "7px 16px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          Clear filters
                        </button>
                      </div>
                    </div>
                  )}
                  {filteredModules.map(m => {
                const isExp = expandedRemark === m.id;
                const hasRemarks = m.whatsDone || m.whatsGoingOn || m.remarks;
                return (
                  <div key={m.id} style={{ borderBottom: `1px solid ${theme.tableBorder}` }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 100px 120px 90px 1fr 90px", gap: 8, padding: "13px 22px", alignItems: "center", fontSize: 13, transition: "background 0.15s", cursor: "default" }}
                      onMouseEnter={e => e.currentTarget.style.background = theme.hover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                      <div>
                        <div style={{ fontWeight: 700, color: theme.text, fontSize: 13 }}>{m.name}</div>
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {m.assignees.length === 0
                            ? <span style={{ fontSize: 11, color: theme.textMuted }}>No members</span>
                            : m.assignees.map((a, i) => (
                                <span key={a + i} style={{ fontSize: 11, background: dark ? "#1E293B" : "#F1F5F9", color: theme.textSub, borderRadius: 99, padding: "1px 8px", fontWeight: 600 }}>👤 {a}</span>
                              ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <ProgressBar value={m.progress} color={selected.color} height={5} dark={dark} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: theme.textSub, minWidth: 28 }}>{m.progress}%</span>
                      </div>

                      <Badge status={m.status} dark={dark} />

                      <div style={{ fontSize: 11, fontWeight: 600, color: m.deadline && getDaysLeft(m.deadline) < 5 ? "#EF4444" : theme.textSub }}>
                        {m.deadline ? fmtDate(m.deadline) : "—"}
                      </div>

                      <div style={{ fontSize: 11, cursor: hasRemarks ? "pointer" : "default" }} onClick={() => hasRemarks && setExpandedRemark(isExp ? null : m.id)}>
                        {hasRemarks
                          ? <span style={{ color: theme.textSub, lineHeight: 1.5 }}>
                              {(m.whatsDone || m.whatsGoingOn || m.remarks).length > 40
                                ? (m.whatsDone || m.whatsGoingOn || m.remarks).slice(0, 38).trimEnd() + "…"
                                : (m.whatsDone || m.whatsGoingOn || m.remarks)}
                              <span style={{ color: selected.color, fontWeight: 700 }}> {isExp ? "▲" : "▼"}</span>
                            </span>
                          : <span style={{ color: theme.textMuted }}>—</span>}
                      </div>

                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        {canEdit && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button onClick={() => moveModule(m.id, "up")} style={{ background: dark ? "#1E293B" : "#F1F5F9", border: "none", borderRadius: 5, padding: "2px 6px", fontSize: 10, cursor: "pointer", color: theme.textSub, lineHeight: 1 }}>▲</button>
                            <button onClick={() => moveModule(m.id, "down")} style={{ background: dark ? "#1E293B" : "#F1F5F9", border: "none", borderRadius: 5, padding: "2px 6px", fontSize: 10, cursor: "pointer", color: theme.textSub, lineHeight: 1 }}>▼</button>
                          </div>
                        )}
                        {canEdit && (
                          <button onClick={() => setOpenModuleId(m.id)}
                            style={{ background: dark ? "#1E293B" : "#F1F5F9", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: theme.textSub }}>✏️</button>
                        )}
                        {userProfile?.role === "mentor" && (
                          <button onClick={() => setMentorRemarksModule(m)}
                            style={{ background: dark ? "#1E1B4B" : "#EEF2FF", border: "none", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#6C63FF" }}>📝</button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Remarks */}
                    {isExp && hasRemarks && (
                      <div style={{ padding: "0 22px 16px 22px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                        {m.whatsDone && (
                          <div style={{ background: dark ? "rgba(16,185,129,0.08)" : "#F0FDF4", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #10B981" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>✅ What's Done</div>
                            <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.65 }}>{m.whatsDone}</div>
                          </div>
                        )}
                        {m.whatsGoingOn && (
                          <div style={{ background: dark ? "rgba(245,158,11,0.08)" : "#FFFBEB", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #F59E0B" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⚡ Going On Now</div>
                            <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.65 }}>{m.whatsGoingOn}</div>
                          </div>
                        )}
                        {m.remarks && (
                          <div style={{ background: dark ? "rgba(108,99,255,0.08)" : "#F0F4FF", borderRadius: 10, padding: "12px 14px", borderLeft: "3px solid #6C63FF" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#6C63FF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📝 Faculty Remarks</div>
                            <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.65 }}>{m.remarks}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Panels & Modals ─────────────────────────────────────────────────── */}
      {openModule && <ModulePanel module={openModule} project={selected} onClose={() => setOpenModuleId(null)} onSave={saveModule} onDelete={deleteModule} projectUsers={users} dark={dark} />}
      {projectModal && <ProjectModal initial={projectModal === "new" ? null : projectModal} onSave={handleProjectSave} onClose={() => setProjectModal(null)} dark={dark} />}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} projects={projects} db={db} dark={dark} />}
      {mentorRemarksModule && selected && <MentorRemarksPanel module={mentorRemarksModule} project={selected} onClose={() => setMentorRemarksModule(null)} onSave={saveMentorRemarks} dark={dark} />}
      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} projects={projects} />}
      {showLog && <ActivityLog onClose={() => setShowLog(false)} dark={dark} />}
    </div>
  );
}
