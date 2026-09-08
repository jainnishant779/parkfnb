import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Modal,
  FlatList,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';

// ============================================================================
// TYPES
// ============================================================================

type OwnerType =
  | 'individual'
  | 'residential_community'
  | 'commercial_property'
  | 'industrial_facility'
  | 'empty_land';

interface OwnerTypeOption {
  id: OwnerType;
  title: string;
  iconName: string;
}

// ============================================================================
// CONSTANTS & DATA
// ============================================================================

const STORAGE_KEY = 'ownerType';

const ownerTypes: OwnerTypeOption[] = [
  { id: 'individual', title: 'Individual Owner', iconName: 'home' },
  { id: 'residential_community', title: 'Residential Community', iconName: 'home-group' },
  { id: 'commercial_property', title: 'Commercial Property', iconName: 'office-building' },
  { id: 'industrial_facility', title: 'Industrial Facility', iconName: 'factory' },
  { id: 'empty_land', title: 'Empty Land Owner', iconName: 'land-plots' },
];

// ============================================================================
// THEME
// ============================================================================

const theme = {
  colors: {
    background: '#FFFFFF',
    surface: '#FFFFFF',
    primary: '#0D7377',
    primaryLight: '#E8F5F4',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    border: '#E2E8F0',
    borderSelected: '#0D7377',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
};

// ============================================================================
// MAIN SCREEN COMPONENT
// ============================================================================

type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export default function WelcomeOwnerTypeScreen() {
  const navigation = useNavigation<AuthNavigationProp>();

  const [selectedType, setSelectedType] = useState<OwnerType | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Load saved selection on mount
  useEffect(() => {
    loadSavedSelection();
  }, []);

  const loadSavedSelection = async () => {
    try {
      const savedType = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedType && ownerTypes.some((t) => t.id === savedType)) {
        setSelectedType(savedType as OwnerType);
      }
    } catch (error) {
      console.warn('Failed to load saved owner type:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSelection = async (type: OwnerType) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, type);
    } catch (error) {
      console.warn('Failed to save owner type:', error);
    }
  };

  const handleSelectType = (type: OwnerType) => {
    setSelectedType(type);
    setIsDropdownOpen(false);
    saveSelection(type);
  };

  const getSelectedOption = () => {
    return ownerTypes.find((t) => t.id === selectedType);
  };

  const renderDropdownItem = ({ item }: { item: OwnerTypeOption }) => {
    const isSelected = selectedType === item.id;
    return (
      <TouchableOpacity
        style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
        onPress={() => handleSelectType(item.id)}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={item.iconName}
          size={24}
          color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
          style={styles.dropdownItemIcon}
        />
        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextSelected]}>
          {item.title}
        </Text>
        {isSelected && (
          <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
        )}
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View style={[styles.logoContainer, styles.skeletonLogo]} />
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonSubtitle} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const selectedOption = getSelectedOption();

  return (
    <SafeAreaView style={styles.container}>
      {/* Decorative Circles */}
      <View style={styles.circleTopRight} />
      <View style={styles.circleTopRightInner} />
      <View style={styles.circleBottomLeft} />

      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <MaterialCommunityIcons name="parking" size={36} color={theme.colors.surface} />
          </View>
          <Text style={styles.title}>Welcome</Text>
          <Text style={styles.subtitle}>
            Choose what kind of space you manage to personalize your setup.
          </Text>
        </View>

        {/* Dropdown Selector */}
        <View style={styles.dropdownContainer}>
          <Text style={styles.dropdownLabel}>Owner Type</Text>
          <TouchableOpacity
            style={[styles.dropdownButton, isDropdownOpen && styles.dropdownButtonActive]}
            onPress={() => setIsDropdownOpen(true)}
            activeOpacity={0.7}
          >
            {selectedOption ? (
              <View style={styles.selectedValue}>
                <MaterialCommunityIcons
                  name={selectedOption.iconName}
                  size={22}
                  color={theme.colors.textPrimary}
                  style={styles.selectedIcon}
                />
                <Text style={styles.selectedText}>{selectedOption.title}</Text>
              </View>
            ) : (
              <Text style={styles.placeholderText}>Select owner type</Text>
            )}
            <Ionicons
              name="chevron-down"
              size={20}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtonContainer}>
        <TouchableOpacity
          onPress={() => navigation.navigate('SignIn')}
          style={[styles.continueButton, !selectedType && styles.continueButtonDisabled]}
          activeOpacity={0.7}
          disabled={!selectedType}
        >
          <Text style={[styles.continueButtonText, !selectedType && styles.continueButtonTextDisabled]}>
            Continue
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('SignIn')}
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>

      {/* Dropdown Modal */}
      {isDropdownOpen ? (

        <Pressable style={styles.modalOverlay} onPress={() => setIsDropdownOpen(false)}>
          <View style={styles.dropdownModal}>
            <View style={styles.dropdownHeader}>
              <Text style={styles.dropdownTitle}>Select Owner Type</Text>
              <TouchableOpacity onPress={() => setIsDropdownOpen(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={ownerTypes}
              renderItem={renderDropdownItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              ListFooterComponent={
                <TouchableOpacity
                  style={styles.clearSelectionItem}
                  onPress={() => {
                    setSelectedType(null);
                    setIsDropdownOpen(false);
                    AsyncStorage.removeItem(STORAGE_KEY);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle-outline" size={20} color="#EF4444" style={styles.clearIcon} />
                  <Text style={styles.clearSelectionText}>Clear selection</Text>
                </TouchableOpacity>
              }
            />
          </View>
        </Pressable>
      
      ) : null}
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Decorative Circles (same as SignIn screen)
  circleTopRight: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 130,
    height: 130,
    borderRadius: 70,
    backgroundColor: '#EBF4FF',
  },
  circleTopRightInner: {
    position: 'absolute',
    top: 50,
    right: 70,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E6FE8',
  },
  circleBottomLeft: {
    position: 'absolute',
    bottom: -60,
    left: -60,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#EBF4FF',
  },

  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
  },

  // Header
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: theme.spacing.xxxl,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: SCREEN_WIDTH * 0.85,
  },

  // Dropdown
  dropdownContainer: {
    marginTop: theme.spacing.lg,
  },
  dropdownLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    minHeight: 56,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  dropdownButtonActive: {
    borderColor: theme.colors.primary,
  },
  selectedValue: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedIcon: {
    marginRight: theme.spacing.md,
  },
  selectedText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textPrimary,
  },
  placeholderText: {
    fontSize: 16,
    color: theme.colors.textTertiary,
  },

  // Modal
  modalOverlay: {
    // Absolutely positioned rather than flex:1 — no longer inside a
    // <Modal>, which does not present on this build.
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  dropdownModal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    width: '100%',
    maxHeight: 400,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemSelected: {
    backgroundColor: theme.colors.primaryLight,
  },
  dropdownItemIcon: {
    marginRight: theme.spacing.lg,
  },
  dropdownItemText: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  dropdownItemTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600',
  },

  // Bottom Button
  bottomButtonContainer: {
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: 60,
    paddingTop: 24,
    backgroundColor: theme.colors.background,
  },
  continueButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    marginBottom: 90,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  continueButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  continueButtonTextDisabled: {
    color: '#E5E7EB',
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 12,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  clearSelectionItem: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  clearIcon: {
    marginRight: theme.spacing.sm,
  },
  clearSelectionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#EF4444',
  },

  // Skeleton
  skeletonLogo: {
    backgroundColor: theme.colors.border,
  },
  skeletonTitle: {
    width: 160,
    height: 28,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  skeletonSubtitle: {
    width: SCREEN_WIDTH * 0.7,
    height: 16,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.border,
  },
});
