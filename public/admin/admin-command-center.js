import { adminReady, db, mountSidebar, esc } from "/admin/admin-shared.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

mountSidebar("command");
await adminReady;

const $ = (id) => document.getElementById(id);
const state = {
  tasks: [],
  bookings: [],
  contacts: [],
  referrals: [],
  crm: [],
  users: [],
  blog: [],
  social: []
};
let queueFilter = "all";
let queueSearch = "";
let lastRender = 0;

const SOURCES = [
  ["tasks", "tasks"],
  ["bookings", "bookings"],
  ["contacts", "contacts"],
  ["referrals", "patientReferal"],
  ["crm", "crmLeads"],
  ["users", "users"],
  ["blog", "blogPosts"],
  ["social", "socialPosts"]
];

function asDate(value) {
  if (!value) return null;
  if (value?.toDate) {
    const d = value.toDate();
    return Number.isNaN(d?.getTime?.()) ? null : d;
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function localDay(value) {
  const d = value instanceof Date ? value : asDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey() { return localDay(new Date()); }
function isToday(value) { return localDay(value) === todayKey(); }
function isPast(value) {
  const d = asDate(value);
  if (!d) return false;
  return d.getTime() < Date.now() && !isToday(d);
}
function isCrmOverdue(value) {
  const day = localDay(value);
  return Boolean(day && day < todayKey());
}
function crmDueToday(value) { return localDay(value) === todayKey(); }
function stamp(item) {
  return asDate(item?.createdAt || item?.updatedAt || item?.scheduledAt || item?.publishedAt)?.getTime?.() || 0;
}
function sortNewest(a, b) { return stamp(b.data || b) - stamp(a.data || a); }
function timeLabel(value) {
  const d = asDate(value);
  if (!d) return "Unscheduled";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}
function dateTimeLabel(value) {
  const d = asDate(value);
  if (!d) return "No date";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}
function text(value) { return String(value ?? "").trim(); }
function lower(value) { return text(value).toLowerCase(); }
function statusOf(value, fallback = "new") { return lower(value || fallback).replace(/\s+/g, "_"); }
function activeTask(t) { return !["done", "cancelled", "completed", "archived"].includes(statusOf(t.status, "assigned")); }
function activeBooking(b) { return !["completed", "cancelled", "archived"].includes(statusOf(b.status, "pending")); }
function setText(id, value) { const el = $(id); if (el) el.textContent = String(value); }

function subscribe(name, collectionName) {
  onSnapshot(collection(db, collectionName), (snap) => {
    state[name] = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    scheduleRender();
  }, (error) => {
    console.error(`[command-center] ${collectionName}:`, error);
    state[name] = [];
    scheduleRender();
  });
}

SOURCES.forEach(([name, collectionName]) => subscribe(name, collectionName));

function scheduleRender() {
  const now = Date.now();
  if (now - lastRender < 70) {
    clearTimeout(scheduleRender.timer);
    scheduleRender.timer = setTimeout(renderAll, 90);
  } else {
    renderAll();
  }
}

function buildPriorityQueue() {
  const items = [];

  state.tasks.forEach((t) => {
    if (!activeTask(t)) return;
    const patient = text(t.patient?.name) || "Clinical task";
    const service = text(t.service?.title || t.service?.slug) || "Wound care task";
    const reasons = [];
    let score = 0;
    let level = "medium";
    if (t.scheduledAt && isPast(t.scheduledAt)) { score = Math.max(score, 100); reasons.push("scheduled time passed"); level = "critical"; }
    if (!text(t.assignedTo)) { score = Math.max(score, 94); reasons.push("no assignee"); level = score >= 98 ? "critical" : "high"; }
    if (statusOf(t.status, "assigned") === "in_progress") { score = Math.max(score, 78); reasons.push("in progress"); }
    if (isToday(t.scheduledAt)) { score = Math.max(score, 74); reasons.push("due today"); }
    if (!score) return;
    items.push({
      score, level, category: "clinical", title: patient,
      subtitle: `${service} · ${reasons.join(" · ")}`,
      tags: [text(t.status || "assigned"), !text(t.assignedTo) ? "unassigned" : "clinical"].filter(Boolean),
      href: "/admin/tasks.html", action: "Open task queue"
    });
  });

  state.referrals.forEach((r) => {
    const st = statusOf(r.status, "new");
    if (st !== "new") return;
    items.push({
      score: 97, level: "critical", category: "intake",
      title: text(r.patientName) || "New patient referral",
      subtitle: `${text(r.refName || r.refOrg) || "Referring source"}${r.diagnosis ? ` · ${text(r.diagnosis)}` : ""}`,
      tags: ["new referral", "intake"], href: "/admin/referrals.html", action: "Review referral"
    });
  });

  state.bookings.forEach((b) => {
    if (!activeBooking(b) || statusOf(b.status, "pending") !== "pending") return;
    items.push({
      score: 92, level: "high", category: "intake",
      title: text(b.patient?.name) || "Pending booking",
      subtitle: `${text(b.serviceTitle || b.serviceSlug) || "Requested service"} · needs scheduling`,
      tags: ["pending", "booking"], href: "/admin/bookings.html", action: "Schedule"
    });
  });

  state.crm.forEach((lead) => {
    const st = text(lead.status || "New");
    if (["Partner", "Not Interested"].includes(st)) return;
    const follow = lead.nextFollowUp;
    let score = 0;
    let reason = "";
    if (isCrmOverdue(follow)) { score = 88; reason = "follow-up overdue"; }
    else if (st === "Interested") { score = 86; reason = "interested — secure meeting"; }
    else if (crmDueToday(follow)) { score = 82; reason = "follow-up due today"; }
    else if (st === "Meeting") { score = 76; reason = "active meeting opportunity"; }
    if (!score) return;
    items.push({
      score, level: score >= 88 ? "high" : "medium", category: "growth",
      title: text(lead.name) || "CRM opportunity",
      subtitle: `${text(lead.administrator) || text(lead.type) || "Decision maker"} · ${reason}`,
      tags: [st, isCrmOverdue(follow) ? "overdue" : "growth"], href: "/admin/crm.html", action: "Open CRM"
    });
  });

  state.contacts.forEach((c) => {
    if (statusOf(c.status, "new") !== "new") return;
    items.push({
      score: 73, level: "medium", category: "intake",
      title: text(c.name) || "New inquiry",
      subtitle: text(c.reason) || text(c.email) || text(c.phone) || "Contact request",
      tags: ["new contact", "inbox"], href: "/admin/contacts.html", action: "Open contact"
    });
  });

  return items.sort((a, b) => b.score - a.score);
}

function renderMetrics(queue) {
  const urgent = queue.filter(x => x.score >= 85).length;
  const todayTasks = state.tasks.filter(t => activeTask(t) && isToday(t.scheduledAt)).length;
  const todayBookings = state.bookings.filter(b => activeBooking(b) && isToday(b.scheduledAt)).length;
  const newRefs = state.referrals.filter(r => statusOf(r.status, "new") === "new").length;
  const pendingBookings = state.bookings.filter(b => activeBooking(b) && statusOf(b.status, "pending") === "pending").length;
  const overdueCrm = state.crm.filter(l => !["Partner", "Not Interested"].includes(text(l.status)) && isCrmOverdue(l.nextFollowUp)).length;
  const unassigned = state.tasks.filter(t => activeTask(t) && !text(t.assignedTo)).length;

  setText("mUrgent", urgent);
  setText("mToday", todayTasks + todayBookings);
  setText("mReferrals", newRefs);
  setText("mBookings", pendingBookings);
  setText("mCrmOverdue", overdueCrm);
  setText("mUnassigned", unassigned);

  const deduction = Math.min(60, urgent * 3 + unassigned * 3 + pendingBookings * 2 + overdueCrm * 2 + newRefs * 2);
  const score = Math.max(40, 100 - deduction);
  setText("opsScore", score);
  const label = score >= 90 ? "Clear and well controlled" : score >= 78 ? "Stable — a few actions pending" : score >= 64 ? "Watch list active" : "Operational attention required";
  setText("opsLabel", label);
  const ring = document.querySelector(".status-ring");
  ring?.style.setProperty("--ops-score", `${score}%`);
}

function renderPriority(queue) {
  const filtered = queue.filter(item => {
    if (queueFilter !== "all" && item.category !== queueFilter) return false;
    if (!queueSearch) return true;
    const hay = `${item.title} ${item.subtitle} ${(item.tags || []).join(" ")}`.toLowerCase();
    return hay.includes(queueSearch);
  }).slice(0, 12);

  $("priorityEmpty").hidden = filtered.length > 0;
  $("priorityList").innerHTML = filtered.map((item, index) => {
    const tags = item.tags.slice(0, 3).map(tag => {
      const cls = lower(tag).includes("overdue") || lower(tag).includes("new referral") ? "urgent" : lower(tag).includes("pending") || lower(tag).includes("unassigned") ? "warn" : "";
      return `<span class="tag ${cls}">${esc(tag)}</span>`;
    }).join("");
    return `<article class="priority-item ${esc(item.level)}">
      <div class="priority-rank">${String(index + 1).padStart(2, "0")}</div>
      <div class="priority-copy"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span><div class="priority-meta">${tags}<span class="tag">priority ${item.score}</span></div></div>
      <a class="priority-action" href="${esc(item.href)}">${esc(item.action)} →</a>
    </article>`;
  }).join("");
}

function renderToday() {
  const items = [];
  state.tasks.filter(t => activeTask(t) && isToday(t.scheduledAt)).forEach(t => items.push({
    when: asDate(t.scheduledAt), type: "Task", title: text(t.patient?.name) || "Clinical task",
    subtitle: `${text(t.service?.title || t.service?.slug) || "Wound care"} · ${text(t.status || "assigned")}`
  }));
  state.bookings.filter(b => activeBooking(b) && isToday(b.scheduledAt)).forEach(b => items.push({
    when: asDate(b.scheduledAt), type: "Booking", title: text(b.patient?.name) || "Scheduled booking",
    subtitle: `${text(b.serviceTitle || b.serviceSlug) || "Requested service"} · ${text(b.status || "scheduled")}`
  }));
  items.sort((a, b) => (a.when?.getTime?.() || 0) - (b.when?.getTime?.() || 0));

  $("todayTimeline").innerHTML = items.length ? items.slice(0, 10).map(item => `<div class="timeline-item">
    <div class="timeline-time">${esc(timeLabel(item.when))}</div><span class="timeline-dot"></span>
    <div class="timeline-copy"><strong>${esc(item.title)}</strong><span>${esc(item.type)} · ${esc(item.subtitle)}</span></div>
  </div>`).join("") : `<div class="empty-command">No scheduled clinical work is currently recorded for today.</div>`;
}

function renderReferralPipeline() {
  const statuses = ["new", "reviewed", "contacted", "converted", "archived"];
  const counts = Object.fromEntries(statuses.map(s => [s, 0]));
  state.referrals.forEach(r => { const st = statusOf(r.status, "new"); if (st in counts) counts[st] += 1; });
  $("referralPipeline").innerHTML = statuses.map(st => `<div class="pipeline-step"><strong>${counts[st]}</strong><span>${esc(st)}</span></div>`).join("");

  const latest = [...state.referrals].sort((a, b) => sortNewest({data:a},{data:b})).slice(0, 4);
  $("latestReferrals").innerHTML = latest.length ? latest.map(r => `<div class="feed-item"><div class="feed-copy"><strong>${esc(text(r.patientName) || "Referral")}</strong><span>${esc(text(r.refOrg || r.refName) || "Referring source")} · ${esc(text(r.status || "new"))}</span></div><a href="/admin/referrals.html">Open →</a></div>`).join("") : `<div class="empty-command">No referrals yet.</div>`;
}

function userLabel(uid) {
  if (!uid) return "Unassigned";
  const user = state.users.find(u => u.id === uid);
  return text(user?.displayName || user?.name || user?.email) || uid;
}

function renderTeamLoad() {
  const groups = new Map();
  state.tasks.filter(activeTask).forEach(t => {
    const key = text(t.assignedTo) || "__unassigned__";
    const current = groups.get(key) || { count: 0, inProgress: 0 };
    current.count += 1;
    if (statusOf(t.status, "assigned") === "in_progress") current.inProgress += 1;
    groups.set(key, current);
  });
  const rows = [...groups.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 7);
  const max = Math.max(1, ...rows.map(([,v]) => v.count));
  $("teamLoad").innerHTML = rows.length ? rows.map(([uid, load]) => {
    const label = uid === "__unassigned__" ? "Unassigned queue" : userLabel(uid);
    const width = Math.max(8, Math.round((load.count / max) * 100));
    return `<div class="load-row"><div><div class="load-label"><strong>${esc(label)}</strong><span>${load.inProgress ? `${load.inProgress} active` : "queued"}</span></div><div class="load-bar"><i style="width:${width}%"></i></div></div><div class="load-count">${load.count}</div></div>`;
  }).join("") : `<div class="empty-command">No active task load.</div>`;
}

function renderGrowth() {
  const active = state.crm.filter(l => !["Partner", "Not Interested"].includes(text(l.status)));
  const overdue = active.filter(l => isCrmOverdue(l.nextFollowUp)).length;
  const due = active.filter(l => crmDueToday(l.nextFollowUp)).length;
  const interested = state.crm.filter(l => text(l.status) === "Interested").length;
  const meeting = state.crm.filter(l => text(l.status) === "Meeting").length;
  const partner = state.crm.filter(l => text(l.status) === "Partner").length;
  setText("gOverdue", overdue); setText("gToday", due); setText("gInterested", interested); setText("gMeeting", meeting); setText("gPartner", partner);

  const next = [...state.crm].filter(l => !["Partner", "Not Interested"].includes(text(l.status))).sort((a, b) => {
    const scoreA = isCrmOverdue(a.nextFollowUp) ? 1000 : text(a.status) === "Interested" ? 900 : crmDueToday(a.nextFollowUp) ? 800 : Number(a.score || 0);
    const scoreB = isCrmOverdue(b.nextFollowUp) ? 1000 : text(b.status) === "Interested" ? 900 : crmDueToday(b.nextFollowUp) ? 800 : Number(b.score || 0);
    return scoreB - scoreA;
  })[0];
  $("growthNext").innerHTML = next ? `<strong>Next growth action:</strong> ${esc(text(next.name) || "CRM lead")} — ${esc(isCrmOverdue(next.nextFollowUp) ? "overdue follow-up" : text(next.status || "New"))}. <a href="/admin/crm.html">Open CRM →</a>` : `<strong>Growth queue clear.</strong> Add or import opportunities in the CRM.`;
}

function renderSignals() {
  const items = [];
  state.contacts.forEach(c => items.push({ data:c, title:text(c.name)||"Website contact", subtitle:`Contact · ${text(c.status || "new")} · ${dateTimeLabel(c.createdAt)}`, href:"/admin/contacts.html" }));
  state.bookings.forEach(b => items.push({ data:b, title:text(b.patient?.name)||"Booking request", subtitle:`Booking · ${text(b.status || "pending")} · ${dateTimeLabel(b.createdAt)}`, href:"/admin/bookings.html" }));
  state.referrals.forEach(r => items.push({ data:r, title:text(r.patientName)||"Patient referral", subtitle:`Referral · ${text(r.status || "new")} · ${dateTimeLabel(r.createdAt)}`, href:"/admin/referrals.html" }));
  items.sort(sortNewest);
  $("recentSignals").innerHTML = items.length ? items.slice(0, 6).map(item => `<div class="feed-item"><div class="feed-copy"><strong>${esc(item.title)}</strong><span>${esc(item.subtitle)}</span></div><a href="${item.href}">Open →</a></div>`).join("") : `<div class="empty-command">No recent intake signals.</div>`;
}

function renderContentHealth() {
  const blogPublished = state.blog.filter(x => ["published", "publish"].includes(lower(x.status))).length;
  const blogDrafts = state.blog.filter(x => !["published", "publish"].includes(lower(x.status))).length;
  const socialPublished = state.social.filter(x => ["published", "posted", "scheduled"].includes(lower(x.status))).length;
  const socialDrafts = Math.max(0, state.social.length - socialPublished);
  setText("cBlog", state.blog.length); setText("cSocial", state.social.length);
  setText("cBlogMeta", `${blogPublished} published · ${blogDrafts} draft/other`);
  setText("cSocialMeta", `${socialPublished} active · ${socialDrafts} draft/other`);
}

function renderSync() {
  const now = new Date();
  setText("lastSync", `Live · ${new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit",second:"2-digit"}).format(now)}`);
}

function renderAll() {
  lastRender = Date.now();
  const queue = buildPriorityQueue();
  renderMetrics(queue);
  renderPriority(queue);
  renderToday();
  renderReferralPipeline();
  renderTeamLoad();
  renderGrowth();
  renderSignals();
  renderContentHealth();
  renderSync();
}

function renderClock() {
  const now = new Date();
  setText("liveClock", new Intl.DateTimeFormat(undefined, { hour:"numeric", minute:"2-digit" }).format(now));
  setText("liveDate", new Intl.DateTimeFormat(undefined, { weekday:"short", month:"short", day:"numeric" }).format(now));
}
renderClock();
setInterval(renderClock, 30000);

$("commandSearch")?.addEventListener("input", (e) => {
  queueSearch = lower(e.target.value);
  renderPriority(buildPriorityQueue());
});

document.querySelectorAll("[data-queue-filter]").forEach(btn => btn.addEventListener("click", () => {
  queueFilter = btn.dataset.queueFilter || "all";
  document.querySelectorAll("[data-queue-filter]").forEach(x => x.classList.toggle("active", x === btn));
  renderPriority(buildPriorityQueue());
}));

document.querySelectorAll("[data-jump]").forEach(el => el.addEventListener("click", () => {
  document.getElementById(el.dataset.jump)?.scrollIntoView({ behavior:"smooth", block:"start" });
}));

document.addEventListener("keydown", (e) => {
  if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName || "")) {
    e.preventDefault();
    $("commandSearch")?.focus();
  }
});
