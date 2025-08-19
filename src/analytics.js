// /src/analytics.js
const getPlatform = () => {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'desktop';
};

const isPWA = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

/**
 * track(name, props?) → sends a custom event to Plausible/Umami if present.
 * Safe to call even if no analytics provider is loaded (no-ops).
 */
export function track(name, props = {}) {
  const payload = {
    platform: getPlatform(),
    is_pwa: isPWA(),
    is_offline: !navigator.onLine,
    ...props
  };
  if (window.plausible) window.plausible(name, { props: payload });
  if (window.umami && window.umami.track) window.umami.track(name, payload);
}

/** Optional: emits install-related events if supported. */
export function initInstallAnalytics(handler) {
  window.addEventListener('beforeinstallprompt', () => handler('INSTALL_SHOWN'));
  window.addEventListener('appinstalled', () => handler('INSTALLED'));
}
