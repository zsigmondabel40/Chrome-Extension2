# PM Document: Momentum-Style Focus Extension for Chrome

Sep 30, 2026

## What I want to build

A Chrome extension in the style of Momentum that turns the new tab page into a focus dashboard with a to-do list, today's Google Calendar events, and a focus timer. It must work every time Chrome is opened.

**Core features**

- **To-do list with ticks:** the user adds tasks and ticks them off when done. Ticked tasks stay visible but look different.
- **Google Calendar connection:** the user signs in with their Google account, and today's events appear on the dashboard next to the to-do list.
- **Focus timer:** a Pomodoro-style timer (default 25 minutes focus, 5 minutes break) with start, pause, and reset.

**Availability**

The dashboard appears when Chrome starts and on every new tab. It keeps working after restarts and updates without any manual setup. Chrome's "On startup" setting can override an extension's new tab page, so the extension opens the dashboard itself at startup.

**Supporting elements**

Kept minimal, as in Momentum: a clock with a greeting, a background image, and a simple settings panel.

## Acceptance criteria

The extension is done when every criterion below can be checked and passes on the latest stable Chrome.

### To-do list

- The user can add a task, tick it as complete, untick it, and delete it.
- Ticked tasks are visually distinct (for example, struck through).
- Tasks persist after closing and reopening Chrome.

### Google Calendar

- The user can connect their Google account with one click (OAuth) and disconnect at any time.
- After connecting, today's events show title and start/end time, sorted by time.
- The event list refreshes when the dashboard opens and at least every 15 minutes.
- If the user is offline or not connected, the dashboard shows a clear message, and the to-do list and timer keep working.
- The extension requests read-only calendar access.

### Focus timer

- The user can start, pause, and reset the timer, and set the focus and break lengths.
- The timer keeps running when the user switches tabs or opens a new tab, and shows the same remaining time on every dashboard tab.
- When time is up, the user gets a notification and the timer switches to the break.
- If Chrome is closed, the timer stops and does not restart on its own after Chrome reopens.

### Works every time Chrome opens

- When Chrome starts, the dashboard opens automatically, and it opens on every new tab.
- After closing and reopening Chrome 10 times in a row, the extension loads correctly each time with all saved data intact.
- The dashboard loads in under 1 second, excluding calendar data, which may load a moment later.
- The extension needs no manual re-activation after Chrome or extension updates.

### Privacy and quality

- Tasks and settings are stored locally on the device, and the only data fetched from outside is the calendar.
- The extension requests only the permissions it needs: storage, notifications, alarms, and read-only calendar access through identity.
- The user can delete all stored data from settings.
- The extension is built on Manifest V3 and displays correctly on common laptop resolutions.
