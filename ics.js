/* ---------------------------------------------------------
   Shared iCal (.ics) parsing + recurring-event expansion.
   Loaded by popup.html via <script> and by background.js via importScripts().
--------------------------------------------------------- */
const ICS_DAY_MS = 24 * 60 * 60 * 1000;
const ICS_WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Unfold RFC5545 folded lines (continuation lines start with a space/tab)
function unfoldICS(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function unescapeICSText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c));
}

/* ---- Time zones ----
   Dates are handled as "wall" times (the clock reading, stored as a UTC ms
   number) plus a zone: 'UTC', 'local', or an IANA TZID like 'Europe/Berlin'. */
const tzFormatters = {};

function getTzOffset(ms, timeZone) {
  if (!tzFormatters[timeZone]) {
    tzFormatters[timeZone] = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
  }
  const p = {};
  tzFormatters[timeZone].formatToParts(new Date(ms)).forEach(({ type, value }) => (p[type] = Number(value)));
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(ms / 1000) * 1000;
}

function wallToDate(wall, zone) {
  if (zone === 'UTC') return new Date(wall);
  if (zone !== 'local') {
    try {
      const firstOffset = getTzOffset(wall, zone);
      let t = wall - firstOffset;
      const secondOffset = getTzOffset(t, zone);
      if (secondOffset !== firstOffset) t = wall - secondOffset; // DST boundary
      return new Date(t);
    } catch {
      // Unknown TZID (e.g. Outlook's Windows zone names) — treat as local time
    }
  }
  const d = new Date(wall);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

function parseICSDate(value, tzid) {
  let m = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return { wall, zone: 'local', allDay: true, date: wallToDate(wall, 'local') };
  }
  m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const zone = m[7] ? 'UTC' : tzid || 'local';
    return { wall, zone, allDay: false, date: wallToDate(wall, zone) };
  }
  const date = new Date(value);
  return { wall: date.getTime(), zone: 'UTC', allDay: false, date };
}

function parseICSDuration(value) {
  const m = value.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sign, w, d, h, mi, s] = m.map((v, i) => (i > 1 ? Number(v || 0) : v));
  const ms = ((((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s) * 1000;
  return sign === '-' ? -ms : ms;
}

function parseRRule(value) {
  const rule = {};
  value.split(';').forEach((part) => {
    const [k, v] = part.split('=');
    if (!v) return;
    switch (k.toUpperCase()) {
      case 'FREQ':
        rule.freq = v.toUpperCase();
        break;
      case 'INTERVAL':
        rule.interval = parseInt(v, 10) || 1;
        break;
      case 'COUNT':
        rule.count = parseInt(v, 10);
        break;
      case 'UNTIL':
        rule.until = parseICSDate(v);
        break;
      case 'WKST':
        rule.wkst = Math.max(0, ICS_WEEKDAYS.indexOf(v.toUpperCase()));
        break;
      case 'BYDAY':
        rule.byday = v
          .split(',')
          .map((d) => d.toUpperCase().match(/^([+-]?\d+)?([A-Z]{2})$/))
          .filter((d) => d && ICS_WEEKDAYS.includes(d[2]))
          .map((d) => ({ n: d[1] ? parseInt(d[1], 10) : 0, wd: ICS_WEEKDAYS.indexOf(d[2]) }));
        break;
      case 'BYMONTHDAY':
        rule.bymonthday = v.split(',').map((d) => parseInt(d, 10)).filter(Boolean);
        break;
      case 'BYMONTH':
        rule.bymonth = v.split(',').map((d) => parseInt(d, 10)).filter(Boolean);
        break;
    }
  });
  return rule;
}

// Returns the raw VEVENTs; use expandEvents() to get concrete occurrences.
function parseICS(text) {
  const lines = unfoldICS(text).split(/\r\n|\n|\r/);
  const events = [];
  let current = null;
  let nested = 0; // depth inside sub-components like VALARM, whose fields must be ignored

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = { exdates: [] };
      nested = 0;
      continue;
    }
    if (!current) continue;
    if (line === 'END:VEVENT') {
      if (current.start && !isNaN(current.start.date)) events.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('BEGIN:')) {
      nested++;
      continue;
    }
    if (line.startsWith('END:')) {
      nested--;
      continue;
    }
    if (nested > 0) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const [key, ...paramParts] = line.substring(0, idx).split(';');
    const value = line.substring(idx + 1);
    const params = {};
    paramParts.forEach((p) => {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    });

    switch (key.toUpperCase()) {
      case 'SUMMARY':
        current.summary = unescapeICSText(value);
        break;
      case 'LOCATION':
        current.location = unescapeICSText(value);
        break;
      case 'UID':
        current.uid = value;
        break;
      case 'STATUS':
        current.status = value.toUpperCase();
        break;
      case 'DTSTART':
        current.start = parseICSDate(value, params.TZID);
        break;
      case 'DTEND':
        current.end = parseICSDate(value, params.TZID);
        break;
      case 'DURATION':
        current.duration = parseICSDuration(value);
        break;
      case 'RRULE':
        current.rrule = parseRRule(value);
        break;
      case 'EXDATE':
        value.split(',').forEach((v) => current.exdates.push(parseICSDate(v, params.TZID).date.getTime()));
        break;
      case 'RECURRENCE-ID':
        current.recurrenceId = parseICSDate(value, params.TZID).date.getTime();
        break;
    }
  }

  return events;
}

