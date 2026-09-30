'use strict';

const DEFAULT_SETTINGS = { name: '', focusMin: 25, breakMin: 5, hour12: false };
const IDLE_TIMER = { phase: 'focus', status: 'idle', endsAt: 0, remainingMs: 0 };
const CAL_REFRESH_MS = 15 * 60 * 1000;

const $ = (selector) => document.querySelector(selector);

const state = {
  settings: { ...DEFAULT_SETTINGS },
  tasks: [],
  timer: { ...IDLE_TIMER },
  calConnected: false,
  calCache: null,
  calMessage: '',
  calMessageIsError: false,
};

let lastCalFetch = 0;

/* ---------- Storage ---------- */

const put = (values) => chrome.storage.local.set(values);

async function load() {
  const data = await chrome.storage.local.get([
    'settings', 'tasks', 'timer', 'calConnected', 'calCache',
  ]);
  state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  state.tasks = data.tasks || [];
  state.timer = data.timer || { ...IDLE_TIMER };
  state.calConnected = !!data.calConnected;
  state.calCache = data.calCache || null;
}

// Keep every open dashboard tab in sync.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key === 'settings') state.settings = { ...DEFAULT_SETTINGS, ...(newValue || {}) };
    else if (key === 'tasks') state.tasks = newValue || [];
    else if (key === 'timer') state.timer = newValue || { ...IDLE_TIMER };
    else if (key === 'calConnected') state.calConnected = !!newValue;
    else if (key === 'calCache') state.calCache = newValue || null;
  }
  renderAll();
});

/* ---------- Clock, greeting, sky ---------- */

function partOfDay(hour) {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

function renderClock() {
  const now = new Date();
  const hour = now.getHours();

  $('#clock').textContent = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: state.settings.hour12,
  });

  const part = partOfDay(hour);
  if (document.body.dataset.part !== part) document.body.dataset.part = part;

  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = state.settings.name.trim();
  $('#greeting').textContent = name ? `${salutation}, ${name}` : salutation;

  $('#cal-date').textContent = now.toLocaleDateString([], {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/* ---------- Tasks ---------- */

function saveTasks() {
  put({ tasks: state.tasks });
  renderTasks();
}

function addTask(text) {
  const clean = text.trim();
  if (!clean) return;
  state.tasks = [...state.tasks, { id: crypto.randomUUID(), text: clean, done: false }];
  saveTasks();
}

function toggleTask(id) {
  state.tasks = state.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  saveTasks();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  saveTasks();
}

function renderTasks() {
  const list = $('#task-list');
  list.replaceChildren();

  for (const task of state.tasks) {
    const item = document.createElement('li');
    item.className = `task${task.done ? ' done' : ''}`;

    const label = document.createElement('label');
    label.className = 'tick';

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = task.done;
    box.addEventListener('change', () => toggleTask(task.id));

    const mark = document.createElement('span');
    mark.className = 'tick-mark';
    mark.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;

    label.append(box, mark, text);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'task-delete';
    remove.textContent = '\u00d7';
    remove.setAttribute('aria-label', `Delete task: ${task.text}`);
    remove.addEventListener('click', () => deleteTask(task.id));

    item.append(label, remove);
    list.append(item);
  }

  const done = state.tasks.filter((t) => t.done).length;
  $('#task-count').textContent = state.tasks.length ? `${done} of ${state.tasks.length} done` : '';
  $('#task-empty').hidden = state.tasks.length > 0;
}

/* ---------- Focus timer ---------- */

function phaseMs(phase) {
  const minutes = phase === 'focus' ? state.settings.focusMin : state.settings.breakMin;
  return minutes * 60000;
}

function timerRemaining() {
  const t = state.timer;
  if (t.status === 'running') return Math.max(0, t.endsAt - Date.now());
  if (t.status === 'paused') return t.remainingMs;
  return phaseMs(t.phase);
}

function formatMs(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setTimer(timer) {
  state.timer = timer;
  put({ timer });
  renderTimer();
}

function startOrResume() {
  const t = state.timer;
  const duration = t.status === 'paused' ? t.remainingMs : phaseMs(t.phase);
  const endsAt = Date.now() + duration;
  setTimer({ phase: t.phase, status: 'running', endsAt, remainingMs: 0 });
  chrome.alarms.create('timer', { when: endsAt });
}

function pause() {
  const remainingMs = timerRemaining();
  chrome.alarms.clear('timer');
  setTimer({ phase: state.timer.phase, status: 'paused', endsAt: 0, remainingMs });
}

function reset() {
  chrome.alarms.clear('timer');
  setTimer({ ...IDLE_TIMER });
}

function renderTimer() {
  const t = state.timer;
  const remaining = timerRemaining();
  const display = formatMs(remaining);

  $('#timer-display').textContent = display;
  $('#timer-h').textContent = t.phase === 'focus' ? 'Focus' : 'Break';

  const total = phaseMs(t.phase);
  const progress = t.status === 'idle' ? 0 : 1 - remaining / total;
  $('#timer-progress').style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;

  $('#timer-toggle').textContent =
    t.status === 'running' ? 'Pause' : t.status === 'paused' ? 'Resume' : 'Start';
  $('#timer-reset').disabled = t.status === 'idle' && t.phase === 'focus';

  document.title = t.status === 'running' ? `${display} \u00b7 ${t.phase === 'focus' ? 'Focus' : 'Break'}` : 'New Tab';
}

/* ---------- Google Calendar ---------- */

function oauthConfigured() {
  const id = (chrome.runtime.getManifest().oauth2 || {}).client_id || '';
  return id !== '' && !id.startsWith('YOUR_CLIENT_ID');
}

async function getToken(interactive) {
  const result = await chrome.identity.getAuthToken({ interactive });
  return typeof result === 'string' ? result : result && result.token;
}

async function fetchTodayEvents(token) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.search = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  }).toString();

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    const error = new Error('auth');
    error.code = 'auth';
    throw error;
  }
  if (!response.ok) throw new Error(`Calendar request failed (${response.status})`);

  const body = await response.json();
  return (body.items || [])
    .filter((e) => e.status !== 'cancelled')
    .map((e) => ({
      id: e.id,
      title: e.summary || '(No title)',
      allDay: !!(e.start && e.start.date && !e.start.dateTime),
      start: (e.start && (e.start.dateTime || e.start.date)) || null,
      end: (e.end && (e.end.dateTime || e.end.date)) || null,
    }))
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start) - new Date(b.start);
    });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function setCalMessage(message, isError = false) {
  state.calMessage = message;
  state.calMessageIsError = isError;
}

