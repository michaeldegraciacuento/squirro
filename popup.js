/* ---------------------------------------------------------
   TAB SWITCHING
--------------------------------------------------------- */
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

/* ---------------------------------------------------------
   SHARED HELPERS
--------------------------------------------------------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function showGlobalStatus(msg, ms = 1500) {
  const el = document.getElementById('globalStatus');
  el.textContent = msg;
  setTimeout(() => {
    el.textContent = '';
  }, ms);
}

function formatTimestamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const timePart = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${timePart}`;

  const datePart = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${datePart}, ${timePart}`;
}

function genId() {
  return Date.now().toString() + Math.random().toString(36).slice(2, 7);
}

/* ---------------------------------------------------------
   DARK MODE
--------------------------------------------------------- */
const darkModeBtn = document.getElementById('darkModeBtn');

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  darkModeBtn.textContent = enabled ? '☀️' : '🌙';
}

chrome.storage.local.get(['darkMode'], (result) => {
  applyDarkMode(!!result.darkMode);
});

darkModeBtn.addEventListener('click', () => {
  chrome.storage.local.get(['darkMode'], (result) => {
    const newVal = !result.darkMode;
    chrome.storage.local.set({ darkMode: newVal }, () => applyDarkMode(newVal));
  });
});

/* ---------------------------------------------------------
   FOLDERS (shared pattern for notes + tasks, stored separately)
--------------------------------------------------------- */
let noteFolders = [];
let taskFolders = [];
let selectedNoteFolder = 'all'; // 'all' | 'uncat' | folder id
let selectedTaskFolder = 'all';

function loadFolders(callback) {
  chrome.storage.local.get(['noteFolders', 'taskFolders'], (result) => {
    noteFolders = result.noteFolders || [];
    taskFolders = result.taskFolders || [];
    if (callback) callback();
  });
}

function saveFolders(callback) {
  chrome.storage.local.set({ noteFolders, taskFolders }, () => {
    if (callback) callback();
  });
}

function populateFolderSelect(selectEl, folders, selectedValue) {
  selectEl.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All folders';
  selectEl.appendChild(allOpt);

  const uncatOpt = document.createElement('option');
  uncatOpt.value = 'uncat';
  uncatOpt.textContent = 'Uncategorized';
  selectEl.appendChild(uncatOpt);

  folders.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    selectEl.appendChild(opt);
  });

  selectEl.value = selectedValue;
}

/* ---- Note folder UI ---- */
const noteFolderSelect = document.getElementById('noteFolderSelect');
const addNoteFolderBtn = document.getElementById('addNoteFolderBtn');
const newNoteFolderWrap = document.getElementById('newNoteFolderWrap');
const newNoteFolderInput = document.getElementById('newNoteFolderInput');
const confirmNoteFolderBtn = document.getElementById('confirmNoteFolderBtn');
const cancelNoteFolderBtn = document.getElementById('cancelNoteFolderBtn');

noteFolderSelect.addEventListener('change', () => {
  selectedNoteFolder = noteFolderSelect.value;
  renderNotesList();
});

addNoteFolderBtn.addEventListener('click', () => {
  newNoteFolderWrap.classList.remove('hidden');
  newNoteFolderInput.value = '';
  newNoteFolderInput.focus();
});

cancelNoteFolderBtn.addEventListener('click', () => {
  newNoteFolderWrap.classList.add('hidden');
});

confirmNoteFolderBtn.addEventListener('click', () => {
  const name = newNoteFolderInput.value.trim();
  if (!name) return;
  const folder = { id: genId(), name };
  noteFolders.push(folder);
  saveFolders(() => {
    populateFolderSelect(noteFolderSelect, noteFolders, folder.id);
    selectedNoteFolder = folder.id;
    newNoteFolderWrap.classList.add('hidden');
    renderNotesList();
  });
});

newNoteFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmNoteFolderBtn.click();
});

