import { createContext, useContext, ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CgtUser, UserRole } from '../types/database';

interface AuthContextType {
  user: User | null;
  profile: CgtUser | null;
  role: UserRole;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';

const mockUser = {
  id: MOCK_USER_ID,
  email: 'guest@local',
  app_metadata: {},
  user_metadata: { name: 'Guest' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User;

const mockProfile: CgtUser = {
  id: MOCK_USER_ID,
  email: 'guest@local',
  name: 'Guest',
  role: 'admin',
  created_at: new Date().toISOString(),
} as CgtUser;

export function AuthProvider({ children }: { children: ReactNode }) {
  const value: AuthContextType = {
    user: mockUser,
    profile: mockProfile,
    role: 'admin' as UserRole,
    loading: false,
    signIn: async () => ({ error: null }),
    signUp: async () => ({ error: null }),
    signOut: async () => {},
    refreshProfile: async () => {},
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