async function refreshCalendar({ interactive = false } = {}) {
  if (!state.calConnected && !interactive) return;

  if (!oauthConfigured()) {
    setCalMessage(
      'Google sign-in is not set up yet. Add your OAuth client ID to manifest.json (see README).',
      true
    );
    renderCalendar();
    return;
  }

  if (!navigator.onLine) {
    setCalMessage("You're offline. Showing the last synced events.");
    renderCalendar();
    return;
  }

  try {
    let token = await getToken(interactive);
    if (!token) throw new Error('No token');

    let events;
    try {
      events = await fetchTodayEvents(token);
    } catch (err) {
      if (err.code !== 'auth') throw err;
      await chrome.identity.removeCachedAuthToken({ token });
      token = await getToken(interactive);
      if (!token) throw err;
      events = await fetchTodayEvents(token);
    }

    lastCalFetch = Date.now();
    setCalMessage('');
    state.calConnected = true;
    await put({
      calConnected: true,
      calCache: { day: todayKey(), fetchedAt: lastCalFetch, events },
    });
  } catch (err) {
    if (interactive) {
      setCalMessage('Could not connect to Google Calendar. Try again.', true);
    } else {
      setCalMessage('Could not refresh your calendar. Reconnect to try again.', true);
    }
  }
  renderCalendar();
}

async function disconnectCalendar() {
  try {
    const token = await getToken(false);
    if (token) {
      await chrome.identity.removeCachedAuthToken({ token });
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
    }
  } catch (err) {
    // Already signed out or offline: local state is cleared below either way.
  }
  state.calConnected = false;
  state.calCache = null;
  setCalMessage('');
  await put({ calConnected: false });
  await chrome.storage.local.remove('calCache');
  renderAll();
}

function formatEventTime(event) {
  if (event.allDay) return 'All day';
  const options = { hour: '2-digit', minute: '2-digit', hour12: state.settings.hour12 };
  const start = new Date(event.start).toLocaleTimeString([], options);
  const end = event.end ? new Date(event.end).toLocaleTimeString([], options) : '';
  return end ? `${start}\u2013${end}` : start;
}