const renameNoteFolderBtn = document.getElementById('renameNoteFolderBtn');
const renameNoteFolderWrap = document.getElementById('renameNoteFolderWrap');
const renameNoteFolderInput = document.getElementById('renameNoteFolderInput');
const confirmRenameNoteFolderBtn = document.getElementById('confirmRenameNoteFolderBtn');
const cancelRenameNoteFolderBtn = document.getElementById('cancelRenameNoteFolderBtn');

renameNoteFolderBtn.addEventListener('click', () => {
  if (selectedNoteFolder === 'all' || selectedNoteFolder === 'uncat') {
    showGlobalStatus("Can't rename that");
    return;
  }
  const folder = noteFolders.find((f) => f.id === selectedNoteFolder);
  if (!folder) return;
  renameNoteFolderInput.value = folder.name;
  renameNoteFolderWrap.classList.remove('hidden');
  renameNoteFolderInput.focus();
});

cancelRenameNoteFolderBtn.addEventListener('click', () => {
  renameNoteFolderWrap.classList.add('hidden');
});

confirmRenameNoteFolderBtn.addEventListener('click', () => {
  const name = renameNoteFolderInput.value.trim();
  if (!name) return;
  const folder = noteFolders.find((f) => f.id === selectedNoteFolder);
  if (folder) {
    folder.name = name;
    saveFolders(() => {
      populateFolderSelect(noteFolderSelect, noteFolders, selectedNoteFolder);
      renameNoteFolderWrap.classList.add('hidden');
      showGlobalStatus('Folder renamed');
    });
  }
});

renameNoteFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmRenameNoteFolderBtn.click();
});

/* ---- Task folder UI ---- */
const taskFolderSelect = document.getElementById('taskFolderSelect');
const addTaskFolderBtn = document.getElementById('addTaskFolderBtn');
const newTaskFolderWrap = document.getElementById('newTaskFolderWrap');
const newTaskFolderInput = document.getElementById('newTaskFolderInput');
const confirmTaskFolderBtn = document.getElementById('confirmTaskFolderBtn');
const cancelTaskFolderBtn = document.getElementById('cancelTaskFolderBtn');

taskFolderSelect.addEventListener('change', () => {
  selectedTaskFolder = taskFolderSelect.value;
  renderTasks();
});

addTaskFolderBtn.addEventListener('click', () => {
  newTaskFolderWrap.classList.remove('hidden');
  newTaskFolderInput.value = '';
  newTaskFolderInput.focus();
});

cancelTaskFolderBtn.addEventListener('click', () => {
  newTaskFolderWrap.classList.add('hidden');
});

confirmTaskFolderBtn.addEventListener('click', () => {
  const name = newTaskFolderInput.value.trim();
  if (!name) return;
  const folder = { id: genId(), name };
  taskFolders.push(folder);
  saveFolders(() => {
    populateFolderSelect(taskFolderSelect, taskFolders, folder.id);
    selectedTaskFolder = folder.id;
    newTaskFolderWrap.classList.add('hidden');
    renderTasks();
  });
});

newTaskFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmTaskFolderBtn.click();
});

const renameTaskFolderBtn = document.getElementById('renameTaskFolderBtn');
const renameTaskFolderWrap = document.getElementById('renameTaskFolderWrap');
const renameTaskFolderInput = document.getElementById('renameTaskFolderInput');
const confirmRenameTaskFolderBtn = document.getElementById('confirmRenameTaskFolderBtn');
const cancelRenameTaskFolderBtn = document.getElementById('cancelRenameTaskFolderBtn');

renameTaskFolderBtn.addEventListener('click', () => {
  if (selectedTaskFolder === 'all' || selectedTaskFolder === 'uncat') {
    showGlobalStatus("Can't rename that");
    return;
  }
  const folder = taskFolders.find((f) => f.id === selectedTaskFolder);
  if (!folder) return;
  renameTaskFolderInput.value = folder.name;
  renameTaskFolderWrap.classList.remove('hidden');
  renameTaskFolderInput.focus();
});

cancelRenameTaskFolderBtn.addEventListener('click', () => {
  renameTaskFolderWrap.classList.add('hidden');
});

