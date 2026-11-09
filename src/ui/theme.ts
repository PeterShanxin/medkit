import { useColorScheme, useWindowDimensions } from 'react-native';
import { useRecords } from './store';

const light = {
  bg: '#F7F8F4',
  surface: '#FFFFFF',
  ink: '#203B31',
  muted: '#66736C',
  line: '#E2E7DE',
  accent: '#315D4A',
  onAccent: '#FFFFFF',
  soft: '#EAF0E4',
  highlight: '#DCE7CF',
  warning: '#865326',
  warningBg: '#FBF0DF',
  danger: '#9D413A',
  dangerBg: '#FAECE8',
  nav: '#EFF2EA',
};
const dark = {
  bg: '#141D19',
  surface: '#1D2922',
  ink: '#EEF2E7',
  muted: '#ACB9AF',
  line: '#35473C',
  accent: '#C6DDB3',
  onAccent: '#1B3023',
  soft: '#293C2E',
  highlight: '#354C36',
  warning: '#E8C18C',
  warningBg: '#3D3224',
  danger: '#F1B5A8',
  dangerBg: '#442B29',
  nav: '#18251D',
};

export function useTheme() {
  const { state } = useRecords();
  const system = useColorScheme();
  const preference = state?.preferences.theme ?? 'system';
  const isDark =
    preference === 'dark' || (preference === 'system' && system === 'dark');
  const { width } = useWindowDimensions();
  return {
    ...(isDark ? dark : light),
    isDark,
    wide: width >= 1000,
    compact: width < 600,
    width,
  };
}

export const fonts = {
  regular: 'DM Sans',
  medium: 'DM Sans Medium',
  bold: 'DM Sans Bold',
  display: 'Fraunces',
};
