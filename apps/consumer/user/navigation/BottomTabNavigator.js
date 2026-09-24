import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Easing } from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';

import HomePage from '../screens/home/HomePage';
import BookingManagementPage from '../screens/bookings/BookingManagementPage';
import ProfilePage from '../screens/profile/ProfilePage';
import { palette } from '../theme';

const Tab = createBottomTabNavigator();

// Tabs we render. Order = visual order in the bar.
const TABS = [
  { key: 'Home', icon: 'home', label: 'Home' },
  { key: 'Bookings', icon: 'calendar', label: 'Bookings' },
  { key: 'Profile', icon: 'user', label: 'Profile' },
];

/**
 * Floating frosted pill tab bar. Icon-only; the focused tab sits in a solid
 * ink circle. The pill floats above the home indicator rather than spanning
 * the full width, so content scrolls visibly underneath it.
 */
function FloatingTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[styles.outer, { paddingBottom: Math.max(insets.bottom - 6, 12) }]}
    >
      <View style={styles.pillShadow}>
        <View style={styles.pill}>
          {/* Real blur on iOS. Android's BlurView samples the whole window,
              including this bar's own active circle (grey smear), so Android
              gets a translucent frosted fill instead (see pillTint). */}
          {Platform.OS === 'ios' ? (
            <BlurView
              style={StyleSheet.absoluteFill}
              blurType="light"
              blurAmount={18}
              reducedTransparencyFallbackColor="#FFFFFF"
            />
          ) : null}
          <View style={styles.pillTint} />
          {/* Glass sheen: brighter top half, like light across frosted glass. */}
          <View style={styles.pillSheen} pointerEvents="none" />

          {state.routes.map((route, index) => {
            const tab = TABS.find((t) => t.key === route.name);
            if (!tab) return null;
            const focused = state.index === index;
            const { options } = descriptors[route.key];

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key });
            };

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
                onPress={onPress}
                onLongPress={onLongPress}
                hitSlop={6}
                activeOpacity={0.7}
                style={styles.tab}
              >
                <View style={styles.iconWrap}>
                  {/* The ink circle is always mounted and only its opacity
                      changes: on Android a rounded view whose background
                      colour changes after mount loses its radius (square). */}
                  <View style={[styles.activeCircle, { opacity: focused ? 1 : 0 }]} />
                  <Icon
                    name={tab.icon}
                    size={22}
                    color={focused ? palette.textInverse : palette.text}
                  />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const BottomTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.bg },
        // Library handles the show/hide of inactive scenes by itself.
        // The previous override (`lazy:false, detachInactiveScreens:false`)
        // kept all three screens mounted, which caused the OLD scene
        // (e.g. Home) to bleed through under the NEW one during the
        // transition. Defaults are correct.
        animation: 'fade',
        transitionSpec: {
          animation: 'timing',
          config: {
            duration: 280,
            easing: Easing.out(Easing.cubic),
          },
        },
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomePage} />
      <Tab.Screen name="Bookings" component={BookingManagementPage} />
      <Tab.Screen name="Profile" component={ProfilePage} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  pillShadow: {
    borderRadius: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 26,
    elevation: 6,
    // Android shapes the elevation shadow from the background; a near-clear
    // fill keeps it rounded without hiding the glass.
    backgroundColor: Platform.OS === 'android' ? 'rgba(255,255,255,0.02)' : undefined,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 76,
    paddingHorizontal: 8,
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  pillTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(248,248,248,0.72)' : 'rgba(249,249,249,0.99)',
  },
  pillSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  tab: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    backgroundColor: palette.ink,
  },
});

export default BottomTabNavigator;
