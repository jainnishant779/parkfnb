import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getTheme } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';
import AppHeader from '../../components/headers/AppHeader';
import { clearMoreDot } from '../../utils/storage';
import { useAuth } from '../../context/AuthContext';

// Owner type storage key
const OWNER_TYPE_KEY = 'ownerType';

// Menu item type
interface MenuItem {
  id: string;
  icon: string;
  label: string;
  description?: string;
  route?: string;
  showBadge?: boolean;
  badgeCount?: number;
  color?: string;
}

// Menu sections
const MENU_SECTIONS: { title: string; items: MenuItem[] }[] = [
  {
    title: 'Account',
    items: [
      {
        id: 'profile',
        icon: 'person-outline',
        label: 'Profile',
        description: 'Manage your personal information',
        route: 'Profile',
      },
      {
        id: 'notifications',
        icon: 'notifications-outline',
        label: 'Notifications',
        description: 'Notification preferences',
        route: 'NotificationPreferences',
        showBadge: true,
        badgeCount: 3,
      },
    ],
  },
  {
    title: 'Business',
    items: [
      {
        id: 'earnings',
        icon: 'bar-chart-outline',
        label: 'Earnings',
        description: 'Revenue summary and transactions',
        route: 'Earnings',
      },
      {
        id: 'payouts',
        icon: 'card-outline',
        label: 'Payouts',
        description: 'Bank account and payout settings',
        route: 'Payouts',
      },
      {
        id: 'promotions',
        icon: 'pricetag-outline',
        label: 'Promotions',
        description: 'Discounts and special offers',
        route: 'Promotions',
      },
      {
        id: 'reviews',
        icon: 'star-outline',
        label: 'Reviews',
        description: 'View and respond to reviews',
        route: 'Reviews',
      },
    ],
  },
  {
    title: 'Support',
    items: [
      {
        id: 'help',
        icon: 'help-circle-outline',
        label: 'Help Center',
        description: 'FAQs and support tickets',
        route: 'HelpCenter',
      },
    ],
  },
];

// Menu item component
interface MenuItemRowProps {
  item: MenuItem;
  onPress: () => void;
  isLast: boolean;
  theme: ReturnType<typeof getTheme>;
}