/* ---- Recurrence expansion (FREQ=DAILY/WEEKLY/MONTHLY/YEARLY with
   INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH; BYSETPOS is not supported) ---- */

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Days (1-based) of the given month that match the rule
function monthDaysForRule(rule, year, month, baseDay) {
  const dim = daysInMonth(year, month);
  const firstWd = new Date(Date.UTC(year, month, 1)).getUTCDay();
  let days = [];

  if (rule.byday) {
    rule.byday.forEach(({ n, wd }) => {
      const first = 1 + ((wd - firstWd + 7) % 7);
      const all = [];
      for (let d = first; d <= dim; d += 7) all.push(d);
      if (n > 0 && all[n - 1]) days.push(all[n - 1]);
      else if (n < 0 && all[all.length + n]) days.push(all[all.length + n]);
      else if (n === 0) days.push(...all);
    });
  } else if (rule.bymonthday) {
    rule.bymonthday.forEach((d) => {
      const day = d < 0 ? dim + d + 1 : d;
      if (day >= 1 && day <= dim) days.push(day);
    });
  } else if (baseDay <= dim) {
    days.push(baseDay);
  }

  return [...new Set(days)].sort((a, b) => a - b);
}

// Candidate wall times for the n-th period after the base, plus the period's start
function periodCandidates(rule, base, n) {
  const b = new Date(base);
  const y = b.getUTCFullYear();
  const mo = b.getUTCMonth();
  const baseDayStart = Date.UTC(y, mo, b.getUTCDate());
  const timeOfDay = base - baseDayStart;

  if (rule.freq === 'DAILY') {
    const start = baseDayStart + n * ICS_DAY_MS;
    const wd = new Date(start).getUTCDay();
    const ok = !rule.byday || rule.byday.some((d) => d.wd === wd);
    return { start, walls: ok ? [start + timeOfDay] : [] };
  }

  if (rule.freq === 'WEEKLY') {
    const wkst = rule.wkst ?? 1;
    const weekStart = baseDayStart - ((b.getUTCDay() - wkst + 7) % 7) * ICS_DAY_MS;
    const start = weekStart + n * 7 * ICS_DAY_MS;
    const weekdays = rule.byday ? rule.byday.map((d) => d.wd) : [b.getUTCDay()];
    const offsets = [...new Set(weekdays.map((wd) => (wd - wkst + 7) % 7))].sort((a, c) => a - c);
    return { start, walls: offsets.map((off) => start + off * ICS_DAY_MS + timeOfDay) };
  }

  if (rule.freq === 'MONTHLY') {
    const start = Date.UTC(y, mo + n, 1);
    const s = new Date(start);
    const days = monthDaysForRule(rule, s.getUTCFullYear(), s.getUTCMonth(), b.getUTCDate());
    return { start, walls: days.map((d) => start + (d - 1) * ICS_DAY_MS + timeOfDay) };
  }

  if (rule.freq === 'YEARLY') {
    const year = y + n;
    const months = rule.bymonth ? rule.bymonth.map((m) => m - 1) : [mo];
    const walls = [];
    months.sort((a, c) => a - c).forEach((m) => {
      const monthStart = Date.UTC(year, m, 1);
      monthDaysForRule(rule, year, m, b.getUTCDate()).forEach((d) =>
        walls.push(monthStart + (d - 1) * ICS_DAY_MS + timeOfDay)
      );
    });
    return { start: Date.UTC(year, 0, 1), walls };
  }

  return null; // unsupported FREQ (e.g. HOURLY)
}

