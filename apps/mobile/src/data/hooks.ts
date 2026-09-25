import type { Cafe, CafeSummary } from '@cflog/shared';
import { useCallback, useEffect, useState } from 'react';

import { getDataSource } from './source';

export type LoadState<T> =
  { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: T };

function useLoad<T>(
  key: string | null,
  load: () => Promise<T>,
): LoadState<T> & { retry: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ token: string; state: LoadState<T> } | null>(null);
  const token = key === null ? null : `${key}#${attempt}`;
  useEffect(() => {
    if (token === null) return;
    let alive = true;
    load()
      .then((data) => alive && setResult({ token, state: { status: 'ready', data } }))
      .catch(
        (err: unknown) =>
          alive &&
          setResult({
            token,
            state: { status: 'error', error: err instanceof Error ? err.message : String(err) },
          }),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  // A result for an older key/attempt means the new one is still loading.
  const state: LoadState<T> =
    token !== null && result?.token === token ? result.state : { status: 'loading' };
  return { ...state, retry };
}

export function useCityCafes(cityId: string) {
  return useLoad<CafeSummary[]>(cityId, () => getDataSource().cityIndex(cityId));
}

export function useCafe(id: string | null) {
  return useLoad<Cafe | null>(id, () => getDataSource().cafe(id!));
}

export function useCityCounts(enabled: boolean) {
  return useLoad<Record<string, number>>(enabled ? 'counts' : null, () =>
    getDataSource().cityCounts(),
  );
}
