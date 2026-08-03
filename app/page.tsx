"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays, addWeeks, differenceInCalendarDays, endOfWeek,
  format, isWithinInterval, parseISO, startOfWeek
} from "date-fns";

type Role = "supervisor" | "viewer";
type Priority = "emergency" | "today" | "scheduled" | "waiting";
type Status = "open" | "working" | "complete" | "waiting";
type User = { id: number; email: string; role: Role };
type Crew = { id: number; name: string; sort_order: number };
type Equipment = { id: number; name: string; sort_order: number };
type Assignment = { crew_id: number };
type EquipmentAssignment = { equipment_id: number };

type Job = {
  id: number;
  job_name: string;
  customer: string | null;
  customer_phone: string | null;
  location: string | null;
  job_type: string | null;
  permit_number: string | null;
  inspector: string | null;
  notes: string | null;
  priority: Priority;
  status: Status;
  start_date: string | null;
  end_date: string | null;
  color: string;
  assignments?: Assignment[];
  job_equipment?: EquipmentAssignment[];
};

type Draft = {
  id?: number;
  job_name: string;
  customer: string;
  customer_phone: string;
  location: string;
  job_type: string;
  permit_number: string;
  inspector: string;
  notes: string;
  priority: Priority;
  status: Status;
  start_date: string;
  end_date: string;
  color: string;
  crewIds: number[];
  equipmentIds: number[];
};

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#4f46e5", "#64748b"];

