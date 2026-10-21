importScripts('ics.js'); // parseICS, expandEvents

const CHECK_ALARM = 'checkMeetings';
const REMIND_MINUTES_BEFORE = 10;

function ensureAlarm() {
  chrome.alarms.get(CHECK_ALARM, (alarm) => {
    if (!alarm) chrome.alarms.create(CHECK_ALARM, { periodInMinutes: 1 });
  });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CHECK_ALARM) {
    checkUpcomingMeetings();
  }
});

/* ---- Meeting check + reminder trigger ---- */

async function checkUpcomingMeetings() {
  const { icsUrl, notifiedEventIds } = await chrome.storage.local.get([
    'icsUrl',
    'notifiedEventIds',
  ]);
  if (!icsUrl) return;

  const now = new Date();
  let events;
  try {
    const res = await fetch(icsUrl, { cache: 'no-store' });
    if (!res.ok) return;
    const text = await res.text();
    const windowEnd = new Date(now.getTime() + (REMIND_MINUTES_BEFORE + 1) * 60000);
    events = expandEvents(parseICS(text), now, windowEnd);
  } catch (err) {
    console.warn('Meeting check fetch failed:', err);
    return;
  }

  const notified = new Set(notifiedEventIds || []);
  let didNotify = false;

  for (const event of events) {
    if (event.allDay) continue;
    // Key on start time too, so each occurrence of a recurring meeting gets its own reminder
    const key = `${event.uid || event.summary}|${event.start.getTime()}`;
    const minutesUntil = (event.start - now) / 60000;
    if (minutesUntil > 0 && minutesUntil <= REMIND_MINUTES_BEFORE && !notified.has(key)) {
      notified.add(key);
      didNotify = true;
      triggerReminder(event, key, Math.max(1, Math.round(minutesUntil)));
    }
  }

  if (didNotify) {
    // Cap stored ids so this doesn't grow forever
    const trimmed = Array.from(notified).slice(-200);
    await chrome.storage.local.set({ notifiedEventIds: trimmed });
  }
}

async function triggerReminder(event, key, minutesUntil) {
  // OS-level notification as a backup (in case injection fails or the tab isn't visible)
  chrome.notifications.create(`meeting-${key}`, {
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

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith('meeting-')) return;
  chrome.notifications.clear(notificationId);
  chrome.tabs.create({ url: 'https://calendar.google.com/calendar/r/day' });
});

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
