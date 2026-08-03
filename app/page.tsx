"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays, addWeeks, differenceInCalendarDays, endOfWeek,
  format, isWithinInterval, parseISO, startOfWeek
} from "date-fns";

type Role = "supervisor" | "viewer";
type User = { id: number; email: string; role: Role };
type Crew = { id: number; name: string; sort_order: number };
type Assignment = { crew_id: number };
type Job = {
  id: number;
  job_name: string;
  customer: string | null;
  location: string | null;
  notes: string | null;
  start_date: string;
  end_date: string;
  color: string;
  assignments?: Assignment[];
};
type Draft = {
  id?: number;
  job_name: string;
  customer: string;
  location: string;
  notes: string;
  start_date: string;
  end_date: string;
  color: string;
  crewIds: number[];
};

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#4f46e5", "#64748b"];

function blankDraft(date: string): Draft {
  return {
    job_name: "", customer: "", location: "", notes: "",
    start_date: date, end_date: date, color: COLORS[0], crewIds: []
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const canEdit = user?.role === "supervisor";

  useEffect(() => {
    api("/api/auth/me")
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null));
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
      setJobs(data.jobs);
      setLastUpdated(new Date());
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load schedule.");
    }
  }

  function jobsForDay(day: Date) {
    return jobs.filter(job => isWithinInterval(day, {
      start: parseISO(job.start_date),
      end: parseISO(job.end_date)
    }));
  }

  function editJob(job: Job) {
    setDraft({
      id: job.id,
      job_name: job.job_name,
      customer: job.customer || "",
      location: job.location || "",
      notes: job.notes || "",
      start_date: job.start_date,
      end_date: job.end_date,
      color: job.color || COLORS[0],
      crewIds: job.assignments?.map(a => a.crew_id) || []
    });
  }

  async function saveJob() {
    if (!draft?.job_name.trim()) return setMessage("Enter a job name.");
    if (draft.end_date < draft.start_date) return setMessage("End date cannot be before start date.");

    try {
      await api("/api/schedule", {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify({
          ...draft,
          job_name: draft.job_name.trim(),
          customer: draft.customer.trim() || null,
          location: draft.location.trim() || null,
          notes: draft.notes.trim() || null
        })
      });
      setDraft(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save job.");
    }
  }

  function duplicateJob() {
    if (!draft?.id) return;

    setDraft({
      job_name: `${draft.job_name} Copy`,
      customer: draft.customer,
      location: draft.location,
      notes: draft.notes,
      start_date: draft.start_date,
      end_date: draft.end_date,
      color: draft.color,
      crewIds: [...draft.crewIds]
    });
    setMessage("");
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

  async function moveJob(job: Job, newDate: string) {
    if (!canEdit) return;
    const duration = differenceInCalendarDays(parseISO(job.end_date), parseISO(job.start_date));
    const newEnd = format(addDays(parseISO(newDate), duration), "yyyy-MM-dd");

    try {
      await api("/api/schedule", {
        method: "PUT",
        body: JSON.stringify({
          ...job,
          start_date: newDate,
          end_date: newEnd,
          crewIds: job.assignments?.map(a => a.crew_id) || []
        })
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

  if (user === undefined) return <main className="center">Loading…</main>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <main>
      <header className="topbar">
        <div><h1>D’Angelo Schedule</h1><p>Dispatch and crew board</p></div>
        <div className="actions">
          <span className="liveBadge">
            <span className="liveDot" />
            Live{lastUpdated ? ` · ${format(lastUpdated, "h:mm:ss a")}` : ""}
          </span>
          <span className={`badge ${user.role}`}>{user.role}</span>
          <button className="secondary" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="actions">
          <button className="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>‹</button>
          <button className="secondary" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Today</button>
          <button className="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>›</button>
          <strong>{format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}</strong>
        </div>
        {canEdit && <button className="primary" onClick={() => setDraft(blankDraft(format(new Date(), "yyyy-MM-dd")))}>+ Add job</button>}
      </section>

      {message && <div className="message">{message}</div>}

      <section className="board">
        {days.map(day => {
          const key = format(day, "yyyy-MM-dd");
          return (
            <div
              className="day"
              key={key}
              onDragOver={e => canEdit && e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const job = jobs.find(j => j.id === Number(e.dataTransfer.getData("job-id")));
                if (job) moveJob(job, key);
              }}
            >
              <div className="dayHead"><strong>{format(day, "EEE")}</strong><span>{format(day, "MMM d")}</span></div>
              <div className="dayBody">
                {jobsForDay(day).map(job => (
                  <article
                    key={`${key}-${job.id}`}
                    className={`job ${canEdit ? "editable" : ""}`}
                    style={{ borderLeftColor: job.color }}
                    draggable={canEdit}
                    onDragStart={e => e.dataTransfer.setData("job-id", String(job.id))}
                    onClick={() => canEdit && editJob(job)}
                  >
                    <div className="jobHeader">
                      <h3>{job.job_name}</h3>
                      {job.customer && <p className="customer">{job.customer}</p>}
                    </div>

                    {job.location && (
                      <a
                        className="mapLink"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.location)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="cardLabel">Address</span>
                        <span>{job.location}</span>
                      </a>
                    )}

                    {!!job.assignments?.length && (
                      <div className="cardSection">
                        <span className="cardLabel">Crew / Equipment</span>
                        <div className="pills">
                          {job.assignments.map(a => {
                            const member = crew.find(c => c.id === a.crew_id);
                            return member ? <span key={a.crew_id}>{member.name}</span> : null;
                          })}
                        </div>
                      </div>
                    )}

                    {job.notes && (
                      <div className="cardSection notesSection">
                        <span className="cardLabel">Notes</span>
                        <p className="notes">{job.notes}</p>
                      </div>
                    )}
                  </article>
                ))}
                {canEdit && <button className="addDay" onClick={() => setDraft(blankDraft(key))}>+ Add job</button>}
              </div>
            </div>
          );
        })}
      </section>

      {draft && (
        <div className="backdrop" onMouseDown={() => setDraft(null)}>
          <div className="modal" onMouseDown={e => e.stopPropagation()}>
            <div className="modalTitle">
              <h2>{draft.id ? "Edit job" : "Add job"}</h2>
              <button className="icon" onClick={() => setDraft(null)}>×</button>
            </div>

            <label>Job name<input value={draft.job_name} onChange={e => setDraft({ ...draft, job_name: e.target.value })} autoFocus /></label>
            <div className="two">
              <label>Customer<input value={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.value })} /></label>
              <label>Location<input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
            </div>
            <div className="two">
              <label>Start date<input type="date" value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></label>
              <label>End date<input type="date" value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>
            </div>
            <label>Notes<textarea rows={3} value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} /></label>

            <fieldset>
              <legend>Crew and equipment</legend>
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
              <legend>Color</legend>
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
              {draft.id && <button className="danger" onClick={() => deleteJob(draft.id!)}>Delete</button>}
              {draft.id && <button className="secondary" onClick={duplicateJob}>Duplicate</button>}
              <span />
              <button className="secondary" onClick={() => setDraft(null)}>Cancel</button>
              <button className="primary" onClick={saveJob}>Save job</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState("brandon@dangelo-brothers.com");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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
