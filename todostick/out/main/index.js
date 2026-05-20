"use strict";
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const supabaseJs = require("@supabase/supabase-js");
const WebSocket = require("ws");
const dotenv = require("dotenv");
if (utils.is.dev) {
  const devUserData = path.join(electron.app.getPath("appData"), "todostick-dev");
  electron.app.setPath("userData", devUserData);
  console.log("[DEV] userData →", devUserData);
}
const isDev = utils.is.dev;
const DB_FILENAME = "todostick.json";
function migrateUserData({ oldDir, newDir }) {
  if (!fs.existsSync(oldDir)) {
    return { migrated: false, reason: "source-missing" };
  }
  const oldFile = path.join(oldDir, DB_FILENAME);
  if (!fs.existsSync(oldFile)) {
    return { migrated: false, reason: "source-missing" };
  }
  if (!fs.existsSync(newDir)) {
    fs.mkdirSync(newDir, { recursive: true });
  }
  const newFile = path.join(newDir, DB_FILENAME);
  if (fs.existsSync(newFile)) {
    return { migrated: false, reason: "target-exists" };
  }
  fs.copyFileSync(oldFile, newFile);
  return { migrated: true, from: oldFile, to: newFile };
}
const SCHEMA_VERSION = 1;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  date TEXT NOT NULL,
  end_date TEXT,
  is_completed INTEGER DEFAULT 0,
  is_in_progress INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  repeat_type TEXT DEFAULT 'none',
  repeat_days TEXT,
  order_index INTEGER DEFAULT 0,
  remind_at TEXT,
  color TEXT,
  category TEXT,
  is_habit INTEGER DEFAULT 0,
  start_time TEXT,
  end_time TEXT,
  is_template INTEGER DEFAULT 0,
  parent_id TEXT,
  skipped_dates TEXT,
  rollover_source_id TEXT,
  completion_note TEXT,
  completed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS see_memos (
  date TEXT PRIMARY KEY,
  good TEXT DEFAULT '',
  bad TEXT DEFAULT '',
  next TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_goals (
  ym TEXT PRIMARY KEY,
  text TEXT DEFAULT '',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;
function openDatabase(path2) {
  const db2 = new Database(path2);
  db2.pragma("journal_mode = WAL");
  db2.pragma("foreign_keys = ON");
  db2.exec(SCHEMA);
  const stmt = db2.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)");
  stmt.run("schema_version", String(SCHEMA_VERSION));
  return db2;
}
const TASK_COLS$1 = [
  "id",
  "title",
  "memo",
  "date",
  "end_date",
  "is_completed",
  "is_in_progress",
  "is_starred",
  "repeat_type",
  "repeat_days",
  "order_index",
  "remind_at",
  "color",
  "category",
  "is_habit",
  "start_time",
  "end_time",
  "is_template",
  "parent_id",
  "skipped_dates",
  "rollover_source_id",
  "completion_note",
  "completed_at",
  "created_at",
  "updated_at"
];
const BOOL_COLS$1 = /* @__PURE__ */ new Set(["is_completed", "is_in_progress", "is_starred", "is_habit", "is_template"]);
const ARRAY_COLS$1 = /* @__PURE__ */ new Set(["repeat_days", "skipped_dates"]);
function normalizeTaskValue(col, value) {
  if (value === void 0) return null;
  if (BOOL_COLS$1.has(col)) return value ? 1 : 0;
  if (ARRAY_COLS$1.has(col)) return value ? JSON.stringify(value) : null;
  return value;
}
function migrateJsonToSqlite(jsonPath2, db2) {
  const already = db2.prepare("SELECT value FROM meta WHERE key='json_migrated'").get();
  if (already) {
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 };
  }
  if (!fs.existsSync(jsonPath2)) {
    db2.prepare("INSERT INTO meta (key, value) VALUES ('json_migrated', '1')").run();
    return { skipped: true, tasks: 0, categories: 0, seeMemos: 0, goals: 0 };
  }
  const raw = JSON.parse(fs.readFileSync(jsonPath2, "utf-8"));
  const tasks = raw.tasks || [];
  const settings = raw.settings || {};
  const insertTask = db2.prepare(`INSERT INTO tasks (${TASK_COLS$1.join(", ")}) VALUES (${TASK_COLS$1.map(() => "?").join(", ")})`);
  const insertCategory = db2.prepare("INSERT OR REPLACE INTO categories (id, label, color) VALUES (?, ?, ?)");
  const insertSeeMemo = db2.prepare("INSERT OR REPLACE INTO see_memos (date, good, bad, next, updated_at) VALUES (?, ?, ?, ?, ?)");
  const insertGoal = db2.prepare("INSERT OR REPLACE INTO monthly_goals (ym, text, updated_at) VALUES (?, ?, ?)");
  const insertSetting = db2.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  let categoriesCount = 0;
  let seeCount = 0;
  let goalCount = 0;
  db2.transaction(() => {
    for (const t of tasks) {
      insertTask.run(...TASK_COLS$1.map((col) => normalizeTaskValue(col, t[col])));
    }
    for (const cat of settings.categories || []) {
      insertCategory.run(cat.id, cat.label, cat.color || null);
      categoriesCount++;
    }
    for (const [key, value] of Object.entries(settings)) {
      if (key === "categories") continue;
      if (key.startsWith("see:")) {
        const date = key.slice(4);
        const obj = typeof value === "string" ? { good: value, bad: "", next: "" } : value;
        insertSeeMemo.run(date, obj.good || "", obj.bad || "", obj.next || "", now);
        seeCount++;
      } else if (key.startsWith("goal:")) {
        const ym = key.slice(5);
        insertGoal.run(ym, String(value), now);
        goalCount++;
      } else {
        const v = typeof value === "string" ? value : JSON.stringify(value);
        insertSetting.run(key, v);
      }
    }
    db2.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('json_migrated', '1')").run();
  })();
  return { skipped: false, tasks: tasks.length, categories: categoriesCount, seeMemos: seeCount, goals: goalCount };
}
function generateId$1() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function autoRolloverOverdue(tasks, toDate) {
  const candidates = tasks.filter(
    (t) => t.date < toDate && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date
  );
  if (candidates.length === 0) return [];
  const existingSources = new Set(
    tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
  );
  const toCopy = candidates.filter((t) => !existingSources.has(t.id));
  if (toCopy.length === 0) return [];
  const maxOrder = tasks.filter((t) => t.date === toDate).length;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return toCopy.map((t, i) => ({
    id: generateId$1(),
    title: t.title,
    memo: t.memo,
    date: toDate,
    is_completed: false,
    is_in_progress: !!t.is_in_progress,
    repeat_type: "none",
    order_index: maxOrder + i,
    remind_at: null,
    color: t.color || null,
    category: t.category || null,
    is_template: false,
    parent_id: null,
    rollover_source_id: t.id,
    completion_note: null,
    completed_at: null,
    created_at: now,
    updated_at: now
  }));
}
function shouldRepeatOnDate(template, date) {
  if (template.date >= date) return false;
  if (template.skipped_dates && template.skipped_dates.includes(date)) return false;
  const tDate = /* @__PURE__ */ new Date(template.date + "T00:00:00");
  const rDate = /* @__PURE__ */ new Date(date + "T00:00:00");
  if (template.repeat_type === "daily") {
    if (template.repeat_days && template.repeat_days.length > 0) {
      return template.repeat_days.includes(rDate.getDay());
    }
    return true;
  }
  if (template.repeat_type === "weekly") return tDate.getDay() === rDate.getDay();
  if (template.repeat_type === "monthly") return tDate.getDate() === rDate.getDate();
  return false;
}
function buildRepeatInstancesForDate(tasks, date, generateId2) {
  const templates = tasks.filter((t) => t.is_template && t.repeat_type !== "none");
  if (templates.length === 0) return [];
  const existing = /* @__PURE__ */ new Set();
  for (const t of tasks) {
    if (t.parent_id && t.date === date) existing.add(t.parent_id);
  }
  const newInstances = [];
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const tmpl of templates) {
    if (!shouldRepeatOnDate(tmpl, date)) continue;
    if (existing.has(tmpl.id)) continue;
    newInstances.push({
      id: generateId2(),
      title: tmpl.title,
      memo: tmpl.memo,
      date,
      is_completed: false,
      repeat_type: tmpl.repeat_type,
      order_index: tmpl.order_index,
      remind_at: tmpl.remind_at || null,
      color: tmpl.color || null,
      category: tmpl.category || null,
      is_habit: !!tmpl.is_habit,
      parent_id: tmpl.id,
      is_template: false,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    });
    existing.add(tmpl.id);
  }
  return newInstances;
}
let _db = null;
function dbPath() {
  return path.join(electron.app.getPath("userData"), "orbit.db");
}
function jsonPath() {
  return path.join(electron.app.getPath("userData"), "todostick.json");
}
function getDb() {
  if (_db) return _db;
  _db = openDatabase(dbPath());
  try {
    migrateJsonToSqlite(jsonPath(), _db);
  } catch (e) {
    console.error("[migrate] failed:", e);
  }
  return _db;
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
const TASK_COLS = [
  "id",
  "title",
  "memo",
  "date",
  "end_date",
  "is_completed",
  "is_in_progress",
  "is_starred",
  "repeat_type",
  "repeat_days",
  "order_index",
  "remind_at",
  "color",
  "category",
  "is_habit",
  "start_time",
  "end_time",
  "is_template",
  "parent_id",
  "skipped_dates",
  "rollover_source_id",
  "completion_note",
  "completed_at",
  "created_at",
  "updated_at"
];
const BOOL_COLS = /* @__PURE__ */ new Set(["is_completed", "is_in_progress", "is_starred", "is_habit", "is_template"]);
const ARRAY_COLS = /* @__PURE__ */ new Set(["repeat_days", "skipped_dates"]);
function rowToTask(row) {
  if (!row) return null;
  const t = { ...row };
  for (const c of BOOL_COLS) t[c] = !!t[c];
  for (const c of ARRAY_COLS) {
    if (t[c]) {
      try {
        t[c] = JSON.parse(t[c]);
      } catch {
        t[c] = c === "skipped_dates" ? [] : null;
      }
    } else {
      t[c] = c === "skipped_dates" ? [] : null;
    }
  }
  return t;
}
function valForCol(col, value) {
  if (value === void 0) return null;
  if (value === null) return null;
  if (BOOL_COLS.has(col)) return value ? 1 : 0;
  if (ARRAY_COLS.has(col)) return value ? JSON.stringify(value) : null;
  return value;
}
function getAllTasks() {
  return getDb().prepare("SELECT * FROM tasks").all().map(rowToTask);
}
function insertTaskRow(db2, task) {
  const stmt = db2.prepare(
    `INSERT INTO tasks (${TASK_COLS.join(", ")}) VALUES (${TASK_COLS.map(() => "?").join(", ")})`
  );
  stmt.run(...TASK_COLS.map((c) => valForCol(c, task[c])));
}
function dateRange(startDate, endDate) {
  const dates = [];
  const cur = /* @__PURE__ */ new Date(startDate + "T00:00:00");
  const end = /* @__PURE__ */ new Date(endDate + "T00:00:00");
  while (cur <= end) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
function ensureRepeatInstancesForDate(date) {
  const db2 = getDb();
  const tasks = getAllTasks();
  const newInstances = buildRepeatInstancesForDate(tasks, date, generateId);
  if (newInstances.length === 0) return false;
  db2.transaction(() => {
    for (const inst of newInstances) insertTaskRow(db2, inst);
  })();
  return true;
}
function ensureRepeatInstancesForRange(fromDate, toDate) {
  let changed = false;
  for (const date of dateRange(fromDate, toDate)) {
    if (ensureRepeatInstancesForDate(date)) changed = true;
  }
  return changed;
}
function sortDayTasks(a, b) {
  const aInProg = !!a.is_in_progress && !a.is_completed;
  const bInProg = !!b.is_in_progress && !b.is_completed;
  if (aInProg !== bInProg) return aInProg ? -1 : 1;
  const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
  if (star) return star;
  if (a.order_index !== b.order_index) return a.order_index - b.order_index;
  return (a.created_at || "").localeCompare(b.created_at || "");
}
function sortMultiDayTasks(a, b) {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const aInProg = !!a.is_in_progress && !a.is_completed;
  const bInProg = !!b.is_in_progress && !b.is_completed;
  if (aInProg !== bInProg) return aInProg ? -1 : 1;
  const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
  if (star) return star;
  return a.order_index - b.order_index;
}
function seedIfEmpty() {
  const db2 = getDb();
  const count = db2.prepare("SELECT count(*) as c FROM tasks").get().c;
  if (count > 0) return false;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const now = nowIso();
  const mk = (overrides) => ({
    id: generateId(),
    title: "",
    memo: "",
    date: today,
    end_date: null,
    is_completed: false,
    is_in_progress: false,
    is_starred: false,
    repeat_type: "none",
    repeat_days: null,
    order_index: 0,
    remind_at: null,
    color: null,
    category: null,
    is_habit: false,
    start_time: null,
    end_time: null,
    is_template: false,
    parent_id: null,
    skipped_dates: null,
    rollover_source_id: null,
    completion_note: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    ...overrides
  });
  const tasks = [];
  tasks.push(mk({ title: "🧪 [DEV] 회의 준비", category: "work", color: "blue", start_time: "10:00", end_time: "11:00", order_index: 0 }));
  tasks.push(mk({ title: "🧪 [DEV] 점심 약속", category: "personal", color: "green", start_time: "12:30", end_time: "13:30", order_index: 1 }));
  tasks.push(mk({ title: "🧪 [DEV] 코드 리뷰", category: "work", color: "blue", order_index: 2 }));
  tasks.push(mk({ title: "🧪 [DEV] 어제 못 끝낸 일", date: yesterday, order_index: 99 }));
  const stretchT = mk({
    title: "🌱 [DEV] 스트레칭 10분",
    date: lastWeek,
    repeat_type: "daily",
    is_template: true,
    is_habit: true,
    color: "orange",
    category: "health",
    skipped_dates: []
  });
  tasks.push(stretchT);
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    if (i % 3 === 0) continue;
    tasks.push(mk({
      title: stretchT.title,
      date: d,
      repeat_type: "daily",
      is_habit: true,
      color: "orange",
      category: "health",
      parent_id: stretchT.id,
      is_completed: true,
      completed_at: new Date(Date.now() - i * 864e5).toISOString()
    }));
  }
  const waterT = mk({
    title: "🌱 [DEV] 물 8잔 마시기",
    date: lastWeek,
    repeat_type: "daily",
    repeat_days: [1, 2, 3, 4, 5],
    is_template: true,
    is_habit: true,
    color: "blue",
    category: "health",
    skipped_dates: []
  });
  tasks.push(waterT);
  const meetingT = mk({
    title: "🧪 [DEV] 주간 팀 미팅",
    date: lastWeek,
    repeat_type: "weekly",
    is_template: true,
    color: "purple",
    category: "work",
    skipped_dates: []
  });
  tasks.push(meetingT);
  const insertCat = db2.prepare("INSERT OR REPLACE INTO categories (id, label, color) VALUES (?, ?, ?)");
  db2.transaction(() => {
    for (const t of tasks) insertTaskRow(db2, t);
    const cats = [
      { id: "work", label: "업무", color: "blue" },
      { id: "personal", label: "개인", color: "green" },
      { id: "health", label: "운동", color: "orange" }
    ];
    for (const c of cats) insertCat.run(c.id, c.label, c.color);
  })();
  return true;
}
const db = {
  getDbPath: () => dbPath(),
  seedIfEmpty,
  // ── 조회 ─────────────────────────────────────────────────
  getTasksByDate(date) {
    ensureRepeatInstancesForDate(date);
    const rows = getDb().prepare(
      `SELECT * FROM tasks
         WHERE is_template = 0
           AND (date = ?
                OR (end_date IS NOT NULL AND date <= ? AND ? <= end_date))`
    ).all(date, date, date);
    return rows.map(rowToTask).sort(sortDayTasks);
  },
  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${prefix}-01`;
    const endDate = `${prefix}-${String(daysInMonth).padStart(2, "0")}`;
    ensureRepeatInstancesForRange(startDate, endDate);
    const rows = getDb().prepare(
      `SELECT * FROM tasks
         WHERE is_template = 0
           AND (date LIKE ?
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
    ).all(`${prefix}-%`, endDate, startDate);
    return rows.map(rowToTask).sort(sortMultiDayTasks);
  },
  getTasksByRange(startDate, endDate) {
    ensureRepeatInstancesForRange(startDate, endDate);
    const rows = getDb().prepare(
      `SELECT * FROM tasks
         WHERE is_template = 0
           AND ((date >= ? AND date <= ?)
                OR (end_date IS NOT NULL AND date <= ? AND end_date >= ?))`
    ).all(startDate, endDate, endDate, startDate);
    return rows.map(rowToTask).sort(sortMultiDayTasks);
  },
  getOverdueTasks(date) {
    const db2 = getDb();
    const rolledSources = new Set(
      db2.prepare(
        `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
      ).all(date).map((r) => r.rollover_source_id)
    );
    const rows = db2.prepare(
      `SELECT * FROM tasks
         WHERE date < ?
           AND is_completed = 0
           AND is_template = 0
           AND parent_id IS NULL
           AND end_date IS NULL`
    ).all(date);
    return rows.map(rowToTask).filter((t) => !rolledSources.has(t.id));
  },
  getTodayReminders(date) {
    const rows = getDb().prepare(
      `SELECT * FROM tasks
         WHERE date = ?
           AND remind_at IS NOT NULL
           AND is_template = 0`
    ).all(date);
    return rows.map(rowToTask);
  },
  getCompletedTasks({ category, search } = {}) {
    const db2 = getDb();
    let sql = `SELECT * FROM tasks WHERE is_completed = 1 AND is_template = 0`;
    const params = [];
    if (category) {
      sql += ` AND category = ?`;
      params.push(category);
    }
    const rows = db2.prepare(sql).all(...params);
    const filtered = rows.map(rowToTask).filter((t) => {
      if (search) {
        const s = search.toLowerCase();
        const inTitle = (t.title || "").toLowerCase().includes(s);
        const inNote = (t.completion_note || "").toLowerCase().includes(s);
        if (!inTitle && !inNote) return false;
      }
      return true;
    });
    return filtered.sort(
      (a, b) => (b.completed_at || b.updated_at || "").localeCompare(a.completed_at || a.updated_at || "")
    );
  },
  getPoolTasks(poolKey) {
    const rows = getDb().prepare(`SELECT * FROM tasks WHERE date = ? AND is_template = 0`).all(poolKey);
    return rows.map(rowToTask).sort(
      (a, b) => a.order_index - b.order_index || (a.created_at || "").localeCompare(b.created_at || "")
    );
  },
  // ── 쓰기 ─────────────────────────────────────────────────
  createTask({
    title,
    memo = "",
    date,
    end_date = null,
    repeat_type = "none",
    repeat_days = null,
    order_index = 0,
    remind_at = null,
    color = null,
    category = null,
    is_habit = false,
    start_time = null,
    end_time = null
  }) {
    const db2 = getDb();
    const habit = repeat_type !== "none" && !!is_habit;
    const isPoolKey = typeof date === "string" && (date.startsWith("M:") || date.startsWith("W:"));
    const resolvedEndDate = repeat_type === "none" && !isPoolKey && end_date && end_date > date ? end_date : null;
    const now = nowIso();
    if (repeat_type === "none") {
      const task = {
        id: generateId(),
        title,
        memo,
        date,
        end_date: resolvedEndDate,
        is_completed: false,
        is_in_progress: false,
        is_starred: false,
        repeat_type,
        repeat_days: null,
        order_index,
        remind_at,
        color,
        category,
        is_habit: false,
        start_time,
        end_time,
        is_template: false,
        parent_id: null,
        skipped_dates: null,
        rollover_source_id: null,
        completion_note: null,
        completed_at: null,
        created_at: now,
        updated_at: now
      };
      insertTaskRow(db2, task);
      return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(task.id));
    }
    const templateId = generateId();
    const resolvedRepeatDays = repeat_type === "daily" && repeat_days && repeat_days.length < 7 ? repeat_days : null;
    const template = {
      id: templateId,
      title,
      memo,
      date,
      end_date: null,
      is_completed: false,
      is_in_progress: false,
      is_starred: false,
      repeat_type,
      repeat_days: resolvedRepeatDays,
      order_index,
      remind_at,
      color,
      category,
      is_habit: habit,
      start_time,
      end_time,
      is_template: true,
      parent_id: null,
      skipped_dates: [],
      rollover_source_id: null,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    };
    const instance = {
      id: generateId(),
      title,
      memo,
      date,
      end_date: null,
      is_completed: false,
      is_in_progress: false,
      is_starred: false,
      repeat_type,
      repeat_days: null,
      order_index,
      remind_at,
      color,
      category,
      is_habit: habit,
      start_time,
      end_time,
      is_template: false,
      parent_id: templateId,
      skipped_dates: null,
      rollover_source_id: null,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    };
    db2.transaction(() => {
      insertTaskRow(db2, template);
      insertTaskRow(db2, instance);
    })();
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(instance.id));
  },
  updateTask(id, fields) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!row) return null;
    const task = rowToTask(row);
    const wasTemplate = !!task.is_template;
    const prevRepeatType = task.repeat_type;
    const now = nowIso();
    const setKeys = [];
    const params = [];
    for (const [key, val] of Object.entries(fields)) {
      if (!TASK_COLS.includes(key)) continue;
      setKeys.push(`${key} = ?`);
      params.push(valForCol(key, val));
    }
    setKeys.push("updated_at = ?");
    params.push(now);
    if (setKeys.length > 0) {
      params.push(id);
      db2.prepare(`UPDATE tasks SET ${setKeys.join(", ")} WHERE id = ?`).run(...params);
    }
    if (Object.prototype.hasOwnProperty.call(fields, "is_habit")) {
      const templateId = task.is_template ? task.id : task.parent_id;
      if (templateId) {
        const flag = fields.is_habit ? 1 : 0;
        db2.prepare(
          `UPDATE tasks SET is_habit = ?, updated_at = ?
           WHERE id = ? OR parent_id = ?`
        ).run(flag, now, templateId, templateId);
      }
    }
    if (wasTemplate && prevRepeatType !== "none" && fields.repeat_type === "none") {
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      db2.transaction(() => {
        db2.prepare(
          `DELETE FROM tasks WHERE parent_id = ? AND date > ?`
        ).run(task.id, todayStr);
        db2.prepare(
          `UPDATE tasks SET is_template = 0, parent_id = NULL, skipped_dates = NULL, is_habit = 0, updated_at = ?
           WHERE id = ?`
        ).run(now, task.id);
      })();
    }
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(id));
  },
  toggleTask(id, completionNote = null) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!row) return null;
    const task = rowToTask(row);
    const now = nowIso();
    const newCompleted = !task.is_completed;
    if (newCompleted) {
      db2.prepare(
        `UPDATE tasks SET is_completed = 1, completed_at = ?, completion_note = ?, is_in_progress = 0, updated_at = ?
         WHERE id = ?`
      ).run(now, completionNote || null, now, id);
    } else {
      db2.prepare(
        `UPDATE tasks SET is_completed = 0, completed_at = NULL, completion_note = NULL, updated_at = ?
         WHERE id = ?`
      ).run(now, id);
    }
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(id));
  },
  setInProgress(id, value) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!row) return null;
    const now = nowIso();
    const flag = value ? 1 : 0;
    if (flag) {
      db2.prepare(
        `UPDATE tasks SET is_in_progress = 1, is_completed = 0, updated_at = ? WHERE id = ?`
      ).run(now, id);
    } else {
      db2.prepare(
        `UPDATE tasks SET is_in_progress = 0, updated_at = ? WHERE id = ?`
      ).run(now, id);
    }
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(id));
  },
  setStarred(id, value) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!row) return null;
    const flag = value ? 1 : 0;
    db2.prepare(
      `UPDATE tasks SET is_starred = ?, updated_at = ? WHERE id = ?`
    ).run(flag, nowIso(), id);
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(id));
  },
  deleteTask(id) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (row && row.parent_id) {
      const task = rowToTask(row);
      const tmplRow = db2.prepare("SELECT * FROM tasks WHERE id=?").get(task.parent_id);
      if (tmplRow) {
        const tmpl = rowToTask(tmplRow);
        const skipped = Array.isArray(tmpl.skipped_dates) ? tmpl.skipped_dates : [];
        skipped.push(task.date);
        db2.prepare(
          `UPDATE tasks SET skipped_dates = ?, updated_at = ? WHERE id = ?`
        ).run(JSON.stringify(skipped), nowIso(), tmpl.id);
      }
    }
    db2.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    return { id };
  },
  deleteTaskAndFuture(id, fromDate) {
    const db2 = getDb();
    const row = db2.prepare("SELECT * FROM tasks WHERE id=?").get(id);
    if (!row) return { id };
    const task = rowToTask(row);
    const templateId = task.is_template ? task.id : task.parent_id || null;
    if (templateId) {
      db2.transaction(() => {
        db2.prepare("DELETE FROM tasks WHERE id = ?").run(templateId);
        db2.prepare(
          `DELETE FROM tasks WHERE parent_id = ? AND date >= ?`
        ).run(templateId, fromDate);
      })();
    } else {
      db2.prepare("DELETE FROM tasks WHERE id = ?").run(id);
    }
    return { id };
  },
  reorderTasks(date, orderedIds) {
    const db2 = getDb();
    const now = nowIso();
    const stmt = db2.prepare(
      `UPDATE tasks SET order_index = ?, updated_at = ? WHERE id = ?`
    );
    db2.transaction(() => {
      orderedIds.forEach((id, index) => stmt.run(index, now, id));
    })();
    return true;
  },
  // ── 이월 ─────────────────────────────────────────────────
  rolloverTasks(toDate) {
    const db2 = getDb();
    const overdueRows = db2.prepare(
      `SELECT * FROM tasks
         WHERE date < ?
           AND is_completed = 0
           AND is_template = 0
           AND parent_id IS NULL
           AND end_date IS NULL`
    ).all(toDate);
    const overdue = overdueRows.map(rowToTask);
    const existingSources = new Set(
      db2.prepare(
        `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
      ).all(toDate).map((r) => r.rollover_source_id)
    );
    const toCopy = overdue.filter((t) => !existingSources.has(t.id));
    if (toCopy.length === 0) return [];
    const maxOrder = db2.prepare(`SELECT count(*) as c FROM tasks WHERE date = ?`).get(toDate).c;
    const now = nowIso();
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title,
      memo: t.memo,
      date: toDate,
      end_date: null,
      is_completed: false,
      is_in_progress: !!t.is_in_progress,
      is_starred: false,
      repeat_type: "none",
      repeat_days: null,
      order_index: maxOrder + i,
      remind_at: null,
      color: t.color || null,
      category: t.category || null,
      is_habit: false,
      start_time: null,
      end_time: null,
      is_template: false,
      parent_id: null,
      skipped_dates: null,
      rollover_source_id: t.id,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    }));
    db2.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db2, nt);
    })();
    return newTasks;
  },
  rolloverSelectedTasks(taskIds, toDate) {
    const db2 = getDb();
    if (!taskIds || taskIds.length === 0) return [];
    const placeholders = taskIds.map(() => "?").join(",");
    const selectedRows = db2.prepare(`SELECT * FROM tasks WHERE id IN (${placeholders}) AND end_date IS NULL`).all(...taskIds);
    const selected = selectedRows.map(rowToTask);
    const existingSources = new Set(
      db2.prepare(
        `SELECT rollover_source_id FROM tasks
           WHERE date = ? AND rollover_source_id IS NOT NULL`
      ).all(toDate).map((r) => r.rollover_source_id)
    );
    const toCopy = selected.filter((t) => !existingSources.has(t.id));
    if (toCopy.length === 0) return [];
    const maxOrder = db2.prepare(`SELECT count(*) as c FROM tasks WHERE date = ?`).get(toDate).c;
    const now = nowIso();
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title,
      memo: t.memo,
      date: toDate,
      end_date: null,
      is_completed: false,
      is_in_progress: !!t.is_in_progress,
      is_starred: false,
      repeat_type: "none",
      repeat_days: null,
      order_index: maxOrder + i,
      remind_at: null,
      color: t.color || null,
      category: t.category || null,
      is_habit: false,
      start_time: null,
      end_time: null,
      is_template: false,
      parent_id: null,
      skipped_dates: null,
      rollover_source_id: t.id,
      completion_note: null,
      completed_at: null,
      created_at: now,
      updated_at: now
    }));
    db2.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db2, nt);
    })();
    return newTasks;
  },
  autoRolloverOverdue(toDate) {
    const db2 = getDb();
    const tasks = getAllTasks();
    const newTasks = autoRolloverOverdue(tasks, toDate);
    if (newTasks.length === 0) return [];
    db2.transaction(() => {
      for (const nt of newTasks) insertTaskRow(db2, nt);
    })();
    return newTasks;
  },
  // ── 습관 트래커 ───────────────────────────────────────────
  getHabitMatrix(fromDate, toDate) {
    ensureRepeatInstancesForRange(fromDate, toDate);
    const db2 = getDb();
    const templates = db2.prepare(
      `SELECT * FROM tasks
         WHERE is_template = 1 AND is_habit = 1 AND repeat_type != 'none'`
    ).all().map(rowToTask);
    const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    return templates.map((tmpl) => {
      const instances = db2.prepare(
        `SELECT * FROM tasks
           WHERE is_template = 0 AND parent_id = ?
             AND date >= ? AND date <= ?`
      ).all(tmpl.id, fromDate, toDate).map(rowToTask);
      const byDate = {};
      for (const inst of instances) {
        byDate[inst.date] = {
          id: inst.id,
          is_completed: !!inst.is_completed,
          completed_at: inst.completed_at || null,
          completion_note: inst.completion_note || null
        };
      }
      const skipped = new Set(tmpl.skipped_dates || []);
      const days = [];
      for (const date of dateRange(fromDate, toDate)) {
        const expected = shouldRepeatOnDate(tmpl, date) || tmpl.date === date;
        let status;
        if (skipped.has(date)) status = "skip";
        else if (!expected) status = "off";
        else if (byDate[date]?.is_completed) status = "done";
        else if (date > todayStr) status = "future";
        else if (date === todayStr) status = "today";
        else status = "miss";
        days.push({ date, status, instance: byDate[date] || null });
      }
      return {
        template: {
          id: tmpl.id,
          title: tmpl.title,
          color: tmpl.color || null,
          category: tmpl.category || null,
          repeat_type: tmpl.repeat_type,
          repeat_days: tmpl.repeat_days || null,
          start_date: tmpl.date
        },
        days
      };
    });
  },
  toggleHabitOnDate(templateId, date) {
    const db2 = getDb();
    const tmplRow = db2.prepare(`SELECT * FROM tasks WHERE id = ? AND is_template = 1`).get(templateId);
    if (!tmplRow) return null;
    const tmpl = rowToTask(tmplRow);
    const instRow = db2.prepare(
      `SELECT * FROM tasks WHERE parent_id = ? AND date = ? AND is_template = 0`
    ).get(templateId, date);
    if (!instRow) {
      const now2 = nowIso();
      const inst2 = {
        id: generateId(),
        title: tmpl.title,
        memo: tmpl.memo,
        date,
        end_date: null,
        is_completed: true,
        is_in_progress: false,
        is_starred: false,
        repeat_type: tmpl.repeat_type,
        repeat_days: null,
        order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null,
        category: tmpl.category || null,
        is_habit: true,
        start_time: null,
        end_time: null,
        is_template: false,
        parent_id: templateId,
        skipped_dates: null,
        rollover_source_id: null,
        completion_note: null,
        completed_at: now2,
        created_at: now2,
        updated_at: now2
      };
      insertTaskRow(db2, inst2);
      return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(inst2.id));
    }
    const inst = rowToTask(instRow);
    const now = nowIso();
    const newCompleted = !inst.is_completed;
    db2.prepare(
      `UPDATE tasks SET is_completed = ?, completed_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(newCompleted ? 1 : 0, newCompleted ? now : null, now, inst.id);
    return rowToTask(db2.prepare("SELECT * FROM tasks WHERE id=?").get(inst.id));
  },
  // ── Categories ───────────────────────────────────────────
  getCategories() {
    const db2 = getDb();
    const rows = db2.prepare("SELECT id, label, color FROM categories").all();
    if (rows.length > 0) return rows;
    const setting = db2.prepare("SELECT value FROM settings WHERE key='categories'").get();
    if (!setting) return [];
    try {
      const parsed = JSON.parse(setting.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  setCategories(categories) {
    const db2 = getDb();
    db2.transaction(() => {
      db2.prepare("DELETE FROM categories").run();
      const stmt = db2.prepare("INSERT INTO categories (id, label, color) VALUES (?, ?, ?)");
      for (const c of categories) stmt.run(c.id, c.label, c.color || null);
    })();
  },
  // ── 설정 (key/value) ─────────────────────────────────────
  getSetting(key) {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return void 0;
    const raw = row.value;
    if (raw === null || raw === void 0) return raw;
    const first = raw.charAt(0);
    if (first === "{" || first === "[") {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  },
  setSetting(key, value) {
    const db2 = getDb();
    const stored = typeof value === "string" ? value : value === void 0 ? null : JSON.stringify(value);
    db2.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, stored);
  },
  // ── PDS: See 회고 ────────────────────────────────────────
  getSeeMemo(date) {
    const row = getDb().prepare("SELECT good, bad, next FROM see_memos WHERE date = ?").get(date);
    if (!row) return { good: "", bad: "", next: "" };
    return { good: row.good || "", bad: row.bad || "", next: row.next || "" };
  },
  setSeeMemo(date, obj) {
    const db2 = getDb();
    const good = obj && obj.good || "";
    const bad = obj && obj.bad || "";
    const next = obj && obj.next || "";
    db2.prepare(
      `INSERT OR REPLACE INTO see_memos (date, good, bad, next, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(date, good, bad, next, nowIso());
  },
  // ── PDS: Look Back ──────────────────────────────────────
  getMonthlyStats(months) {
    const db2 = getDb();
    const totalStmt = db2.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE date LIKE ? AND is_template = 0`
    );
    const doneStmt = db2.prepare(
      `SELECT count(*) as c FROM tasks
       WHERE date LIKE ? AND is_template = 0 AND is_completed = 1`
    );
    return months.map((ym) => {
      const pattern = `${ym}-%`;
      const total = totalStmt.get(pattern).c;
      const done = doneStmt.get(pattern).c;
      return { ym, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
    });
  },
  // ── PDS: Look Forward ───────────────────────────────────
  getMonthlyGoal(ym) {
    const row = getDb().prepare("SELECT text FROM monthly_goals WHERE ym = ?").get(ym);
    return row ? row.text || "" : "";
  },
  setMonthlyGoal(ym, text) {
    getDb().prepare(
      `INSERT OR REPLACE INTO monthly_goals (ym, text, updated_at)
         VALUES (?, ?, ?)`
    ).run(ym, text, nowIso());
  }
};
function loadEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return;
  const candidates = [];
  if (process.cwd()) candidates.push(path.join(process.cwd(), ".env"));
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, ".env"));
  if (electron.app?.getAppPath) {
    try {
      candidates.push(path.join(electron.app.getAppPath(), ".env"));
    } catch {
    }
  }
  if (electron.app?.getPath) {
    try {
      candidates.push(path.join(electron.app.getPath("userData"), ".env"));
    } catch {
    }
  }
  for (const path2 of candidates) {
    if (fs.existsSync(path2)) {
      dotenv.config({ path: path2 });
      break;
    }
  }
}
loadEnv();
const config = {
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ""
};
function assertConfigured() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.");
  }
}
function createFileBackedStorage({ dir, encrypt, decrypt }) {
  function resolveDir() {
    return typeof dir === "function" ? dir() : dir;
  }
  function pathFor(key) {
    return path.join(resolveDir(), encodeURIComponent(key) + ".bin");
  }
  function ensureDir() {
    const d = resolveDir();
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
  return {
    getItem(key) {
      const p = pathFor(key);
      if (!fs.existsSync(p)) return null;
      try {
        return decrypt(fs.readFileSync(p));
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      ensureDir();
      fs.writeFileSync(pathFor(key), encrypt(String(value)));
    },
    removeItem(key) {
      const p = pathFor(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  };
}
let _secureStorage = null;
function getSecureStorage() {
  if (_secureStorage) return _secureStorage;
  _secureStorage = createFileBackedStorage({
    dir: () => path.join(electron.app.getPath("userData"), "secure"),
    encrypt: (value) => {
      if (electron.safeStorage.isEncryptionAvailable()) {
        return electron.safeStorage.encryptString(value);
      }
      return Buffer.from(value, "utf8");
    },
    decrypt: (buffer) => {
      if (electron.safeStorage.isEncryptionAvailable()) {
        return electron.safeStorage.decryptString(buffer);
      }
      return buffer.toString("utf8");
    }
  });
  return _secureStorage;
}
function createSupabaseClient({ url, anonKey, storage }) {
  return supabaseJs.createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      // Electron에선 redirect URL이 브라우저가 아니라 main process의 deep link로 들어오므로,
      // supabase-js의 URL fragment 자동 파싱은 꺼두고 우리가 직접 code를 exchange한다.
      detectSessionInUrl: false,
      flowType: "pkce",
      storage
    },
    // Electron 29의 내장 Node는 20.x — native WebSocket이 없어서 SDK가 모듈 init 시 throw.
    // Realtime 자체는 안 쓰지만 import 시점에 초기화되므로 ws를 transport로 명시.
    realtime: {
      transport: WebSocket
    }
  });
}
let _client = null;
function getSupabaseClient() {
  if (_client) return _client;
  assertConfigured();
  _client = createSupabaseClient({
    url: config.supabaseUrl,
    anonKey: config.supabaseAnonKey,
    storage: getSecureStorage()
  });
  return _client;
}
const GOOGLE_SCOPES = "email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks";
const REDIRECT_URL = "app://orbit/auth/callback";
function createAuth({
  getClient = getSupabaseClient,
  openExternal = (url) => electron.shell.openExternal(url)
} = {}) {
  return {
    async signInWithGoogle() {
      const client = getClient();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: REDIRECT_URL,
          scopes: GOOGLE_SCOPES,
          queryParams: {
            access_type: "offline",
            prompt: "consent"
          },
          // Electron main에선 SDK가 직접 redirect할 화면이 없다. URL만 받아서 외부 브라우저로 연다.
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (!data?.url) throw new Error("OAuth URL not returned from Supabase");
      await openExternal(data.url);
      return { url: data.url };
    },
    async handleAuthCallback(callbackUrl) {
      const url = new URL(callbackUrl);
      const errorParam = url.searchParams.get("error_description") || url.searchParams.get("error");
      if (errorParam) throw new Error(`OAuth error: ${errorParam}`);
      const code = url.searchParams.get("code");
      if (!code) throw new Error("OAuth callback missing code parameter");
      const client = getClient();
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return data;
    },
    async getSession() {
      const client = getClient();
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async getUser() {
      const session = await this.getSession();
      return session?.user || null;
    },
    async signOut() {
      const client = getClient();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }
  };
}
let _auth = null;
function getAuth() {
  if (_auth) return _auth;
  _auth = createAuth();
  return _auth;
}
const AUTH_PROTOCOL_SCHEME = "app";
let mainWindow = null;
let stickerWindow = null;
let tray = null;
let reminderTimers = [];
function createMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: isDev ? "Orbit [DEV]" : "Orbit",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      spellcheck: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    if (utils.is.dev) mainWindow.webContents.openDevTools({ mode: "detach" });
  });
  mainWindow.on("close", (e) => {
    if (!electron.app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
function createStickerWindow() {
  const { width: sw, height: sh } = electron.screen.getPrimaryDisplay().workAreaSize;
  const saved = db.getSetting("stickerPosition");
  const rawX = saved?.x ?? sw - 300;
  const rawY = saved?.y ?? sh - 380;
  const x = Math.max(0, Math.min(rawX, sw - 280));
  const y = Math.max(0, Math.min(rawY, sh - 100));
  stickerWindow = new electron.BrowserWindow({
    width: 280,
    height: 360,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      spellcheck: false
    }
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    stickerWindow.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#sticker`);
  } else {
    stickerWindow.loadFile(path.join(__dirname, "../renderer/index.html"), { hash: "sticker" });
  }
  stickerWindow.on("moved", () => {
    const [x2, y2] = stickerWindow.getPosition();
    db.setSetting("stickerPosition", { x: x2, y: y2 });
  });
  stickerWindow.on("closed", () => {
    stickerWindow = null;
    updateTrayMenu();
  });
}
function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const contextMenu = electron.Menu.buildFromTemplate([
    { label: "메인 창 열기", click: () => {
      mainWindow?.show();
      mainWindow?.focus();
    } },
    {
      label: stickerWindow ? "스티커 숨기기" : "스티커 열기",
      click: async () => {
        if (stickerWindow) {
          stickerWindow.close();
        } else {
          const session = await getAuth().getSession().catch(() => null);
          if (!session) {
            mainWindow?.show();
            mainWindow?.focus();
            return;
          }
          createStickerWindow();
          updateTrayMenu();
        }
      }
    },
    { type: "separator" },
    { label: "종료", click: () => {
      electron.app.isQuitting = true;
      electron.app.quit();
    } }
  ]);
  tray.setContextMenu(contextMenu);
}
function createTray() {
  const iconPath = path.join(__dirname, "../../resources/icon.png");
  const icon = electron.nativeImage.createFromPath(iconPath);
  tray = new electron.Tray(icon);
  tray.setToolTip(isDev ? "Orbit [DEV]" : "Orbit");
  updateTrayMenu();
  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}
