"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebaseFirestore";
import { getAuthVerificationGeneration, waitForAuth } from "@/lib/authState";
import { normalizeCollectionError } from "./collectionCache";
import { useAuth } from "./useAuth";

export interface DriverData {
  id: string;
  name: string;
  assignedBusId: string | null;
  authUid?: string;
  photoUrl?: string;
}

export function useDrivers() {
  const { user, loading: authLoading, refreshAccess } = useAuth();
  const [drivers, setDrivers] = useState<DriverData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryGeneration, setRetryGeneration] = useState(0);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const authGeneration = getAuthVerificationGeneration();
  const scope = !authLoading && user && (user.role === "admin" || user.role === "driver")
    ? `${user.uid}:${user.role}:${authGeneration}`
    : null;

  useEffect(() => {
    if (!user || !scope) return;

    let unsubscribe: (() => void) | undefined;
    let active = true;

    const fail = (failure: unknown) => {
      if (!active || getAuthVerificationGeneration() !== authGeneration) return;
      const normalized = normalizeCollectionError("drivers", failure);
      setError(normalized.message);
      setErrorCode(normalized.code);
      setLoadedScope(scope);
      setLoading(false);
    };
    void waitForAuth().then(() => {
      if (!active || getAuthVerificationGeneration() !== authGeneration) return;
      const source = user.role === "admin"
        ? query(collection(db, "drivers"), limit(250))
        : query(collection(db, "drivers"), where("authUid", "==", user.uid), limit(1));

      unsubscribe = onSnapshot(
        source,
        snapshot => {
          if (!active || getAuthVerificationGeneration() !== authGeneration) return;
          setError(null);
          setErrorCode(null);
          setDrivers(snapshot.docs.map(driver => ({
            id: driver.id,
            ...driver.data(),
          })) as DriverData[]);
          setLoadedScope(scope);
          setLoading(false);
        },
        fail,
      );
    }).catch(fail);

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [scope, user, retryGeneration, authGeneration]);

  const retry = useCallback(() => {
    if (loadedScope === scope && errorCode === "permission-denied") {
      void refreshAccess();
      return;
    }
    setLoadedScope(null);
    setLoading(true);
    setRetryGeneration(value => value + 1);
  }, [errorCode, loadedScope, scope, refreshAccess]);
  const hasCurrentScope = scope !== null && loadedScope === scope;
  return {
    drivers: hasCurrentScope && !error ? drivers : [],
    error: hasCurrentScope ? error : null,
    retry,
    loading: scope === null ? false : !hasCurrentScope || loading,
  };
}
