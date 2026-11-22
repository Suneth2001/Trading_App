/**
 * API Configuration & Multi-Platform Server Resolver
 * Supports Desktop Web, Mobile Browser, and Android Capacitor APK with
 * automatic fallback to the Embedded Standalone Trading Engine.
 */
import { standaloneEngine } from './standaloneEngine.js';

export function isNativeApp() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
    window.location.protocol === 'capacitor:' ||
    (window.location.origin.includes('localhost') && !window.location.port)
  );
}

export function getServerUrl() {
  const saved = localStorage.getItem('apex_server_url');
  if (saved && saved.trim()) {
    return saved.trim().replace(/\/+$/, '');
  }

  if (isNativeApp()) {
    // Default LAN backend IP for Android APK
    return 'http://192.168.1.4:5000';
  }

  // When running in desktop/browser, Vite dev server proxies relative /api
  return '';
}

export function setServerUrl(url) {
  if (url && url.trim()) {
    localStorage.setItem('apex_server_url', url.trim().replace(/\/+$/, ''));
  } else {
    localStorage.removeItem('apex_server_url');
  }
}

export function getSocketUrl() {
  const server = getServerUrl();
  return server || '/';
}

/**
 * Global fetch interceptor:
 * 1. Routes /api calls to the configured backend server if reachable.
 * 2. Automatically falls back to the in-app Standalone Trading Engine if the
 *    PC backend server is offline or unreachable (e.g. Android APK on mobile data).
 */
export function setupApiInterceptor() {
  if (window._nativeFetch) return;
  const originalFetch = window.fetch.bind(window);
  window._nativeFetch = originalFetch;

  let backendReachable = !isNativeApp();
  let lastCheckTime = 0;

  window.fetch = async function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      const serverUrl = getServerUrl();
      const fullUrl = serverUrl ? `${serverUrl}${input}` : input;

      // Try external backend if recently reachable or due for a retry check
      const now = Date.now();
      if (backendReachable || now - lastCheckTime > 12000) {
        lastCheckTime = now;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), isNativeApp() ? 2200 : 6000);
          const res = await originalFetch(fullUrl, {
            ...init,
            signal: controller.signal
          });
          clearTimeout(timer);
          backendReachable = true;
          return res;
        } catch {
          backendReachable = false;
        }
      }

      // Seamless fallback to Embedded Standalone Engine
      try {
        const data = await standaloneEngine.handleApiRequest(input, init);
        return new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        const status = err?.status || 400;
        const payload = err?.data || { error: err?.message || 'Operation failed' };
        return new Response(JSON.stringify(payload), {
          status,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return originalFetch(input, init);
  };
}
