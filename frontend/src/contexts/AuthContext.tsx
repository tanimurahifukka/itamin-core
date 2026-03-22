import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../api/supabase';
import { api } from '../api/client';
import type { User, Session } from '@supabase/supabase-js';

interface StoreInfo {
  id: string;
  name: string;
  role: string;
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

  const refreshStores = async () => {
    try {
      const data = await api.getStores();
      setStores(data.stores);
      // Auto-select if only one store and nothing selected (or saved selection no longer valid)
      if (data.stores.length === 1 && !selectedStore) {
        setSelectedStore(data.stores[0]);
      }
      // Validate that saved selectedStore still exists in the store list
      if (selectedStore && !data.stores.find((s: StoreInfo) => s.id === selectedStore.id)) {
        setSelectedStore(data.stores.length === 1 ? data.stores[0] : null);
      }
    } catch {
      setStores([]);
    }
  };

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
  }, []);

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
      } catch (e: any) {
        return { error: `アカウント作成済み。事業所登録に失敗: ${e.message}` };
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

    // トリガーでstore_staffに追加されるまで少し待つ
    await new Promise(r => setTimeout(r, 500));

    try {
      await refreshStores();
    } catch (e: any) {
      return { error: e.message };
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