function renderCalendar() {
  const list = $('#cal-list');
  const status = $('#cal-status');
  const connectBox = $('#cal-connect');
  const empty = $('#cal-empty');

  list.replaceChildren();
  status.hidden = !state.calMessage;
  status.textContent = state.calMessage;
  status.classList.toggle('error', state.calMessageIsError);

  const cache = state.calCache && state.calCache.day === todayKey() ? state.calCache : null;
  const showEvents = state.calConnected && cache;

  connectBox.hidden = state.calConnected && !state.calMessageIsError;
  if (state.calConnected && state.calMessageIsError) {
    connectBox.querySelector('p').textContent = 'Sign in again to see today\u2019s events.';
    $('#cal-connect-btn').textContent = 'Reconnect Google Calendar';
  } else {
    connectBox.querySelector('p').textContent = 'See today\u2019s events next to your tasks.';
    $('#cal-connect-btn').textContent = 'Connect Google Calendar';
  }

  if (!showEvents) {
    empty.hidden = true;
    $('#cal-disconnect').hidden = !state.calConnected;
    return;
  }

  const now = Date.now();
  for (const event of cache.events) {
    const item = document.createElement('li');
    item.className = 'event';

    if (!event.allDay) {
      const startMs = new Date(event.start).getTime();
      const endMs = event.end ? new Date(event.end).getTime() : startMs;
      if (endMs < now) item.classList.add('past');
      else if (startMs <= now) item.classList.add('now');
    }

    const time = document.createElement('span');
    time.className = 'event-time';
    time.textContent = formatEventTime(event);

    const title = document.createElement('span');
    title.className = 'event-title';
    title.textContent = event.title;

    item.append(time, title);
    list.append(item);
  }

  empty.hidden = cache.events.length > 0;
  $('#cal-disconnect').hidden = false;
}

/* ---------- Settings ---------- */

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function saveSettings() {
  const next = {
    name: $('#set-name').value.slice(0, 40),
    focusMin: clampInt($('#set-focus').value, 1, 180, state.settings.focusMin),
    breakMin: clampInt($('#set-break').value, 1, 60, state.settings.breakMin),
    hour12: $('#set-12h').checked,
  };
  state.settings = next;
  put({ settings: next });
  renderAll();
}

function openSettings() {
  $('#set-name').value = state.settings.name;
  $('#set-focus').value = state.settings.focusMin;
  $('#set-break').value = state.settings.breakMin;
  $('#set-12h').checked = state.settings.hour12;
  $('#cal-disconnect').hidden = !state.calConnected;
  $('#settings').showModal();
}

async function deleteAllData() {
  if (!confirm('Delete all tasks, settings, and calendar data from this device?')) return;
  await disconnectCalendar();
  await chrome.alarms.clearAll();
  await chrome.storage.local.clear();
  state.settings = { ...DEFAULT_SETTINGS };
  state.tasks = [];
  state.timer = { ...IDLE_TIMER };
  state.calCache = null;
  setCalMessage('');
  $('#settings').close();
  renderAll();
}

/* ---------- Wiring ---------- */

function renderAll() {
  renderClock();
  renderTasks();
  renderTimer();
  renderCalendar();
}

function bindEvents() {
  $('#task-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = $('#task-input');
    addTask(input.value);
    input.value = '';
    input.focus();
  });

  $('#timer-toggle').addEventListener('click', () => {
    if (state.timer.status === 'running') pause();
    else startOrResume();
  });
  $('#timer-reset').addEventListener('click', reset);

  $('#cal-connect-btn').addEventListener('click', () => refreshCalendar({ interactive: true }));
  $('#cal-disconnect').addEventListener('click', async () => {
    await disconnectCalendar();
  });

  $('#settings-open').addEventListener('click', openSettings);
  for (const id of ['#set-name', '#set-focus', '#set-break', '#set-12h']) {
    $(id).addEventListener('change', saveSettings);
  }
  $('#delete-all').addEventListener('click', deleteAllData);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastCalFetch > CAL_REFRESH_MS) refreshCalendar();
  });
}

async function init() {
  await load();
  bindEvents();
  renderAll();

  // Show the cached events instantly, then refresh from Google.
  refreshCalendar();
  setInterval(() => refreshCalendar(), CAL_REFRESH_MS);

  let lastMinute = -1;
  setInterval(() => {
    renderClock();
    renderTimer();
    const minute = new Date().getMinutes();
    if (minute !== lastMinute) {
      lastMinute = minute;
      renderCalendar(); // moves events between upcoming, now, and past
    }
  }, 250);
}

init();
