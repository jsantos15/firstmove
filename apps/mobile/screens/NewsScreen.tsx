import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, RADIUS } from '../lib/constants';

const ARTICLES = [
  {
    tag: 'Opening of the Week',
    title: "Why the Najdorf is Still the Most Played Sicilian at Every Level",
    time: '2 hours ago',
  },
  {
    tag: 'Tip',
    title: 'The one principle that explains 80% of opening mistakes',
    time: '1 day ago',
  },
  {
    tag: 'Community',
    title: 'Most liked punish line this week: Evans Gambit trap wins a piece by move 9',
    time: '2 days ago',
  },
];

export function NewsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.heading}>News</Text>
      <Text style={styles.sub}>Chess tips, updates, and community highlights</Text>

      {ARTICLES.map(a => (
        <View key={a.title} style={styles.card}>
          <View style={styles.tagRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{a.tag}</Text>
            </View>
            <Text style={styles.time}>{a.time}</Text>
          </View>
          <Text style={styles.title}>{a.title}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgBase },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  heading: { fontSize: 28, fontWeight: FONT.bold, color: COLORS.text, marginBottom: 4 },
  sub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 8 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 10,
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: {
    backgroundColor: COLORS.accentDim,
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  tagText: { fontSize: 10, fontWeight: FONT.bold, color: COLORS.accent, letterSpacing: 0.3 },
  time: { fontSize: 11, color: COLORS.textDim },
  title: { fontSize: 14, fontWeight: FONT.semibold, color: COLORS.text, lineHeight: 20 },
});
