const scoreEl = document.getElementById("score");
const recentEl = document.getElementById("recent");
const totalEl = document.getElementById("total");
const reasonsEl = document.getElementById("reasons");
const statusEl = document.getElementById("status");

document.getElementById("refresh").addEventListener("click", load);
document.getElementById("export").addEventListener("click", exportLogs);

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function render(summary) {
  scoreEl.textContent = summary.score ?? "--";
  recentEl.textContent = summary.recentEvents ?? "--";
  totalEl.textContent = summary.totalEvents ?? "--";

  reasonsEl.innerHTML = "";
  const reasons = summary.reasons || [];
  if (!reasons.length) {
    const li = document.createElement("li");
    li.textContent = "No strong bot-like signals detected.";
    reasonsEl.appendChild(li);
    return;
  }
  for (const r of reasons) {
    const li = document.createElement("li");
    li.textContent = r;
    reasonsEl.appendChild(li);
  }
}

function load() {
  setStatus("Loading...");
  chrome.runtime.sendMessage({ kind: "getSummaryForActiveTab" }, (resp) => {
    if (!resp || !resp.ok) {
      setStatus(resp?.error || "Open a webpage and interact, then refresh.");
      scoreEl.textContent = "--";
      reasonsEl.innerHTML = "";
      return;
    }
    render(resp.summary);
    setStatus(`Session: ${resp.sessionId.slice(0, 8)}…`);
  });
}

function exportLogs() {
  setStatus("Exporting...");
  chrome.runtime.sendMessage({ kind: "exportActiveSession" }, (resp) => {
    if (!resp || !resp.ok) {
      setStatus(resp?.error || "Export failed.");
      return;
    }
    setStatus("Export started (check downloads).");
  });
}

load();