function MenuItemRow({ item, onPress, isLast, theme }: MenuItemRowProps) {
  const scale = useSharedValue(1);

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 15, stiffness: 200 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 200 });
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityLabel={item.label}
      accessibilityRole="button"
    >
      <Animated.View
        style={[
          styles.menuItem,
          !isLast && [styles.menuItemBorder, { borderBottomColor: theme.borderLight }],
          animatedStyle,
        ]}
      >
        {/* Icon */}
        <View style={[styles.menuItemIcon, { backgroundColor: theme.primaryLight }]}>
          <Ionicons
            name={item.icon}
            size={20}
            color={item.color || theme.primary}
          />
        </View>

        {/* Content */}
        <View style={styles.menuItemContent}>
          <Text style={[styles.menuItemLabel, { color: theme.text }]}>
            {item.label}
          </Text>
          {item.description && (
            <Text
              style={[styles.menuItemDescription, { color: theme.textMuted }]}
              numberOfLines={1}
            >
              {item.description}
            </Text>
          )}
        </View>

        {/* Badge or Chevron */}
        <View style={styles.menuItemRight}>
          {item.showBadge && item.badgeCount && item.badgeCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.danger }]}>
              <Text style={styles.badgeText}>{item.badgeCount}</Text>
            </View>
          )}
          <Ionicons
            name="chevron-forward"
            size={20}
            color={theme.textMuted}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  // Force light mode
  const theme = useMemo(() => getTheme(false), []);

  // Owner type state for conditional menu items
  const [isEmptyLandOwner, setIsEmptyLandOwner] = useState(false);
  const [isIndustrialOwner, setIsIndustrialOwner] = useState(false);
  const [isCommercialOwner, setIsCommercialOwner] = useState(false);

  // Load owner type and clear More dot when viewing this screen
  useEffect(() => {
    clearMoreDot();

    // Check owner type
    const checkOwnerType = async () => {
      try {
        const ownerType = await AsyncStorage.getItem(OWNER_TYPE_KEY);
        setIsEmptyLandOwner(ownerType === 'empty_land');
        setIsIndustrialOwner(ownerType === 'industrial_facility');
        setIsCommercialOwner(ownerType === 'commercial_property');
      } catch {
        // Ignore errors
      }
    };
    checkOwnerType();
  }, []);

  // Build menu sections dynamically based on owner type
  const menuSections = useMemo(() => {
    return MENU_SECTIONS.map(section => {
      if (section.title === 'Business') {
        let items = section.items.map(item => {
          // Replace Promotions with Disputes for empty_land owners
          if (item.id === 'promotions' && isEmptyLandOwner) {
            return {
              id: 'disputes',
              icon: 'alert-circle-outline',
              label: 'Disputes',
              description: 'Track and manage dispute cases',
              route: 'Disputes',
            };
          }
          // Replace Reviews with Integrations for industrial_facility owners
          if (item.id === 'reviews' && isIndustrialOwner) {
            return {
              id: 'integrations',
              icon: 'git-network-outline',
              label: 'Integrations',
              description: 'Fleet and GPS tracking',
              route: 'Integrations',
            };
          }
          return item;
        });

        // Add IoT Integrations for commercial_property owners
        if (isCommercialOwner) {
          items = [
            ...items,
            {
              id: 'iot-integrations',
              icon: 'hardware-chip-outline',
              label: 'IoT Integrations',
              description: 'IoT devices and POS systems',
              route: 'IoTIntegrations',
            },
          ];
        }

        return {
          ...section,
          items,
        };
      }
      return section;
    });
  }, [isEmptyLandOwner, isIndustrialOwner, isCommercialOwner]);

  const handleMenuPress = useCallback(
    (route?: string) => {
      if (route) {
        (navigation as any).navigate(route);
      }
    },
    [navigation]
  );

  const handleLogout = useCallback(async () => {
    try {
      // Wipe all device-side state (drafts, dashboard cache, ownerType, etc.).
      await AsyncStorage.clear();
    } catch {
      // Non-fatal — keep going so the auth state still flips.
    }
    // Flip auth state. RootNavigator listens to `isAuthenticated` and will
    // swap the active stack to AuthStack, which opens to WelcomeOwnerType
    // by default — no manual navigation reset needed (and a manual reset
    // here breaks because WelcomeOwnerType isn't a top-level route).
    await signOut();
  }, [signOut]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <AppHeader
        variant="large"
        title="More"
        subtitle="Profile and support"
        showDivider={false}
      />

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {menuSections.map((section, sectionIndex) => (
          <View key={section.title} style={styles.section}>
            {/* Section Title */}
            <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
              {section.title}
            </Text>

            {/* Section Card */}
            <View style={[styles.sectionCard, { backgroundColor: theme.surface }]}>
              {section.items.map((item, itemIndex) => (
                <MenuItemRow
                  key={item.id}
                  item={item}
                  onPress={() => handleMenuPress(item.route)}
                  isLast={itemIndex === section.items.length - 1}
                  theme={theme}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Logout Button */}
        <Pressable
          style={[styles.logoutButton, { backgroundColor: theme.primary }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={[styles.logoutText, { color: '#FFFFFF' }]}>Log Out</Text>
        </Pressable>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  section: {
    marginBottom: spacing[5],
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing[2],
    marginLeft: spacing[1],
  },
  sectionCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: spacing[3],
    gap: 2,
  },
  menuItemLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium as any,
  },
  menuItemDescription: {
    fontSize: fontSize.xs,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing[4],
    borderRadius: borderRadius.lg,
    gap: spacing[2],
    marginTop: spacing[2],
  },
  logoutText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
  },
});
