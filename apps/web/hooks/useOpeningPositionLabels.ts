import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeFenForOpeningPosition, type OpeningMove } from '@firstmove/core';
import {
  getOpeningPositionsByKeys,
  type OpeningPositionRow,
} from '@firstmove/supabase';

export interface OpeningPositionMilestone {
  moveIndex: number;
  ply: number;
  name: string;
  ecoCode: string;
  family: string;
  variation: string | null;
  positionKey: string;
}

function getPositionKeys(moves: OpeningMove[]) {
  return moves.map(move => normalizeFenForOpeningPosition(move.fen));
}

function buildMilestones(
  moves: OpeningMove[],
  positions: OpeningPositionRow[]
): OpeningPositionMilestone[] {
  const positionsByKey = new Map(positions.map(position => [position.position_key, position]));
  const milestones: OpeningPositionMilestone[] = [];
  let lastName = '';

  moves.forEach((move, moveIndex) => {
    const positionKey = normalizeFenForOpeningPosition(move.fen);
    const position = positionsByKey.get(positionKey);
    if (!position || position.name === lastName) {
      return;
    }

    milestones.push({
      moveIndex,
      ply: moveIndex + 1,
      name: position.name,
      ecoCode: position.eco_code,
      family: position.family,
      variation: position.variation,
      positionKey,
    });
    lastName = position.name;
  });

  return milestones;
}

export function useOpeningPositionLabels(moves: OpeningMove[]) {
  const positionKeys = useMemo(() => getPositionKeys(moves), [moves]);
  const uniquePositionKeys = useMemo(
    () => [...new Set(positionKeys)],
    [positionKeys]
  );

  const query = useQuery({
    queryKey: ['opening-position-labels', uniquePositionKeys],
    staleTime: Infinity,
    enabled: uniquePositionKeys.length > 0,
    queryFn: () => getOpeningPositionsByKeys(uniquePositionKeys),
  });

  const milestones = useMemo(
    () => buildMilestones(moves, query.data ?? []),
    [moves, query.data]
  );

  return {
    ...query,
    milestones,
  };
}
