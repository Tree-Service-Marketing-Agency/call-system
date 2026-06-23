/*
 * Chat widget loader (v1). Vanilla, no build step. ADR-014.
 *
 * Embed with:
 *   <script async src="https://your-app.com/widget.v1.js"
 *           data-key="EMBED_KEY" data-color="#4f46e5" data-title="Chat with us"></script>
 *
 * Renders a floating bubble bottom-right. The chat itself loads in an iframe
 * (lazily, on first open) pointing at /widget on this app's origin.
 */
(function () {
  "use strict";

  // Capture the script element synchronously (currentScript is null in async
  // callbacks later).
  var SCRIPT = document.currentScript;
  if (!SCRIPT) return;

  var key = SCRIPT.dataset.key;
  if (!key) return; // no key → render nothing.

  var color = SCRIPT.dataset.color || "#4f46e5";
  var title = SCRIPT.dataset.title || "Chat with us";

  // Where to load the iframe from, and the only origin we trust for postMessage.
  var ORIGIN = new URL(SCRIPT.src).origin;

  // Host element + shadow root isolate the widget's CSS from the host site
  // (both ways).
  var host = document.createElement("div");
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  var style = document.createElement("style");
  style.textContent =
    ".cw-bubble{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;" +
    "box-shadow:0 4px 12px rgba(0,0,0,.25);z-index:2147483000;display:flex;align-items:center;justify-content:center;color:#fff}" +
    ".cw-bubble svg{width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2}" +
    ".cw-panel{position:fixed;right:20px;bottom:88px;width:380px;height:560px;max-width:calc(100vw - 40px);max-height:calc(100dvh - 108px);" +
    "border:0;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.28);z-index:2147483000;background:#fff;display:none}" +
    ".cw-panel.cw-open{display:block}" +
    ".cw-panel iframe{width:100%;height:100%;border:0;display:block}" +
    "@media (max-width:480px){.cw-panel{right:8px;bottom:80px;width:calc(100vw - 16px);height:calc(100dvh - 96px)}}";
  root.appendChild(style);

  // Bubble button.
  var bubble = document.createElement("button");
  bubble.className = "cw-bubble";
  bubble.style.backgroundColor = color;
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  root.appendChild(bubble);

  // Panel (the iframe lives inside; created lazily on first open — story 6).
  var panel = document.createElement("div");
  panel.className = "cw-panel";
  root.appendChild(panel);

  var iframe = null;
  var open = false;

  function ensureIframe() {
    if (iframe) return;
    iframe = document.createElement("iframe");
    iframe.title = title;
    iframe.src =
      ORIGIN +
      "/widget?key=" +
      encodeURIComponent(key) +
      "&color=" +
      encodeURIComponent(color) +
      "&title=" +
      encodeURIComponent(title);
    panel.appendChild(iframe);
  }

  function openPanel() {
    ensureIframe();
    panel.classList.add("cw-open");
    open = true;
    bubble.setAttribute("aria-label", "Close chat");
  }

  function closePanel() {
    panel.classList.remove("cw-open");
    open = false;
    bubble.setAttribute("aria-label", "Open chat");
  }

  bubble.addEventListener("click", function () {
    if (open) closePanel();
    else openPanel();
  });

  // The chat iframe asks to close via postMessage — only trust our own origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== ORIGIN) return;
    if (e.data && e.data.type === "chat-widget:close") closePanel();
  });
})();
