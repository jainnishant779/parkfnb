import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, StatusBar, Image, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppAlert } from '../../components/common/AppAlert';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { listingService } from '../../services/listingService';
import { ApiRequestError } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { ApiProperty } from '../../types/api';
import { resolveImageUri } from '../../utils/imageUri';
import { palette, radii, fonts } from '../../theme/kit';
import {
  IconCircle, SearchPill, Chip, StatusTag, IsoBlock, EmptyState, ListRow, PillButton,
} from '../../components/ui';

type ListFilter = 'all' | 'published' | 'draft';

const FILTERS: { id: ListFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
];

export default function MyListingsScreen() {
  const navigation = useNavigation<any>();
  const { owner, user } = useAuth();
  const ownerId = owner?.id;

  const [properties, setProperties] = useState<ApiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [menuProperty, setMenuProperty] = useState<ApiProperty | null>(null);
  const insets = useSafeAreaInsets();
  // Client-side search + status filter over the loaded list (visual only).
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');

  const visibleProperties = useMemo(() => {
    const q = query.trim().toLowerCase();
    return properties.filter((p) => {
      if (filter === 'draft' && p.status !== 'draft') return false;
      if (filter === 'published' && p.status === 'draft') return false;
      if (!q) return true;
      return [p.propertyName, p.address, p.city]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
  }, [properties, query, filter]);

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

  const renderProperty = ({ item, index }: { item: ApiProperty; index: number }) => {
    const total = item.totalSpaces ?? 0;
    const pending = user?.isVerified === false; // badge shown until KYC verified
    const isDraft = item.status === 'draft';
    const tone = index % 2 === 0 ? 'peach' : 'blue';
    const hasPhoto = !!(item.propertyImages && item.propertyImages.length > 0);
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={[
          styles.card,
          { backgroundColor: tone === 'peach' ? palette.peachSoft : palette.blueSoft },
        ]}
        onPress={() => navigation.navigate('PropertySpaces', { propertyId: item.id })}
      >
        <View style={styles.cardArt} pointerEvents="none">
          {hasPhoto ? (
            <Image
              source={{ uri: resolveImageUri(item.propertyImages[0]) }}
              style={styles.cardPhoto}
              resizeMode="cover"
            />
          ) : (
            <IsoBlock size={150} tone={tone} />
          )}
        </View>

        <View style={styles.cardTop}>
          <View style={styles.tagRow}>
            <StatusTag
              label={isDraft ? 'Draft' : item.isActive ? 'Live' : 'Paused'}
              tone={isDraft ? 'white' : item.isActive ? 'ink' : 'grey'}
            />
            {pending ? (
              <StatusTag label="Pending KYC" tone="warning" style={styles.tagGap} />
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => setMenuProperty(item)}
            style={styles.menuBtn}
            hitSlop={8}
            activeOpacity={0.7}
          >
            <Ionicons name="ellipsis-horizontal" size={17} color={palette.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.title} numberOfLines={1}>{item.propertyName}</Text>
          <Text style={styles.address} numberOfLines={1}>
            {item.address}, {item.city}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.metaTitle}>{total} space{total === 1 ? '' : 's'}</Text>
              <Text style={styles.metaSub}>Parking</Text>
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.metaTitle} numberOfLines={1}>{item.city || '—'}</Text>
              <Text style={styles.metaSub}>City</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.safe}>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={palette.ink} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={palette.bg} />
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.headerTitle}>My properties</Text>
          <Text style={styles.headerSubtitle}>
            {properties.length} {properties.length === 1 ? 'property' : 'properties'}
          </Text>
        </View>
        {properties.length > 0 ? (
          <IconCircle icon="plus" variant="ink" size={50} onPress={handleAddMore} />
        ) : null}
      </View>

      {properties.length > 0 ? (
        <View style={styles.searchWrap}>
          <SearchPill
            value={query}
            onChangeText={setQuery}
            placeholder="Search properties"
            right={
              query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={10}>
                  <Ionicons name="close" size={18} color={palette.textMuted} />
                </TouchableOpacity>
              ) : null
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                label={f.label}
                selected={filter === f.id}
                onPress={() => setFilter(f.id)}
                style={styles.chip}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {errorText ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color={palette.danger} />
          <Text style={styles.errorText}>{errorText}</Text>
        </View>
      ) : null}

      <FlatList
        data={visibleProperties}
        keyExtractor={(p) => p.id}
        renderItem={renderProperty}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.ink} />
        }
        ListEmptyComponent={
          !errorText ? (
            properties.length === 0 ? (
              <EmptyState
                title="No properties yet"
                subtitle="Add your first property to start listing parking spaces."
                action="Add your first property"
                onAction={handleAddFirst}
              />
            ) : (
              <EmptyState
                title="No matches"
                subtitle="Try a different search or filter."
                action="Clear filters"
                onAction={() => {
                  setQuery('');
                  setFilter('all');
                }}
                tone="blue"
              />
            )
          ) : null
        }
      />

      {menuProperty ? (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMenuProperty(null)}
          />
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.grabber} />
            <Text style={styles.menuTitle} numberOfLines={1}>{menuProperty?.propertyName}</Text>
            <View style={styles.menuCard}>
              <ListRow
                icon="grid"
                title="View spaces"
                onPress={() => {
                  const p = menuProperty!;
                  setMenuProperty(null);
                  navigation.navigate('PropertySpaces', { propertyId: p.id });
                }}
              />
              <ListRow
                icon="edit-2"
                title="Edit property"
                onPress={() => {
                  const p = menuProperty!;
                  setMenuProperty(null);
                  navigation.navigate('PropertyWizard', { editPropertyId: p.id });
                }}
              />
              <ListRow
                icon="trash-2"
                title="Delete"
                danger
                isLast
                onPress={() => handleDelete(menuProperty!)}
              />
            </View>
            <PillButton
              label="Cancel"
              variant="grey"
              onPress={() => setMenuProperty(null)}
              style={styles.menuCancel}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  flex: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
  },
  headerTitle: { ...fonts.semibold, fontSize: 32, letterSpacing: -0.8, color: palette.text },
  headerSubtitle: { ...fonts.medium, fontSize: 15, color: palette.textMuted, marginTop: 2 },
  searchWrap: { paddingHorizontal: 16 },
  chipsRow: { paddingVertical: 12 },
  chip: { marginRight: 8 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: palette.dangerSoft,
  },
  errorText: { ...fonts.medium, color: palette.danger, fontSize: 13, marginLeft: 8, flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  card: {
    borderRadius: radii.xl,
    padding: 18,
    marginBottom: 12,
    minHeight: 170,
    overflow: 'hidden',
  },
  cardArt: { position: 'absolute', right: -30, bottom: -26 },
  cardPhoto: {
    width: 130,
    height: 130,
    borderRadius: radii.xl,
    marginRight: 44,
    marginBottom: 40,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  tagGap: { marginLeft: 6 },
  menuBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { width: '62%' },
  title: {
    ...fonts.bold,
    fontSize: 22,
    letterSpacing: -0.5,
    color: palette.text,
    marginTop: 12,
  },
  address: { ...fonts.medium, fontSize: 13, color: palette.textMuted, marginTop: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  metaCol: { maxWidth: '55%' },
  metaTitle: { ...fonts.semibold, fontSize: 13.5, color: palette.text },
  metaSub: { ...fonts.medium, fontSize: 12, color: palette.textMuted, marginTop: 2 },
  modalOverlay: {
    // Absolutely positioned overlay rather than a <Modal>, which does not
    // present on this build.
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.line,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    ...fonts.semibold,
    fontSize: 20,
    letterSpacing: -0.3,
    color: palette.text,
    marginBottom: 8,
  },
  menuCard: { marginBottom: 8 },
  menuCancel: { marginTop: 8 },
});
