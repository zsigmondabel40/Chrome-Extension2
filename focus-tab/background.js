'use strict';

const IDLE_TIMER = { phase: 'focus', status: 'idle', endsAt: 0, remainingMs: 0 };
const DEFAULT_SETTINGS = { focusMin: 25, breakMin: 5 };

function notify(title, message) {
  chrome.notifications.create(`focus-tab-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  });
}

// Timer finished: notify, then move to the next phase.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'timer') return;

  const data = await chrome.storage.local.get(['timer', 'settings']);
  const timer = data.timer;
  if (!timer || timer.status !== 'running') return;
  if (Date.now() < timer.endsAt - 1000) return; // stale alarm

  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

  if (timer.phase === 'focus') {
    const breakMs = settings.breakMin * 60000;
    const endsAt = Date.now() + breakMs;
    await chrome.storage.local.set({
      timer: { phase: 'break', status: 'running', endsAt, remainingMs: 0 },
    });
    await chrome.alarms.create('timer', { when: endsAt });
    notify('Focus session complete', `Take a ${settings.breakMin}-minute break.`);
  } else {
    await chrome.storage.local.set({ timer: { ...IDLE_TIMER } });
    notify('Break is over', 'Ready for the next focus session?');
  }
});

async function openDashboard() {
  try {
    await chrome.tabs.create({});
  } catch (err) {
    // No window open yet (for example Chrome running in the background).
    await chrome.windows.create({});
  }
}

// Every time Chrome starts: reset the timer and make sure the dashboard is open.
chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.clear('timer');
  await chrome.storage.local.set({ timer: { ...IDLE_TIMER } });

  // Give Chrome a moment to restore the previous session's tabs.
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const dashboardUrl = chrome.runtime.getURL('newtab.html');
  const tabs = await chrome.tabs.query({});
  const hasDashboard = tabs.some((tab) =>
    [tab.url, tab.pendingUrl].some(
      (url) => url && (url.startsWith('chrome://newtab') || url.startsWith(dashboardUrl))
    )
  );
  if (!hasDashboard) await openDashboard();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') await openDashboard();
});
