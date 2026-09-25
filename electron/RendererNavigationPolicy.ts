import type { WebContents } from 'electron';
import { isAllowedExternalUrl } from './services/ExternalUrlPolicy';

/**
 * Renderer documents may stay on the app entry point only. In dev this is the
 * local Vite origin; in packaged builds it is the exact bundled index.html.
 */
export function isAllowedRendererNavigation(candidate: string, appUrl: string): boolean {
  try {
    const target = new URL(candidate);
    const trusted = new URL(appUrl);

    if (trusted.protocol === 'http:') {
      return target.protocol === 'http:' &&
        target.hostname === 'localhost' &&
        target.port === '5180' &&
        target.pathname === trusted.pathname &&
        target.username === '' &&
        target.password === '';
    }

    return trusted.protocol === 'file:' &&
      target.protocol === 'file:' &&
      target.hostname === trusted.hostname &&
      target.pathname === trusted.pathname &&
      target.username === '' &&
      target.password === '';
  } catch {
    return false;
  }
}

/** Install deny-by-default top-level navigation and window-open controls. */
export function installRendererNavigationGuards(
  webContents: WebContents,
  appUrl: string,
  openExternal: (url: string) => Promise<void>,
): void {
  webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url, appUrl)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) {
      void openExternal(url).catch((error) => {
        console.warn('[RendererBoundary] Failed to open approved external URL:', error);
      });
    }
  });

  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void openExternal(url).catch((error) => {
        console.warn('[RendererBoundary] Failed to open approved external URL:', error);
      });
    }
    return { action: 'deny' };
  });
}
