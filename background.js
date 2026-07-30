const CHECK_ALARM = 'checkMeetings';
const REMIND_MINUTES_BEFORE = 10;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    checkUpcomingMeetings();
  }
});

/* ---- Minimal ICS parsing (self-contained copy, since service workers
   can't share code with the popup script) ---- */

function unfoldICS(text) {
  return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function parseICSDate(value) {
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { date: new Date(`${y}-${m}-${d}T00:00:00`), allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const [, y, mo, d, h, mi, s, z] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? 'Z' : ''}`;
    return { date: new Date(iso), allDay: false };
  }
  return { date: new Date(value), allDay: false };
}

function parseICS(text) {
  const lines = unfoldICS(text).split(/\r\n|\n|\r/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current && current.startRaw) events.push(current);
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const keyPart = line.substring(0, idx);
      const value = line.substring(idx + 1);
      const key = keyPart.split(';')[0];

      if (key === 'SUMMARY') {
        current.summary = value.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\\\/g, '\\');
      } else if (key === 'DTSTART') {
        current.startRaw = value;
      } else if (key === 'UID') {
        current.uid = value;
      }
    }
  }

  return events.map((e) => {
    const parsed = parseICSDate(e.startRaw);
    return {
      uid: e.uid || `${e.summary}-${e.startRaw}`,
      summary: e.summary || '(no title)',
      start: parsed.date,
      allDay: parsed.allDay,
    };
  });
}

/* ---- Meeting check + reminder trigger ---- */

async function checkUpcomingMeetings() {
  const { icsUrl, notifiedEventIds } = await chrome.storage.local.get([
    'icsUrl',
    'notifiedEventIds',
  ]);
  if (!icsUrl) return;

  let events;
  try {
    const res = await fetch(icsUrl);
    if (!res.ok) return;
    const text = await res.text();
    events = parseICS(text);
  } catch (err) {
    console.warn('Meeting check fetch failed:', err);
    return;
  }

  const notified = new Set(notifiedEventIds || []);
  const now = new Date();
  let didNotify = false;

  for (const event of events) {
    if (event.allDay) continue;
    const minutesUntil = (event.start - now) / 60000;
    if (minutesUntil > 0 && minutesUntil <= REMIND_MINUTES_BEFORE && !notified.has(event.uid)) {
      notified.add(event.uid);
      didNotify = true;
      triggerReminder(event, Math.round(minutesUntil));
    }
  }

  if (didNotify || notified.size !== (notifiedEventIds || []).length) {
    // Cap stored ids so this doesn't grow forever
    const trimmed = Array.from(notified).slice(-200);
    await chrome.storage.local.set({ notifiedEventIds: trimmed });
  }
}

async function triggerReminder(event, minutesUntil) {
  // OS-level notification as a backup (in case injection fails or the tab isn't visible)
  chrome.notifications.create(`meeting-${event.uid}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Meeting starting soon',
    message: `${event.summary} starts in ${minutesUntil} min`,
    priority: 2,
    requireInteraction: true,
  });

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab || !activeTab.id || !/^https?:/.test(activeTab.url || '')) {
      // Can't inject into chrome:// pages, the Web Store, or if no normal tab is focused
      return;
    }

    await chrome.scripting.insertCSS({
      target: { tabId: activeTab.id },
      files: ['overlay.css'],
    });

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: injectReminderOverlay,
      args: [event.summary, event.start.getTime()],
    });
  } catch (err) {
    console.warn('Overlay injection failed (notification still shown):', err);
  }
}

// This function is serialized and run inside the active page's context,
// so it must be fully self-contained (no references to outer variables).
function injectReminderOverlay(summary, startMs) {
  const existing = document.getElementById('dwh-reminder-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dwh-reminder-overlay';
  overlay.innerHTML = `
    <div id="dwh-reminder-card">
      <button id="dwh-reminder-close" title="Dismiss">✕</button>
      <div class="dwh-icon-wrap">
        <div class="dwh-pulse-ring"></div>
        <div class="dwh-icon">📅</div>
      </div>
      <div class="dwh-label">Meeting starting soon</div>
      <div class="dwh-meeting-name"></div>
      <div class="dwh-countdown"></div>
      <button class="dwh-dismiss-btn">Got it</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.dwh-meeting-name').textContent = summary;

  function formatCountdown(ms) {
    if (ms <= 0) return 'Starting now!';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `Starts in ${min}m ${sec.toString().padStart(2, '0')}s`;
  }

  const countdownEl = overlay.querySelector('.dwh-countdown');
  function tick() {
    countdownEl.textContent = formatCountdown(startMs - Date.now());
  }
  tick();
  const interval = setInterval(tick, 1000);

  function removeOverlay() {
    clearInterval(interval);
    overlay.remove();
  }

  overlay.querySelector('#dwh-reminder-close').addEventListener('click', removeOverlay);
  overlay.querySelector('.dwh-dismiss-btn').addEventListener('click', removeOverlay);

  setTimeout(removeOverlay, 90000);
}
