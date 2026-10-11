/*! Frilensa booking widget. Paste on any website:
 *   <div data-frilensa-booking="your-business"></div>
 *   <script src="https://frilensa.com/embed/booking.js" async></script>
 * Optional attributes: data-service="<serviceId>" (preselect), data-label="Book now", data-colour="#0f766e".
 * When a booking is sent, the element fires a "frilensa:booking" event with { ref, slug } in event.detail.
 */
(function () {
  'use strict';
  if (window.__frilensaBooking) return;
  window.__frilensaBooking = true;

  var script = document.currentScript || document.querySelector('script[src*="/embed/booking.js"]');
  var ORIGIN = 'https://frilensa.com';
  try { ORIGIN = new URL(script.src).origin; } catch (e) { /* keep default */ }
  var SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
  var COLOUR = /^#[0-9a-fA-F]{3,8}$/;
  var overlay = null, lastTrigger = null, openFor = null;

  function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.style.overflow = '';
    if (lastTrigger) lastTrigger.focus();
  }

  function open(el) {
    var slug = el.getAttribute('data-frilensa-booking');
    if (!SLUG.test(slug || '')) return;
    close();
    lastTrigger = el.querySelector('button');
    openFor = el;
    var params = new URLSearchParams({ embed: '1', host: location.href.slice(0, 2000) });
    var service = el.getAttribute('data-service');
    if (service) params.set('service', service.slice(0, 200));

    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Booking');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    var box = document.createElement('div');
    box.style.cssText = 'position:relative;width:100%;max-width:640px;height:min(92vh,860px);background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3);';
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    x.style.cssText = 'position:absolute;top:8px;right:10px;z-index:1;width:34px;height:34px;border:0;border-radius:999px;background:#f1f5f9;color:#0f172a;font:600 20px/1 sans-serif;cursor:pointer;';
    x.onclick = close;
    var frame = document.createElement('iframe');
    frame.src = ORIGIN + '/book/' + encodeURIComponent(slug) + '?' + params.toString();
    frame.title = 'Booking form';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
    frame.setAttribute('allow', 'payment');
    box.appendChild(x);
    box.appendChild(frame);
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden';
    x.focus();
  }

  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'frilensa:booking-sent' && openFor) {
      openFor.dispatchEvent(new CustomEvent('frilensa:booking', { bubbles: true, detail: { ref: String(e.data.ref || ''), slug: String(e.data.slug || '') } }));
    }
    if (e.data.type === 'frilensa:close') close();
  });

  function mount(el) {
    if (el.__frilensaMounted) return;
    el.__frilensaMounted = true;
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = (el.getAttribute('data-label') || 'Book now').slice(0, 60);
    var colour = el.getAttribute('data-colour') || el.getAttribute('data-color') || '#0f766e';
    if (!COLOUR.test(colour)) colour = '#0f766e';
    b.style.cssText = 'background:' + colour + ';color:#fff;border:0;border-radius:10px;padding:12px 20px;font:600 15px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;';
    b.onclick = function () { open(el); };
    el.appendChild(b);
  }

  function scan() { document.querySelectorAll('[data-frilensa-booking]').forEach(mount); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
})();