function blankDraft(date = ""): Draft {
  return {
    job_name: "", customer: "", customer_phone: "", location: "", job_type: "",
    permit_number: "", inspector: "", notes: "", priority: "scheduled", status: "open",
    start_date: date, end_date: date, color: COLORS[0], crewIds: [], equipmentIds: []
  };
}

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export default function Home() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [crew, setCrew] = useState<Crew[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [incoming, setIncoming] = useState<Job[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const canEdit = user?.role === "supervisor";
  const todayKey = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    api("/api/auth/me").then(({ user }) => setUser(user)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    if (draft) return;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [user, weekStart, draft]);

  async function load() {
    try {
      const from = format(weekStart, "yyyy-MM-dd");
      const to = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const data = await api(`/api/schedule?from=${from}&to=${to}`);
      setCrew(data.crew);
      setEquipment(data.equipment);
      setJobs(data.jobs);
      setIncoming(data.incoming);
      setLastUpdated(new Date());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load schedule.");
    }
  }

  function jobsForDay(day: Date) {
    return jobs.filter(job =>
      job.start_date && job.end_date &&
      isWithinInterval(day, { start: parseISO(job.start_date), end: parseISO(job.end_date) })
    );
  }

  function jobToDraft(job: Job): Draft {
    return {
      id: job.id,
      job_name: job.job_name,
      customer: job.customer || "",
      customer_phone: job.customer_phone || "",
      location: job.location || "",
      job_type: job.job_type || "",
      permit_number: job.permit_number || "",
      inspector: job.inspector || "",
      notes: job.notes || "",
      priority: job.priority || "scheduled",
      status: job.status || "open",
      start_date: job.start_date || "",
      end_date: job.end_date || "",
      color: job.color || COLORS[0],
      crewIds: job.assignments?.map(a => a.crew_id) || [],
      equipmentIds: job.job_equipment?.map(a => a.equipment_id) || []
    };
  }

  async function saveJob() {
    if (!draft?.job_name.trim()) return setMessage("Enter a job name.");
    if ((draft.start_date && !draft.end_date) || (!draft.start_date && draft.end_date)) {
      return setMessage("Use both dates or leave both blank for Incoming.");
    }
    if (draft.start_date && draft.end_date < draft.start_date) {
      return setMessage("End date cannot be before start date.");
    }

    try {
      await api("/api/schedule", {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify({
          ...draft,
          job_name: draft.job_name.trim(),
          customer: draft.customer.trim() || null,
          customer_phone: draft.customer_phone.trim() || null,
          location: draft.location.trim() || null,
          job_type: draft.job_type.trim() || null,
          permit_number: draft.permit_number.trim() || null,
          inspector: draft.inspector.trim() || null,
          notes: draft.notes.trim() || null,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null
        })
      });
      setDraft(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save job.");
    }
  }

  async function deleteJob(id: number) {
    if (!confirm("Delete this job?")) return;
    try {
      await api(`/api/schedule?id=${id}`, { method: "DELETE" });
      setDraft(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete job.");
    }
  }

  function duplicateJob() {
    if (!draft?.id) return;
    setDraft({ ...draft, id: undefined, job_name: `${draft.job_name} Copy` });
  }

  async function moveJob(job: Job, newDate: string) {
    if (!canEdit) return;
    const duration = job.start_date && job.end_date
      ? differenceInCalendarDays(parseISO(job.end_date), parseISO(job.start_date))
      : 0;
    const newEnd = format(addDays(parseISO(newDate), duration), "yyyy-MM-dd");

    try {
      await api("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          ...jobToDraft(job),
          id: job.id,
          start_date: newDate,
          end_date: newEnd
        })
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not schedule job.");
    }
  }

  async function returnToIncoming(job: Job) {
    try {
      await api("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({ ...jobToDraft(job), id: job.id, start_date: null, end_date: null })
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not move job.");
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  const todayJobs = jobsForDay(new Date());
  const workingCrewIds = new Set(todayJobs.flatMap(job => job.assignments?.map(a => a.crew_id) || []));
  const dashboard = {
    today: todayJobs.length,
    emergency: [...jobs, ...incoming].filter(job => job.priority === "emergency" && job.status !== "complete").length,
    working: workingCrewIds.size,
    available: Math.max(crew.length - workingCrewIds.size, 0),
    incoming: incoming.length
  };

  if (user === undefined) return <main className="center">Loading…</main>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <main>
      <header className="topbar">
        <div><h1>D’Angelo Schedule</h1><p>Dispatch and crew board</p></div>
        <div className="actions">
          <span className="liveBadge"><span className="liveDot" />Live{lastUpdated ? ` · ${format(lastUpdated, "h:mm:ss a")}` : ""}</span>
          <span className={`badge ${user.role}`}>{user.role}</span>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="dashboard">
        <Metric label="Jobs Today" value={dashboard.today} />
        <Metric label="Emergency" value={dashboard.emergency} />
        <Metric label="Crew Working" value={dashboard.working} />
        <Metric label="Crew Available" value={dashboard.available} />
        <Metric label="Incoming" value={dashboard.incoming} />
      </section>

      <section className="toolbar">
        <div className="actions">
          <button className="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>‹</button>
          <button className="secondary" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
          <button className="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>›</button>
          <strong>{format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}</strong>
        </div>
        {canEdit && <button className="primary" onClick={() => setDraft(blankDraft())}>+ New incoming job</button>}
      </section>

      {message && <div className="message">{message}</div>}

      <section className="dispatchLayout">
        <aside
          className="incomingColumn"
          onDragOver={e => canEdit && e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const job = jobs.find(j => j.id === Number(e.dataTransfer.getData("job-id")));
            if (job) returnToIncoming(job);
          }}
        >
          <div className="incomingHead">
            <div><strong>Incoming Jobs</strong><span>Drag onto a day</span></div>
            {canEdit && <button className="miniAdd" onClick={() => setDraft(blankDraft())}>+</button>}
          </div>
          <div className="incomingBody">
            {incoming.length === 0 && <p className="empty">No incoming jobs.</p>}
            {incoming.map(job => (
              <JobCard
                key={job.id}
                job={job}
                crew={crew}
                equipment={equipment}
                canEdit={canEdit}
                onEdit={() => setDraft(jobToDraft(job))}
              />
            ))}
          </div>
        </aside>

        <section className="board">
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            return (
              <div
                className={`day ${key === todayKey ? "today" : ""}`}
                key={key}
                onDragOver={e => canEdit && e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const allJobs = [...jobs, ...incoming];
                  const job = allJobs.find(j => j.id === Number(e.dataTransfer.getData("job-id")));
                  if (job) moveJob(job, key);
                }}
              >
                <div className="dayHead"><strong>{format(day, "EEE")}</strong><span>{format(day, "MMM d")}</span></div>
                <div className="dayBody">
                  {jobsForDay(day).map(job => (
                    <JobCard
                      key={`${key}-${job.id}`}
                      job={job}
                      crew={crew}
                      equipment={equipment}
                      canEdit={canEdit}
                      onEdit={() => setDraft(jobToDraft(job))}
                    />
                  ))}
                  {canEdit && <button className="addDay" onClick={() => setDraft(blankDraft(key))}>+ Add job</button>}
                </div>
              </div>
            );
          })}
        </section>
      </section>

      {draft && (
        <JobModal
          draft={draft}
          setDraft={setDraft}
          crew={crew}
          equipment={equipment}
          onSave={saveJob}
          onDelete={deleteJob}
          onDuplicate={duplicateJob}
          onClose={() => setDraft(null)}
        />
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function JobCard({
  job, crew, equipment, canEdit, onEdit
}: {
  job: Job;
  crew: Crew[];
  equipment: Equipment[];
  canEdit: boolean;
  onEdit: () => void;
}) {
  const crewNames = job.assignments?.map(a => crew.find(c => c.id === a.crew_id)?.name).filter(Boolean) || [];
  const equipmentNames = job.job_equipment?.map(a => equipment.find(e => e.id === a.equipment_id)?.name).filter(Boolean) || [];

  return (
    <article
      className={`job ${canEdit ? "editable" : ""} priority-${job.priority} status-${job.status}`}
      style={{ borderLeftColor: job.color }}
      draggable={canEdit}
      onDragStart={e => e.dataTransfer.setData("job-id", String(job.id))}
      onClick={() => canEdit && onEdit()}
    >
      <div className="jobTop">
        <span className={`priorityTag ${job.priority}`}>{job.priority}</span>
        <span className={`statusTag ${job.status}`}>{job.status}</span>
      </div>
      <h3>{job.job_name}</h3>
      {job.customer && <p className="customer">{job.customer}</p>}
      {job.job_type && <p><b>Work:</b> {job.job_type}</p>}
      {job.location && (
        <a
          className="mapLink"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
        >
          {job.location}
        </a>
      )}
      {!!crewNames.length && <p><b>Crew:</b> {crewNames.join(", ")}</p>}
      {!!equipmentNames.length && <p><b>Equipment:</b> {equipmentNames.join(", ")}</p>}
      {job.permit_number && <p><b>Permit:</b> {job.permit_number}</p>}
      {job.inspector && <p><b>Inspector:</b> {job.inspector}</p>}
      {job.notes && <p className="notes">{job.notes}</p>}
    </article>
  );
}

function JobModal({
  draft, setDraft, crew, equipment, onSave, onDelete, onDuplicate, onClose
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  crew: Crew[];
  equipment: Equipment[];
  onSave: () => void;
  onDelete: (id: number) => void;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="modal large" onMouseDown={e => e.stopPropagation()}>
        <div className="modalTitle">
          <div>
            <h2>{draft.id ? "Edit job" : draft.start_date ? "Add scheduled job" : "Add incoming job"}</h2>
            <p>Leave both dates blank to keep the job Incoming.</p>
          </div>
          <button className="icon" onClick={onClose}>×</button>
        </div>

        <div className="two">
          <label>Job name<input value={draft.job_name} onChange={e => setDraft({ ...draft, job_name: e.target.value })} autoFocus /></label>
          <label>Job type<input placeholder="Sewer repair, hydrant, water tap…" value={draft.job_type} onChange={e => setDraft({ ...draft, job_type: e.target.value })} /></label>
        </div>

        <div className="two">
          <label>Customer<input value={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.value })} /></label>
          <label>Customer phone<input value={draft.customer_phone} onChange={e => setDraft({ ...draft, customer_phone: e.target.value })} /></label>
        </div>

        <label>Location<input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>

        <div className="four">
          <label>Priority
            <select value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as Priority })}>
              <option value="emergency">Emergency</option>
              <option value="today">Today</option>
              <option value="scheduled">Scheduled</option>
              <option value="waiting">Waiting</option>
            </select>
          </label>
          <label>Status
            <select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value as Status })}>
              <option value="open">Open</option>
              <option value="working">Working</option>
              <option value="complete">Complete</option>
              <option value="waiting">Waiting</option>
            </select>
          </label>
          <label>Start date<input type="date" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></label>
          <label>End date<input type="date" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>
        </div>

        <div className="two">
          <label>Permit number<input value={draft.permit_number} onChange={e => setDraft({ ...draft, permit_number: e.target.value })} /></label>
          <label>Inspector<input value={draft.inspector} onChange={e => setDraft({ ...draft, inspector: e.target.value })} /></label>
        </div>

        <label>Notes<textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>

        <div className="two">
          <fieldset>
            <legend>Crew</legend>
            <div className="crewGrid">
              {crew.map(member => (
                <label className="check" key={member.id}>
                  <input
                    type="checkbox"
                    checked={draft.crewIds.includes(member.id)}
                    onChange={() => setDraft({
                      ...draft,
                      crewIds: draft.crewIds.includes(member.id)
                        ? draft.crewIds.filter(id => id !== member.id)
                        : [...draft.crewIds, member.id]
                    })}
                  />
                  {member.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Equipment</legend>
            <div className="crewGrid">
              {equipment.map(item => (
                <label className="check" key={item.id}>
                  <input
                    type="checkbox"
                    checked={draft.equipmentIds.includes(item.id)}
                    onChange={() => setDraft({
                      ...draft,
                      equipmentIds: draft.equipmentIds.includes(item.id)
                        ? draft.equipmentIds.filter(id => id !== item.id)
                        : [...draft.equipmentIds, item.id]
                    })}
                  />
                  {item.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset>
          <legend>Job color</legend>
          <div className="colors">
            {COLORS.map(color => (
              <button
                type="button"
                aria-label={color}
                key={color}
                className={draft.color === color ? "color selected" : "color"}
                style={{ background: color }}
                onClick={() => setDraft({ ...draft, color })}
              />
            ))}
          </div>
        </fieldset>

        <div className="modalActions">
          {draft.id && <button className="danger" onClick={() => onDelete(draft.id!)}>Delete</button>}
          {draft.id && <button className="secondary" onClick={onDuplicate}>Duplicate</button>}
          <span />
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={onSave}>Save job</button>
        </div>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("brandon@dangelo-brothers.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      onLogin(data.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed.");
    }
  }

  return (
    <main className="loginPage">
      <form className="loginCard" onSubmit={submit}>
        <div className="logo">D</div>
        <h1>D’Angelo Schedule</h1>
        <p>Sign in to view the dispatch board.</p>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {message && <div className="message">{message}</div>}
        <button className="primary wide">Sign in</button>
      </form>
    </main>
  );
}
