'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeFenForOpeningPosition } from '@firstmove/core';
import { getOpeningPositionsByKeys, type OpeningPositionRow } from '@firstmove/supabase';

export function useOpeningName(fen: string | undefined): OpeningPositionRow | null {
  const positionKey = useMemo(
    () => (fen ? normalizeFenForOpeningPosition(fen) : ''),
    [fen]
  );

  const { data } = useQuery({
    queryKey: ['opening-name', positionKey],
    staleTime: Infinity,
    enabled: positionKey.length > 0,
    queryFn: async () => {
      const results = await getOpeningPositionsByKeys([positionKey]);
      return results[0] ?? null;
    },
  });

  return data ?? null;
}
