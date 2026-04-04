/**
 * LIFF 初期化ユーティリティ
 * LIFF SDK は CDN から読み込む前提。window.liff を使う。
 */

declare global {
  interface Window {
    liff: any;
  }
}

let liffInitialized = false;
let liffError: string | null = null;

export async function initLiff(): Promise<{ ok: boolean; error?: string }> {
  if (liffInitialized) return { ok: true };

  const liffId = (import.meta as any).env?.VITE_LINE_LIFF_ID;
  if (!liffId) {
    return { ok: false, error: 'LIFF ID is not configured' };
  }

  if (!window.liff) {
    return { ok: false, error: 'LIFF SDK not loaded' };
  }

  try {
    await window.liff.init({ liffId });
    liffInitialized = true;
    return { ok: true };
  } catch (e: any) {
    liffError = e.message;
    return { ok: false, error: e.message };
  }
}

export function isInLiff(): boolean {
  return !!(window.liff && window.liff.isInClient && window.liff.isInClient());
}

export function isLiffLoggedIn(): boolean {
  return !!(window.liff && window.liff.isLoggedIn && window.liff.isLoggedIn());
}

export async function getLiffProfile(): Promise<{
  userId: string;
  displayName: string;
  pictureUrl?: string;
} | null> {
  if (!window.liff || !liffInitialized) return null;
  try {
    const profile = await window.liff.getProfile();
    return {
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    };
  } catch {
    return null;
  }
}

export function liffLogin() {
  if (window.liff && !window.liff.isLoggedIn()) {
    window.liff.login();
  }
}

export function closeLiff() {
  if (window.liff && window.liff.isInClient()) {
    window.liff.closeWindow();
  }
}
