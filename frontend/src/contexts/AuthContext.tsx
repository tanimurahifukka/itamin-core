import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import { api } from '../api/client';
import type { User } from '@supabase/supabase-js';

interface StoreInfo {
  id: string;
  name: string;
  role: string;
  address?: string;
}

interface AuthContextType {
  user: User | null;
  stores: StoreInfo[];
  loading: boolean;
  selectedStore: StoreInfo | null;
  requiresPasswordChange: boolean;
  selectStore: (store: StoreInfo | null) => void;
  signUp: (email: string, password: string, name: string, storeName: string) => Promise<{ error?: string }>;
  completeInvitedSignUp: (email: string, password: string, name: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refreshStores: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(() => {
    try {
      const saved = localStorage.getItem('itamin_selectedStore');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persist selectedStore to localStorage
  useEffect(() => {
    if (selectedStore) {
      localStorage.setItem('itamin_selectedStore', JSON.stringify(selectedStore));
    } else {
      localStorage.removeItem('itamin_selectedStore');
    }
  }, [selectedStore]);

  const refreshStores = useCallback(async () => {
    try {
      const data = await api.getStores();
      const nextStores: StoreInfo[] = data.stores;
      setStores(nextStores);

      setSelectedStore(prev => {
        if (nextStores.length === 1 && !prev) {
          return nextStores[0];
        }
        if (prev) {
          const refreshedSelected = nextStores.find((store: StoreInfo) => store.id === prev.id);
          if (!refreshedSelected) {
            return nextStores.length === 1 ? nextStores[0] : null;
          }
          if (
            refreshedSelected.name !== prev.name ||
            refreshedSelected.role !== prev.role ||
            refreshedSelected.address !== prev.address
          ) {
            return refreshedSelected;
          }
        }
        return prev;
      });
    } catch {
      setStores([]);
    }
  }, []);

  useEffect(() => {
    // 初期セッション確認
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        refreshStores();
      }
      setLoading(false);
    });

    // Auth状態変化を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          refreshStores();
        } else {
          setStores([]);
          setSelectedStore(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [refreshStores]);

  const signUp = async (email: string, password: string, name: string, storeName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) return { error: error.message };

    // ユーザー作成後、事業所を自動作成
    if (data.session) {
      try {
        await api.createStore(storeName);
        await refreshStores();
      } catch (e: unknown) {
        return { error: `アカウント作成済み。事業所登録に失敗: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    return {};
  };

  const completeInvitedSignUp = async (email: string, password: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (error) return { error: error.message };

    // signUp後にセッションがない場合はsignInでログイン
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) return { error: signInErr.message };
    }

    // トリガーでstore_staffに追加されるまでリトライ（最大3回、500ms間隔）
    let found = false;
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        await refreshStores();
        const data = await api.getStores();
        if (data.stores && data.stores.length > 0) {
          found = true;
          break;
        }
      } catch {
        // リトライ継続
      }
    }
    if (!found) {
      return { error: '店舗情報の取得に失敗しました。再読込してください。' };
    }

    return {};
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  };

  const requiresPasswordChange = !!(user && user.user_metadata?.password_changed === false);

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { password_changed: true },
    });
    if (error) return { error: error.message };
    // Update local user state
    const { data: { user: updatedUser } } = await supabase.auth.getUser();
    if (updatedUser) setUser(updatedUser);
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStores([]);
    setSelectedStore(null);
  };

  const selectStore = (store: StoreInfo | null) => {
    setSelectedStore(store);
  };

  return (
    <AuthContext.Provider value={{
      user, stores, loading, selectedStore, requiresPasswordChange,
      selectStore, signUp, completeInvitedSignUp, signIn, signOut, refreshStores, changePassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
