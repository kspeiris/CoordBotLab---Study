(() => {
  // Per-tab session id (not cross-site tracking)
  const sessionId = crypto.randomUUID();
  const start = performance.now();

  // Throttle scroll events
  let lastScrollSent = 0;

  function send(type, extra = {}) {
    const payload = {
      kind: "event",
      sessionId,
      type,
      t: Date.now(),
      dt: Math.round(performance.now() - start),
      path: location.pathname, // no full URL, no query string
      ...extra
    };
    chrome.runtime.sendMessage(payload);
  }

  // Clicks (no element text captured)
  document.addEventListener(
    "click",
    (e) => {
      // minimal metadata: tag name only
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "unknown";
      send("click", { tag });
    },
    true
  );

  // Keydown (no key captured, only count)
  document.addEventListener(
    "keydown",
    () => {
      send("keydown");
    },
    true
  );

  // Scroll (throttled)
  window.addEventListener(
    "scroll",
    () => {
      const now = Date.now();
      if (now - lastScrollSent < 300) return;
      lastScrollSent = now;
      send("scroll");
    },
    { passive: true }
  );

  // Let background know the tab is active (useful for UI)
  chrome.runtime.sendMessage({
    kind: "hello",
    sessionId,
    path: location.pathname,
    t: Date.now()
  });
})();
