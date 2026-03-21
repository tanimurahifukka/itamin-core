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
  selectStore: (store: StoreInfo | null) => void;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshStores: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [stores, setStores] = useState<StoreInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStore, setSelectedStore] = useState<StoreInfo | null>(null);

  const refreshStores = async () => {
    try {
      const data = await api.getStores();
      setStores(data.stores);
      if (data.stores.length === 1 && !selectedStore) {
        setSelectedStore(data.stores[0]);
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

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
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
      user, stores, loading, selectedStore,
      selectStore, signInWithGoogle, signOut, refreshStores,
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
