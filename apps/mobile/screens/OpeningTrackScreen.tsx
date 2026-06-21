import React, { useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Svg, {
  Path,
  Rect as SvgRect,
  Defs,
  LinearGradient,
  Stop,
  Pattern as SvgPattern,
} from 'react-native-svg';
import { SvgUri } from 'react-native-svg';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import { getOpeningLinesBySlug, type OpeningLineRow } from '@firstmove/supabase';
import type { TrainStackParamList } from '../navigation/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeStatus = 'mastered' | 'completed' | 'current' | 'locked';

// All nodes are uniform — no boss/final_boss distinction shown in UI.
// 'final' only affects the icon on the last node (no text badge).
type NodeType = 'normal' | 'final';

type NodeDef =
  | { seg: 'H';  row: number; frac: number;
      id: number; name: string; status: NodeStatus; type: NodeType; stars: number; lineSlug: string }
  | { seg: 'VL'; between: [number, number];
      id: number; name: string; status: NodeStatus; type: NodeType; stars: number; lineSlug: string }
  | { seg: 'VR'; between: [number, number];
      id: number; name: string; status: NodeStatus; type: NodeType; stars: number; lineSlug: string };

type TrackRoute = RouteProp<TrainStackParamList, 'OpeningTrack'>;
type TrackNav   = NativeStackNavigationProp<TrainStackParamList, 'OpeningTrack'>;

// ─── Layout constants ─────────────────────────────────────────────────────────

const TOP_PAD     = 80;
const ROW_SPACING = 320;
const BOTTOM_PAD  = 96;
const RAIL_INSET  = 50;
const TILE_SIZE   = 64; // all nodes same size

const TRACK_W      = 13;
const TRACK_COLOR  = '#c27c10';
const TRACK_LOCKED = COLORS.border;

const MAX_TRACK_NODES = 15;

// ─── Line filter ──────────────────────────────────────────────────────────────
// Only true variation lines belong on the track — no reference main lines,
// no punish/fork lines, no lines explicitly labelled "Main Line".

function isTrackLine(line: OpeningLineRow): boolean {
  if (line.is_main_line) return false;
  const name = (line.name ?? '').toLowerCase();
  if (name.includes('main line')) return false;
  if (name.includes('fork')) return false;
  if (name.includes('punish')) return false;
  if (name.includes('e-pawn')) return false;
  if (name.includes('trap')) return false;
  return true;
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function makeRowY(row: number, totalRows: number) {
  return TOP_PAD + (totalRows - row) * ROW_SPACING;
}

function makeContentH(totalRows: number) {
  return TOP_PAD + (totalRows - 1) * ROW_SPACING + 43 + BOTTOM_PAD;
}

function nodePos(n: NodeDef, LRAIL: number, RRAIL: number, totalRows: number) {
  if (n.seg === 'H') {
    return {
      x: Math.round(LRAIL + n.frac * (RRAIL - LRAIL)),
      y: makeRowY(n.row, totalRows),
    };
  }
  const [r1, r2] = n.between;
  return {
    x: n.seg === 'VL' ? LRAIL : RRAIL,
    y: Math.round((makeRowY(r1, totalRows) + makeRowY(r2, totalRows)) / 2),
  };
}

// ─── Dynamic node layout ──────────────────────────────────────────────────────
// Lines come in sorted most-popular-first.
// Row 1 = bottom of the map = most popular variation.
// Pattern per section: [H, H, V] with alternating direction per row.
// Last section: 1, 2, or 3 H nodes (no trailing V).

function buildNodesFromLines(lines: OpeningLineRow[]): { nodes: NodeDef[]; totalRows: number } {
  const filtered = lines
    .filter(isTrackLine)
    .sort((a, b) => (b.popularity_games ?? 0) - (a.popularity_games ?? 0))
    .slice(0, MAX_TRACK_NODES);

  const n = filtered.length;
  if (n === 0) return { nodes: [], totalRows: 1 };

  const nodes: NodeDef[] = [];
  let id = 1;
  let row = 1;
  let i = 0;

  const statusFor = (idx: number): NodeStatus => idx === 0 ? 'current' : 'locked';

  while (i < n) {
    const remaining = n - i;
    const isOddRow = row % 2 === 1;
    const h1frac = isOddRow ? 0.72 : 0.28;
    const h2frac = isOddRow ? 0.28 : 0.72;
    const isLast = (idx: number) => idx === n - 1;

    if (remaining === 1) {
      nodes.push({ seg: 'H', row, frac: 0.50, id: id++, name: filtered[i].name, status: statusFor(i), type: 'final', stars: 0, lineSlug: filtered[i].slug });
      i++;
    } else if (remaining === 2) {
      nodes.push({ seg: 'H', row, frac: h1frac, id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug });
      i++;
      nodes.push({ seg: 'H', row, frac: h2frac, id: id++, name: filtered[i].name, status: statusFor(i), type: 'final', stars: 0, lineSlug: filtered[i].slug });
      i++;
    } else if (remaining === 3) {
      nodes.push({ seg: 'H', row, frac: 0.22, id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug });
      i++;
      nodes.push({ seg: 'H', row, frac: 0.52, id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug });
      i++;
      nodes.push({ seg: 'H', row, frac: 0.82, id: id++, name: filtered[i].name, status: statusFor(i), type: 'final', stars: 0, lineSlug: filtered[i].slug });
      i++;
    } else {
      nodes.push({ seg: 'H', row, frac: h1frac, id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug });
      i++;
      nodes.push({ seg: 'H', row, frac: h2frac, id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug });
      i++;
      const rail = isOddRow ? 'VL' : 'VR';
      nodes.push({ seg: rail, between: [row, row + 1], id: id++, name: filtered[i].name, status: statusFor(i), type: 'normal', stars: 0, lineSlug: filtered[i].slug } as NodeDef);
      i++;
      row++;
    }
  }

  return { nodes, totalRows: row };
}

// ─── Dynamic path builder ─────────────────────────────────────────────────────

type Point = { x: number; y: number };

function buildDynamicPaths(LRAIL: number, RRAIL: number, totalRows: number, nodes: NodeDef[]) {
  const rowY      = (r: number) => makeRowY(r, totalRows);
  const rowStartX = (r: number) => r % 2 === 1 ? RRAIL : LRAIL;
  const rowEndX   = (r: number) => r % 2 === 1 ? LRAIL : RRAIL;

  // Full snake corner points from bottom-right to top
  const snake: Point[] = [{ x: rowStartX(1), y: rowY(1) }];
  for (let r = 1; r <= totalRows; r++) {
    snake.push({ x: rowEndX(r), y: rowY(r) });
    if (r < totalRows) snake.push({ x: rowEndX(r), y: rowY(r + 1) });
  }

  const toPath = (pts: Point[]) =>
    pts.length < 2
      ? ''
      : `M ${pts[0].x} ${pts[0].y}` + pts.slice(1).map(p => ` L ${p.x} ${p.y}`).join('');

  // Find first non-completed node
  const firstNonDoneIdx = nodes.findIndex(n => n.status !== 'mastered' && n.status !== 'completed');

  // Nothing done yet — full snake is the locked (dashed) path
  if (firstNonDoneIdx <= 0) {
    return { completed: '', locked: toPath(snake) };
  }

  // Everything done — full snake is the completed (amber) path
  if (firstNonDoneIdx === -1) {
    return { completed: toPath(snake), locked: '' };
  }

  const currentNode = nodes[firstNonDoneIdx];

  // Compute the split point on the snake
  let splitX: number, splitY: number;
  if (currentNode.seg === 'VL' || currentNode.seg === 'VR') {
    const [r1, r2] = currentNode.between;
    splitX = rowEndX(r1);
    splitY = Math.round((rowY(r1) + rowY(r2)) / 2);
  } else {
    splitX = Math.round(LRAIL + currentNode.frac * (RRAIL - LRAIL));
    splitY = rowY(currentNode.row);
  }

  // Find the snake segment containing the split point
  let splitSegIdx = -1;
  for (let i = 0; i < snake.length - 1; i++) {
    const p1 = snake[i], p2 = snake[i + 1];
    if (p1.x === p2.x && p1.x === splitX) {
      const lo = Math.min(p1.y, p2.y), hi = Math.max(p1.y, p2.y);
      if (splitY >= lo && splitY <= hi) { splitSegIdx = i; break; }
    } else if (p1.y === p2.y && p1.y === splitY) {
      const lo = Math.min(p1.x, p2.x), hi = Math.max(p1.x, p2.x);
      if (splitX >= lo && splitX <= hi) { splitSegIdx = i; break; }
    }
  }

  if (splitSegIdx === -1) {
    return { completed: '', locked: toPath(snake) };
  }

  const sp = { x: splitX, y: splitY };
  return {
    completed: toPath([...snake.slice(0, splitSegIdx + 1), sp]),
    locked:    toPath([sp, ...snake.slice(splitSegIdx + 1)]),
  };
}

// ─── Chess world scene (SVG pieces only — no local image assets) ──────────────

const MAESTRO = 'https://cdn.jsdelivr.net/gh/lichess-org/lila@master/public/piece/maestro';

function WorldPiece({ code, cx, cy, size, opacity = 1 }: {
  code: string; cx: number; cy: number; size: number; opacity?: number;
}) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, opacity }}>
      <SvgUri uri={`${MAESTRO}/${code}.svg`} width={size} height={size} />
    </View>
  );
}