confirmRenameTaskFolderBtn.addEventListener('click', () => {
  const name = renameTaskFolderInput.value.trim();
  if (!name) return;
  const folder = taskFolders.find((f) => f.id === selectedTaskFolder);
  if (folder) {
    folder.name = name;
    saveFolders(() => {
      populateFolderSelect(taskFolderSelect, taskFolders, selectedTaskFolder);
      renameTaskFolderWrap.classList.add('hidden');
      showGlobalStatus('Folder renamed');
    });
  }
});

renameTaskFolderInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmRenameTaskFolderBtn.click();
});

/* ---------------------------------------------------------
   NOTES
--------------------------------------------------------- */
const notesListEl = document.getElementById('notesList');
const noteEditorEl = document.getElementById('noteEditor');
const noteTextEl = document.getElementById('noteText');
const newNoteBtn = document.getElementById('newNoteBtn');
const backBtn = document.getElementById('backBtn');
const deleteNoteBtn = document.getElementById('deleteNoteBtn');
const captureBtn = document.getElementById('captureBtn');
const cropCaptureBtn = document.getElementById('cropCaptureBtn');
const captureStatusEl = document.getElementById('captureStatus');
const noteImageWrap = document.getElementById('noteImageWrap');
const noteImageEl = document.getElementById('noteImage');
const removeImageBtn = document.getElementById('removeImageBtn');
const copyImageBtn = document.getElementById('copyImageBtn');
const exportNoteBtn = document.getElementById('exportNoteBtn');
const noteSearchInput = document.getElementById('noteSearchInput');

let notes = [];
let currentNoteId = null;
let saveTimeout = null;
let noteSearchQuery = '';

noteSearchInput.addEventListener('input', () => {
  noteSearchQuery = noteSearchInput.value.trim().toLowerCase();
  renderNotesList();
});

function loadNotes(callback) {
  chrome.storage.local.get(['notes'], (result) => {
    notes = result.notes || [];
    if (callback) callback();
  });
}

function saveNotes(callback) {
  chrome.storage.local.set({ notes }, () => {
    if (callback) callback();
  });
}

function renderNotesList() {
  notesListEl.innerHTML = '';

  const filtered = notes.filter((n) => {
    if (selectedNoteFolder === 'all') {
      // ok
    } else if (selectedNoteFolder === 'uncat') {
      if (n.folderId && n.folderId !== 'uncat') return false;
    } else if (n.folderId !== selectedNoteFolder) {
      return false;
    }
    if (noteSearchQuery && !n.text.toLowerCase().includes(noteSearchQuery)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = noteSearchQuery ? 'No notes match your search.' : 'No notes here yet.';
    notesListEl.appendChild(empty);
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    return b.updatedAt - a.updatedAt;
  });

  sorted.forEach((note) => {
    const item = document.createElement('div');
    item.className = 'note-item';

    const pinBtn = document.createElement('span');
    pinBtn.className = 'pin-icon' + (note.pinned ? ' pinned' : '');
    pinBtn.textContent = '📌';
    pinBtn.title = note.pinned ? 'Unpin' : 'Pin to top';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      note.pinned = !note.pinned;
      saveNotes(() => renderNotesList());
    });
    item.appendChild(pinBtn);

    const previewWrap = document.createElement('span');
    previewWrap.className = 'note-preview-wrap';

    const preview = document.createElement('span');
    preview.className = 'note-preview';
    preview.textContent = note.text.trim().split('\n')[0] || '(empty note)';
    previewWrap.appendChild(preview);

    const time = document.createElement('span');
    time.className = 'note-time';
    time.textContent = formatTimestamp(note.updatedAt);
    previewWrap.appendChild(time);

    item.appendChild(previewWrap);

    if (note.image) {
      const icon = document.createElement('span');
      icon.className = 'thumb-icon';
      icon.textContent = '📷';
      item.appendChild(icon);
    }

    item.addEventListener('click', () => openNote(note.id));
    notesListEl.appendChild(item);
  });
}

