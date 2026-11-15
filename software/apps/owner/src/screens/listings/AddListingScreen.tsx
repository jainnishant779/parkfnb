import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../context/AuthContext';
import { listingService } from '../../services/listingService';
import type { ApiProperty } from '../../types/api';
import { palette, radii, fonts } from '../../theme/kit';
import { ScreenHeader, IsoBlock, StatusTag, ListRow, PillButton } from '../../components/ui';

/**
 * Dispatcher screen: "What would you like to add?"
 * - If zero properties exist → auto-redirect to PropertyWizard with chainToSpace: true
 * - Otherwise → show two choices: New Property, New Space under existing Property
 */
export default function AddListingScreen() {
  const navigation = useNavigation<any>();
  const { owner } = useAuth();
  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerVisible, setPickerVisible] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const load = async () => {
      if (!owner?.id) {
        setLoading(false);
        return;
      }
      try {
        const { properties } = await listingService.listMyProperties(owner.id);
        setProperties(properties);
        // Auto-redirect to property wizard for first-time owners
        if (properties.length === 0) {
          navigation.replace('PropertyWizard', { chainToSpace: true });
        }
      } catch {
        /* let user pick manually */
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [owner?.id]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </SafeAreaView>
    );
  }

  const noProperties = properties.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <ScreenHeader title="What to add?" onBack={() => navigation.goBack()} />

      <View style={styles.content}>
        <Text style={styles.lead}>Choose what you want to list next.</Text>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.optionCard, { backgroundColor: palette.peachSoft }]}
          onPress={() => navigation.navigate('PropertyWizard', { chainToSpace: false })}
        >
          <View style={styles.optionArt} pointerEvents="none">
            <IsoBlock size={140} tone="peach" />
          </View>
          <StatusTag label="Location" tone="ink" />
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>New property</Text>
            <Text style={styles.optionDesc}>
              A new physical location (address). You'll add parking spaces to it next.
            </Text>
          </View>
          <View style={styles.optionGo}>
            <Ionicons name="arrow-forward" size={18} color={palette.text} />
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.optionCard,
            { backgroundColor: palette.blueSoft },
            noProperties && styles.optionCardDisabled,
          ]}
          disabled={noProperties}
          onPress={() => setPickerVisible(true)}
        >
          <View style={styles.optionArt} pointerEvents="none">
            <IsoBlock size={140} tone="blue" />
          </View>
          <StatusTag label="Space" tone="ink" />
          <View style={styles.optionBody}>
            <Text style={styles.optionTitle}>New parking space</Text>
            <Text style={styles.optionDesc}>
              {noProperties
                ? 'Add a property first'
                : 'Add another space to one of your properties'}
            </Text>
          </View>
          <View style={styles.optionGo}>
            <Ionicons name="arrow-forward" size={18} color={palette.text} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Property picker sheet */}
      {pickerVisible ? (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPickerVisible(false)}
          />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.pickerTitle}>Choose property</Text>
            <FlatList
              data={properties}
              keyExtractor={(p) => p.id}
              style={styles.pickerList}
              renderItem={({ item, index }) => (
                <ListRow
                  icon="home"
                  title={item.propertyName}
                  subtitle={item.city}
                  isLast={index === properties.length - 1}
                  onPress={() => {
                    setPickerVisible(false);
                    navigation.navigate('SpaceWizard', { propertyId: item.id });
                  }}
                />
              )}
            />
            <PillButton
              label="Cancel"
              variant="grey"
              onPress={() => setPickerVisible(false)}
              style={styles.pickerCancel}
            />
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  lead: {
    ...fonts.medium,
    fontSize: 15,
    color: palette.textMuted,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  optionCard: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
    minHeight: 170,
    overflow: 'hidden',
    alignItems: 'flex-start',
  },
  optionCardDisabled: { opacity: 0.5 },
  optionArt: { position: 'absolute', right: -30, bottom: -26 },
  optionBody: { width: '64%' },
  optionTitle: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  optionDesc: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 6, lineHeight: 18 },
  optionGo: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    // Absolutely positioned overlay rather than a <Modal>, which does not
    // present on this build.
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '70%',
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  pickerTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 6,
  },
  pickerList: { flexGrow: 0 },
  pickerCancel: { marginTop: 12 },
});
