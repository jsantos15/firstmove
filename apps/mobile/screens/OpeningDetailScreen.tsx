import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { COLORS, FONT, RADIUS } from '../lib/constants';
import { useHideProfileButton } from '../lib/profileVisibility';
import {
  useOpening,
  groupVariations,
  sortAndLimitDisplayedBranches,
  formatBranchEval,
  branchEvalValue,
  type AppVariation,
  type VariationGroup,
} from '../hooks/useOpenings';
import type { OpeningsStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<OpeningsStackParamList, 'OpeningDetail'>;

// ─── Row primitives ───────────────────────────────────────────────────────────

function Row({
  label,
  right,
  isActive,
  indent,
  onPress,
}: {
  label: string;
  right?: React.ReactNode;
  isActive?: boolean;
  indent?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        indent && styles.rowIndent,
        isActive && styles.rowActive,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
    >
      {isActive && <View style={styles.activeBar} />}
      <Text
        style={[styles.rowLabel, isActive && styles.rowLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {right}
    </Pressable>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <View style={styles.countBadge}>
      <Text style={styles.countBadgeText}>{count}</Text>
    </View>
  );
}

function EvalBadge({ value }: { value: string }) {
  return (
    <View style={styles.evalBadge}>
      <Text style={styles.evalBadgeText}>{value}</Text>
    </View>
  );
}

function Chevron({ down }: { down: boolean }) {
  return (
    <Ionicons
      name={down ? 'chevron-down' : 'chevron-forward'}
      size={13}
      color={COLORS.textDim}
      style={styles.chevron}
    />
  );
}

// ─── Inset card section ───────────────────────────────────────────────────────
// Label sits above the card (like iOS grouped table), card is visually self-contained.

function CardSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cardSection}>
      <Text style={styles.cardSectionLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function CardDivider() {
  return <View style={styles.cardDivider} />;
}

function CardSubheader({ label }: { label: string }) {
  return (
    <View style={styles.cardSubheader}>
      <Text style={styles.cardSubheaderText}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function OpeningDetailScreen({ route, navigation }: Props) {
  const { openingSlug } = route.params;
  const insets = useSafeAreaInsets();
  const { data: opening, isLoading, isError, error } = useOpening(openingSlug);

  useHideProfileButton();

  const [expandedGroupId, setExpandedGroupId] = useState('');
  const [contextLineId, setContextLineId] = useState<string | null>(null);
  const [selectedPracticeId, setSelectedPracticeId] = useState<string | null>(null);

  useEffect(() => {
    if (!opening || contextLineId) return;
    const groups = groupVariations(opening.variations, opening.name);
    const first = groups[0];
    const firstLine = first?.lines[0];
    if (first && firstLine) {
      // All groups start collapsed — user chooses what to expand
      setContextLineId(firstLine.id);
      setSelectedPracticeId(firstLine.id);
    }
  }, [opening?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {isError && <Text style={styles.errorDetail}>{error instanceof Error ? error.message : ''}</Text>}
        </View>
      </View>
    );
  }

  const groups = groupVariations(opening.variations, opening.name);
  const contextVariation = opening.variations.find(v => v.id === contextLineId) ?? opening.variations[0];
  const displayedBranches = sortAndLimitDisplayedBranches(
    opening.practicalBranches.filter(b => b.branchMetadata?.parent_line_slug === contextLineId),
    opening.color
  );
  const allLines: AppVariation[] = [...opening.variations, ...opening.practicalBranches];
  const practiceTarget = allLines.find(v => v.id === selectedPracticeId);
  const practiceLabel = practiceTarget?.branchMetadata?.lesson_title ?? practiceTarget?.name ?? 'Select a line';

  function handleGroupPress(group: VariationGroup) {
    const isOpen = expandedGroupId === group.id;
    setExpandedGroupId(isOpen ? '' : group.id);
    if (!isOpen) {
      const hasContext = group.lines.some(l => l.id === contextLineId);
      if (!hasContext) {
        const first = group.lines[0];
        if (first) { setContextLineId(first.id); setSelectedPracticeId(first.id); }
      }
    }
  }

  function handleChildPress(line: AppVariation) {
    setContextLineId(line.id);
    setSelectedPracticeId(line.id);
  }

  function handleReferencePress() {
    if (contextVariation) setSelectedPracticeId(contextVariation.id);
  }

  function handleBranchPress(branch: AppVariation) {
    setSelectedPracticeId(branch.id);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={styles.headerName} numberOfLines={1}>{opening.name}</Text>
      </View>

      {/* Body — fixed layout, no outer scroll */}
      <View style={styles.body}>

        {/* Variations card — smaller, scrolls internally */}
        <View style={styles.sectionTop}>
          <Text style={styles.cardSectionLabel}>Variations</Text>
          <View style={styles.card}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {groups.map((group, gi) => {
                const isOpen = expandedGroupId === group.id;
                const hasContext = group.lines.some(l => l.id === contextLineId);
                return (
                  <View key={group.id}>
                    {gi > 0 && <CardDivider />}
                    <Row
                      label={group.displayName}
                      isActive={hasContext && !isOpen}
                      right={
                        <View style={styles.groupRight}>
                          <CountBadge count={group.lines.length} />
                          <Chevron down={isOpen} />
                        </View>
                      }
                      onPress={() => handleGroupPress(group)}
                    />
                    {isOpen && group.lines.map(line => (
                      <View key={line.id}>
                        <CardDivider />
                        <Row
                          label={line.name}
                          indent
                          isActive={line.id === contextLineId}
                          right={
                            line.id === selectedPracticeId
                              ? <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} style={{ marginLeft: 8 }} />
                              : null
                          }
                          onPress={() => handleChildPress(line)}
                        />
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Lines card — larger, scrolls internally */}
        <View style={styles.sectionBottom}>
          <Text style={styles.cardSectionLabel}>Lines</Text>
          <View style={styles.card}>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <CardSubheader label="Reference (Engine Continuation)" />
              {contextVariation ? (
                <Row
                  label={contextVariation.name}
                  isActive={selectedPracticeId === contextVariation.id}
                  right={
                    selectedPracticeId === contextVariation.id
                      ? <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} style={{ marginLeft: 8 }} />
                      : null
                  }
                  onPress={handleReferencePress}
                />
              ) : (
                <View style={styles.emptyRow}><Text style={styles.emptyText}>Select a variation above.</Text></View>
              )}

              <CardDivider />

              <CardSubheader label="Punish" />
              {displayedBranches.length > 0 ? (
                displayedBranches.map((branch, bi) => {
                  const evalLabel = formatBranchEval(branchEvalValue(branch, opening.color));
                  const title = branch.branchMetadata?.lesson_title ?? branch.name;
                  const isActive = selectedPracticeId === branch.id;
                  return (
                    <View key={branch.id}>
                      {bi > 0 && <CardDivider />}
                      <Row
                        label={title}
                        isActive={isActive}
                        right={
                          <View style={styles.rowRight}>
                            {evalLabel && <EvalBadge value={evalLabel} />}
                            {isActive && <Ionicons name="checkmark-circle" size={18} color={COLORS.accent} style={{ marginLeft: 6 }} />}
                          </View>
                        }
                        onPress={() => handleBranchPress(branch)}
                      />
                    </View>
                  );
                })
              ) : (
                <View style={styles.emptyRow}><Text style={styles.emptyText}>No punish lines for this variation yet.</Text></View>
              )}
            </ScrollView>
          </View>
        </View>

      </View>

      {/* CTA — pinned to bottom */}
      <View style={styles.ctaWrap}>
        <Pressable
          style={({ pressed }) => [styles.ctaBtn, !selectedPracticeId && styles.ctaBtnDisabled, pressed && { opacity: 0.88 }]}
          onPress={() => {
            if (selectedPracticeId) {
              navigation.navigate('Practice', { openingSlug, variationId: selectedPracticeId, mode: 'learn' });
            }
          }}
          disabled={!selectedPracticeId}
        >
          <Text style={styles.ctaLabel} numberOfLines={1}>{practiceLabel}</Text>
          <Ionicons name="arrow-forward-circle" size={22} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0c11' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  floatingBack: { marginLeft: 16, marginTop: 12 },
  headerName: { flex: 1, fontSize: 15, fontWeight: FONT.bold, color: COLORS.text },

  // Body — fills remaining space, no scroll
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 12,
  },
  // Variations section — bigger (flex: 3)
  sectionTop: { flex: 3, gap: 5, minHeight: 0 },
  // Lines section — shorter (flex: 2)
  sectionBottom: { flex: 2, gap: 5, minHeight: 0 },

  cardSectionLabel: {
    fontSize: 11,
    fontWeight: FONT.bold,
    color: COLORS.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  card: {
    flex: 1,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
  },
  cardDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 16 },
  cardSubheader: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  cardSubheaderText: {
    fontSize: 10,
    fontWeight: FONT.bold,
    color: COLORS.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    minHeight: 46,
    position: 'relative',
  },
  rowIndent: { paddingLeft: 28 },
  rowActive: { backgroundColor: 'rgba(245,158,11,0.07)' },
  rowPressed: { backgroundColor: COLORS.surfaceElevated },
  rowLabel: { flex: 1, fontSize: 14, fontWeight: FONT.medium, color: COLORS.textMuted },
  rowLabelActive: { color: COLORS.accentText, fontWeight: FONT.semibold },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },

  // Right-side accessories
  groupRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  chevron: { opacity: 0.5 },
  countBadge: {
    backgroundColor: COLORS.bgBase,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countBadgeText: { fontSize: 11, color: COLORS.textDim, fontWeight: FONT.medium },
  evalBadge: {
    backgroundColor: COLORS.bgBase,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  evalBadgeText: { fontSize: 11, color: COLORS.textDim, fontFamily: 'monospace' },

  // Empty state
  emptyRow: { paddingHorizontal: 16, paddingVertical: 12 },
  emptyText: { fontSize: 12, color: COLORS.textDim },

  // CTA
  ctaWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    backgroundColor: '#0a0c11',
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accent,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  ctaBtnDisabled: { borderColor: COLORS.border, opacity: 0.5 },
  ctaLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: FONT.semibold,
    color: COLORS.text,
  },

  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: COLORS.textMuted },
  errorDetail: { marginTop: 6, fontSize: 11, color: COLORS.textDim, textAlign: 'center', paddingHorizontal: 24 },
});
