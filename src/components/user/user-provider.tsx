"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

import { getCachedRequest, primeCachedRequest } from "@/lib/client-request-cache";
import type {
  CurrentUserProfileResponse,
  UpdateCurrentUserProfileRequest,
  UpdateCurrentUserAvatarRequest
} from "@/lib/api/contracts";

export type CurrentUserProfile = CurrentUserProfileResponse;

interface UserContextValue {
  user: CurrentUserProfile | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  updateProfile: (payload: UpdateCurrentUserProfileRequest) => Promise<void>;
  uploadAvatar: (payload: UpdateCurrentUserAvatarRequest) => Promise<void>;
  deleteAvatar: () => Promise<void>;
}

const UserContext = React.createContext<UserContextValue | null>(null);

async function parseResponseOrThrow<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : undefined;
    throw new Error(message ?? "Запрос завершился ошибкой.");
  }

  return payload as T;
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [user, setUser] = React.useState<CurrentUserProfile | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (force = false) => {
    if (!session?.user?.id) {
      setUser(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const load = async () => {
        const response = await fetch("/api/user/profile", {
          method: "GET",
          cache: "no-store"
        });
        return parseResponseOrThrow<CurrentUserProfileResponse>(response);
      };
      const parsed = force
        ? await load()
        : await getCachedRequest("profile:current-user", 10_000, load);
      setUser(parsed);
      primeCachedRequest("profile:current-user", parsed, 10_000);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить профиль.");
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  React.useEffect(() => {
    if (status === "authenticated") {
      void refresh(true);
      return;
    }
    if (status === "unauthenticated") {
      setUser(null);
      setError(null);
      setLoading(false);
    }
  }, [refresh, status]);

  React.useEffect(() => {
    if (status !== "authenticated") return;

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void refresh(true);
    };

    const intervalId = window.setInterval(poll, 10_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(true);
      }
    };
    const onFocus = () => {
      void refresh(true);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, status]);

  const updateProfile = React.useCallback(
    async (payload: UpdateCurrentUserProfileRequest) => {
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const parsed = await parseResponseOrThrow<CurrentUserProfileResponse>(response);
      primeCachedRequest("profile:current-user", parsed, 10_000);
      setUser(parsed);
    },
    []
  );

  const uploadAvatar = React.useCallback(
    async (payload: UpdateCurrentUserAvatarRequest) => {
      const response = await fetch("/api/user/profile/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const parsed = await parseResponseOrThrow<CurrentUserProfileResponse>(response);
      primeCachedRequest("profile:current-user", parsed, 10_000);
      setUser(parsed);
    },
    []
  );

  const deleteAvatar = React.useCallback(async () => {
    const response = await fetch("/api/user/profile/avatar", {
      method: "DELETE"
    });
    const parsed = await parseResponseOrThrow<CurrentUserProfileResponse>(response);
    primeCachedRequest("profile:current-user", parsed, 10_000);
    setUser(parsed);
  }, []);

  const value = React.useMemo<UserContextValue>(
    () => ({
      user,
      loading,
      error,
      refresh,
      updateProfile,
      uploadAvatar,
      deleteAvatar
    }),
    [deleteAvatar, error, loading, refresh, updateProfile, uploadAvatar, user]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useCurrentUser() {
  const context = React.useContext(UserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used inside UserProvider");
  }
  return context;
}
