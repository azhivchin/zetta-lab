"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { authApi } from "./api";

export interface ReferenceItem {
  id: string;
  type: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
}

interface CacheEntry {
  items: ReferenceItem[];
  timestamp: number;
}

// Global in-memory cache shared across all hook instances
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track in-flight requests to avoid duplicate fetches
const inflight = new Map<string, Promise<ReferenceItem[]>>();

async function fetchReferences(type: string): Promise<ReferenceItem[]> {
  const res = await authApi(`/settings/references?type=${encodeURIComponent(type)}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []) as ReferenceItem[];
}

export function useReferences(type: string) {
  const [items, setItems] = useState<ReferenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Check cache first
      const cached = cache.get(type);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setItems(cached.items);
        setLoading(false);
        return;
      }

      setLoading(true);

      // Deduplicate in-flight requests
      let promise = inflight.get(type);
      if (!promise) {
        promise = fetchReferences(type);
        inflight.set(type, promise);
      }

      try {
        const result = await promise;
        cache.set(type, { items: result, timestamp: Date.now() });
        if (!cancelled && mountedRef.current) {
          setItems(result);
        }
      } catch {
        // Keep existing items on error
      } finally {
        inflight.delete(type);
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [type]);

  // Convenience: active items as {value, label} for <select>
  const asOptions = useMemo(
    () => items
      .filter(i => i.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(i => ({ value: i.code, label: i.name })),
    [items],
  );

  // Convenience: code → name map for display
  const labelMap = useMemo(
    () => Object.fromEntries(items.map(i => [i.code, i.name])),
    [items],
  );

  return { items, loading, asOptions, labelMap };
}

/** Invalidate cache for a specific type (call after editing references in Settings) */
export function invalidateReferences(type?: string) {
  if (type) {
    cache.delete(type);
  } else {
    cache.clear();
  }
}
