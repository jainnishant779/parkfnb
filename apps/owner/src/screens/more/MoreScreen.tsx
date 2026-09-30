import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palette, radii, fonts } from '../../theme/kit';
import { Avatar, IconCircle, ListRow } from '../../components/ui';
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
        icon: 'user',
        label: 'Profile',
        description: 'Manage your personal information',
        route: 'Profile',
      },
      {
        id: 'notifications',
        icon: 'bell',
        label: 'Notifications',
        description: 'Notification preferences',
        route: 'NotificationPreferences',
        // No real unread count is wired up yet. This was a hardcoded 3, which told
        // every owner they had three unread notifications regardless of account.
      },
    ],
  },
  {
    title: 'Business',
    items: [
      {
        id: 'earnings',
        icon: 'bar-chart-2',
        label: 'Earnings',
        description: 'Revenue summary and transactions',
        route: 'Earnings',
      },
      {
        id: 'payouts',
        icon: 'credit-card',
        label: 'Payouts',
        description: 'Bank account and payout settings',
        route: 'Payouts',
      },
      {
        id: 'promotions',
        icon: 'tag',
        label: 'Promotions',
        description: 'Discounts and special offers',
        route: 'Promotions',
      },
      {
        id: 'reviews',
        icon: 'star',
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
        icon: 'help-circle',
        label: 'Help Center',
        description: 'FAQs and support tickets',
        route: 'HelpCenter',
      },
    ],
  },
];

export default function MoreScreen() {
  const navigation = useNavigation();
  const { signOut, user, owner } = useAuth();
  const insets = useSafeAreaInsets();

  const displayName =
    user?.legalName ||
    `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() ||
    'Owner';
  const displaySubtitle = owner?.businessName || user?.email || user?.phone || 'Parking owner';

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
              icon: 'alert-circle',
              label: 'Disputes',
              description: 'Track and manage dispute cases',
              route: 'Disputes',
            };
          }
          // Replace Reviews with Integrations for industrial_facility owners
          if (item.id === 'reviews' && isIndustrialOwner) {
            return {
              id: 'integrations',
              icon: 'git-branch',
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
              icon: 'cpu',
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
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile row */}
        <View style={styles.profileRow}>
          <TouchableOpacity onPress={() => handleMenuPress('Profile')} activeOpacity={0.8}>
            <Avatar name={displayName} uri={user?.profilePictureUrl} size={58} />
          </TouchableOpacity>
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.profileSub} numberOfLines={1}>{displaySubtitle}</Text>
          </View>
          <IconCircle
            icon="edit-2"
            size={50}
            onPress={() => handleMenuPress('Profile')}
          />
        </View>

        <Text style={styles.pageTitle}>More</Text>

        {menuSections.map(section => (
          <View key={section.title} style={styles.section}>
            {/* Section Title */}
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {/* Section Card */}
            <View style={styles.sectionCard}>
              {section.items.map((item: MenuItem, itemIndex: number) => (
                <ListRow
                  key={item.id}
                  icon={item.icon}
                  title={item.label}
                  subtitle={item.description}
                  onPress={() => handleMenuPress(item.route)}
                  isLast={itemIndex === section.items.length - 1}
                />
              ))}
            </View>
          </View>
        ))}

        {/* Logout */}
        <View style={styles.sectionCard}>
          <ListRow
            icon="log-out"
            title="Log Out"
            danger
            onPress={handleLogout}
            right={null}
            isLast
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  profileText: {
    flex: 1,
    marginLeft: 14,
    marginRight: 10,
  },
  profileName: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
  },
  profileSub: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
    marginTop: 3,
  },
  pageTitle: {
    ...fonts.semibold,
    fontSize: 32,
    letterSpacing: -0.8,
    color: palette.text,
    marginTop: 26,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...fonts.medium,
    fontSize: 14,
    color: palette.textMuted,
    marginBottom: 10,
    marginLeft: 6,
  },
  sectionCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.xl,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
});
