import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../lib/api';

/**
 * List-endpoint state: fetch, search, filter, paginate.
 *
 * Every EIMS list screen uses this so they all debounce the same way, keep
 * the same `{ data, pagination }` contract, and never render a stale
 * response that arrives after a newer one.
 */
export function useResource(path, { params = {}, pageSize = 20, auto = true, debounceMs = 300 } = {}) {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(auto);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Serialised so a caller can pass an object literal without re-fetching
  // on every render.
  const paramsKey = JSON.stringify(params);
  const requestId = useRef(0);

  const load = useCallback(async (overrides = {}) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const { data } = await api.get(path, {
        params: {
          page,
          pageSize,
          ...(search ? { search } : {}),
          ...JSON.parse(paramsKey),
          ...overrides,
        },
      });

      // A slower earlier request must not overwrite a newer result.
      if (id !== requestId.current) return;

      if (Array.isArray(data)) {
        setRows(data);
        setPagination({ page: 1, pageSize: data.length, total: data.length, totalPages: 1 });
      } else {
        setRows(data?.data || []);
        setPagination(data?.pagination || { page: 1, pageSize, total: 0, totalPages: 1 });
      }
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err.response?.data?.error || err.message || 'Failed to load');
      setRows([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, page, pageSize, search, paramsKey]);

  // Debounce so typing in the search box does not fire a request per key.
  useEffect(() => {
    if (!auto) return undefined;
    const timer = setTimeout(load, search ? debounceMs : 0);
    return () => clearTimeout(timer);
  }, [auto, load, search, debounceMs]);

  // Any filter or search change resets to the first page.
  useEffect(() => { setPage(1); }, [search, paramsKey]);

  return useMemo(() => ({
    rows,
    pagination,
    loading,
    error,
    search,
    setSearch,
    page,
    setPage,
    reload: load,
    setRows,
  }), [rows, pagination, loading, error, search, page, load]);
}

/**
 * Fetch a single object once (a summary endpoint, a detail record).
 * Returns `{ data, loading, error, reload }`.
 */
export function useEndpoint(path, { params = {}, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const paramsKey = JSON.stringify(params);

  const load = useCallback(async () => {
    if (!enabled || !path) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(path, { params: JSON.parse(paramsKey) });
      setData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [path, paramsKey, enabled]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, reload: load };
}

export default useResource;
