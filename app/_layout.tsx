import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../src/ui/store';
import { useTheme } from '../src/ui/theme';
import { Shell, WebOfflineRegistration } from '../src/ui/Shell';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'DM Sans': DMSans_400Regular,
    'DM Sans Medium': DMSans_500Medium,
    'DM Sans Bold': DMSans_700Bold,
    Fraunces: Fraunces_400Regular,
  });
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <ThemedStatusBar />
        <WebOfflineRegistration />
        <Shell>
          <Slot />
        </Shell>
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.isDark ? 'light' : 'dark'} />;
}