const DEFAULT_SHORTCUTS = {
  openMain: "Ctrl+Shift+T",
  toggleSticker: "Ctrl+Shift+S"
};
function toElectronKey(display) {
  return display.replace("Ctrl", "CommandOrControl");
}
function registerShortcuts() {
  electron.globalShortcut.unregisterAll();
  const saved = db.getSetting("shortcuts") || {};
  const shortcuts = { ...DEFAULT_SHORTCUTS, ...saved };
  try {
    electron.globalShortcut.register(toElectronKey(shortcuts.openMain), () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch {
  }
  try {
    electron.globalShortcut.register(toElectronKey(shortcuts.toggleSticker), () => {
      if (stickerWindow) {
        stickerWindow.close();
      } else {
        createStickerWindow();
      }
    });
  } catch {
  }
}
function scheduleReminders() {
  reminderTimers.forEach(clearTimeout);
  reminderTimers = [];
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const tasks = db.getTodayReminders(today);
  const now = /* @__PURE__ */ new Date();
  tasks.forEach((task) => {
    if (!task.remind_at) return;
    const [hours, minutes] = task.remind_at.split(":").map(Number);
    const reminderTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    const delay = reminderTime - now;
    if (delay <= 0) return;
    const timer = setTimeout(() => {
      mainWindow?.webContents.send("reminder:notify", { title: task.title, remind_at: task.remind_at });
    }, delay);
    reminderTimers.push(timer);
  });
}
function scheduleMidnightRefresh() {
  const now = /* @__PURE__ */ new Date();
  const msToMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  setTimeout(() => {
    scheduleReminders();
    scheduleMidnightRefresh();
  }, msToMidnight + 500);
}
function extractAuthCallbackUrl(argv) {
  if (!argv) return null;
  for (const arg of argv) {
    if (typeof arg === "string" && arg.startsWith(`${AUTH_PROTOCOL_SCHEME}://`) && arg.includes("/auth/callback")) {
      return arg;
    }
  }
  return null;
}
async function handleDeepLink(url) {
  if (!url) return;
  try {
    const result = await getAuth().handleAuthCallback(url);
    mainWindow?.webContents.send("auth:state-changed", { session: result?.session ?? null });
    mainWindow?.show();
    mainWindow?.focus();
    refreshUserWindows();
  } catch (e) {
    console.error("[auth] callback failed:", e);
    mainWindow?.webContents.send("auth:state-changed", { session: null, error: String(e?.message || e) });
  }
}
async function refreshUserWindows() {
  try {
    const session = await getAuth().getSession();
    if (session && !stickerWindow) {
      createStickerWindow();
    } else if (!session && stickerWindow) {
      stickerWindow.close();
    }
    updateTrayMenu();
  } catch (e) {
    console.error("[auth] refreshUserWindows failed:", e);
  }
}
if (process.defaultApp && process.argv.length >= 2) {
  electron.app.setAsDefaultProtocolClient(AUTH_PROTOCOL_SCHEME, process.execPath, [path.join(process.cwd(), process.argv[1])]);
} else {
  electron.app.setAsDefaultProtocolClient(AUTH_PROTOCOL_SCHEME);
}
const gotSingleInstanceLock = electron.app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", (_, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    const url = extractAuthCallbackUrl(argv);
    if (url) handleDeepLink(url);
  });
}
electron.app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});
electron.app.whenReady().then(() => {
  try {
    const userDataPath = electron.app.getPath("userData");
    const parentDir = userDataPath.split(/[/\\]/).slice(0, -1).join("/");
    const oldDir = `${parentDir}/todostick`;
    const result = migrateUserData({ oldDir, newDir: userDataPath });
    if (result.migrated) {
      console.log("[migration] todostick → orbit:", result.to);
    }
  } catch (e) {
    console.error("[migration] failed:", e);
  }
  utils.electronApp.setAppUserModelId(isDev ? "com.orbit.dev" : "com.orbit");
  if (isDev) {
    const seeded = db.seedIfEmpty();
    if (seeded) console.log("[DEV] 시드 데이터 생성됨 →", db.getDbPath());
  }
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createMainWindow();
  createTray();
  refreshUserWindows();
  registerShortcuts();
  scheduleReminders();
  scheduleMidnightRefresh();
  const initialUrl = extractAuthCallbackUrl(process.argv);
  if (initialUrl) {
    mainWindow?.webContents.once("did-finish-load", () => handleDeepLink(initialUrl));
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform === "darwin") electron.app.quit();
});
electron.app.on("will-quit", () => {
  electron.globalShortcut.unregisterAll();
});
electron.ipcMain.handle("tasks:getByDate", (_, date) => db.getTasksByDate(date));
electron.ipcMain.handle("tasks:getByMonth", (_, year, month) => db.getTasksByMonth(year, month));
electron.ipcMain.handle("tasks:getByWeek", (_, startDate, endDate) => db.getTasksByRange(startDate, endDate));
electron.ipcMain.handle("tasks:create", (_, task) => {
  const result = db.createTask(task);
  if (task.remind_at) scheduleReminders();
  return result;
});
electron.ipcMain.handle("tasks:update", (_, id, fields) => {
  const result = db.updateTask(id, fields);
  if (fields.remind_at !== void 0) scheduleReminders();
  return result;
});
electron.ipcMain.handle("tasks:delete", (_, id) => db.deleteTask(id));
electron.ipcMain.handle("tasks:toggle", (_, id, note) => db.toggleTask(id, note));
electron.ipcMain.handle("tasks:setInProgress", (_, id, value) => db.setInProgress(id, value));
electron.ipcMain.handle("tasks:setStarred", (_, id, value) => db.setStarred(id, value));
electron.ipcMain.handle("tasks:autoRolloverOverdue", (_, toDate) => {
  const result = db.autoRolloverOverdue(toDate);
  if (result.length > 0) {
    mainWindow?.webContents.send("tasks:refresh");
    stickerWindow?.webContents.send("tasks:refresh");
  }
  return result;
});
electron.ipcMain.handle("tasks:getOverdue", (_, date) => db.getOverdueTasks(date));
electron.ipcMain.handle("tasks:rollover", (_, toDate) => {
  const result = db.rolloverTasks(toDate);
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
  return result;
});
electron.ipcMain.handle("tasks:rolloverSelected", (_, taskIds, toDate) => {
  const result = db.rolloverSelectedTasks(taskIds, toDate);
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
  return result;
});
electron.ipcMain.handle("tasks:reorder", (_, date, orderedIds) => db.reorderTasks(date, orderedIds));
electron.ipcMain.handle("tasks:deleteAndFuture", (_, id, fromDate) => db.deleteTaskAndFuture(id, fromDate));
electron.ipcMain.handle("tasks:getCompleted", (_, filters) => db.getCompletedTasks(filters));
electron.ipcMain.handle("categories:get", () => db.getCategories());
electron.ipcMain.handle("categories:set", (_, categories) => db.setCategories(categories));
electron.ipcMain.handle("tasks:getPool", (_, poolKey) => db.getPoolTasks(poolKey));
electron.ipcMain.handle("memo:get", () => db.getSetting("memo") || "");
electron.ipcMain.handle("memo:set", (_, text) => {
  db.setSetting("memo", text);
  return true;
});
electron.ipcMain.handle("reminder:test", () => {
  mainWindow?.webContents.send("reminder:notify", { title: "테스트 알림 🎉", remind_at: "지금" });
});
electron.ipcMain.on("tasks:changed", () => {
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
});
electron.ipcMain.on("window:startDrag", (event) => {
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  if (win) win.setMovable(true);
});
electron.ipcMain.on("window:openMain", () => {
  mainWindow?.show();
  mainWindow?.focus();
});
electron.ipcMain.on("window:close", (event) => {
  electron.BrowserWindow.fromWebContents(event.sender)?.close();
});
electron.ipcMain.handle("shortcuts:get", () => {
  const saved = db.getSetting("shortcuts") || {};
  return { ...DEFAULT_SHORTCUTS, ...saved };
});
electron.ipcMain.handle("shortcuts:set", (_, shortcuts) => {
  db.setSetting("shortcuts", shortcuts);
  registerShortcuts();
  return true;
});
electron.ipcMain.handle("see:get", (_, date) => db.getSeeMemo(date));
electron.ipcMain.handle("see:set", (_, date, text) => {
  db.setSeeMemo(date, text);
  return true;
});
electron.ipcMain.handle("review:getStats", (_, months) => db.getMonthlyStats(months));
electron.ipcMain.handle("review:getGoal", (_, ym) => db.getMonthlyGoal(ym));
electron.ipcMain.handle("review:setGoal", (_, ym, text) => {
  db.setMonthlyGoal(ym, text);
  return true;
});
electron.ipcMain.handle("env:info", () => ({ isDev, dbPath: db.getDbPath() }));
electron.ipcMain.handle("habits:getMatrix", (_, fromDate, toDate) => db.getHabitMatrix(fromDate, toDate));
electron.ipcMain.handle("habits:toggle", (_, templateId, date) => {
  const result = db.toggleHabitOnDate(templateId, date);
  mainWindow?.webContents.send("tasks:refresh");
  stickerWindow?.webContents.send("tasks:refresh");
  return result;
});
electron.ipcMain.on("window:setSize", (event, width, height) => {
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  if (win) win.setSize(width, height);
});
electron.ipcMain.on("window:setIgnoreMouseEvents", (event, ignore) => {
  const win = electron.BrowserWindow.fromWebContents(event.sender);
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
});
electron.ipcMain.handle("auth:signInWithGoogle", async () => {
  return await getAuth().signInWithGoogle();
});
electron.ipcMain.handle("auth:getSession", async () => {
  return await getAuth().getSession();
});
electron.ipcMain.handle("auth:getUser", async () => {
  return await getAuth().getUser();
});
electron.ipcMain.handle("auth:signOut", async () => {
  await getAuth().signOut();
  mainWindow?.webContents.send("auth:state-changed", { session: null });
  refreshUserWindows();
  return true;
});
