import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, supabaseAuthStorageKey } from "../lib/supabaseClient";
import { normalizeRole, type AppRole } from "../lib/roles";

type AuthRoleState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: AppRole | null;
};

const AUTH_BOOTSTRAP_TIMEOUT_MS = 5000;
const AUTH_STORAGE_FALLBACK_MS = 3000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error(`${label} timed out`));
      }, timeoutMs);
    }),
  ]);
}

async function fetchRoleForUser(userId: string): Promise<AppRole> {
  const { data, error } = await withTimeout(
    supabase
      .from("user_information")
      .select("role")
      .eq("auth_user_id", userId)
      .maybeSingle(),
    AUTH_BOOTSTRAP_TIMEOUT_MS,
    "Loading user role",
  );

  if (error) {
    throw error;
  }

  return normalizeRole(data?.role);
}

export async function getUserRole(userId: string): Promise<AppRole> {
  return fetchRoleForUser(userId);
}

function readPersistedSession(): Session | null {
  try {
    const rawValue = window.localStorage.getItem(supabaseAuthStorageKey);
    if (!rawValue) return null;

    const parsedValue = JSON.parse(rawValue) as Partial<Session> & {
      currentSession?: Partial<Session>;
    };
    const maybeSession = parsedValue.currentSession ?? parsedValue;

    if (!maybeSession.access_token || !maybeSession.refresh_token || !maybeSession.user) {
      return null;
    }

    return maybeSession as Session;
  } catch (error) {
    console.error("Failed to read persisted auth session:", error);
    return null;
  }
}

const AuthRoleContext = createContext<AuthRoleState | null>(null);

function useAuthRoleState(): AuthRoleState {
  const [state, setState] = useState<AuthRoleState>({
    loading: true,
    session: null,
    user: null,
    role: null,
  });

  useEffect(() => {
    let active = true;
    let authBootstrapResolved = false;

    const syncSession = async (session: Session | null) => {
      const user = session?.user ?? null;

      if (!user) {
        if (!active) return;
        setState({
          loading: false,
          session: null,
          user: null,
          role: null,
        });
        return;
      }

      try {
        const role = await fetchRoleForUser(user.id);

        if (!active) return;
        setState({
          loading: false,
          session,
          user,
          role,
        });
      } catch (error) {
        console.error("Failed to load user role:", error);

        if (!active) return;
        setState({
          loading: false,
          session,
          user,
          role: "user",
        });
      }
    };

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        authBootstrapResolved = true;
        void syncSession(data.session);
      })
      .catch((error) => {
        authBootstrapResolved = true;
        console.error("Failed to load auth session:", error);

        if (!active) return;
        setState({
          loading: false,
          session: null,
          user: null,
          role: null,
        });
      });

    window.setTimeout(() => {
      if (!active || authBootstrapResolved) return;

      const persistedSession = readPersistedSession();
      if (persistedSession) {
        void syncSession(persistedSession);
        return;
      }

      setState({
        loading: false,
        session: null,
        user: null,
        role: null,
      });
    }, AUTH_STORAGE_FALLBACK_MS);

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      authBootstrapResolved = true;
      window.setTimeout(() => {
        void syncSession(session);
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const state = useAuthRoleState();

  return createElement(AuthRoleContext.Provider, { value: state }, children);
}

export function useAuthRole(): AuthRoleState {
  const state = useContext(AuthRoleContext);

  if (!state) {
    throw new Error("useAuthRole must be used within AuthRoleProvider");
  }

  return state;
}
