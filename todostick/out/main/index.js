"use strict";
const electron = require("electron");
const utils = require("@electron-toolkit/utils");
const path = require("path");
const fs = require("fs");
if (utils.is.dev) {
  const devUserData = path.join(electron.app.getPath("appData"), "todostick-dev");
  electron.app.setPath("userData", devUserData);
  console.log("[DEV] userData →", devUserData);
}
const isDev = utils.is.dev;
function dbPath() {
  return path.join(electron.app.getPath("userData"), "todostick.json");
}
function read() {
  try {
    const path2 = dbPath();
    if (!fs.existsSync(path2)) return { tasks: [], settings: {} };
    const data = JSON.parse(fs.readFileSync(path2, "utf-8"));
    if (!data.settings) data.settings = {};
    for (const t of data.tasks) {
      if (t.is_habit === void 0) t.is_habit = false;
      if (t.is_in_progress === void 0) t.is_in_progress = false;
      if (t.is_starred === void 0) t.is_starred = false;
    }
    return data;
  } catch {
    return { tasks: [], settings: {} };
  }
}
function write(data) {
  fs.writeFileSync(dbPath(), JSON.stringify(data, null, 2), "utf-8");
}
function seedIfEmpty() {
  const path2 = dbPath();
  if (fs.existsSync(path2)) return false;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const seed = {
    tasks: [],
    settings: {
      categories: [
        { id: "work", label: "업무", color: "blue" },
        { id: "personal", label: "개인", color: "green" },
        { id: "health", label: "운동", color: "orange" }
      ]
    }
  };
  const mk = (overrides) => ({
    id: generateId(),
    title: "",
    memo: "",
    date: today,
    is_completed: false,
    repeat_type: "none",
    order_index: 0,
    remind_at: null,
    color: null,
    category: null,
    is_habit: false,
    start_time: null,
    end_time: null,
    is_template: false,
    parent_id: null,
    completion_note: null,
    completed_at: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString(),
    ...overrides
  });
  seed.tasks.push(mk({ title: "🧪 [DEV] 회의 준비", category: "work", color: "blue", start_time: "10:00", end_time: "11:00", order_index: 0 }));
  seed.tasks.push(mk({ title: "🧪 [DEV] 점심 약속", category: "personal", color: "green", start_time: "12:30", end_time: "13:30", order_index: 1 }));
  seed.tasks.push(mk({ title: "🧪 [DEV] 코드 리뷰", category: "work", color: "blue", order_index: 2 }));
  seed.tasks.push(mk({ title: "🧪 [DEV] 어제 못 끝낸 일", date: yesterday, order_index: 99 }));
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
  seed.tasks.push(stretchT);
  for (let i = 7; i >= 1; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    if (i % 3 === 0) continue;
    seed.tasks.push(mk({
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
  seed.tasks.push(waterT);
  const meetingT = mk({
    title: "🧪 [DEV] 주간 팀 미팅",
    date: lastWeek,
    repeat_type: "weekly",
    is_template: true,
    color: "purple",
    category: "work",
    skipped_dates: []
  });
  seed.tasks.push(meetingT);
  fs.writeFileSync(path2, JSON.stringify(seed, null, 2), "utf-8");
  return true;
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
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
function generateRepeatInstances(data, date) {
  const templates = data.tasks.filter((t) => t.is_template && t.repeat_type !== "none");
  let changed = false;
  for (const tmpl of templates) {
    if (!shouldRepeatOnDate(tmpl, date)) continue;
    const exists = data.tasks.some((t) => t.parent_id === tmpl.id && t.date === date);
    if (!exists) {
      data.tasks.push({
        id: generateId(),
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
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      });
      changed = true;
    }
  }
  return changed;
}
function dateRange(startDate, endDate) {
  const dates = [];
  const cur = /* @__PURE__ */ new Date(startDate + "T00:00:00");
  const end = /* @__PURE__ */ new Date(endDate + "T00:00:00");
  while (cur <= end) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
const db = {
  seedIfEmpty,
  getDbPath: () => dbPath(),
  getTasksByDate(date) {
    const data = read();
    const changed = generateRepeatInstances(data, date);
    if (changed) write(data);
    return data.tasks.filter((t) => !t.is_template && (t.date === date || t.end_date && t.date <= date && date <= t.end_date)).sort((a, b) => {
      const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
      if (star) return star;
      return a.order_index - b.order_index || a.created_at.localeCompare(b.created_at);
    });
  },
  getTasksByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = `${prefix}-01`;
    const endDate = `${prefix}-${String(daysInMonth).padStart(2, "0")}`;
    const data = read();
    let changed = false;
    for (const date of dateRange(startDate, endDate)) {
      if (generateRepeatInstances(data, date)) changed = true;
    }
    if (changed) write(data);
    return data.tasks.filter((t) => !t.is_template && (t.date.startsWith(prefix) || t.end_date && t.date <= endDate && t.end_date >= startDate)).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
      if (star) return star;
      return a.order_index - b.order_index;
    });
  },
  getTasksByRange(startDate, endDate) {
    const data = read();
    let changed = false;
    for (const date of dateRange(startDate, endDate)) {
      if (generateRepeatInstances(data, date)) changed = true;
    }
    if (changed) write(data);
    return data.tasks.filter((t) => !t.is_template && (t.date >= startDate && t.date <= endDate || t.end_date && t.date <= endDate && t.end_date >= startDate)).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const star = (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0);
      if (star) return star;
      return a.order_index - b.order_index;
    });
  },
  getOverdueTasks(date) {
    const { tasks } = read();
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const rolledSources = new Set(
      tasks.filter((t) => t.date === date && t.rollover_source_id).map((t) => t.rollover_source_id)
    );
    return tasks.filter(
      (t) => t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date && !rolledSources.has(t.id)
    );
  },
  getTodayReminders(date) {
    const { tasks } = read();
    return tasks.filter((t) => t.date === date && t.remind_at && !t.is_template);
  },
  createTask({ title, memo = "", date, end_date = null, repeat_type = "none", repeat_days = null, order_index = 0, remind_at = null, color = null, category = null, is_habit = false, start_time = null, end_time = null }) {
    const data = read();
    const habit = repeat_type !== "none" && !!is_habit;
    const isPoolKey = typeof date === "string" && (date.startsWith("M:") || date.startsWith("W:"));
    const resolvedEndDate = repeat_type === "none" && !isPoolKey && end_date && end_date > date ? end_date : null;
    if (repeat_type === "none") {
      const task = {
        id: generateId(),
        title,
        memo,
        date,
        end_date: resolvedEndDate,
        is_completed: false,
        repeat_type,
        order_index,
        remind_at,
        color,
        category,
        is_habit: false,
        start_time,
        end_time,
        is_template: false,
        parent_id: null,
        completion_note: null,
        completed_at: null,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      data.tasks.push(task);
      write(data);
      return task;
    }
    const templateId = generateId();
    const resolvedRepeatDays = repeat_type === "daily" && repeat_days && repeat_days.length < 7 ? repeat_days : null;
    const template = {
      id: templateId,
      title,
      memo,
      date,
      is_completed: false,
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
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    const instance = {
      id: generateId(),
      title,
      memo,
      date,
      is_completed: false,
      repeat_type,
      order_index,
      remind_at,
      color,
      category,
      is_habit: habit,
      start_time,
      end_time,
      is_template: false,
      parent_id: templateId,
      completion_note: null,
      completed_at: null,
      created_at: (/* @__PURE__ */ new Date()).toISOString(),
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    data.tasks.push(template, instance);
    write(data);
    return instance;
  },
  updateTask(id, fields) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, fields, { updated_at: (/* @__PURE__ */ new Date()).toISOString() });
    if (Object.prototype.hasOwnProperty.call(fields, "is_habit")) {
      const templateId = task.is_template ? task.id : task.parent_id;
      if (templateId) {
        const now = (/* @__PURE__ */ new Date()).toISOString();
        for (const t of data.tasks) {
          if (t.id === templateId || t.parent_id === templateId) {
            t.is_habit = !!fields.is_habit;
            t.updated_at = now;
          }
        }
      }
    }
    write(data);
    return task;
  },
  toggleTask(id, completionNote = null) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.is_completed = !task.is_completed;
    task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    if (task.is_completed) {
      task.completed_at = (/* @__PURE__ */ new Date()).toISOString();
      task.completion_note = completionNote || null;
      task.is_in_progress = false;
    } else {
      task.completed_at = null;
      task.completion_note = null;
    }
    write(data);
    return task;
  },
  setInProgress(id, value) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.is_in_progress = !!value;
    if (task.is_in_progress) task.is_completed = false;
    task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    write(data);
    return task;
  },
  setStarred(id, value) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return null;
    task.is_starred = !!value;
    task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    write(data);
    return task;
  },
  getCompletedTasks({ category, search } = {}) {
    const { tasks } = read();
    return tasks.filter((t) => {
      if (!t.is_completed || t.is_template) return false;
      if (category && t.category !== category) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !(t.completion_note || "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at));
  },
  deleteTask(id) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (task && task.parent_id) {
      const template = data.tasks.find((t) => t.id === task.parent_id);
      if (template) {
        if (!template.skipped_dates) template.skipped_dates = [];
        template.skipped_dates.push(task.date);
      }
    }
    data.tasks = data.tasks.filter((t) => t.id !== id);
    write(data);
    return { id };
  },
  deleteTaskAndFuture(id, fromDate) {
    const data = read();
    const task = data.tasks.find((t) => t.id === id);
    if (!task) return { id };
    const templateId = task.is_template ? task.id : task.parent_id || null;
    if (templateId) {
      data.tasks = data.tasks.filter((t) => {
        if (t.id === templateId) return false;
        if (t.parent_id === templateId && t.date >= fromDate) return false;
        return true;
      });
    } else {
      data.tasks = data.tasks.filter((t) => t.id !== id);
    }
    write(data);
    return { id };
  },
  reorderTasks(date, orderedIds) {
    const data = read();
    orderedIds.forEach((id, index) => {
      const task = data.tasks.find((t) => t.id === id);
      if (task) {
        task.order_index = index;
        task.updated_at = (/* @__PURE__ */ new Date()).toISOString();
      }
    });
    write(data);
    return true;
  },
  rolloverTasks(toDate) {
    const data = read();
    const d = new Date(toDate);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const overdue = data.tasks.filter((t) => t.date === yesterday && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date);
    const existingSources = new Set(
      data.tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
    );
    const toCopy = overdue.filter((t) => !existingSources.has(t.id));
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
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
    data.tasks.push(...newTasks);
    write(data);
    return newTasks;
  },
  rolloverSelectedTasks(taskIds, toDate) {
    const data = read();
    const idSet = new Set(taskIds);
    const selected = data.tasks.filter((t) => idSet.has(t.id) && !t.end_date);
    const existingSources = new Set(
      data.tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
    );
    const toCopy = selected.filter((t) => !existingSources.has(t.id));
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
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
    data.tasks.push(...newTasks);
    write(data);
    return newTasks;
  },
  autoRolloverInProgress(toDate) {
    const data = read();
    const d = new Date(toDate);
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const candidates = data.tasks.filter(
      (t) => t.date === yesterday && t.is_in_progress && !t.is_completed && !t.is_template && !t.parent_id && !t.end_date
    );
    if (candidates.length === 0) return [];
    const existingSources = new Set(
      data.tasks.filter((t) => t.date === toDate && t.rollover_source_id).map((t) => t.rollover_source_id)
    );
    const toCopy = candidates.filter((t) => !existingSources.has(t.id));
    if (toCopy.length === 0) return [];
    const maxOrder = data.tasks.filter((t) => t.date === toDate).length;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const newTasks = toCopy.map((t, i) => ({
      id: generateId(),
      title: t.title,
      memo: t.memo,
      date: toDate,
      is_completed: false,
      is_in_progress: true,
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
    data.tasks.push(...newTasks);
    write(data);
    return newTasks;
  },
  // ── 습관 트래커 ─────────────────────────────────────────
  getHabitMatrix(fromDate, toDate) {
    const data = read();
    let changed = false;
    for (const date of dateRange(fromDate, toDate)) {
      if (generateRepeatInstances(data, date)) changed = true;
    }
    if (changed) write(data);
    const templates = data.tasks.filter((t) => t.is_template && t.is_habit && t.repeat_type !== "none");
    return templates.map((tmpl) => {
      const instances = data.tasks.filter(
        (t) => !t.is_template && t.parent_id === tmpl.id && t.date >= fromDate && t.date <= toDate
      );
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
        else if (date > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) status = "future";
        else if (date === (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) status = "today";
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
    const data = read();
    const tmpl = data.tasks.find((t) => t.id === templateId && t.is_template);
    if (!tmpl) return null;
    let inst = data.tasks.find((t) => t.parent_id === templateId && t.date === date && !t.is_template);
    if (!inst) {
      inst = {
        id: generateId(),
        title: tmpl.title,
        memo: tmpl.memo,
        date,
        is_completed: true,
        repeat_type: tmpl.repeat_type,
        order_index: tmpl.order_index,
        remind_at: tmpl.remind_at || null,
        color: tmpl.color || null,
        category: tmpl.category || null,
        is_habit: true,
        parent_id: templateId,
        is_template: false,
        completion_note: null,
        completed_at: (/* @__PURE__ */ new Date()).toISOString(),
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      data.tasks.push(inst);
    } else {
      inst.is_completed = !inst.is_completed;
      inst.completed_at = inst.is_completed ? (/* @__PURE__ */ new Date()).toISOString() : null;
      inst.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    }
    write(data);
    return inst;
  },
  // ── 플래너 풀 (M:YYYY-MM, W:YYYY-MM-DD 형식) ───────────
  getPoolTasks(poolKey) {
    const { tasks } = read();
    return tasks.filter((t) => t.date === poolKey && !t.is_template).sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at));
  },
  // ── Categories ─────────────────────────────────────────
  getCategories() {
    const { settings } = read();
    return settings.categories || [];
  },
  setCategories(categories) {
    const data = read();
    data.settings.categories = categories;
    write(data);
  },
  getSetting(key) {
    const { settings } = read();
    return settings[key];
  },
  setSetting(key, value) {
    const data = read();
    data.settings[key] = value;
    write(data);
  },
  // ── PDS: See 회고 (날짜별) ─────────────────────────────
  getSeeMemo(date) {
    const { settings } = read();
    const raw = settings[`see:${date}`];
    if (!raw) return { good: "", bad: "", next: "" };
    if (typeof raw === "string") return { good: raw, bad: "", next: "" };
    return raw;
  },
  setSeeMemo(date, obj) {
    const data = read();
    data.settings[`see:${date}`] = obj;
    write(data);
  },
  // ── PDS: Look Back 월별 통계 ──────────────────────────
  getMonthlyStats(months) {
    const { tasks } = read();
    return months.map((ym) => {
      const monthTasks = tasks.filter((t) => t.date.startsWith(ym) && !t.is_template);
      const total = monthTasks.length;
      const done = monthTasks.filter((t) => t.is_completed).length;
      return { ym, total, done, rate: total > 0 ? Math.round(done / total * 100) : 0 };
    });
  },
  // ── PDS: Look Forward 월별 목표 ───────────────────────
  getMonthlyGoal(ym) {
    const { settings } = read();
    return settings[`goal:${ym}`] || "";
  },
  setMonthlyGoal(ym, text) {
    const data = read();
    data.settings[`goal:${ym}`] = text;
    write(data);
  }
};
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
    title: isDev ? "TodoStick [DEV]" : "TodoStick",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
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
      sandbox: false
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
  if (!tray) return;
  const contextMenu = electron.Menu.buildFromTemplate([
    { label: "메인 창 열기", click: () => {
      mainWindow?.show();
      mainWindow?.focus();
    } },
    {
      label: stickerWindow ? "스티커 숨기기" : "스티커 열기",
      click: () => {
        if (stickerWindow) {
          stickerWindow.close();
        } else {
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
  tray.setToolTip(isDev ? "TodoStick [DEV]" : "TodoStick");
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
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId(isDev ? "com.todostick.dev" : "com.todostick");
  if (isDev) {
    const seeded = db.seedIfEmpty();
    if (seeded) console.log("[DEV] 시드 데이터 생성됨 →", db.getDbPath());
  }
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createMainWindow();
  createStickerWindow();
  createTray();
  registerShortcuts();
  scheduleReminders();
  scheduleMidnightRefresh();
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
electron.ipcMain.handle("tasks:autoRolloverInProgress", (_, toDate) => {
  const result = db.autoRolloverInProgress(toDate);
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
