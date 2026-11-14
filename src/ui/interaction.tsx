import { forwardRef, useState, type ComponentRef } from 'react';
import {
  Pressable as NativePressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  style?:
    | StyleProp<ViewStyle>
    | ((
        state: PressableStateCallbackType & { hovered: boolean },
      ) => StyleProp<ViewStyle>);
};

export const Pressable = forwardRef<
  ComponentRef<typeof NativePressable>,
  Props
>(function Pressable({ style, onHoverIn, onHoverOut, ...props }, ref) {
  const [hovered, setHovered] = useState(false);
  return (
    <NativePressable
      {...props}
      ref={ref}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      style={(state) =>
        typeof style === 'function' ? style({ ...state, hovered }) : style
      }
    />
  );
});