function forEachOccurrence(ev, limitMs, callback) {
  const rule = ev.rrule;
  const base = ev.start.wall;
  const zone = ev.start.zone;
  const interval = rule.interval || 1;
  const untilMs = rule.until
    ? rule.until.date.getTime() + (rule.until.allDay ? ICS_DAY_MS - 1 : 0)
    : Infinity;
  let count = 0;

  for (let k = 0; k < 100000; k++) {
    const period = periodCandidates(rule, base, k * interval);
    if (!period) {
      callback(ev.start.date.getTime());
      return;
    }
    for (const wall of period.walls) {
      if (wall < base) continue;
      const t = wallToDate(wall, zone).getTime();
      if (t > untilMs) return;
      count++;
      if (rule.count && count > rule.count) return;
      if (t > limitMs) return;
      callback(t);
    }
    // Wall vs. real time differ by at most ~14h, so 2 days of slack is plenty
    if (period.start > limitMs + 2 * ICS_DAY_MS) return;
  }
}

function eventDuration(ev) {
  if (ev.end && !isNaN(ev.end.date)) return Math.max(0, ev.end.date - ev.start.date);
  if (ev.duration != null) return Math.max(0, ev.duration);
  return ev.start.allDay ? ICS_DAY_MS : 0;
}

// Concrete occurrences overlapping [rangeStart, rangeEnd], sorted by start.
// `instanceOf` is the original start (ms) of a recurring instance, else null.
function expandEvents(rawEvents, rangeStart, rangeEnd) {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const overridden = new Set(
    rawEvents.filter((e) => e.recurrenceId != null && e.uid).map((e) => `${e.uid}|${e.recurrenceId}`)
  );
  const out = [];

  function add(ev, start, instanceOf) {
    const end = start + eventDuration(ev);
    if (start > endMs || Math.max(end, start + 1) <= startMs) return;
    out.push({
      uid: ev.uid || null,
      summary: ev.summary || '(no title)',
      location: ev.location || '',
      start: new Date(start),
      end: new Date(end),
      allDay: ev.start.allDay,
      instanceOf,
    });
  }

  for (const ev of rawEvents) {
    if (ev.status === 'CANCELLED') continue;

    if (ev.recurrenceId != null) {
      add(ev, ev.start.date.getTime(), ev.recurrenceId); // moved/edited single instance
    } else if (ev.rrule) {
      const exdates = new Set(ev.exdates);
      forEachOccurrence(ev, endMs, (t) => {
        if (exdates.has(t) || (ev.uid && overridden.has(`${ev.uid}|${t}`))) return;
        add(ev, t, t);
      });
    } else {
      add(ev, ev.start.date.getTime(), null);
    }
  }

  return out.sort((a, b) => a.start - b.start);
}
