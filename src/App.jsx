import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

const COLORS = ["#6C63FF","#F59E0B","#10B981","#EF4444","#3B82F6","#EC4899","#8B5CF6","#14B8A6"];

const statusConfig = {
  done:          { label: "Completed",   color: "#10B981", bg: "#D1FAE5", icon: "✓" },
  "in-progress": { label: "In Progress", color: "#F59E0B", bg: "#FEF3C7", icon: "◑" },
  pending:       { label: "Pending",     color: "#94A3B8", bg: "#F1F5F9", icon: "○" },
  blocked:       { label: "Blocked",     color: "#EF4444", bg: "#FEE2E2", icon: "✕" },
};

function getProjectProgress(modules) {
  if (!modules.length) return 0;
  return Math.round(modules.reduce((a, m) => a + m.progress, 0) / modules.length);
}
function getDaysLeft(deadline) {
  return Math.ceil((new Date(deadline) - new Date()) / 86400000);
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function ProgressBar({ value, color, height = 8 }) {
  return (
    <div style={{ background: "#E2E8F0", borderRadius: 99, height, overflow: "hidden", flex: 1, minWidth: 40 }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s ease" }} />
    </div>
  );
}

function Badge({ status }) {
  const c = statusConfig[status] || statusConfig.pending;
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 99, padding: "3px 9px", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
      {c.icon} {c.label}
    </span>
  );
}

function Tag({ label, onRemove }) {
  return (
    <span style={{ background: "#EEF2FF", color: "#4F46E5", borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
      {label}
      {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.5, fontSize: 14, lineHeight: 1, fontWeight: 900 }}>×</span>}
    </span>
  );
}

const inputStyle = {
  padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0",
  fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
  fontFamily: "inherit", color: "#1E293B", background: "#FAFAFA",
};

function Field({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      {children}
    </div>
  );
}

// ─── Module Side Panel ────────────────────────────────────────────────────────
function ModulePanel({ module, project, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ ...module, assignees: [...module.assignees] });
  const [newMember, setNewMember] = useState("");

  function addMember() {
    const n = newMember.trim();
    if (!n || form.assignees.includes(n)) return;
    setForm(f => ({ ...f, assignees: [...f.assignees, n] }));
    setNewMember("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)" }} onClick={onClose} />
      <div style={{ width: 500, background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 24px 14px", borderBottom: "1.5px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: project.color, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{project.name}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#0F172A" }}>Edit Module</div>
          </div>
          <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, fontSize: 18, cursor: "pointer", color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
          <Field label="Module Name">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              style={inputStyle} placeholder="e.g. Frontend Development" />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Status">
              <select value={form.status} onChange={e => {
                const s = e.target.value;
                setForm(f => ({ ...f, status: s, progress: s === "done" ? 100 : s === "pending" ? 0 : f.progress }));
              }} style={{ ...inputStyle }}>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </Field>
            <Field label="Module Deadline">
              <input type="date" value={form.deadline || ""} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} />
            </Field>
          </div>

          <Field label={`Completion Progress — ${form.progress}%`}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
              <input type="range" min={0} max={100} value={form.progress}
                onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: project.color, height: 4 }} />
              <span style={{ fontSize: 18, fontWeight: 900, color: project.color, minWidth: 42, textAlign: "right" }}>{form.progress}%</span>
            </div>
            <ProgressBar value={form.progress} color={project.color} height={10} />
          </Field>

          <Field label="Assigned Members">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 28, padding: "6px 0" }}>
              {form.assignees.length === 0
                ? <span style={{ color: "#CBD5E1", fontSize: 12, padding: "3px 0" }}>No members assigned yet</span>
                : form.assignees.map(a => (
                    <Tag key={a} label={a} onRemove={() => setForm(f => ({ ...f, assignees: f.assignees.filter(x => x !== a) }))} />
                  ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newMember} onChange={e => setNewMember(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addMember()}
                placeholder="Type member name, press Enter or +"
                style={{ ...inputStyle, flex: 1 }} />
              <button onClick={addMember}
                style={{ background: project.color, color: "#fff", border: "none", borderRadius: 8, width: 40, height: 40, fontWeight: 900, fontSize: 20, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          </Field>

          <div style={{ borderTop: "2px dashed #E2E8F0", margin: "4px 0" }} />

          <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: -6 }}>
            📋 Progress Remarks
          </div>

          <Field label="✅ What's Done">
            <textarea value={form.whatsDone} onChange={e => setForm(f => ({ ...f, whatsDone: e.target.value }))}
              rows={3} placeholder="List completed tasks, features, or deliverables in this module..."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>

          <Field label="⚡ What's Currently Going On">
            <textarea value={form.whatsGoingOn} onChange={e => setForm(f => ({ ...f, whatsGoingOn: e.target.value }))}
              rows={3} placeholder="What is the team currently working on right now?"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>

          <Field label="📝 Faculty Remarks / Notes">
            <textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              rows={3} placeholder="Add your notes, concerns, guidance, or feedback here..."
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.65 }} />
          </Field>
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1.5px solid #F1F5F9", display: "flex", gap: 10, background: "#fff", position: "sticky", bottom: 0 }}>
          <button onClick={() => onDelete(form.id)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#fff", color: "#EF4444", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
            🗑 Delete
          </button>
          <button onClick={onClose}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, color: "#64748B" }}>
            Cancel
          </button>
          <button onClick={() => onSave(form)}
            style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: project.color, color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Project Modal ─────────────────────────────────────────────────────────────
function ProjectModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: "", team: "", deadline: "", color: "#6C63FF" });
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(4px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 28, width: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "#1E293B", marginBottom: 20 }}>
          {initial ? "✏️ Edit Project" : "➕ New Project"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Project Name">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. E-Commerce Portal" style={inputStyle} />
          </Field>
          <Field label="Team Name">
            <input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
              placeholder="e.g. Team Epsilon" style={inputStyle} />
          </Field>
          <Field label="Deadline">
            <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={inputStyle} />
          </Field>
          <Field label="Project Color">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
              {COLORS.map(c => (
                <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer",
                    border: form.color === c ? "3px solid #0F172A" : "3px solid transparent",
                    boxShadow: form.color === c ? `0 0 0 2px #fff inset` : "none", transition: "all 0.15s" }} />
              ))}
            </div>
          </Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, color: "#64748B" }}>Cancel</button>
          <button onClick={() => form.name && form.deadline && onSave(form)}
            style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#0F172A", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13 }}>
            {initial ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [openModuleId, setOpenModuleId] = useState(null);
  const [projectModal, setProjectModal] = useState(null);
  const [expandedRemark, setExpandedRemark] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "projects"), (snapshot) => {
      const loaded = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      setProjects(loaded);
      setLoading(false);
      if (loaded.length > 0 && !selectedId) {
        setSelectedId(loaded[0].id);
      }
    });
    return () => unsub();
  }, []);

  const selected = projects.find(p => p.id === selectedId);
  const openModule = selected?.modules.find(m => m.id === openModuleId) || null;

  const totalModules = projects.reduce((a, p) => a + p.modules.length, 0);
  const doneModules  = projects.reduce((a, p) => a + p.modules.filter(m => m.status === "done").length, 0);
  const inProg       = projects.reduce((a, p) => a + p.modules.filter(m => m.status === "in-progress").length, 0);
  const overall      = Math.round(projects.reduce((a, p) => a + getProjectProgress(p.modules), 0) / Math.max(projects.length, 1));

  async function saveProjectToFirebase(project) {
    const { id, ...data } = project;
    await setDoc(doc(db, "projects", String(id)), data);
  }

  async function saveModule(updated) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const newModules = updatedProject.modules.map(m =>
      m.id === updated.id ? updated : m
    );
    const newProject = { ...updatedProject, modules: newModules };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    setOpenModuleId(null);
  }

  async function deleteModule(mid) {
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const newProject = {
      ...updatedProject,
      modules: updatedProject.modules.filter(m => m.id !== mid)
    };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    setOpenModuleId(null);
  }

  async function addModule() {
    const newMod = {
      id: Date.now(), name: "New Module", assignees: [], deadline: "",
      progress: 0, status: "pending", remarks: "", whatsDone: "", whatsGoingOn: "",
    };
    const updatedProject = projects.find(p => p.id === selectedId);
    if (!updatedProject) return;
    const newProject = { ...updatedProject, modules: [...updatedProject.modules, newMod] };
    setProjects(ps => ps.map(p => p.id === selectedId ? newProject : p));
    await saveProjectToFirebase(newProject);
    setOpenModuleId(newMod.id);
  }

  async function handleProjectSave(form) {
    if (!form.name.trim()) { alert("Project name cannot be empty."); return; }
    if (!form.deadline)    { alert("Please set a project deadline."); return; }
    if (projectModal === "new") {
      const id = String(Date.now());
      const newProject = { ...form, id, modules: [] };
      setProjects(ps => [...ps, newProject]);
      setSelectedId(id);
      await saveProjectToFirebase(newProject);
    } else {
      const updated = { ...projectModal, ...form };
      setProjects(ps => ps.map(p => p.id === projectModal.id ? updated : p));
      await saveProjectToFirebase(updated);
    }
    setProjectModal(null);
  }

  async function deleteProject(id) {
    if (!window.confirm("Delete this project and all its modules?")) return;
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    setSelectedId(remaining[0]?.id || null);
    await deleteDoc(doc(db, "projects", String(id)));
  }

  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: "'Segoe UI', sans-serif",
        background: "#F0F4F8", flexDirection: "column", gap: 12
      }}>
        <div style={{ fontSize: 36 }}>📊</div>
        <div style={{ fontWeight: 700, color: "#6C63FF", fontSize: 16 }}>
          Loading projects...
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", background: "#F0F4F8", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top Bar */}
      <div style={{ background: "#0F172A", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "#6C63FF", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>Student Project Tracker</div>
            <div style={{ color: "#64748B", fontSize: 11 }}>Academic Year 2025–26 · {projects.length} Projects</div>
          </div>
        </div>
        <button onClick={() => setProjectModal("new")}
          style={{ background: "#6C63FF", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          + New Project
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, padding: "18px 24px 0" }}>
        {[
          { label: "Overall Progress", value: `${overall}%`, icon: "🎯", color: "#6C63FF" },
          { label: "Total Modules", value: totalModules, icon: "📦", color: "#F59E0B" },
          { label: "Completed", value: doneModules, icon: "✅", color: "#10B981" },
          { label: "In Progress", value: inProg, icon: "⚡", color: "#3B82F6" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px #00000010" }}>
            <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Main */}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, padding: "16px 24px 24px", flex: 1 }}>

        {/* Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projects.map(p => {
            const prog = getProjectProgress(p.modules);
            const days = getDaysLeft(p.deadline);
            const isSel = selectedId === p.id;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)}
                style={{ background: isSel ? p.color : "#fff", borderRadius: 14, padding: "15px 16px", cursor: "pointer",
                  boxShadow: isSel ? `0 6px 20px ${p.color}50` : "0 1px 3px #00000010",
                  border: `2px solid ${isSel ? p.color : "#E2E8F0"}`, transition: "all 0.2s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: isSel ? "#fff" : "#1E293B", lineHeight: 1.3, flex: 1 }}>{p.name}</div>
                  <button onClick={e => { e.stopPropagation(); setProjectModal(p); }}
                    style={{ background: "none", border: "none", color: isSel ? "rgba(255,255,255,0.6)" : "#CBD5E1", cursor: "pointer", fontSize: 13, padding: "0 0 0 4px", lineHeight: 1 }}>✏️</button>
                </div>
                <div style={{ fontSize: 11, color: isSel ? "rgba(255,255,255,0.65)" : "#94A3B8", marginBottom: 10 }}>
                  {p.team} · {p.modules.filter(m => m.status === "done").length}/{p.modules.length} done
                </div>
                <ProgressBar value={prog} color={isSel ? "rgba(255,255,255,0.85)" : p.color} height={5} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: isSel ? "rgba(255,255,255,0.6)" : "#94A3B8" }}>📅 {fmtDate(p.deadline)}</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: isSel ? "#fff" : p.color }}>{prog}%</span>
                </div>
                {days < 14 && (
                  <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: isSel ? "#FEF3C7" : "#EF4444" }}>
                    ⚠️ {days > 0 ? `${days} days left` : "Overdue!"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Module Table */}
        {selected && (
          <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px #00000010", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1.5px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: selected.color }} />
                  <span style={{ fontWeight: 900, fontSize: 16, color: "#0F172A" }}>{selected.name}</span>
                </div>
                <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>
                  {selected.team} · Due {fmtDate(selected.deadline)}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: selected.color, lineHeight: 1 }}>{getProjectProgress(selected.modules)}%</div>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>COMPLETE</div>
                </div>
                <button onClick={addModule}
                  style={{ background: selected.color, color: "#fff", border: "none", borderRadius: 9, padding: "9px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                  + Module
                </button>
                <button onClick={() => deleteProject(selected.id)}
                  style={{ background: "#FEF2F2", color: "#EF4444", border: "1.5px solid #FEE2E2", borderRadius: 9, padding: "8px 12px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                  🗑
                </button>
              </div>
            </div>

            <div style={{ padding: "10px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 14 }}>
              <ProgressBar value={getProjectProgress(selected.modules)} color={selected.color} height={7} />
              <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                {Object.entries(statusConfig).map(([k, v]) => {
                  const cnt = selected.modules.filter(m => m.status === k).length;
                  if (!cnt) return null;
                  return (
                    <span key={k} style={{ fontSize: 11, color: v.color, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color, display: "inline-block" }} />{cnt} {v.label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 110px 130px 90px 1fr 76px", gap: 8, padding: "9px 20px", background: "#F8FAFC", borderBottom: "1.5px solid #E2E8F0", fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              <span>Module & Members</span><span>Progress</span><span>Status</span><span>Deadline</span><span>Remarks</span><span>Action</span>
            </div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {selected.modules.length === 0 && (
                <div style={{ padding: 48, textAlign: "center", color: "#CBD5E1", fontSize: 14 }}>
                  No modules yet. Click <strong style={{ color: selected.color }}>+ Module</strong> to get started.
                </div>
              )}

              {selected.modules.map(m => {
                const isExp = expandedRemark === m.id;
                const hasRemarks = m.whatsDone || m.whatsGoingOn || m.remarks;
                return (
                  <div key={m.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <div
                      style={{ display: "grid", gridTemplateColumns: "2fr 110px 130px 90px 1fr 76px", gap: 8, padding: "12px 20px", alignItems: "center", fontSize: 13, transition: "background 0.15s", cursor: "default" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#FAFBFF"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: "#1E293B", fontSize: 13 }}>{m.name}</div>
                        <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {m.assignees.length === 0
                            ? <span style={{ fontSize: 11, color: "#CBD5E1" }}>No members</span>
                            : m.assignees.map((a, i) => (
                                <span key={a + i} style={{ fontSize: 11, background: "#F1F5F9", color: "#64748B", borderRadius: 99, padding: "1px 7px", fontWeight: 600 }}>👤 {a}</span>
                              ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <ProgressBar value={m.progress} color={selected.color} height={5} />
                        <span style={{ fontSize: 11, fontWeight: 800, color: "#475569", minWidth: 28 }}>{m.progress}%</span>
                      </div>

                      <Badge status={m.status} />

                      <div style={{ fontSize: 11, fontWeight: 600, color: m.deadline && getDaysLeft(m.deadline) < 5 ? "#EF4444" : "#64748B" }}>
                        {m.deadline ? fmtDate(m.deadline) : "—"}
                      </div>

                      <div style={{ fontSize: 11, cursor: hasRemarks ? "pointer" : "default" }} onClick={() => hasRemarks && setExpandedRemark(isExp ? null : m.id)}>
                        {hasRemarks
                          ? <span style={{ color: "#64748B", lineHeight: 1.5 }}>
                          {(m.whatsDone || m.whatsGoingOn || m.remarks).length > 40
                              ? (m.whatsDone || m.whatsGoingOn || m.remarks).slice(0, 38).trimEnd() + "…"
                              : (m.whatsDone || m.whatsGoingOn || m.remarks)}
                              <span style={{ color: selected.color, fontWeight: 700 }}> {isExp ? "▲" : "▼"}</span>
                            </span>
                          : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </div>

                      <button onClick={() => setOpenModuleId(m.id)}
                        style={{ background: "#F1F5F9", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", color: "#475569" }}>
                        ✏️ Edit
                      </button>
                    </div>

                    {isExp && hasRemarks && (
                      <div style={{ padding: "0 20px 14px 20px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                        {m.whatsDone && (
                          <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #10B981" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>✅ What's Done</div>
                            <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.65 }}>{m.whatsDone}</div>
                          </div>
                        )}
                        {m.whatsGoingOn && (
                          <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #F59E0B" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>⚡ Going On Now</div>
                            <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.65 }}>{m.whatsGoingOn}</div>
                          </div>
                        )}
                        {m.remarks && (
                          <div style={{ background: "#F0F4FF", borderRadius: 10, padding: "11px 14px", borderLeft: "3px solid #6C63FF" }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: "#6C63FF", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>📝 Faculty Remarks</div>
                            <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.65 }}>{m.remarks}</div>
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

      {openModule && (
        <ModulePanel module={openModule} project={selected}
          onClose={() => setOpenModuleId(null)} onSave={saveModule} onDelete={deleteModule} />
      )}

      {projectModal && (
        <ProjectModal
          initial={projectModal === "new" ? null : projectModal}
          onSave={handleProjectSave} onClose={() => setProjectModal(null)} />
      )}
    </div>
  );
}
