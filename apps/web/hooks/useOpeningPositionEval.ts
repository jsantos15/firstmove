'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { normalizeFenForOpeningPosition } from '@firstmove/core';
import {
  getOpeningPositionEvalByKey,
  type OpeningPositionEvalRow,
} from '@firstmove/supabase';

const MATE_CP = 9999;

function scoreToCp(scoreType: string | null, scoreValue: number | null) {
  if (typeof scoreValue !== 'number' || !Number.isFinite(scoreValue)) return undefined;
  if (scoreType === 'mate') return scoreValue > 0 ? MATE_CP : -MATE_CP;
  return scoreValue;
}

function activeColorFromPositionKey(positionKey: string) {
  return positionKey.split(/\s+/)[1] === 'b' ? 'black' : 'white';
}

function toWhiteEvalCp(row: OpeningPositionEvalRow | null | undefined) {
  if (!row) return undefined;

  const whiteScore = scoreToCp(row.score_type, row.white_score_value);
  if (typeof whiteScore === 'number') return whiteScore;

  const sideToMoveScore = scoreToCp(row.score_type, row.score_value);
  if (typeof sideToMoveScore !== 'number') return undefined;

  return activeColorFromPositionKey(row.position_key) === 'white'
    ? sideToMoveScore
    : -sideToMoveScore;
}

export function useOpeningPositionEval(fen: string | undefined): number | undefined {
  const positionKey = useMemo(
    () => (fen ? normalizeFenForOpeningPosition(fen) : ''),
    [fen]
  );

  const query = useQuery({
    queryKey: ['opening-position-eval', positionKey],
    staleTime: Infinity,
    enabled: positionKey.length > 0,
    queryFn: () => getOpeningPositionEvalByKey(positionKey),
  });

  return toWhiteEvalCp(query.data);
}
