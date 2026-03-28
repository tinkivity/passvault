import { useState, useCallback } from 'react';
import type { WarningCode, WarningCodeDefinition } from '@passvault/shared';
import { api } from '../services/api.js';

export function useWarningCatalog() {
  const [catalog, setCatalog] = useState<WarningCodeDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);

  const fetchCatalog = useCallback(async (): Promise<void> => {
    if (loaded) return;
    try {
      const defs = await api.getWarningCodes();
      setCatalog(defs);
      setLoaded(true);
    } catch {
      // Non-fatal — UI degrades gracefully
    }
  }, [loaded]);

  const getLabel = useCallback((code: WarningCode): string => {
    return catalog.find(d => d.code === code)?.label ?? code;
  }, [catalog]);

  const getDescription = useCallback((code: WarningCode): string => {
    return catalog.find(d => d.code === code)?.description ?? '';
  }, [catalog]);

  return { catalog, fetchCatalog, getLabel, getDescription };
}
