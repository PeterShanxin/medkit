import { Pressable } from './interaction';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Check, ChevronDown, X, type LucideIcon } from 'lucide-react-native';
import { ZodError } from 'zod';
import { fonts, useTheme } from './theme';
import { hasConnection } from '../storage/connection';
import { useRecords, uuid } from './store';

export function Copy({
  children,
  size = 15,
  muted = false,
  weight = 'regular',
  style,
  selectable,
  heading,
}: React.PropsWithChildren<{
  size?: number;
  muted?: boolean;
  weight?: 'regular' | 'medium' | 'bold' | 'display';
  style?: TextStyle;
  selectable?: boolean;
  heading?: boolean;
}>) {
  const t = useTheme();
  return (
    <Text
      accessibilityRole={heading ? 'header' : undefined}
      selectable={selectable}
      style={{
        fontFamily: fonts[weight],
        fontSize: size,
        lineHeight: size * 1.45,
        color: muted ? t.muted : t.ink,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  icon: Icon,
  kind = 'primary',
  disabled,
  small,
  testID,
}: {
  label: string;
  onPress(): void;
  icon?: LucideIcon;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  small?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  const color =
    kind === 'primary' ? t.onAccent : kind === 'danger' ? t.danger : t.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      testID={testID}
      onPress={onPress}
      style={({ pressed, hovered }) => ({
        minHeight: 44,
        paddingHorizontal: small ? 13 : 20,
        paddingVertical: 10,
        borderRadius: 12,
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
        backgroundColor:
          kind === 'primary'
            ? t.accent
            : kind === 'danger'
              ? t.dangerBg
              : kind === 'secondary' || hovered
                ? t.soft
                : 'transparent',
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
      })}
    >
      {Icon && <Icon size={17} color={color} strokeWidth={1.8} />}
      <Copy weight="medium" size={14} style={{ color }}>
        {label}
      </Copy>
    </Pressable>
  );
}

export function SectionTitle({
  title,
  children,
}: React.PropsWithChildren<{ title: string }>) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 18,
      }}
    >
      <Copy size={20} weight="medium">
        {title}
      </Copy>
      {children}
    </View>
  );
}

export function Panel({
  children,
  style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderRadius: 22,
        padding: t.compact ? 20 : 26,
        ...style,
      }}
    >
      {children}
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  keyboard = 'default',
  hint,
  testID,
  secure = false,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  multiline?: boolean;
  keyboard?: 'default' | 'decimal-pad';
  hint?: string;
  testID?: string;
  secure?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Copy size={13} weight="medium">
        {label}
      </Copy>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize="none"
        secureTextEntry={secure}
        autoCorrect={!secure}
        style={{
          fontFamily: fonts.regular,
          fontSize: 16,
          color: t.ink,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.bg,
          borderRadius: 10,
          padding: 13,
          minHeight: multiline ? 88 : 48,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {hint && (
        <Copy size={12} muted>
          {hint}
        </Copy>
      )}
    </View>
  );
}

export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const t = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Copy size={13} weight="medium">
        {label}
      </Copy>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${options.find((option) => option.value === value)?.label ?? 'Choose'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{
          minHeight: 48,
          borderWidth: 1,
          borderColor: t.line,
          backgroundColor: t.bg,
          borderRadius: 10,
          padding: 13,
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Copy style={{ flex: 1 }}>
          {options.find((option) => option.value === value)?.label ?? 'Choose'}
        </Copy>
        <ChevronDown size={18} color={t.muted} />
      </Pressable>
      {open && (
        <View
          style={{
            borderWidth: 1,
            borderColor: t.line,
            borderRadius: 10,
            backgroundColor: t.surface,
            overflow: 'hidden',
          }}
        >
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={({ hovered }) => ({
                padding: 13,
                minHeight: 44,
                backgroundColor:
                  hovered || option.value === value ? t.soft : t.surface,
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
              })}
            >
              <Copy style={{ flex: 1 }}>{option.label}</Copy>
              {option.value === value && <Check size={16} color={t.accent} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange(value: boolean): void;
  hint?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: 'row',
        gap: 12,
        minHeight: 44,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 23,
          height: 23,
          borderWidth: 1,
          borderColor: value ? t.accent : t.muted,
          backgroundColor: value ? t.accent : 'transparent',
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && <Check size={16} color={t.onAccent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Copy size={14}>{label}</Copy>
        {hint && (
          <Copy size={12} muted>
            {hint}
          </Copy>
        )}
      </View>
    </Pressable>
  );
}

export function Notice({
  children,
  danger = false,
}: React.PropsWithChildren<{ danger?: boolean }>) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: danger ? t.dangerBg : t.warningBg,
        padding: 14,
        borderRadius: 12,
      }}
    >
      <Copy size={13} style={{ color: danger ? t.danger : t.warning }}>
        {children}
      </Copy>
    </View>
  );
}

