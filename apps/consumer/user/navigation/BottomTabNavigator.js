import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Feather';

import HomePage from '../screens/home/HomePage';
import BookingManagementPage from '../screens/bookings/BookingManagementPage';
import ProfilePage from '../screens/profile/ProfilePage';
import { palette, fontStacks } from '../theme';

const Tab = createBottomTabNavigator();

const ACTIVE = palette.primary;
const INACTIVE = palette.textSubtle;

// Tabs we render. Order = visual order in the bar.
const TABS = [
  { key: 'Home', icon: 'home', label: 'Home' },
  { key: 'Bookings', icon: 'calendar', label: 'Bookings' },
  { key: 'Profile', icon: 'user', label: 'Profile' },
];

/**
 * Custom tab bar — fake glass morphism + floating pill layout.
 *
 * Why custom: native BlurView on Android in this app's stack has been
 * unstable (see GlassCard.js notes). We fake the glass effect with a
 * translucent base fill + a top "shine" band + a generous drop shadow.
 *
 * Active pill: rather than a tiny dot above the icon, the focused tab gets
 * a soft tinted pill behind the icon + label so it reads from across the
 * room. Inactive tabs are icon-only to keep the bar uncluttered.
 */
function GlassTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.tabBarOuter,
        { paddingBottom: insets.bottom },
      ]}
    >
      {/* Glass backdrop spans the full width AND extends down through the
          safe-area inset, so the mint page bg never peeks out around the
          bar. The actual tabs sit on top in `tabBar`. */}
      <View pointerEvents="none" style={styles.absFill}>
        <View style={styles.glassFill} />
      </View>

      <View style={styles.tabBar}>

        {state.routes.map((route, index) => {
          const tab = TABS.find((t) => t.key === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          const color = focused ? ACTIVE : INACTIVE;
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
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? tab.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.pill}>
                <Icon name={tab.icon} size={22} color={color} />
                <Text
                  style={[
                    styles.label,
                    { color, opacity: focused ? 1 : 0.6 },
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
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
      tabBar={(props) => <GlassTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomePage} />
      <Tab.Screen name="Bookings" component={BookingManagementPage} />
      <Tab.Screen name="Profile" component={ProfilePage} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // Full-width: no horizontal margin, so there are no mint gaps on the
    // sides of the bar. Cards behind it scroll up under the glass directly.
    alignItems: 'stretch',
  },
  absFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  glassFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Opaque white. A translucent fill let the OS's bottom gesture pill
    // (a small rounded white shape on Android) bleed through, which read
    // as a "white box inside the menu". Solid background hides it.
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.08,
        shadowRadius: 18,
      },
      // No `elevation` on Android — its shadow renderer with mixed
      // radius (rounded top, square bottom) drew a visible outline
      // below the bar. Border + flat fill is enough.
    }),
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    height: 64,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  pill: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  label: {
    fontFamily: fontStacks.medium,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.2,
  },
});

export default BottomTabNavigator;
