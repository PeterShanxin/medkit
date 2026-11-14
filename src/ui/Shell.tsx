import { Pressable } from './interaction';
import React from 'react';
import { Link, usePathname } from 'expo-router';
import { Platform, ScrollView, View } from 'react-native';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  House,
  LayoutGrid,
  Settings2,
  ShieldCheck,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Copy, LoadingRecords, Notice } from './components';
import { useRecords } from './store';
import { useTheme } from './theme';

const navigation: {
  href: '/' | '/cabinet' | '/plans' | '/history' | '/advisor';
  label: string;
  icon: LucideIcon;
}[] = [
  { href: '/', label: 'Today', icon: House },
  { href: '/cabinet', label: 'Cabinet', icon: LayoutGrid },
  { href: '/plans', label: 'Plans', icon: CalendarDays },
  { href: '/history', label: 'History', icon: Activity },
  { href: '/advisor', label: 'Advisor', icon: Stethoscope },
];

function Brand() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: t.accent,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: '-6deg' }],
        }}
      >
        <View
          style={{
            position: 'absolute',
            width: 16,
            height: 5,
            borderRadius: 2,
            backgroundColor: t.onAccent,
          }}
        />
        <View
          style={{
            width: 5,
            height: 16,
            borderRadius: 2,
            backgroundColor: t.onAccent,
          }}
        />
      </View>
      <Copy weight="bold" size={23} style={{ letterSpacing: -0.8 }}>
        medkit
      </Copy>
    </View>
  );
}

export function Shell({ children }: React.PropsWithChildren) {
  const t = useTheme();
  const { state, mode, setMode, error, refresh, connected } = useRecords();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!state) return <LoadingRecords />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        flexDirection: t.wide ? 'row' : 'column',
        paddingTop: t.wide ? 0 : insets.top,
      }}
    >
      {t.wide ? (
        <View
          style={{
            width: 226,
            backgroundColor: t.nav,
            paddingHorizontal: 22,
            paddingTop: 38,
            paddingBottom: 24,
            borderRightWidth: 1,
            borderColor: t.line,
          }}
        >
          <View style={{ paddingHorizontal: 12, marginBottom: 55 }}>
            <Brand />
          </View>
          <View style={{ gap: 7 }}>
            {navigation.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityState={{ selected: pathname === href }}
                  style={{
                    minHeight: 48,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    backgroundColor:
                      pathname === href ? t.surface : 'transparent',
                  }}
                >
                  <Icon
                    size={19}
                    color={pathname === href ? t.accent : t.muted}
                    strokeWidth={1.8}
                  />
                  <Copy
                    weight={pathname === href ? 'bold' : 'regular'}
                    size={14}
                  >
                    {label}
                  </Copy>
                </Pressable>
              </Link>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ gap: 16, marginHorizontal: 12, paddingBottom: 25 }}>
            <View style={{ width: 32, height: 1, backgroundColor: t.line }} />
            <Copy weight="display" size={20}>
              A little care, every day.
            </Copy>
            <Copy size={12} muted>
              Your records. Your space.
            </Copy>
          </View>
          <Link href="/settings" asChild>
            <Pressable
              accessibilityRole="link"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                padding: 15,
              }}
            >
              <Settings2 size={18} color={t.muted} />
              <Copy size={14}>Settings</Copy>
            </Pressable>
          </Link>
        </View>
      ) : (
        <View
          style={{
            paddingHorizontal: 22,
            height: 65,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderColor: t.line,
          }}
        >
          <Brand />
          <Link href="/settings" asChild>
            <Pressable
              accessibilityLabel="Settings"
              accessibilityRole="link"
              style={{ padding: 12 }}
            >
              <Settings2 size={22} color={t.muted} />
            </Pressable>
          </Link>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScrollView
          contentContainerStyle={{
            padding: t.compact ? 22 : 44,
            paddingTop: t.compact ? 24 : 35,
            paddingBottom: 45,
            width: '100%',
            maxWidth: 1280,
            alignSelf: 'center',
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: t.compact ? 22 : 35,
            }}
          >
            <Copy size={12} muted>
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Copy>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <ShieldCheck size={14} color={t.muted} />
              <Copy size={11} muted>
                {connected ? 'Connected space' : 'On this device'}
              </Copy>
            </View>
          </View>
          {mode === 'demo' && (
            <View
              style={{
                backgroundColor: t.warningBg,
                borderRadius: 12,
                paddingHorizontal: 14,
                marginBottom: 22,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <Copy size={12} style={{ color: t.warning, flex: 1 }}>
                Sample data · Separate from your records
              </Copy>
              <Button
                label="Exit demo"
                small
                kind="quiet"
                onPress={() => setMode('personal')}
              />
            </View>
          )}
          {error && (
            <View style={{ gap: 10, marginBottom: 20 }}>
              <Notice>{error}</Notice>
              <Button
                label="Refresh records"
                kind="secondary"
                onPress={() => void refresh()}
              />
            </View>
          )}
          {connected && (
            <Link href="/connections" asChild>
              <Pressable
                accessibilityRole="link"
                style={{ paddingVertical: 12, marginBottom: 12 }}
              >
                <Copy size={14}>Connections & pending changes →</Copy>
              </Pressable>
            </Link>
          )}
          {children}
          <View
            style={{
              borderTopWidth: 1,
              borderColor: t.line,
              marginTop: 48,
              paddingTop: 18,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Copy size={11} muted>
              Made for your peace of mind.
            </Copy>
            <Link href="/settings" asChild>
              <Pressable
                accessibilityRole="link"
                style={{
                  minHeight: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Copy size={11} muted>
                  Your data & privacy
                </Copy>
                <ArrowUpRight size={12} color={t.muted} />
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </View>
      {!t.wide && (
        <View
          style={{
            flexDirection: 'row',
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 7,
            backgroundColor: t.surface,
            borderTopWidth: 1,
            borderColor: t.line,
          }}
        >
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={label}
                accessibilityState={{ selected: pathname === href }}
                style={{
                  flex: 1,
                  minHeight: 53,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                }}
              >
                <Icon
                  size={21}
                  color={pathname === href ? t.accent : t.muted}
                  strokeWidth={pathname === href ? 2.2 : 1.6}
                />
                <Copy size={10} weight={pathname === href ? 'bold' : 'regular'}>
                  {label}
                </Copy>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </View>
  );
}

export function PageHeading({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description?: string }>) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: t.compact ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: t.compact ? 'flex-start' : 'center',
        gap: 18,
        marginBottom: 32,
      }}
    >
      <View style={{ flex: 1 }}>
        <Copy
          heading
          size={t.compact ? 37 : 43}
          weight="display"
          style={{ letterSpacing: -1.4, lineHeight: t.compact ? 46 : 54 }}
        >
          {title}
        </Copy>
        {description && (
          <Copy muted size={14} style={{ marginTop: 8 }}>
            {description}
          </Copy>
        )}
      </View>
      {children}
    </View>
  );
}

export function WebOfflineRegistration() {
  React.useEffect(() => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      !__DEV__
    ) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        /* The app remains usable online if the browser blocks offline caching. */
      });
    }
  }, []);
  return null;
}
