const STATE = {
  // tabId -> sessionId
  sessions: new Map(),
  // sessionId -> events[]
  eventsBySession: new Map(),
  // tabId -> last seen timestamp
  lastSeenByTab: new Map()
};

// Detector parameters (tweakable)
const CFG = {
  maxEventsPerSession: 800,
  windowMs: 2000,
  highRateThreshold: 35,        // events in 2s window
  lowJitterStdMs: 25,           // suspicious if std dev of deltas < 25ms
  seqLen: 5,
  seqRepeatThreshold: 3,        // same signature repeats >= 3 times in recent window
  multiTabSyncThreshold: 3,     // >= 3 tabs burst around same time
  multiTabSyncWindowMs: 700
};

function pushEvent(sessionId, evt) {
  if (!STATE.eventsBySession.has(sessionId)) STATE.eventsBySession.set(sessionId, []);
  const arr = STATE.eventsBySession.get(sessionId);
  arr.push(evt);
  if (arr.length > CFG.maxEventsPerSession) arr.splice(0, arr.length - CFG.maxEventsPerSession);
}

function getRecent(events, now, windowMs) {
  const cutoff = now - windowMs;
  // events are appended; scan from end for speed
  let i = events.length - 1;
  while (i >= 0 && events[i].t >= cutoff) i--;
  return events.slice(i + 1);
}

function stddev(nums) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const varr = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(varr);
}

function computeSequenceRepeats(recentEvents) {
  const L = CFG.seqLen;
  if (recentEvents.length < L) return { repeats: 0, topSig: null };

  const sigCounts = new Map();
  // build sequence signatures over recent events
  for (let i = 0; i <= recentEvents.length - L; i++) {
    const sig = recentEvents.slice(i, i + L).map(e => e.type).join("|");
    sigCounts.set(sig, (sigCounts.get(sig) || 0) + 1);
  }

  let topSig = null;
  let repeats = 0;
  for (const [sig, c] of sigCounts.entries()) {
    if (c > repeats) {
      repeats = c;
      topSig = sig;
    }
  }
  return { repeats, topSig };
}

// Multi-tab synchrony: check bursts across tabs near "now"
function computeMultiTabSynchrony(now) {
  const activeTabs = [];
  for (const [tabId, last] of STATE.lastSeenByTab.entries()) {
    if (now - last < 60_000) activeTabs.push(tabId);
  }
  if (activeTabs.length < 2) return { syncedTabs: 0 };

  // For each tab's latest session, see if it had a burst in last sync window
  let syncedTabs = 0;
  for (const tabId of activeTabs) {
    const sessionId = STATE.sessions.get(tabId);
    if (!sessionId) continue;
    const events = STATE.eventsBySession.get(sessionId) || [];
    const recent = getRecent(events, now, CFG.multiTabSyncWindowMs);
    if (recent.length >= 3) syncedTabs++;
  }
  return { syncedTabs };
}

function scoreSession(sessionId) {
  const events = STATE.eventsBySession.get(sessionId) || [];
  const now = Date.now();
  const recent = getRecent(events, now, CFG.windowMs);

  const reasons = [];
  let score = 0;

  // Signal 1: high event rate
  if (recent.length >= CFG.highRateThreshold) {
    score += 35;
    reasons.push(`High event rate: ${recent.length} events / ${CFG.windowMs}ms`);
  }

  // Signal 2: low jitter (very consistent deltas)
  const deltas = [];
  for (let i = 1; i < recent.length; i++) deltas.push(recent[i].t - recent[i - 1].t);
  const sd = stddev(deltas);
  if (deltas.length >= 10 && sd < CFG.lowJitterStdMs) {
    score += 30;
    reasons.push(`Low jitter timing (std≈${sd.toFixed(1)}ms)`);
  }

  // Signal 3: repeating short sequences
  const { repeats, topSig } = computeSequenceRepeats(recent);
  if (repeats >= CFG.seqRepeatThreshold) {
    score += 25;
    reasons.push(`Repeated sequence x${repeats}: ${topSig}`);
  }

  // Signal 4: multi-tab synchrony bursts
  const { syncedTabs } = computeMultiTabSynchrony(now);
  if (syncedTabs >= CFG.multiTabSyncThreshold) {
    score += 20;
    reasons.push(`Multi-tab synchrony: bursts in ${syncedTabs} tabs`);
  }

  // Cap score
  score = Math.min(100, score);

  // Keep lightweight summary too
  return {
    score,
    reasons,
    recentEvents: recent.length,
    totalEvents: events.length,
    lastTs: events.length ? events[events.length - 1].t : null
  };
}

async function storeSummary(sessionId, summary) {
  const key = `summary:${sessionId}`;
  await chrome.storage.local.set({ [key]: summary });
}

async function storeEventForExport(sessionId, evt) {
  // Keep export logs in storage (bounded)
  const key = `export:${sessionId}`;
  const existing = (await chrome.storage.local.get(key))[key] || [];
  existing.push(evt);
  // cap
  if (existing.length > CFG.maxEventsPerSession) {
    existing.splice(0, existing.length - CFG.maxEventsPerSession);
  }
  await chrome.storage.local.set({ [key]: existing });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender?.tab?.id;
  if (!tabId) return;

  if (msg.kind === "hello") {
    STATE.sessions.set(tabId, msg.sessionId);
    STATE.lastSeenByTab.set(tabId, Date.now());
    return;
  }

  if (msg.kind === "event") {
    STATE.lastSeenByTab.set(tabId, Date.now());
    STATE.sessions.set(tabId, msg.sessionId);

    const evt = {
      t: msg.t,
      dt: msg.dt,
      type: msg.type,
      path: msg.path,
      tag: msg.tag || null
    };

    pushEvent(msg.sessionId, evt);
    // store for export
    storeEventForExport(msg.sessionId, evt);

    // compute score + store summary
    const summary = scoreSession(msg.sessionId);
    storeSummary(msg.sessionId, summary);
  }
});

// For popup to request current tab summary
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind !== "getSummaryForActiveTab") return;

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const tabId = tab?.id;
    const sessionId = STATE.sessions.get(tabId);
    if (!sessionId) return sendResponse({ ok: false, error: "No session yet. Reload page." });

    const key = `summary:${sessionId}`;
    const summary = (await chrome.storage.local.get(key))[key] || scoreSession(sessionId);
    sendResponse({ ok: true, sessionId, summary });
  });

  return true; // async response
});

// Export JSONL for active tab session
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind !== "exportActiveSession") return;

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const tabId = tab?.id;
    const sessionId = STATE.sessions.get(tabId);
    if (!sessionId) return sendResponse({ ok: false, error: "No session to export." });

    const key = `export:${sessionId}`;
    const events = (await chrome.storage.local.get(key))[key] || [];

    // JSONL content
    const jsonl = events.map(e => JSON.stringify({ sessionId, ...e })).join("\n") + "\n";
    const blob = new Blob([jsonl], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
      url,
      filename: `cordbotlab_${sessionId}.jsonl`,
      saveAs: true
    }, () => {
      // after download starts, revoke later
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      sendResponse({ ok: true });
    });
  });

  return true;
});
