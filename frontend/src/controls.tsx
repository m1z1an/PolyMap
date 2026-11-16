import { Pressable, StyleSheet, Text } from 'react-native';

export const colors = { ink: '#15332a', muted: '#52675d', dark: '#123b30', green: '#17684e',
  pale: '#edf3eb', white: '#fffefa', border: '#dce5db', lime: '#ddf074' };

export function Button({ label, onPress, primary, active, disabled, testID }: {
  label: string; onPress: () => void; primary?: boolean; active?: boolean; disabled?: boolean; testID?: string;
}) {
  return <Pressable accessibilityRole="button" testID={testID} onPress={onPress} disabled={disabled}
    accessibilityState={{ disabled }} aria-pressed={active}
    style={({ pressed }) => [styles.button, primary && styles.primary, active && styles.active,
      (pressed || disabled) && { opacity: disabled ? 0.5 : 0.76 }]}>
    <Text style={[styles.label, primary && { color: 'white' }]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 11,
    minHeight: 40, paddingVertical: 9, justifyContent: 'center', backgroundColor: colors.white },
  primary: { backgroundColor: colors.green, borderColor: colors.green },
  active: { backgroundColor: '#e6f0c0', borderColor: '#7b9e55' },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
});
