const STORAGE_KEY = 'crm_notifications_muted';

let _muted = false;

// Inicializar do localStorage
try {
  _muted = localStorage.getItem(STORAGE_KEY) === 'true';
} catch {}

const _listeners = new Set<(muted: boolean) => void>();

export function isNotificationsMuted(): boolean {
  return _muted;
}

export function setNotificationsMuted(muted: boolean) {
  _muted = muted;
  try { localStorage.setItem(STORAGE_KEY, String(muted)); } catch {}
  _listeners.forEach(fn => fn(muted));
}

export function toggleNotificationsMuted(): boolean {
  setNotificationsMuted(!_muted);
  return _muted;
}

export function onMuteChange(fn: (muted: boolean) => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
