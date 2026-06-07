/**
 * VH Notify Network — Universal Subdomain Script
 * ──────────────────────────────────────────────────────
 * Deploy at the ROOT of each GitHub Pages subdomain repo.
 * Use via script tag:
 *
 *   <script src="/vh-notify.js"
 *           data-source="radio"
 *           data-api="https://vhoriginal.com/wp-json/vh-notify/v1">
 *   </script>
 *
 * Change data-source per subdomain:
 *   radio | relax | mausam | game | lucky-number
 * ──────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // ── Config from data attributes ──────────────────────────────────────────
  const scripts  = document.currentScript
                || document.querySelector('script[data-source][data-api]');
  const SOURCE   = (scripts && scripts.dataset.source) || 'unknown';
  const API_BASE = (scripts && scripts.dataset.api)    || 'https://vhoriginal.com/wp-json/vh-notify/v1';
  const SW_URL   = '/sw.js';

  const STORE_KEY   = 'vhn_subscribed';
  const DISMISS_KEY = 'vhn_popup_dismissed';

  // ── Helpers ──────────────────────────────────────────────────────────────
  function urlB64ToUint8Array(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }

  function isSubscribed()  { return localStorage.getItem(STORE_KEY) === '1'; }
  function isDismissed()   {
    const ts = parseInt(localStorage.getItem(DISMISS_KEY) || '0');
    return ts > 0 && (Date.now() - ts) < 7 * 24 * 3600 * 1000;
  }

  // ── Fetch VAPID public key from WordPress ────────────────────────────────
  async function getPublicKey() {
    try {
      const r   = await fetch(API_BASE + '/vapid-key');
      const d   = await r.json();
      return d.publicKey || '';
    } catch (_) { return ''; }
  }

  // ── Subscribe ─────────────────────────────────────────────────────────────
  async function subscribe(publicKey) {
    try {
      const sw  = await navigator.serviceWorker.ready;
      const sub = await sw.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlB64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await fetch(API_BASE + '/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh:   json.keys.p256dh,
          auth:     json.keys.auth,
          source:   SOURCE,
        }),
      });
      localStorage.setItem(STORE_KEY, '1');
      return true;
    } catch (err) {
      console.warn('[VHN Subdomain] Subscribe error:', err);
      return false;
    }
  }

  // ── Popup ─────────────────────────────────────────────────────────────────
  function injectStyles() {
    const s = document.createElement('style');
    s.textContent = `
      #vhn-popup{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(120px);
        z-index:999999;opacity:0;transition:opacity .35s ease,transform .35s ease;
        max-width:360px;width:calc(100% - 32px)}
      #vhn-popup.vhn-on{opacity:1;transform:translateX(-50%) translateY(0)}
      #vhn-inner{background:#1a1a1a;border:1px solid #333;border-radius:16px;
        padding:22px 24px;box-shadow:0 8px 32px rgba(0,0,0,.5);text-align:center}
      #vhn-icon{font-size:36px;margin-bottom:10px}
      #vhn-title{font-size:17px;font-weight:700;color:#fff;margin-bottom:8px;line-height:1.3}
      #vhn-text{font-size:13px;color:#aaa;line-height:1.5;margin-bottom:18px}
      #vhn-btns{display:flex;gap:10px;justify-content:center}
      #vhn-yes{background:#e53935;color:#fff;border:none;padding:10px 24px;
        border-radius:30px;font-size:14px;font-weight:700;cursor:pointer}
      #vhn-yes:hover{background:#c62828}
      #vhn-no{background:transparent;color:#888;border:1px solid #444;
        padding:10px 20px;border-radius:30px;font-size:14px;cursor:pointer}
      #vhn-no:hover{border-color:#666;color:#aaa}
    `;
    document.head.appendChild(s);
  }

  function buildPopup(publicKey) {
    injectStyles();
    const wrap = document.createElement('div');
    wrap.id = 'vhn-popup';
    wrap.innerHTML = `
      <div id="vhn-inner">
        <div id="vhn-icon">🔔</div>
        <div id="vhn-title">अपडेट मिस मत कीजिए</div>
        <div id="vhn-text">नए आर्टिकल, टूल, रेडियो अपडेट और खास कंटेंट पाने के लिए नोटिफिकेशन चालू करें।</div>
        <div id="vhn-btns">
          <button id="vhn-yes">YES 😃</button>
          <button id="vhn-no">NO 😞</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('vhn-on')));

    document.getElementById('vhn-yes').addEventListener('click', async () => {
      wrap.remove();
      const perm = Notification.permission === 'granted'
                 ? 'granted'
                 : await Notification.requestPermission();
      if (perm === 'granted') await subscribe(publicKey);
    });

    document.getElementById('vhn-no').addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      wrap.classList.remove('vhn-on');
      setTimeout(() => wrap.remove(), 400);
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (isSubscribed() || isDismissed()) return;

    // Register service worker
    try {
      await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    } catch (e) {
      console.warn('[VHN Subdomain] SW register failed:', e);
      return;
    }

    // Get VAPID public key from WordPress
    const publicKey = await getPublicKey();
    if (!publicKey) { console.warn('[VHN Subdomain] No VAPID key from API'); return; }

    // Show popup after 10s
    setTimeout(() => buildPopup(publicKey), 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
