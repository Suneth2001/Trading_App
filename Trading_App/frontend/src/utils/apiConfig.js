/**
 * API Configuration & Multi-Platform Server Resolver
 * Supports Desktop Web, GitHub Pages / Cloud PWA (iPhone & Android), and Android/iOS Capacitor Apps
 * with automatic zero-delay fallback to the Embedded Standalone Trading Engine.
 */
import { standaloneEngine } from './standaloneEngine.js';

export function isStaticCloudHost() {
  const host = window.location.hostname || '';
  return (
    host.endsWith('github.io') ||
    host.endsWith('netlify.app') ||
    host.endsWith('vercel.app') ||
    host.endsWith('pages.dev')
  );
}

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

  if (isStaticCloudHost()) {
    // On GitHub Pages / Cloud PWA, use Embedded Standalone Engine by default
    return '';
  }

  if (isNativeApp()) {
    // Default LAN backend IP for Android/iOS native app
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
 * 1. Routes /api calls to the configured backend server if reachable and returning JSON.
 * 2. Automatically falls back to the in-app Standalone Trading Engine if running on
 *    GitHub Pages (iPhone PWA) or when the PC backend server is offline.
 */
export function setupApiInterceptor() {
  if (window._nativeFetch) return;
  const originalFetch = window.fetch.bind(window);
  window._nativeFetch = originalFetch;

  const hasSavedServer = Boolean(localStorage.getItem('apex_server_url')?.trim());
  let backendReachable = !isNativeApp() && (!isStaticCloudHost() || hasSavedServer);
  let lastCheckTime = 0;

  window.fetch = async function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      const serverUrl = getServerUrl();
      const fullUrl = serverUrl ? `${serverUrl}${input}` : input;
      const onStaticHostWithoutServer = isStaticCloudHost() && !serverUrl;

      const now = Date.now();
      if (!onStaticHostWithoutServer && (backendReachable || now - lastCheckTime > 12000)) {
        lastCheckTime = now;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), isNativeApp() ? 2200 : 5000);
          const res = await originalFetch(fullUrl, {
            ...init,
            signal: controller.signal
          });
          clearTimeout(timer);

          const contentType = res.headers.get('content-type') || '';
          if (res.status !== 404 && contentType.includes('application/json')) {
            backendReachable = true;
            return res;
          }
          backendReachable = false;
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