function openNote(id) {
  currentNoteId = id;
  const note = notes.find((n) => n.id === id);
  noteTextEl.value = note ? note.text : '';
  document.getElementById('noteTimestamp').textContent = note
    ? `Last edited: ${formatTimestamp(note.updatedAt)}`
    : '';

  if (note && note.image) {
    noteImageEl.src = note.image;
    noteImageWrap.classList.remove('hidden');
  } else {
    noteImageWrap.classList.add('hidden');
    noteImageEl.src = '';
  }

  notesListEl.classList.add('hidden');
  document.querySelector('#notes .folder-row').classList.add('hidden');
  noteEditorEl.classList.remove('hidden');
  newNoteBtn.classList.add('hidden');
  noteTextEl.focus();
}

function closeNoteEditor() {
  currentNoteId = null;
  noteEditorEl.classList.add('hidden');
  notesListEl.classList.remove('hidden');
  document.querySelector('#notes .folder-row').classList.remove('hidden');
  newNoteBtn.classList.remove('hidden');
  renderNotesList();
}

newNoteBtn.addEventListener('click', () => {
  const folderId = selectedNoteFolder === 'all' ? 'uncat' : selectedNoteFolder;
  const id = genId();
  const note = { id, text: '', image: null, folderId, pinned: false, updatedAt: Date.now() };
  notes.push(note);
  saveNotes(() => openNote(id));
});

backBtn.addEventListener('click', () => {
  closeNoteEditor();
});

deleteNoteBtn.addEventListener('click', () => {
  if (!currentNoteId) return;
  notes = notes.filter((n) => n.id !== currentNoteId);
  saveNotes(() => {
    showGlobalStatus('Note deleted');
    closeNoteEditor();
  });
});

removeImageBtn.addEventListener('click', () => {
  if (!currentNoteId) return;
  const note = notes.find((n) => n.id === currentNoteId);
  if (note) {
    note.image = null;
    note.updatedAt = Date.now();
    saveNotes(() => {
      noteImageWrap.classList.add('hidden');
      showGlobalStatus('Image removed');
    });
  }
});

copyImageBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  const note = notes.find((n) => n.id === currentNoteId);
  if (!note || !note.image) return;

  try {
    // Chrome's clipboard API only accepts PNG for images (not JPEG),
    // so redraw the stored (JPEG) screenshot onto a canvas and export as PNG.
    const img = await loadImage(note.image);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
    });

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showGlobalStatus('Screenshot copied ✓');
  } catch (err) {
    console.error('Copy failed:', err);
    showGlobalStatus('Copy failed');
  }
});

exportNoteBtn.addEventListener('click', () => {
  if (!currentNoteId) return;
  const note = notes.find((n) => n.id === currentNoteId);
  if (!note) return;

  const firstLine = note.text.trim().split('\n')[0] || 'note';
  const safeName = firstLine.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'note';

  const blob = new Blob([note.text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showGlobalStatus('Exported ✓');
});

noteTextEl.addEventListener('input', () => {
  if (!currentNoteId) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const note = notes.find((n) => n.id === currentNoteId);
    if (note) {
      note.text = noteTextEl.value;
      note.updatedAt = Date.now();
      saveNotes(() => {
        showGlobalStatus('Saved');
        document.getElementById('noteTimestamp').textContent = `Last edited: ${formatTimestamp(note.updatedAt)}`;
      });
    }
  }, 300);
});

/* ---- Full-page screenshot capture + compression ---- */

async function getPageMetrics(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      originalScrollY: window.scrollY,
    }),
  });
  return result;
}

async function scrollPageTo(tabId, y) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (yy) => window.scrollTo(0, yy),
    args: [y],
  });
}