export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingVertical: 44,
        paddingHorizontal: 12,
        gap: 12,
        borderTopWidth: 1,
        borderColor: t.line,
      }}
    >
      <Copy size={28} weight="display">
        {title}
      </Copy>
      <Copy muted style={{ maxWidth: 430 }}>
        {detail}
      </Copy>
      {action && <View style={{ marginTop: 6 }}>{action}</View>}
    </View>
  );
}

export function FormDialog({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  destructive = false,
}: React.PropsWithChildren<{
  title: string;
  onClose(): void;
  onSubmit(operationId: string): Promise<void>;
  submitLabel?: string;
  destructive?: boolean;
}>) {
  const t = useTheme();
  const { busy } = useRecords();
  const operationId = useRef(uuid());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (saving || busy) return;
    setSaving(true);
    setError('');
    try {
      await onSubmit(operationId.current);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ZodError
          ? (cause.issues[0]?.message ?? 'Check the entered information.')
          : cause instanceof Error
            ? cause.message
            : 'The change was not saved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{
          flex: 1,
          backgroundColor: '#0C1B2666',
          alignItems: 'center',
          justifyContent: t.compact ? 'flex-end' : 'center',
          padding: t.compact ? 0 : 28,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: t.surface,
            borderRadius: t.compact ? 22 : 24,
            width: '100%',
            maxWidth: 580,
            maxHeight: t.compact ? '94%' : '92%',
            overflow: 'hidden',
            paddingTop: 22,
          }}
        >
          <View
            style={{
              paddingHorizontal: 24,
              paddingBottom: 18,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <Copy size={28} weight="display" style={{ flex: 1 }}>
              {title}
            </Copy>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close dialog"
              disabled={saving}
              onPress={onClose}
              style={{
                width: 44,
                height: 44,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={22} color={t.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 24,
              gap: 18,
              paddingBottom: 24,
            }}
          >
            {children}
            {error && <Notice danger>{error}</Notice>}
          </ScrollView>
          <View
            style={{
              borderTopWidth: 1,
              borderColor: t.line,
              padding: 20,
              paddingBottom: Platform.OS === 'ios' ? 30 : 20,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <Button
              label="Cancel"
              kind="quiet"
              disabled={saving}
              onPress={onClose}
            />
            <Button
              label={saving ? 'Saving…' : submitLabel}
              kind={destructive ? 'danger' : 'primary'}
              disabled={saving || busy}
              onPress={() => void submit()}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function LoadingRecords() {
  const { error, refresh, disconnect } = useRecords();
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 30,
        gap: 20,
      }}
    >
      <Copy size={36} weight="display">
        MedKit
      </Copy>
      {error ? (
        <>
          <Notice>{error}</Notice>
          <Button label="Retry" onPress={() => void refresh()} />
          {hasConnection() && (
            <Button
              label="Sign out of connected space"
              kind="quiet"
              onPress={() => void disconnect().catch(() => refresh())}
            />
          )}
        </>
      ) : (
        <>
          <ActivityIndicator color={t.accent} />
          <Copy muted>Opening your records…</Copy>
        </>
      )}
    </View>
  );
}

export function TwoColumns({ children }: React.PropsWithChildren) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: t.compact ? 'column' : 'row', gap: 16 }}>
      {children}
    </View>
  );
}
