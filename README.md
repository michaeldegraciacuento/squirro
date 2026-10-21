# Squirro

A Chrome extension for office work: notes with full-page screenshots, a
read-only view of your Google Calendar (with live status colors and
one-click open), and a task list with folders, priorities, and due dates.

## Features

### 📝 Notes
- Create, edit, and delete notes with autosave
- Organize notes into folders (click **📁+** to add one, **✎** to rename, **🗑️** to delete — its notes move to Uncategorized — and use the dropdown to filter)
- **Search** notes by text
- **Pin** notes to the top of the list (📌)
- Attach a **full-page screenshot** of the current tab to any note (📷 button) — captured at full resolution, no compression
- **Capture & crop** a screenshot (✂️) — opens a separate cropping window so you can select just the area you want
- **Copy** a note's screenshot straight to your clipboard (📋) to paste elsewhere
- **Export** a note as a `.txt` file (📤)
- Each note shows a "last edited" timestamp
- Blank notes (no text, no screenshot) are cleaned up automatically when you leave them

### 📅 Calendar
- A read-only view of your Google Calendar — no OAuth or Google Cloud setup, just paste your calendar's private iCal link
- Shows upcoming events for the next 2 weeks, including events still running from earlier, with start–end times and location
- **Recurring events** are expanded into each occurrence (daily/weekly/monthly/yearly rules, skipped dates, and individually moved instances)
- Event times respect the calendar's **time zone**, including daylight-saving changes
- **Click any event** (or its ↗ icon) to open it directly in Google Calendar in a new tab — deep-links to the exact event when possible, otherwise falls back to that day's view
- **Status colors**: an event's left border is **red** once it's finished, **green** while it's ongoing or still upcoming
- A **10-minutes-before** reminder card that slides in on top of whatever webpage you're currently viewing, plus a backup system notification, so you don't miss a meeting

### ⚡ Tasks
- Add tasks, check them off, delete them
- Organize into folders, same as Notes (add, rename, delete)
- Filter by **All / Active / Completed**
- Click a task to expand it: edit the title, add a short description, set a **due date**, and set a **priority** (low/medium/high, shown as a colored dot)
- Tasks with a due date show a due-date badge and sort earliest-first; overdue tasks are highlighted
- See when a task was last updated

### 🌙 Other
- Dark mode toggle (top bar)
- **Pop out** (⧉, next to the dark mode toggle) — opens Squirro in its own resizable window that stays open while you work. Only one pop-out window is kept; clicking ⧉ again just focuses it. Screenshots taken from the pop-out capture the active tab of your last-focused browser window.
- Changes sync live between the pop-out window and the toolbar popup (notes, tasks, folders, dark mode, calendar connection)
- Unsaved edits are flushed when you close the popup, so the last few keystrokes aren't lost

## How to load the extension locally

1. Unzip this folder somewhere permanent (don't delete it — Chrome loads the extension from this location every time it starts)
2. Go to `chrome://extensions`
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `squirro` folder
5. Click the extension icon in your toolbar to open it

Whenever you edit any file in this folder, go back to `chrome://extensions` and click the **reload (⟳)** icon on the extension's card to pick up the changes.

## How to connect your Google Calendar (iCal link)

This uses your calendar's private "secret address" instead of Google
sign-in — much simpler to set up, fully read-only.

1. Go to [calendar.google.com](https://calendar.google.com) in your browser
2. Click the **gear icon (⚙️) → Settings**
3. In the left sidebar, under **"Settings for my calendars,"** click the calendar you want to connect (usually your name / main calendar)
4. Scroll down to the **"Integrate calendar"** section
5. Copy the URL next to **"Secret address in iCal format"** — it looks like:
   ```
   https://calendar.google.com/calendar/ical/you%40gmail.com/private-xxxxxxxxxxxxx/basic.ics
   ```
6. Open the extension → **Calendar** tab → paste the link into the box → click **Connect**

Your events should appear right away. If it says "Could not connect,"
double check you copied the *entire* URL (they're long).

**Notes on this approach:**
- The link is a private key to your calendar — don't share it publicly. If you ever think it's been exposed, go back to the same Settings page and reset it (then reconnect in the extension with the new link).
- Google refreshes this feed every few hours, not instantly, so a just-created event may take a little while to show up.
- Recurring events are expanded for the common rule types. Rare rules (e.g. `BYSETPOS` like "last weekday of the month", or hourly repeats) may not expand exactly.
- Time zones are read from the feed's `TZID`s. Non-standard zone names (e.g. Outlook's "Pacific Standard Time") fall back to your local time.
- The "open in Google Calendar" link works by decoding your calendar ID out of the iCal URL and combining it with each event's ID — this only reliably targets Google Calendar events. If it can't build a precise link, it opens that day's view instead.

## Meeting reminders

Once a calendar is connected, a background process checks every minute
for meetings starting within the next 10 minutes. When one is found (and
hasn't already been flagged — each occurrence of a recurring meeting is
reminded separately), you'll get:
- A small animated card that **slides in on top of your current tab** (top-right corner), with the meeting name and a live countdown
- A Chrome/OS notification as a backup, in case the tab can't be reached (e.g. you're on a `chrome://` page). Clicking it opens Google Calendar.

This works even if the extension's popup is closed — it runs via a
background service worker as long as Chrome is open.

**Permission note:** to show the card on whatever page you happen to be
on, the extension requests access to all websites (`<all_urls>`). This
is only used to inject the reminder card and fetch your calendar feed —
it doesn't read, track, or send anything from the pages you visit.

## Data & privacy

Everything (notes, screenshots, tasks, folders, your calendar link) is
stored locally in Chrome's extension storage (`chrome.storage.local`) on
your own machine — separate from your regular browser cache/cookies, so
clearing those won't erase your data. Nothing is sent to any
third-party server — the only network calls this extension makes are
directly to `calendar.google.com` to fetch your calendar feed.

Note: this data is still local-only (no cloud sync). Uninstalling the
extension, resetting your Chrome profile, or switching machines will
lose it — there's currently no export/import/backup feature.

## File structure

```
squirro/
├── manifest.json         # Extension config, permissions
├── popup.html/.css/.js   # Main UI (Notes, Calendar, Tasks tabs) — also used for the pop-out window
├── background.js         # Checks for upcoming meetings every minute, injects the reminder card
├── ics.js                # Shared iCal parser + recurring-event expansion (used by popup and background)
├── overlay.css           # Styles for the in-page reminder card
├── crop.html/.css/.js    # Screenshot cropping window
└── icons/                # Extension icons (16/48/128px + source image)
```