async function captureFullPage(tabId, windowId) {
  const metrics = await getPageMetrics(tabId);
  const { scrollHeight, viewportHeight, viewportWidth, originalScrollY } = metrics;

  const cappedHeight = Math.min(scrollHeight, viewportHeight * 15);
  const totalShots = Math.max(1, Math.ceil(cappedHeight / viewportHeight));

  const shots = [];
  for (let i = 0; i < totalShots; i++) {
    const y = Math.min(i * viewportHeight, cappedHeight - viewportHeight);
    await scrollPageTo(tabId, y);
    await new Promise((r) => setTimeout(r, 400));
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    shots.push(dataUrl);
  }

  await scrollPageTo(tabId, originalScrollY);

  const canvas = document.createElement('canvas');
  canvas.width = viewportWidth;
  canvas.height = cappedHeight;
  const ctx = canvas.getContext('2d');

  for (let i = 0; i < shots.length; i++) {
    const img = await loadImage(shots[i]);
    ctx.drawImage(img, 0, i * viewportHeight);
  }

  return canvas.toDataURL('image/png');
}

async function compressImage(dataUrl, maxWidth = 800, quality = 0.7) {
  const img = await loadImage(dataUrl);
  let { width, height } = img;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

captureBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  captureStatusEl.textContent = 'Capturing full page...';
  captureBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    let rawDataUrl;
    try {
      rawDataUrl = await captureFullPage(tab.id, tab.windowId);
    } catch (err) {
      console.warn('Full-page capture failed, falling back to visible area only:', err);
      captureStatusEl.textContent = 'Full page failed, using visible area...';
      rawDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    }

    const note = notes.find((n) => n.id === currentNoteId);
    if (note) {
      note.image = rawDataUrl;
      note.updatedAt = Date.now();
      saveNotes(() => {
        noteImageEl.src = rawDataUrl;
        noteImageWrap.classList.remove('hidden');
        captureStatusEl.textContent = 'Screenshot attached ✓';
        setTimeout(() => (captureStatusEl.textContent = ''), 1500);
      });
    }
  } catch (err) {
    console.error(err);
    captureStatusEl.textContent = 'Capture failed (try a normal webpage, not chrome:// pages)';
  } finally {
    captureBtn.disabled = false;
  }
});

cropCaptureBtn.addEventListener('click', async () => {
  if (!currentNoteId) return;
  captureStatusEl.textContent = 'Capturing...';
  cropCaptureBtn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    await new Promise((resolve) => {
      chrome.storage.local.set({ cropPending: { noteId: currentNoteId, image: dataUrl } }, resolve);
    });

    chrome.windows.create({
      url: chrome.runtime.getURL('crop.html'),
      type: 'popup',
      width: 900,
      height: 700,
    });

    captureStatusEl.textContent = 'Select the area to keep in the new window...';
  } catch (err) {
    console.error(err);
    captureStatusEl.textContent = 'Capture failed';
  } finally {
    cropCaptureBtn.disabled = false;
  }
});

/* ---------------------------------------------------------
   CALENDAR (Google Calendar via secret iCal link, read-only)
--------------------------------------------------------- */
const calSignedOut = document.getElementById('calSignedOut');
const calSignedIn = document.getElementById('calSignedIn');
const calEventsList = document.getElementById('calEventsList');
const icsUrlInput = document.getElementById('icsUrlInput');
const connectCalBtn = document.getElementById('connectCalBtn');
const disconnectCalBtn = document.getElementById('disconnectCalBtn');
const refreshCalBtn = document.getElementById('refreshCalBtn');

function getSavedIcsUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['icsUrl'], (result) => resolve(result.icsUrl || null));
  });
}

function saveIcsUrl(url) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ icsUrl: url }, resolve);
  });
}

// Unfold RFC5545 folded lines (continuation lines start with a space/tab)
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
      } else if (key === 'DTEND') {
        current.endRaw = value;
      } else if (key === 'UID') {
        current.uid = value;
      }
    }
  }

  return events.map((e) => {
    const parsed = parseICSDate(e.startRaw);
    const endParsed = e.endRaw ? parseICSDate(e.endRaw) : null;
    const end = endParsed
      ? endParsed.date
      : parsed.allDay
      ? new Date(parsed.date.getTime() + 24 * 60 * 60 * 1000)
      : parsed.date;
    return { summary: e.summary || '(no title)', start: parsed.date, end, allDay: parsed.allDay, uid: e.uid || null };
  });
}

