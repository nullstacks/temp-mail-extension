// Nullstacks Temp Mail — content script
// Detects email fields on any page; injects a small autofill pill next to them.
// Handles fill / copyToClipboard / toast commands from the service worker.

(() => {
  if (window.__nullstacksTM) return;
  window.__nullstacksTM = true;

  const PILL_ID = "__ns-tm-pill";
  let pill = null;
  let pillTarget = null;
  let hideTimer = null;

  // ---------- email field detection ----------
  function isEmailField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag !== "input") return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "email") return true;
    if (type !== "text" && type !== "tel" && type !== "") return false;
    const name = (el.name || "") + " " + (el.id || "") + " " + (el.placeholder || "") + " " + (el.getAttribute("autocomplete") || "") + " " + (el.getAttribute("aria-label") || "");
    return /e[\-_ ]?mail/i.test(name);
  }

  function findEmailFields() {
    return [...document.querySelectorAll('input[type="email"], input[type="text"]')].filter(isEmailField);
  }

  // Native setter + React/Angular-safe event dispatch
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
    // blur so lazy validators fire
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function getPrimaryEmail() {
    return new Promise((res) => {
      try {
        chrome.storage.local.get({ primary: null }, (v) => res(v.primary?.email || null));
      } catch { res(null); }
    });
  }

  // ---------- pill UI ----------
  function removePill() {
    if (pill) { pill.remove(); pill = null; pillTarget = null; }
  }

  function showPill(el) {
    if (pill && pillTarget === el) { positionPill(el); return; }
    removePill();
    pillTarget = el;
    pill = document.createElement("div");
    pill.id = PILL_ID;
    pill.setAttribute("role", "button");
    pill.title = "Fill with your Nullstacks temp mail address";
    pill.textContent = "✉ temp mail";
    Object.assign(pill.style, {
      position: "absolute",
      zIndex: "2147483646",
      background: "#0f172a",
      color: "#e2e8f0",
      border: "1px solid #334155",
      borderRadius: "999px",
      font: "600 11px/1 -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
      padding: "5px 9px",
      cursor: "pointer",
      boxShadow: "0 4px 14px rgba(0,0,0,.35)",
      userSelect: "none",
      letterSpacing: ".02em"
    });
    pill.addEventListener("mouseenter", () => { pill.style.borderColor = "#10b981"; pill.style.color = "#34d399"; });
    pill.addEventListener("mouseleave", () => { pill.style.borderColor = "#334155"; pill.style.color = "#e2e8f0"; });
    pill.addEventListener("mousedown", (e) => e.preventDefault());
    pill.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const email = await getPrimaryEmail();
      if (!email) { toast("No temp address yet — open the Nullstacks Temp Mail popup"); }
      else { setValue(el, email); toast("Filled: " + email); }
      removePill();
    });
    (document.body || document.documentElement).appendChild(pill);
    positionPill(el);
  }

  function positionPill(el) {
    if (!pill || !el) return;
    const r = el.getBoundingClientRect();
    const pw = pill.offsetWidth || 90, ph = pill.offsetHeight || 24;
    pill.style.left = Math.max(4, r.right - pw - 2) + "px";
    pill.style.top = Math.max(4, r.bottom - ph + 2 + window.scrollY) + "px";
  }

  // ---------- toast ----------
  function toast(text) {
    const t = document.createElement("div");
    t.textContent = text;
    Object.assign(t.style, {
      position: "fixed", zIndex: "2147483647",
      left: "50%", transform: "translateX(-50%)",
      bottom: "28px",
      background: "#0f172a", color: "#e2e8f0",
      border: "1px solid #10b981",
      borderRadius: "8px",
      font: "500 13px/1.4 -apple-system, system-ui, Segoe UI, Roboto, sans-serif",
      padding: "10px 16px",
      boxShadow: "0 10px 30px rgba(0,0,0,.45)",
      maxWidth: "80vw", wordBreak: "break-all",
      opacity: "0", transition: "opacity .18s ease"
    });
    (document.body || document.documentElement).appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; });
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 250);
    }, 2600);
  }

  // ---------- clipboard (page context = user-gesture-safe) ----------
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        (document.body || document.documentElement).appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch { return false; }
    }
  }

  // ---------- focus-follow pill ----------
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (isEmailField(el)) {
      clearTimeout(hideTimer);
      showPill(el);
    } else if (pill && !pill.contains(e.target)) {
      hideTimer = setTimeout(() => { if (!pill?.matches(":hover")) removePill(); }, 300);
    }
  }, true);

  window.addEventListener("scroll", () => { if (pill && pillTarget) positionPill(pillTarget); }, { passive: true });
  window.addEventListener("resize", () => { if (pill && pillTarget) positionPill(pillTarget); }, { passive: true });

  // ---------- messages from service worker ----------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === "fill") {
        const fields = findEmailFields();
        if (!fields.length) { sendResponse({ ok: false, error: "No email field found on page" }); return; }
        // pick the most-likely field: visible first, then first in DOM
        const visible = fields.find((el) => el.offsetParent !== null && el.getBoundingClientRect().width > 0);
        setValue(visible || fields[0], msg.email);
        toast("Filled: " + msg.email);
        sendResponse({ ok: true, filled: true });
      } else if (msg?.type === "copyToClipboard") {
        const ok = await copyText(msg.text);
        if (ok) toast("Copied: " + msg.text);
        sendResponse({ ok });
      } else if (msg?.type === "toast") {
        toast(msg.text || "");
        sendResponse({ ok: true });
      }
    })();
    return true;
  });
})();