function WorldScene({ W, H, LRAIL, RRAIL, totalRows }: {
  W: number; H: number; LRAIL: number; RRAIL: number; totalRows: number;
}) {
  const span = RRAIL - LRAIL;
  const midH = H * 0.5;

  const pieces: { code: string; cx: number; cy: number; size: number; opacity: number }[] = [
    // Atmospheric background giants (partially off-screen)
    { code: 'wQ', cx: LRAIL - 80,          cy: H * 0.08, size: 260, opacity: 0.28 },
    { code: 'wR', cx: RRAIL + 82,          cy: H * 0.30, size: 235, opacity: 0.25 },
    { code: 'wK', cx: LRAIL - 65,          cy: H * 0.56, size: 215, opacity: 0.22 },
    { code: 'wB', cx: RRAIL + 55,          cy: H * 0.78, size: 195, opacity: 0.20 },
    // Focal pieces in the interior of the snake turns
    { code: 'bQ', cx: LRAIL + span * 0.76, cy: H * 0.22, size: 130, opacity: 0.82 },
    { code: 'bN', cx: LRAIL + span * 0.26, cy: H * 0.46, size: 120, opacity: 0.80 },
    { code: 'bB', cx: LRAIL + span * 0.77, cy: H * 0.70, size: 115, opacity: 0.78 },
  ];

  return (
    <>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0"   stopColor="#080b14" />
            <Stop offset="0.5" stopColor="#0d1020" />
            <Stop offset="1"   stopColor="#12100e" />
          </LinearGradient>
          <SvgPattern id="sq" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <SvgRect x="0"  y="0"  width="24" height="24" fill="white" fillOpacity="0.011" />
            <SvgRect x="24" y="24" width="24" height="24" fill="white" fillOpacity="0.011" />
          </SvgPattern>
        </Defs>
        <SvgRect x="0" y="0" width={W} height={H} fill="url(#sky)" />
        <SvgRect x="0" y="0" width={W} height={H} fill="url(#sq)" />
        {pieces.map((p, i) => {
          const sw = p.size * 0.52, sh = p.size * 0.09;
          return (
            <SvgRect key={i} x={p.cx - sw / 2} y={p.cy + p.size * 0.36}
              width={sw} height={sh} rx={sw / 2} fill="#000" fillOpacity={p.opacity * 0.55} />
          );
        })}
      </Svg>
      {pieces.map((p, i) => <WorldPiece key={i} {...p} />)}
    </>
  );
}