// The secret ICS link looks like .../calendar/ical/<calendarId>/private-.../basic.ics
function extractCalendarId(icsUrl) {
  const match = icsUrl.match(/\/ical\/([^/]+)\/private/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// Google Calendar's event deep-link is the base64 of "<eventId> <calendarId>".
// Falls back to that day's view if we can't build a precise event link.
function buildGoogleCalendarUrl(event, calendarId) {
  if (event.uid && calendarId) {
    const eventId = event.uid.split('@')[0];
    try {
      const eid = btoa(`${eventId} ${calendarId}`).replace(/=+$/, '');
      return `https://calendar.google.com/calendar/event?eid=${eid}`;
    } catch {
      // fall through to day view below
    }
  }
  const d = event.start;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${day}`;
}

async function fetchICSEvents(icsUrl) {
  const res = await fetch(icsUrl);
  if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`);
  const text = await res.text();
  return parseICS(text);
}

function formatEventTime(event) {
  if (event.allDay) return 'All day';
  return event.start.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isEventDone(event) {
  return event.end.getTime() <= Date.now();
}

function renderEvents(events, calendarId) {
  calEventsList.innerHTML = '';

  if (!events || events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No upcoming events in the next 2 weeks.';
    calEventsList.appendChild(empty);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-item ' + (isEventDone(event) ? 'event-done' : 'event-active');
    item.title = 'Open in Google Calendar';

    const time = document.createElement('div');
    time.className = 'event-time';
    time.textContent = formatEventTime(event);

    const titleRow = document.createElement('div');
    titleRow.className = 'event-title-row';

    const title = document.createElement('span');
    title.className = 'event-title';
    title.textContent = event.summary;

    const viewIcon = document.createElement('span');
    viewIcon.className = 'event-view-icon';
    viewIcon.textContent = '↗';

    titleRow.appendChild(title);
    titleRow.appendChild(viewIcon);

    item.appendChild(time);
    item.appendChild(titleRow);

    item.addEventListener('click', () => {
      chrome.tabs.create({ url: buildGoogleCalendarUrl(event, calendarId) });
    });

    calEventsList.appendChild(item);
  });
}

async function refreshCalendar() {
  const icsUrl = await getSavedIcsUrl();
  if (!icsUrl) {
    calSignedIn.classList.add('hidden');
    calSignedOut.classList.remove('hidden');
    return;
  }

  try {
    const allEvents = await fetchICSEvents(icsUrl);

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date();
    rangeEnd.setDate(rangeEnd.getDate() + 14);

    const upcoming = allEvents
      .filter((e) => e.start >= rangeStart && e.start <= rangeEnd)
      .sort((a, b) => a.start - b.start)
      .slice(0, 20);

    calSignedOut.classList.add('hidden');
    calSignedIn.classList.remove('hidden');
    renderEvents(upcoming, extractCalendarId(icsUrl));
  } catch (err) {
    console.warn('Calendar fetch failed:', err);
    showGlobalStatus('Could not load calendar');
    calSignedIn.classList.add('hidden');
    calSignedOut.classList.remove('hidden');
  }
}

connectCalBtn.addEventListener('click', async () => {
  const url = icsUrlInput.value.trim();
  if (!url) return;
  connectCalBtn.disabled = true;
  connectCalBtn.textContent = 'Connecting...';
  try {
    await fetchICSEvents(url); // validate it works before saving
    await saveIcsUrl(url);
    await refreshCalendar();
  } catch (err) {
    console.error(err);
    showGlobalStatus('Could not connect — check the link');
  } finally {
    connectCalBtn.disabled = false;
    connectCalBtn.textContent = 'Connect';
  }
});

refreshCalBtn.addEventListener('click', () => refreshCalendar());

disconnectCalBtn.addEventListener('click', async () => {
  await saveIcsUrl(null);
  icsUrlInput.value = '';
  calSignedIn.classList.add('hidden');
  calSignedOut.classList.remove('hidden');
  showGlobalStatus('Disconnected');
});

/* ---------------------------------------------------------
   TASKS
--------------------------------------------------------- */
const taskInput = document.getElementById('taskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const tasksListEl = document.getElementById('tasksList');
const filterButtons = document.querySelectorAll('.filter-btn');

let tasks = [];
let expandedTaskIds = new Set(); // in-memory only, not persisted
let taskSaveTimeouts = {};
let taskFilter = 'all';

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    taskFilter = btn.dataset.filter;
    renderTasks();
  });
});

