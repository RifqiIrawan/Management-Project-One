import { create } from 'zustand';
import type { Auth, User } from '@/types/api';

export type AuthStatus = 'unknown' | 'authenticated' | 'guest';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Access token dan kunci tanda tangan hanya di memori (tidak pernah di localStorage). */
  accessToken: string | null;
  signingKey: string | null;
  /** Selisih detik (server - klien) hasil sinkronisasi header Date. */
  clockOffsetSeconds: number;
  setSession: (a: Auth) => void;
  setUser: (u: User) => void;
  setClockOffset: (seconds: number) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  signingKey: null,
  clockOffsetSeconds: 0,
  setSession: (a) => set({ status: 'authenticated', user: a.user, accessToken: a.access_token, signingKey: a.signing_key }),
  setUser: (user) => set({ user }),
  setClockOffset: (clockOffsetSeconds) => set({ clockOffsetSeconds }),
  clear: () => set({ status: 'guest', user: null, accessToken: null, signingKey: null }),
}));