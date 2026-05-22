import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../lib/constants';

interface ScreenProps extends ViewProps {
  children: React.ReactNode;
  withTopInset?: boolean;
}

export function Screen({ children, style, withTopInset = false, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        withTopInset && { paddingTop: insets.top },
        style,
      ]}
      {...props}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bgBase,
  },
});
