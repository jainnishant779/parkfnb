import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Pressable, RefreshControl,
  ActivityIndicator, Modal, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { ApiProperty } from '../../types/api';

export default function MyListingsScreen() {
  const navigation = useNavigation<any>();
  const { owner, user } = useAuth();
  const ownerId = owner?.id;

  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [menuProperty, setMenuProperty] = useState<ApiProperty | null>(null);

  const loadData = useCallback(async () => {
    if (!ownerId) {
      setLoading(false);
      setErrorText('Complete onboarding to manage listings.');
      return;
    }
    try {
      const { properties } = await listingService.listMyProperties(ownerId);
      setProperties(properties);
      setErrorText('');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrorText(err.message || 'Failed to load properties.');
      } else {
        setErrorText('Unable to connect.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownerId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddFirst = () => {
    // First-time flow: property wizard auto-chains to space wizard
    navigation.navigate('PropertyWizard', { chainToSpace: true });
  };

  const handleAddMore = () => {
    navigation.navigate('PropertyWizard', { chainToSpace: false });
  };

  const handleDelete = (property: ApiProperty) => {
    setMenuProperty(null);
    AppAlert.alert(
      'Delete property?',
      `"${property.propertyName}" and its spaces will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await listingService.deleteProperty(property.id);
              setProperties((prev) => prev.filter((p) => p.id !== property.id));
            } catch (err) {
              if (err instanceof ApiRequestError && err.code === 'BIZ_CONFLICT') {
                AppAlert.alert(
                  "Can't delete",
                  'This property has active spaces. Delete the spaces first.',
                );
              } else {
                AppAlert.alert('Error', err instanceof ApiRequestError ? err.message : 'Failed.');
              }
            }
          },
        },
      ],
    );
  };

  const renderProperty = ({ item }: { item: ApiProperty }) => {
    const total = item.totalSpaces ?? 0;
    const pending = user?.isVerified === false; // badge shown until KYC verified
    const isDraft = item.status === 'draft';
    return (
      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate('PropertySpaces', { propertyId: item.id })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.thumb}>
            <Ionicons name="business-outline" size={24} color="#0D7377" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{item.propertyName}</Text>
            <Text style={styles.address} numberOfLines={1}>
              {item.address}, {item.city}
            </Text>
          </View>
          <Pressable onPress={() => setMenuProperty(item)} style={styles.menuBtn} hitSlop={8}>
            <Ionicons name="ellipsis-vertical" size={18} color="#6B7280" />
          </Pressable>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.stat}>
            <Ionicons name="car-outline" size={14} color="#6B7280" />
            <Text style={styles.statText}>{total} space{total === 1 ? '' : 's'}</Text>
          </View>
          {isDraft ? (
            <View style={[styles.pill, { backgroundColor: '#E0E7FF', marginRight: 6 }]}>
              <Text style={[styles.pillText, { color: '#3730A3' }]}>Draft</Text>
            </View>
          ) : null}
          {pending ? (
            <View style={[styles.pill, { backgroundColor: '#FEF3C7' }]}>
              <Text style={[styles.pillText, { color: '#92400E' }]}>Pending KYC</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" style={{ marginLeft: 'auto' }} />
        </View>
      </Pressable>
    );
  };

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
        <Text style={styles.headerTitle}>My Properties</Text>
        <Text style={styles.headerSubtitle}>
          {properties.length} {properties.length === 1 ? 'property' : 'properties'}
        </Text>
      </View>

      {errorText ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : null}

      <FlatList
        data={properties}
        keyExtractor={(p) => p.id}
        renderItem={renderProperty}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          !errorText ? (
            <View style={styles.empty}>
              <Ionicons name="business-outline" size={56} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>No properties yet</Text>
              <Text style={styles.emptySub}>
                Add your first property to start listing parking spaces.
              </Text>
              <Pressable style={styles.emptyCta} onPress={handleAddFirst}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.emptyCtaText}>Add your first property</Text>
              </Pressable>
            </View>
          ) : null
        }
      />

      {properties.length > 0 ? (
        <Pressable style={styles.fab} onPress={handleAddMore}>
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      ) : null}

      {!!menuProperty ? (

        <Pressable style={styles.modalOverlay} onPress={() => setMenuProperty(null)}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuTitle} numberOfLines={1}>{menuProperty?.propertyName}</Text>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const p = menuProperty!;
                setMenuProperty(null);
                navigation.navigate('PropertySpaces', { propertyId: p.id });
              }}
            >
              <Ionicons name="car-outline" size={20} color="#1F2937" />
              <Text style={styles.menuItemText}>View spaces</Text>
            </Pressable>
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                const p = menuProperty!;
                setMenuProperty(null);
                navigation.navigate('PropertyWizard', { editPropertyId: p.id });
              }}
            >
              <Ionicons name="create-outline" size={20} color="#1F2937" />
              <Text style={styles.menuItemText}>Edit property</Text>
            </Pressable>
            <Pressable style={styles.menuItem} onPress={() => handleDelete(menuProperty!)}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
              <Text style={[styles.menuItemText, { color: '#EF4444' }]}>Delete</Text>
            </Pressable>
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
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#1F2937' },
  headerSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  errorBanner: { padding: 10, backgroundColor: '#FEE2E2' },
  errorText: { color: '#991B1B', fontSize: 13, textAlign: 'center' },
  list: { padding: 12, paddingBottom: 80, flexGrow: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E8F5F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  address: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  menuBtn: { padding: 6 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statText: { fontSize: 13, color: '#6B7280' },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  pillText: { fontSize: 11, fontWeight: '600' },
  empty: { paddingVertical: 80, alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#6B7280', marginTop: 6, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D7377',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 24,
    gap: 6,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0D7377',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 14 },
  menuItemText: { fontSize: 16, color: '#1F2937', marginLeft: 4 },
});