// ─── Pulse ring ───────────────────────────────────────────────────────────────

function PulseRing({ size }: { size: number }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.80)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 1100, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 0,    useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,    duration: 1100, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.80, duration: 0,    useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: size, height: size, borderRadius: 10,
        borderWidth: 2.5, borderColor: TRACK_COLOR,
        transform: [{ scale }], opacity,
      }}
    />
  );
}

// ─── Stars ────────────────────────────────────────────────────────────────────

function StarRow({ stars }: { stars: number }) {
  return (
    <View style={styles.starRow}>
      {[0, 1, 2].map(i => (
        <Ionicons key={i} name={i < stars ? 'star' : 'star-outline'} size={10}
          color={i < stars ? TRACK_COLOR : COLORS.textDim} />
      ))}
    </View>
  );
}

// ─── Map node tile ────────────────────────────────────────────────────────────

function MapNodeView({ node, cx, cy }: { node: NodeDef; cx: number; cy: number }) {
  const size      = TILE_SIZE;
  const half      = size / 2;
  const isLocked  = node.status === 'locked';
  const isCurrent = node.status === 'current';
  const isFinal   = node.type === 'final';
  const WRAP      = 96;

  const bg = isLocked
    ? '#353848'
    : node.status === 'mastered' ? '#9a5e08' : TRACK_COLOR;

  const border = isLocked ? '#4e5268' : TRACK_COLOR;

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
      isFinal && isLocked   ? 'trophy-outline'
    : isLocked              ? 'lock-closed'
    : isCurrent             ? 'play'
    : isFinal               ? 'trophy'
    : 'checkmark';

  return (
    <View style={[styles.nodeWrap, { left: cx - WRAP / 2, top: cy - half, width: WRAP }]}>
      <View style={{ width: size, height: size }}>
        {isCurrent && <PulseRing size={size} />}
        <TouchableOpacity
          disabled={isLocked}
          activeOpacity={0.75}
          style={[styles.tile, { width: size, height: size, backgroundColor: bg, borderColor: border }]}
        >
          <Ionicons
            name={iconName}
            size={Math.round(size * 0.40)}
            color={isLocked ? '#7a7e96' : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {node.stars > 0 && <StarRow stars={node.stars} />}

      <Text numberOfLines={2} style={[styles.label, isLocked && styles.labelDim]}>
        {node.name}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function OpeningTrackScreen() {
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const navigation = useNavigation<TrackNav>();
  const route = useRoute<TrackRoute>();
  const { openingName, openingEco, openingSlug } = route.params;

  const LRAIL = RAIL_INSET;
  const RRAIL = W - RAIL_INSET;

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ['openingLines', openingSlug],
    queryFn: () => getOpeningLinesBySlug(openingSlug),
    staleTime: 1000 * 60 * 10,
  });

  const { nodes, totalRows } = React.useMemo(
    () => buildNodesFromLines(lines),
    [lines],
  );

  const contentH = makeContentH(totalRows);
  const { completed: cPath, locked: lPath } = React.useMemo(
    () => buildDynamicPaths(LRAIL, RRAIL, totalRows, nodes),
    [LRAIL, RRAIL, totalRows, nodes],
  );

  const progressPct = nodes.length === 0
    ? 0
    : nodes.filter(n => n.status === 'mastered' || n.status === 'completed').length / nodes.length;

  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (nodes.length === 0) return;
    const currentNode = nodes.find(n => n.status === 'current');
    if (!currentNode) return;
    const { y } = nodePos(currentNode, LRAIL, RRAIL, totalRows);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 200), animated: true });
    }, 450);
  }, [nodes]);

  return (
    <View style={[styles.root, { backgroundColor: '#080b14' }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{openingName}</Text>
          <View style={styles.ecoBadge}>
            <Text style={styles.ecoText}>{openingEco}</Text>
          </View>
        </View>
      </View>

      {/* ── Progress bar ── */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
      </View>

      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TRACK_COLOR} />
          <Text style={styles.loadingText}>Loading variations…</Text>
        </View>
      )}

      {!isLoading && (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ height: contentH }}
          style={styles.scroll}
        >
          <WorldScene W={W} H={contentH} LRAIL={LRAIL} RRAIL={RRAIL} totalRows={totalRows} />

          <Svg width={W} height={contentH} style={StyleSheet.absoluteFill} pointerEvents="none">
            {/* Glow under completed road */}
            {cPath.length > 0 && (
              <Path d={cPath} stroke={TRACK_COLOR} strokeWidth={TRACK_W + 16}
                opacity="0.10" fill="none" strokeLinecap="square" strokeLinejoin="miter" />
            )}
            {/* Locked dashed road */}
            {lPath.length > 0 && (
              <Path d={lPath} stroke={TRACK_LOCKED} strokeWidth={TRACK_W}
                strokeDasharray="14,10" fill="none" opacity="0.48"
                strokeLinecap="square" strokeLinejoin="miter" />
            )}
            {/* Completed amber road */}
            {cPath.length > 0 && (
              <Path d={cPath} stroke={TRACK_COLOR} strokeWidth={TRACK_W}
                fill="none" strokeLinecap="square" strokeLinejoin="miter" />
            )}
          </Svg>

          {nodes.map(node => {
            const { x, y } = nodePos(node, LRAIL, RRAIL, totalRows);
            return <MapNodeView key={node.id} node={node} cx={x} cy={y} />;
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#080b14',
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden' },
  headerTitle: { fontSize: 17, fontWeight: FONT.bold, color: COLORS.text, letterSpacing: -0.2, flexShrink: 1 },
  ecoBadge: {
    backgroundColor: 'rgba(194,124,16,0.15)', borderRadius: RADIUS.sm,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: 'rgba(194,124,16,0.28)',
  },
  ecoText: { fontSize: 10, fontWeight: FONT.bold, color: TRACK_COLOR, letterSpacing: 0.3 },

  progressTrack: { height: 3, backgroundColor: COLORS.border },
  progressFill:  { height: '100%', backgroundColor: TRACK_COLOR },

  scroll: { flex: 1 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { fontSize: 14, color: COLORS.textMuted },

  nodeWrap: { position: 'absolute', alignItems: 'center', gap: 5 },
  tile: {
    borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  starRow: { flexDirection: 'row', gap: 2 },
  label: {
    fontSize: 10, fontWeight: FONT.semibold, color: COLORS.textMuted,
    textAlign: 'center', lineHeight: 13, maxWidth: 96,
  },
  labelDim: { color: COLORS.textDim, fontWeight: FONT.regular },
});
