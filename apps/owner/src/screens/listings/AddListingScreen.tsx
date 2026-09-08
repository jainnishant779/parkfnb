import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Modal, FlatList, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAuth } from '../../context/AuthContext';
import { listingService } from '../../services/listingService';
import type { ApiProperty } from '../../types/api';

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
          <ActivityIndicator size="large" color="#0D7377" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#1F2937" />
        </Pressable>
        <Text style={styles.headerTitle}>What to add?</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <Pressable
          style={styles.optionCard}
          onPress={() => navigation.navigate('PropertyWizard', { chainToSpace: false })}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#E8F5F4' }]}>
            <Ionicons name="business-outline" size={28} color="#0D7377" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>New property</Text>
            <Text style={styles.optionDesc}>
              A new physical location (address). You'll add parking spaces to it next.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>

        <Pressable
          style={[styles.optionCard, properties.length === 0 && styles.optionCardDisabled]}
          disabled={properties.length === 0}
          onPress={() => setPickerVisible(true)}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#ECFDF5' }]}>
            <Ionicons name="car-outline" size={28} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>New parking space</Text>
            <Text style={styles.optionDesc}>
              {properties.length === 0
                ? 'Add a property first'
                : 'Add another space to one of your properties'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* Property picker modal */}
      {pickerVisible ? (

        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Choose property</Text>
            <FlatList
              data={properties}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.pickerItem}
                  onPress={() => {
                    setPickerVisible(false);
                    navigation.navigate('SpaceWizard', { propertyId: item.id });
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemTitle}>{item.propertyName}</Text>
                    <Text style={styles.pickerItemSub}>{item.city}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1F2937', textAlign: 'center' },
  content: { padding: 16, gap: 12 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  optionCardDisabled: { opacity: 0.5 },
  iconWrap: { width: 52, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  optionDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '70%',
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pickerItemTitle: { fontSize: 15, color: '#1F2937', fontWeight: '500' },
  pickerItemSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
});
