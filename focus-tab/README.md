# Focus Tab

A Momentum-style new tab dashboard for Chrome: to-do list with ticks, today's Google Calendar events, and a focus timer. Built on Manifest V3.

## 1. Load the extension

1. Unzip the folder and keep it somewhere permanent.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and select the `focus-tab` folder.

The to-do list and timer work right away. The extension ID is fixed by the `key` field in `manifest.json`:

```
pidilcikkefggphgibdddgjbhdcckpdo
```

## 2. Connect Google Calendar (one-time setup)

Google requires every app that reads calendars to have its own OAuth client. It is free.

1. Go to <https://console.cloud.google.com> and create a project.
2. **APIs & Services > Library**: enable **Google Calendar API**.
3. **APIs & Services > OAuth consent screen**: choose **External**, fill in the app name and your email, and add the scope `.../auth/calendar.readonly`. While the app is in Testing, add your own Google account under **Test users**.
4. **APIs & Services > Credentials > Create credentials > OAuth client ID**:
   - Application type: **Chrome extension**
   - Item ID: `pidilcikkefggphgibdddgjbhdcckpdo`
5. Copy the client ID and paste it into `manifest.json`, replacing `YOUR_CLIENT_ID.apps.googleusercontent.com`.
6. On `chrome://extensions`, click the reload icon on Focus Tab.
7. Open a new tab and click **Connect Google Calendar**.

The extension asks for read-only access and never writes to your calendar.

## How it behaves

- **Every time Chrome opens:** the dashboard is your new tab page. At startup the extension also opens a dashboard tab if Chrome's "On startup" setting would otherwise skip it.
- **Timer:** runs across all dashboard tabs and sends a notification when a session ends. It switches to the break automatically. If Chrome closes, the timer resets and does not restart on its own.
- **Calendar:** refreshes when you open a tab and every 15 minutes. If you are offline, the last synced events stay visible.
- **Data:** tasks and settings stay on your device (`chrome.storage.local`). Settings > **Delete all data** removes everything and revokes calendar access.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save tasks, settings, timer state |
| `alarms` | Fire the timer when time is up |
| `notifications` | Tell you when a session or break ends |
| `identity` | Google sign-in for the calendar |
| `tabs` | Check at startup whether a dashboard tab is already open |
| `googleapis.com` hosts | Read today's events |

## Files

- `manifest.json`: extension config and OAuth client ID
- `background.js`: timer alarms, notifications, startup behaviour
- `newtab.html`, `styles.css`, `newtab.js`: the dashboard

To publish on the Chrome Web Store, remove the `key` field first. The store assigns its own ID, and you then create a new OAuth client for that ID.