function loadTasks(callback) {
  chrome.storage.local.get(['tasks'], (result) => {
    tasks = result.tasks || [];
    if (callback) callback();
  });
}

function saveTasks(callback) {
  chrome.storage.local.set({ tasks }, () => {
    if (callback) callback();
  });
}

function isOverdue(task) {
  if (!task.dueDate || task.done) return false;
  const due = new Date(task.dueDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function formatDueDate(dueDate) {
  const d = new Date(dueDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderTasks() {
  tasksListEl.innerHTML = '';

  const filtered = tasks.filter((t) => {
    if (selectedTaskFolder === 'all') {
      // ok
    } else if (selectedTaskFolder === 'uncat') {
      if (t.folderId && t.folderId !== 'uncat') return false;
    } else if (t.folderId !== selectedTaskFolder) {
      return false;
    }
    if (taskFilter === 'active' && t.done) return false;
    if (taskFilter === 'completed' && !t.done) return false;
    return true;
  });

  // Sort: tasks with a due date first (soonest first), then no-due-date tasks
  filtered.sort((a, b) => {
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No tasks here yet.';
    tasksListEl.appendChild(empty);
    return;
  }

  filtered.forEach((task) => {
    const item = document.createElement('div');
    item.className = 'task-item' + (task.done ? ' done' : '');

    const row = document.createElement('div');
    row.className = 'task-item-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => {
      task.done = checkbox.checked;
      task.updatedAt = Date.now();
      saveTasks();
      renderTasks();
    });
    row.appendChild(checkbox);

    if (task.priority) {
      const dot = document.createElement('span');
      dot.className = 'priority-dot priority-' + task.priority;
      dot.title = task.priority.charAt(0).toUpperCase() + task.priority.slice(1) + ' priority';
      row.appendChild(dot);
    }

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;
    text.title = 'Click to expand';
    text.addEventListener('click', () => {
      if (expandedTaskIds.has(task.id)) {
        expandedTaskIds.delete(task.id);
      } else {
        expandedTaskIds.add(task.id);
      }
      renderTasks();
    });
    row.appendChild(text);

    if (task.dueDate) {
      const dueBadge = document.createElement('span');
      dueBadge.className = 'due-badge' + (isOverdue(task) ? ' overdue' : '');
      dueBadge.textContent = formatDueDate(task.dueDate);
      row.appendChild(dueBadge);
    }

    const time = document.createElement('span');
    time.className = 'task-time';
    time.textContent = formatTimestamp(task.updatedAt);
    row.appendChild(time);

    const editBtn = document.createElement('button');
    editBtn.className = 'task-edit';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', () => {
      expandedTaskIds.add(task.id);
      renderTasks();
    });
    row.appendChild(editBtn);

    const del = document.createElement('button');
    del.className = 'task-del';
    del.textContent = '🗑️';
    del.title = 'Delete';
    del.addEventListener('click', () => {
      tasks = tasks.filter((t) => t.id !== task.id);
      expandedTaskIds.delete(task.id);
      saveTasks();
      renderTasks();
    });
    row.appendChild(del);

    item.appendChild(row);

    // Expandable edit panel: title, description, due date, priority
    const panel = document.createElement('div');
    panel.className = 'task-edit-panel' + (expandedTaskIds.has(task.id) ? '' : ' hidden');

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = task.text;
    titleInput.placeholder = 'Task title';

    const descInput = document.createElement('textarea');
    descInput.placeholder = 'Short description / notes...';
    descInput.value = task.description || '';

    const dueLabel = document.createElement('div');
    dueLabel.className = 'field-label';
    dueLabel.textContent = 'Due date';

    const dueDateInput = document.createElement('input');
    dueDateInput.type = 'date';
    dueDateInput.value = task.dueDate || '';

    const priorityLabel = document.createElement('div');
    priorityLabel.className = 'field-label';
    priorityLabel.textContent = 'Priority';

    const priorityInput = document.createElement('select');
    [
      ['none', 'No priority'],
      ['low', 'Low priority'],
      ['medium', 'Medium priority'],
      ['high', 'High priority'],
    ].forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if ((task.priority || 'none') === value) opt.selected = true;
      priorityInput.appendChild(opt);
    });

    const panelTime = document.createElement('span');
    panelTime.className = 'task-time';
    panelTime.textContent = `Updated: ${formatTimestamp(task.updatedAt)}`;

    function scheduleTaskSave() {
      clearTimeout(taskSaveTimeouts[task.id]);
      taskSaveTimeouts[task.id] = setTimeout(() => {
        task.text = titleInput.value;
        task.description = descInput.value;
        task.dueDate = dueDateInput.value || null;
        task.priority = priorityInput.value === 'none' ? null : priorityInput.value;
        task.updatedAt = Date.now();
        saveTasks(() => {
          panelTime.textContent = `Updated: ${formatTimestamp(task.updatedAt)}`;
          text.textContent = task.text;
          time.textContent = formatTimestamp(task.updatedAt);
          showGlobalStatus('Saved');
        });
      }, 300);
    }

    titleInput.addEventListener('input', scheduleTaskSave);
    descInput.addEventListener('input', scheduleTaskSave);
    dueDateInput.addEventListener('change', () => {
      scheduleTaskSave();
      renderTasksSoon();
    });
    priorityInput.addEventListener('change', () => {
      scheduleTaskSave();
      renderTasksSoon();
    });

    // Re-render shortly after a due date/priority change so badges/dots/sort update
    function renderTasksSoon() {
      setTimeout(() => renderTasks(), 350);
    }

    panel.appendChild(titleInput);
    panel.appendChild(descInput);
    panel.appendChild(dueLabel);
    panel.appendChild(dueDateInput);
    panel.appendChild(priorityLabel);
    panel.appendChild(priorityInput);
    panel.appendChild(panelTime);
    item.appendChild(panel);

    tasksListEl.appendChild(item);
  });
}

