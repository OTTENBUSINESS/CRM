// ========== CALL MODE - Silencia notificações durante chamadas/reuniões ==========
// Módulo isolado para evitar acoplamento HMR entre CallContext e useNotifications
let _callModeActive = false;

export function setCallMode(active: boolean) {
  _callModeActive = active;
}

export function isCallModeActive(): boolean {
  return _callModeActive;
}
