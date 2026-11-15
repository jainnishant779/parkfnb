import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as UI from '../../components/ui';
import * as Kit from '../../theme/kit';

// The UI kit is plain JS; give it loose component types and typed font tokens.
const { PillButton } = UI as unknown as Record<string, React.ComponentType<any>>;
const { palette, radii, shadow } = Kit;
const fonts = Kit.fonts as Record<keyof typeof Kit.fonts, TextStyle>;

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
// MAIN SCREEN COMPONENT
// ============================================================================

type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

export default function WelcomeOwnerTypeScreen() {
  const navigation = useNavigation<AuthNavigationProp>();

  const [selectedType, setSelectedType] = useState<OwnerType | null>(null);
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
    saveSelection(type);
  };

  const handleClearSelection = () => {
    setSelectedType(null);
    AsyncStorage.removeItem(STORAGE_KEY);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSubtitle} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.brand}>
          parkfnb.<Text style={styles.brandMark}>®</Text>
        </Text>

        <Text style={styles.title}>{'What do you\nmanage?'}</Text>
        <Text style={styles.subtitle}>
          Choose what kind of space you manage to personalize your setup.
        </Text>

        <View style={styles.list}>
          {ownerTypes.map((item) => {
            const isSelected = selectedType === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleSelectType(item.id)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={item.title}
              >
                <View style={[styles.cardIcon, isSelected && styles.cardIconSelected]}>
                  <MaterialCommunityIcons
                    name={item.iconName}
                    size={22}
                    color={isSelected ? palette.textInverse : palette.text}
                  />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color={palette.textInverse} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedType ? (
          <TouchableOpacity
            style={styles.clearSelection}
            onPress={handleClearSelection}
            activeOpacity={0.7}
            hitSlop={8}
          >
            <Text style={styles.clearSelectionText}>Clear selection</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottom}>
        <PillButton
          label="Continue"
          iconRight="arrow-right"
          variant="ink"
          onPress={() => navigation.navigate('SignIn')}
          disabled={!selectedType}
        />
        <TouchableOpacity
          onPress={() => navigation.navigate('SignIn')}
          style={styles.skipButton}
          activeOpacity={0.7}
        >
          <Text style={styles.skipButtonText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.bg },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  brand: { ...fonts.bold, fontSize: 22, letterSpacing: -0.4, color: palette.text },
  brandMark: { ...fonts.medium, fontSize: 11 },
  title: {
    ...fonts.medium,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
    color: palette.text,
    marginTop: 28,
  },
  subtitle: {
    ...fonts.medium,
    fontSize: 15,
    lineHeight: 21,
    color: palette.textMuted,
    marginTop: 10,
  },

  list: { marginTop: 24, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: palette.surface,
    padding: 14,
    ...shadow.press,
  },
  cardSelected: { borderColor: palette.ink },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: palette.fill,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardIconSelected: { backgroundColor: palette.ink },
  cardTitle: { ...fonts.semibold, flex: 1, fontSize: 16, color: palette.text },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: palette.textSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: palette.ink, borderColor: palette.ink },

  clearSelection: { alignSelf: 'center', marginTop: 16, paddingVertical: 6 },
  clearSelectionText: { ...fonts.semibold, fontSize: 14, color: palette.danger },

  bottom: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: palette.bg },
  skipButton: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  skipButtonText: { ...fonts.semibold, fontSize: 15, color: palette.textMuted },

  // Skeleton
  skeletonTitle: {
    width: 200,
    height: 40,
    borderRadius: radii.sm,
    backgroundColor: palette.bgSoft,
    marginTop: 60,
    marginBottom: 12,
  },
  skeletonSubtitle: {
    width: '80%',
    height: 16,
    borderRadius: radii.sm,
    backgroundColor: palette.bgSoft,
  },
});
