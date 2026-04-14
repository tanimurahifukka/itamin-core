import { RefObject } from 'react';

export interface ProfileDropdownProps {
  displayName: string;
  picture?: string;
  showProfileMenu: boolean;
  setShowProfileMenu: (v: boolean) => void;
  profileRef: RefObject<HTMLDivElement | null>;
  user: { email?: string } | null;
  selectedStore: { id: string; name: string } | null;
  selectStore: (store: null) => void;
  signOut: () => void;
}

/**
 * ヘッダー右上のプロフィールドロップダウン。
 * 旧 .profile-area / .profile-trigger / .profile-avatar* / .profile-name /
 * .profile-dropdown* を内包する。
 */
export const ProfileDropdown = ({
  displayName,
  picture,
  showProfileMenu,
  setShowProfileMenu,
  profileRef,
  user,
  selectedStore,
  selectStore,
  signOut,
}: ProfileDropdownProps) => (
  <div className="relative" ref={profileRef}>
    <button
      type="button"
      className="flex items-center gap-2 rounded-full border border-border bg-transparent p-1 text-text transition-colors hover:border-sumi-500 md:py-1 md:pl-1 md:pr-3"
      onClick={() => setShowProfileMenu(!showProfileMenu)}
    >
      {picture ? (
        <img src={picture} alt={displayName} className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap text-[0.85rem] md:inline">
        {displayName}
      </span>
    </button>
    {showProfileMenu && (
      <div className="absolute right-0 top-[calc(100%+8px)] z-[200] min-w-[200px] animate-[dropdownFadeIn_0.15s_ease] rounded-[10px] bg-surface p-4 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
        <div className="mb-0.5 text-[0.95rem] font-semibold text-text">{displayName}</div>
        {user?.email && (
          <div className="mb-3 break-all text-[0.8rem] text-text-description">{user.email}</div>
        )}
        {selectedStore && (
          <button
            type="button"
            className="w-full rounded-md border border-border bg-surface p-2.5 text-[0.85rem] text-text hover:bg-bg"
            onClick={() => {
              selectStore(null);
              setShowProfileMenu(false);
            }}
          >
            事業所を切り替え
          </button>
        )}
        <button
          type="button"
          className="mt-2 w-full rounded-md border border-error p-2.5 text-[0.85rem] text-error hover:bg-error-bg"
          onClick={signOut}
        >
          ログアウト
        </button>
      </div>
    )}
  </div>
);
