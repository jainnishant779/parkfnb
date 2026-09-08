// ============================================================================
// WHITELIST SECTION - Restricted Access Management
// ============================================================================

import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  Switch,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { WhitelistConfig, WhitelistClient } from '../../../types/compliance';
import { formatDate } from '../../../services/complianceStorage';

// ============================================================================
// TYPES
// ============================================================================

interface WhitelistSectionProps {
  whitelist: WhitelistConfig;
  onToggle: (enabled: boolean) => void;
  onAddClient: (name: string, company?: string) => void;
  onRemoveClient: (clientId: string) => void;
  testID?: string;
}

interface AddClientModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (name: string, company?: string) => void;
}

// ============================================================================
// ADD CLIENT MODAL
// ============================================================================

const AddClientModal = memo(function AddClientModal({
  visible,
  onClose,
  onAdd,
}: AddClientModalProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');

  const handleAdd = useCallback(() => {
    if (!name.trim()) return;
    onAdd(name.trim(), company.trim() || undefined);
    setName('');
    setCompany('');
    onClose();
  }, [name, company, onAdd, onClose]);

  const handleClose = useCallback(() => {
    setName('');
    setCompany('');
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return visible ? (

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={modalStyles.keyboardView}
      >
        <View style={modalStyles.backdrop}>
          <Pressable style={modalStyles.backdropPressable} onPress={handleClose} />

          <View
            style={[
              modalStyles.container,
              { paddingBottom: insets.bottom + spacing[4] },
            ]}
          >
            {/* Header */}
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Add Client</Text>
              <Pressable
                onPress={handleClose}
                style={modalStyles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color="#64748B" />
              </Pressable>
            </View>

            {/* Form */}
            <View style={modalStyles.form}>
              <View style={modalStyles.inputGroup}>
                <Text style={modalStyles.inputLabel}>Client Name *</Text>
                <TextInput
                  style={modalStyles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter client name"
                  placeholderTextColor="#94A3B8"
                  autoFocus
                  accessibilityLabel="Client name"
                />
              </View>

              <View style={modalStyles.inputGroup}>
                <Text style={modalStyles.inputLabel}>Company (Optional)</Text>
                <TextInput
                  style={modalStyles.textInput}
                  value={company}
                  onChangeText={setCompany}
                  placeholder="Enter company name"
                  placeholderTextColor="#94A3B8"
                  accessibilityLabel="Company name"
                />
              </View>
            </View>

            {/* Actions */}
            <View style={modalStyles.actions}>
              <Pressable
                onPress={handleClose}
                style={modalStyles.cancelButton}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={modalStyles.cancelButtonText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={handleAdd}
                style={[
                  modalStyles.addButton,
                  !name.trim() && modalStyles.addButtonDisabled,
                ]}
                disabled={!name.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add client"
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={modalStyles.addButtonText}>Add Client</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    
    ) : null;
});

// ============================================================================
// CLIENT ROW COMPONENT
// ============================================================================

interface ClientRowProps {
  client: WhitelistClient;
  onRemove: () => void;
}

const ClientRow = memo(function ClientRow({ client, onRemove }: ClientRowProps) {
  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.avatar}>
        <Text style={rowStyles.avatarText}>
          {client.name.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={rowStyles.content}>
        <Text style={rowStyles.name}>{client.name}</Text>
        {client.company && (
          <Text style={rowStyles.company}>{client.company}</Text>
        )}
        <Text style={rowStyles.addedAt}>
          Added {formatDate(client.addedAt)}
        </Text>
      </View>

      <Pressable
        onPress={onRemove}
        style={rowStyles.removeButton}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${client.name}`}
      >
        <Ionicons name="close-circle" size={22} color="#EF4444" />
      </Pressable>
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function WhitelistSection({
  whitelist,
  onToggle,
  onAddClient,
  onRemoveClient,
  testID,
}: WhitelistSectionProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter clients by search
  const filteredClients = whitelist.clients.filter((client) => {
    const query = searchQuery.toLowerCase();
    return (
      client.name.toLowerCase().includes(query) ||
      (client.company?.toLowerCase().includes(query) ?? false)
    );
  });

  const handleAddClient = useCallback(
    (name: string, company?: string) => {
      onAddClient(name, company);
    },
    [onAddClient]
  );

  const renderClient = useCallback(
    ({ item }: { item: WhitelistClient }) => (
      <ClientRow
        client={item}
        onRemove={() => onRemoveClient(item.id)}
      />
    ),
    [onRemoveClient]
  );

  const keyExtractor = useCallback((item: WhitelistClient) => item.id, []);

  return (
    <View style={styles.container} testID={testID}>
      {/* Header with Toggle */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#0D7377" />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Restricted Access</Text>
            <Text style={styles.subtitle}>
              Only allow whitelisted clients to book
            </Text>
          </View>
        </View>

        <Switch
          value={whitelist.enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#E2E8F0', true: '#7FC5BF' }}
          thumbColor={whitelist.enabled ? '#0D7377' : '#FFFFFF'}
          accessibilityRole="switch"
          accessibilityLabel="Enable whitelist"
          accessibilityState={{ checked: whitelist.enabled }}
        />
      </View>

      {/* Whitelist Content (shown when enabled) */}
      {whitelist.enabled && (
        <View style={styles.content}>
          {/* Search Input */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#94A3B8" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search clients..."
              placeholderTextColor="#94A3B8"
              accessibilityLabel="Search clients"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </Pressable>
            )}
          </View>

          {/* Client List */}
          {filteredClients.length > 0 ? (
            <FlatList
              data={filteredClients}
              renderItem={renderClient}
              keyExtractor={keyExtractor}
              scrollEnabled={false}
              style={styles.list}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyText}>
                {searchQuery
                  ? 'No clients match your search'
                  : 'No clients added yet'}
              </Text>
            </View>
          )}

          {/* Add Client Button */}
          <Pressable
            onPress={() => setShowAddModal(true)}
            style={styles.addClientButton}
            accessibilityRole="button"
            accessibilityLabel="Add client to whitelist"
          >
            <Ionicons name="add" size={20} color="#0D7377" />
            <Text style={styles.addClientButtonText}>Add Client</Text>
          </Pressable>
        </View>
      )}

      {/* Add Client Modal */}
      <AddClientModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddClient}
      />
    </View>
  );
}

// ============================================================================
// MODAL STYLES
// ============================================================================

const modalStyles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  backdrop: {
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
    paddingHorizontal: spacing[4],
  },
  backdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    padding: spacing[4],
  },
  inputGroup: {
    marginBottom: spacing[4],
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
    marginBottom: spacing[2],
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    fontSize: fontSize.sm,
    color: '#1E293B',
    minHeight: 48,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  addButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: '#0D7377',
    minHeight: 48,
  },
  addButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#FFFFFF',
  },
});

// ============================================================================
// CLIENT ROW STYLES
// ============================================================================

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  avatarText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold as any,
    color: '#0D7377',
  },
  content: {
    flex: 1,
    marginRight: spacing[2],
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  company: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 1,
  },
  addedAt: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginTop: 2,
  },
  removeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ============================================================================
// MAIN STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    backgroundColor: '#F8FAFC',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing[3],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
  },
  subtitle: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  content: {
    padding: spacing[4],
    paddingTop: 0,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    marginTop: spacing[3],
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  list: {
    marginTop: spacing[2],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing[6],
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: '#94A3B8',
    marginTop: spacing[2],
  },
  addClientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[3],
    marginTop: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#0D7377',
    borderStyle: 'dashed',
    minHeight: 48,
  },
  addClientButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },
});

export default memo(WhitelistSection);
