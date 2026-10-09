/**
 * Per-browser device identity + metadata, sent with scrape requests so the
 * server can link every pull (and its comments) to this machine in MongoDB.
 * The id lives in localStorage — stable per browser install, no cookies.
 */

const KEY = 'cs_device_id';

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = globalThis.crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // private mode / storage blocked — ephemeral id still lets storage work
    return `device-${globalThis.crypto.randomUUID()}`;
  }
}

export function getDeviceMeta() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform || '',
    language: navigator.language || '',
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      } catch {
        return '';
      }
    })(),
  };
}
