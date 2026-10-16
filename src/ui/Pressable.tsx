// Every tappable thing: feedback the instant a finger lands (scale 0.97, 120ms ease-out,
// a CSS transition on the UI thread), the action on release, at least 48dp to hit. A key
// (`feel="key"`) sinks 2px instead, as a button on the TV set does, and stays down while
// `sunk` (its action is under way).
import * as haptics from "./haptics";
import { useState, type ReactNode } from "react";
import { Pressable as RNPressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { depth, EASE_OUT_CSS, TOUCH } from "./theme";

export function PressableScale({
  children, style, haptic = "light", onPress, disabled, feel = "scale", sunk = false, ...rest
}: Omit<PressableProps, "style" | "children"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** One haptic per committed press, at the moment it commits. "none" for frequent taps. */
  haptic?: "light" | "none";
  /** "key": the face moves down 2px while pressed instead of shrinking. */
  feel?: "scale" | "key";
  /** A key held down by its own action. */
  sunk?: boolean;
}) {
  const [down, setDown] = useState(false);
  const reduced = useReducedMotion();
  const { outer, inner } = split(style);
  return (
    <RNPressable
      hitSlop={8}
      pressRetentionOffset={16}
      {...rest}
      style={outer}
      disabled={disabled}
      onPressIn={(e) => { setDown(true); rest.onPressIn?.(e); }}
      onPressOut={(e) => { setDown(false); rest.onPressOut?.(e); }}
      onPress={(e) => {
        if (haptic === "light") haptics.tap();
        onPress?.(e);
      }}
      accessibilityRole={rest.accessibilityRole ?? "button"}
      accessibilityState={{ disabled: !!disabled, ...rest.accessibilityState }}
    >
      <Animated.View
        style={[
          { minHeight: TOUCH, opacity: disabled ? 0.5 : 1 },
          inner,
          {
            // Reduced motion: no movement. A key's lip still shrinks; anything else dims, so the press still reads.
            transform: feel === "key"
              ? [{ translateY: (down || sunk) && !reduced ? depth.press : 0 }]
              : [{ scale: down && !reduced ? 0.97 : 1 }],
            ...(reduced && down && feel === "scale" ? { opacity: 0.7 } : null),
            transitionProperty: ["transform", "opacity"],
            transitionDuration: 120,
            transitionTimingFunction: EASE_OUT_CSS,
          },
        ]}
      >
        {children}
      </Animated.View>
    </RNPressable>
  );
}

/** Where it sits (alignment, margins, size) belongs to the tap area; how it looks, to the part that scales. */
const LAYOUT = new Set(["alignSelf", "flex", "flexGrow", "flexShrink", "flexBasis", "width", "maxWidth", "minWidth",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical", "position", "top", "left", "right", "bottom"]);

function split(style: StyleProp<ViewStyle>) {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (LAYOUT.has(k) ? outer : inner)[k] = v;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}
