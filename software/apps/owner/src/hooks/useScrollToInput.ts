import { useRef, useCallback } from 'react';
import { ScrollView } from 'react-native';

/**
 * Tracks field Y positions inside a ScrollView and scrolls to a field when
 * it receives focus. Fixes the "keyboard covers lower fields" issue on Android
 * where adjustResize shrinks the window but the ScrollView doesn't auto-scroll
 * to the focused input.
 *
 * Usage:
 *   const { scrollRef, registerField, focusField } = useScrollToInput();
 *
 *   <ScrollView ref={scrollRef}>
 *     <View onLayout={registerField('myField')}>
 *       <FormTextInput ... onFocus={focusField('myField')} />
 *     </View>
 *   </ScrollView>
 */
export function useScrollToInput(topOffset: number = 80) {
  const scrollRef = useRef<ScrollView>(null);
  const fieldYs = useRef<Record<string, number>>({});

  /** Pass to the wrapping View's onLayout to record the field's Y position. */
  const registerField = useCallback(
    (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
      fieldYs.current[key] = e.nativeEvent.layout.y;
    },
    [],
  );

  /** Pass to FormTextInput's onFocus — scrolls the field into view. */
  const focusField = useCallback(
    (key: string) => () => {
      const y = fieldYs.current[key];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - topOffset), animated: true });
      }
    },
    [topOffset],
  );

  return { scrollRef, registerField, focusField };
}
