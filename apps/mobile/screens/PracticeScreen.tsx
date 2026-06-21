import { useState, useRef, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MiniBoard } from '../components/board/MiniBoard';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import { useOpening, buildMovesFromSans } from '../hooks/useOpenings';
import { useHideProfileButton } from '../lib/profileVisibility';
import type { OpeningsStackParamList } from '../navigation/types';
import type { OpeningMove } from '@firstmove/core';

type Props = NativeStackScreenProps<OpeningsStackParamList, 'Practice'>;
type Mode = 'learn' | 'practice';

const EVAL_BAR_WIDTH = 6;
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// ─── Eval bar ─────────────────────────────────────────────────────────────────

function EvalBar({ height, cp = 0 }: { height: number; cp?: number }) {
  const clamped = Math.max(-600, Math.min(600, cp));
  const whiteFraction = 0.5 + (clamped / 600) * 0.35;
  return (
    <View style={[styles.evalBar, { height }]}>
      <View style={[styles.evalBlack, { flex: 1 - whiteFraction }]} />
      <View style={[styles.evalWhite, { flex: whiteFraction }]} />
    </View>
  );
}

// ─── Move sequence ────────────────────────────────────────────────────────────

function MoveSequence({
  moves,
  currentIndex,
  onSelect,
}: {
  moves: OpeningMove[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);

  // Auto-scroll to roughly keep the current move in view
  useEffect(() => {
    if (currentIndex >= 0) {
      // Each token is ~40px wide on average; scroll to keep current move visible
      scrollRef.current?.scrollTo({ x: Math.max(0, currentIndex * 40 - 80), animated: true });
    }
  }, [currentIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.moveSeqContent}
      style={styles.moveSeq}
    >
      {/* "Start" pill */}
      <Pressable onPress={() => onSelect(-1)}>
        <Text style={[styles.moveStart, currentIndex === -1 && styles.moveActive]}>Start</Text>
      </Pressable>

      {moves.map((move, i) => {
        const isWhite = i % 2 === 0;
        const moveNum = Math.floor(i / 2) + 1;
        const active = i === currentIndex;
        return (
          <View key={i} style={styles.movePair}>
            {isWhite && <Text style={styles.moveNumber}>{moveNum}.</Text>}
            <Pressable onPress={() => onSelect(i)}>
              <Text style={[styles.moveSan, active && styles.moveActive]}>{move.san}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function PracticeScreen({ route, navigation }: Props) {
  const { openingSlug, variationId, mode: initialMode } = route.params;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useHideProfileButton();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const { data: opening, isLoading, isError, error } = useOpening(openingSlug);

  if (isLoading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.centered}><ActivityIndicator size="large" color={COLORS.accent} /></View>
      </View>
    );
  }

  if (isError || !opening) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Pressable style={[styles.backBtn, styles.floatingBack]} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{isError ? 'Could not load opening' : 'Opening not found'}</Text>
        </View>
      </View>
    );
  }

  const variation = opening.variations.find(v => v.id === variationId) ?? opening.variations[0];

  // Build moves (chess.js) only for this one variation, not all of them.
  // useMemo ensures this only runs when the variation changes, not on every render.
  const moves = useMemo(
    () => variation?.sans ? buildMovesFromSans(variation.sans) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [variation?.id]
  );
  const totalMoves = moves.length;

  // Board position: -1 = start (initial position), 0+ = after move[i]
  const boardFen = currentIndex === -1
    ? STARTING_FEN
    : (moves[currentIndex]?.fen ?? STARTING_FEN);

  // Eval: use per-ply data if available, else final eval at end, else 0
  const evalCp = currentIndex >= 0
    ? ((variation?.evalCpByPly?.[currentIndex]) ?? (currentIndex === totalMoves - 1 ? (variation?.finalEvalCp ?? 0) : 0))
    : 0;
  const perspective = variation?.finalEvalPerspective ?? 'white';
  const displayCp = perspective === 'black' ? -(evalCp ?? 0) : (evalCp ?? 0);

  const boardSize = width - EVAL_BAR_WIDTH;

  const prev = () => setCurrentIndex(i => Math.max(-1, i - 1));
  const next = () => setCurrentIndex(i => Math.min(totalMoves - 1, i + 1));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Compact header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={COLORS.text} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerOpening} numberOfLines={1}>{opening.name}</Text>
          {variation && (
            <Text style={styles.headerVariation} numberOfLines={1}>{variation.name}</Text>
          )}
        </View>
      </View>

      {/* Mode toggle — flush to board */}
      <View style={styles.modeToggle}>
        <Pressable
          style={[styles.modeBtn, mode === 'learn' && styles.modeBtnActive]}
          onPress={() => setMode('learn')}
        >
          <Text style={[styles.modeBtnText, mode === 'learn' && styles.modeBtnTextActive]}>Learn</Text>
        </Pressable>
        <Pressable
          style={[styles.modeBtn, mode === 'practice' && styles.modeBtnActive]}
          onPress={() => setMode('practice')}
        >
          <Text style={[styles.modeBtnText, mode === 'practice' && styles.modeBtnTextActive]}>Practice</Text>
        </Pressable>
      </View>

      {/* Board + eval bar — full width, no gap between toggle and board */}
      <View style={styles.boardRow}>
        <EvalBar height={boardSize} cp={displayCp} />
        <MiniBoard
          fen={boardFen}
          size={boardSize}
          orientation={opening.color === 'black' ? 'black' : 'white'}
        />
      </View>

      {/* Nav controls */}
      <View style={styles.navRow}>
        <Pressable
          style={[styles.navBtn, currentIndex === -1 && styles.navBtnDisabled]}
          onPress={prev}
          disabled={currentIndex === -1}
        >
          <Ionicons name="chevron-back" size={22} color={currentIndex === -1 ? COLORS.textDim : COLORS.text} />
        </Pressable>

        <Text style={styles.navCounter}>
          {currentIndex === -1 ? 'Start' : `${currentIndex + 1} / ${totalMoves}`}
        </Text>

        <Pressable
          style={[styles.navBtn, currentIndex === totalMoves - 1 && styles.navBtnDisabled]}
          onPress={next}
          disabled={currentIndex === totalMoves - 1}
        >
          <Ionicons name="chevron-forward" size={22} color={currentIndex === totalMoves - 1 ? COLORS.textDim : COLORS.text} />
        </Pressable>
      </View>

      {/* Move sequence */}
      <MoveSequence moves={moves} currentIndex={currentIndex} onSelect={setCurrentIndex} />

      {/* Safe area spacer */}
      <View style={{ height: insets.bottom + 12 }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },

  // Header — compact
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  floatingBack: { marginLeft: 16, marginTop: 10 },
  headerText: { flex: 1, gap: 1 },
  headerOpening: { fontSize: 14, fontWeight: FONT.bold, color: COLORS.text },
  headerVariation: { fontSize: 11, color: COLORS.textDim, fontWeight: FONT.medium },

  // Mode toggle — no bottom margin so it sits flush against the board
  modeToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 14,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 3,
    gap: 3,
  },
  modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  modeBtnActive: { backgroundColor: COLORS.bgBase },
  modeBtnText: { fontSize: 13, fontWeight: FONT.medium, color: COLORS.textDim },
  modeBtnTextActive: { color: COLORS.text, fontWeight: FONT.semibold },

  // Board — flush to toggle (no marginTop)
  boardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  evalBar: { width: EVAL_BAR_WIDTH, flexShrink: 0 },
  evalBlack: { backgroundColor: '#1c1c1e' },
  evalWhite: { backgroundColor: COLORS.text },

  // Nav controls
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.35 },
  navCounter: { fontSize: 13, color: COLORS.textMuted, fontWeight: FONT.medium },

  // Move sequence
  moveSeq: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderSubtle,
  },
  moveSeqContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  moveStart: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: FONT.medium,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  movePair: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moveNumber: { fontSize: 12, color: COLORS.textDim, marginRight: 1 },
  moveSan: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontWeight: FONT.medium,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 5,
    overflow: 'hidden',
  },
  moveActive: {
    color: COLORS.bgBase,
    backgroundColor: COLORS.accent,
    fontWeight: FONT.bold,
  },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: COLORS.textMuted },
});