function addTask() {
  const text = taskInput.value.trim();
  if (!text) return;
  const folderId = selectedTaskFolder === 'all' ? 'uncat' : selectedTaskFolder;
  tasks.push({
    id: genId(),
    text,
    done: false,
    description: '',
    dueDate: null,
    priority: null,
    folderId,
    updatedAt: Date.now(),
  });
  taskInput.value = '';
  saveTasks();
  renderTasks();
}

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  loadFolders(() => {
    populateFolderSelect(noteFolderSelect, noteFolders, selectedNoteFolder);
    populateFolderSelect(taskFolderSelect, taskFolders, selectedTaskFolder);

    loadNotes(() => {
      renderNotesList();
      // If a screenshot crop was just saved in a separate window, jump
      // straight back to that note so the result is visible immediately.
      chrome.storage.local.get(['pendingOpenNoteId'], (result) => {
        const pendingId = result.pendingOpenNoteId;
        if (pendingId) {
          chrome.storage.local.remove('pendingOpenNoteId');
          if (notes.some((n) => n.id === pendingId)) openNote(pendingId);
        }
      });
    });
    loadTasks(() => renderTasks());
  });

  getSavedIcsUrl().then((url) => {
    if (url) icsUrlInput.value = url;
    refreshCalendar();
  });
});

// Keep this popup in sync if notes change in storage while it's open
// (e.g. a crop saved from the separate crop.html window).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.notes) return;
  notes = changes.notes.newValue || [];

  if (currentNoteId) {
    const note = notes.find((n) => n.id === currentNoteId);
    if (note && note.image) {
      noteImageEl.src = note.image;
      noteImageWrap.classList.remove('hidden');
    } else if (note) {
      noteImageEl.src = '';
      noteImageWrap.classList.add('hidden');
    }
  } else {
    renderNotesList();
  }
});
