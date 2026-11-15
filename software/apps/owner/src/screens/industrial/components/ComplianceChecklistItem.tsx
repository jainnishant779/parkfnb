// ============================================================================
// COMPLIANCE CHECKLIST ITEM - Individual Item in Detail Sheet
// ============================================================================

import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type { ComplianceItem, ComplianceItemState } from '../../../types/compliance';
import {
  COMPLIANCE_ITEM_LABELS,
  ITEM_STATE_COLORS,
} from '../../../types/compliance';
import { formatDate, daysUntil, isExpiringSoon } from '../../../services/complianceStorage';

// ============================================================================
// TYPES
// ============================================================================

interface ComplianceChecklistItemProps {
  item: ComplianceItem;
  onUpdate: (itemId: string, updates: Partial<ComplianceItem>) => void;
  onOpenDatePicker: (field: 'issuedAt' | 'expiresAt', currentValue?: string) => void;
  isExpanded?: boolean;
  onToggleExpand: () => void;
  testID?: string;
}

// ============================================================================
// STATE CHIP COMPONENT
// ============================================================================

interface StateChipProps {
  state: ComplianceItemState;
  expiresAt?: string;
}

const StateChip = memo(function StateChip({ state, expiresAt }: StateChipProps) {
  // Check if expiring soon
  const isExpiring = expiresAt && isExpiringSoon(expiresAt);
  const displayState = isExpiring ? 'expiring' : state;
  const colors = ITEM_STATE_COLORS[displayState];

  const labels: Record<ComplianceItemState, string> = {
    missing: 'Missing',
    uploaded: 'Uploaded',
    verified: 'Verified',
    expiring: 'Expiring',
  };

  return (
    <View style={[styles.stateChip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.stateChipText, { color: colors.text }]}>
        {labels[displayState]}
      </Text>
    </View>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

function ComplianceChecklistItem({
  item,
  onUpdate,
  onOpenDatePicker,
  isExpanded = false,
  onToggleExpand,
  testID,
}: ComplianceChecklistItemProps) {
  const [localDocNumber, setLocalDocNumber] = useState(item.docNumber || '');
  const [localNotes, setLocalNotes] = useState(item.notes || '');

  const typeLabel = COMPLIANCE_ITEM_LABELS[item.type];
  const expiryDays = item.expiresAt ? daysUntil(item.expiresAt) : null;

  // Handle document number change
  const handleDocNumberChange = useCallback(
    (text: string) => {
      setLocalDocNumber(text);
    },
    []
  );

  const handleDocNumberBlur = useCallback(() => {
    if (localDocNumber !== item.docNumber) {
      onUpdate(item.id, { docNumber: localDocNumber });
    }
  }, [localDocNumber, item.docNumber, item.id, onUpdate]);

  // Handle notes change
  const handleNotesChange = useCallback(
    (text: string) => {
      setLocalNotes(text);
    },
    []
  );

  const handleNotesBlur = useCallback(() => {
    if (localNotes !== item.notes) {
      onUpdate(item.id, { notes: localNotes });
    }
  }, [localNotes, item.notes, item.id, onUpdate]);

  // Handle verify toggle
  const handleVerifyToggle = useCallback(() => {
    const newState = item.state === 'verified' ? 'uploaded' : 'verified';
    onUpdate(item.id, {
      state: newState,
      verifiedAt: newState === 'verified' ? new Date().toISOString() : undefined,
    });
  }, [item.state, item.id, onUpdate]);

  // Handle add info (simulate upload)
  const handleAddInfo = useCallback(() => {
    onUpdate(item.id, {
      state: 'uploaded',
      docNumber: localDocNumber || `DOC-${Date.now().toString(36).toUpperCase()}`,
    });
  }, [item.id, localDocNumber, onUpdate]);

  // Get icon for item type
  const getTypeIcon = () => {
    switch (item.type) {
      case 'driverId':
        return 'person-outline';
      case 'permit':
        return 'document-text-outline';
      case 'insurance':
        return 'shield-checkmark-outline';
      case 'briefing':
        return 'clipboard-outline';
      default:
        return 'document-outline';
    }
  };

  return (
    <View style={styles.container} testID={testID}>
      {/* Main Row */}
      <Pressable
        onPress={onToggleExpand}
        style={styles.mainRow}
        accessibilityRole="button"
        accessibilityLabel={`${typeLabel}, ${item.state}`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={getTypeIcon() as any} size={20} color="#64748B" />
        </View>

        <View style={styles.mainContent}>
          <Text style={styles.itemLabel}>{typeLabel}</Text>
          {item.docNumber && (
            <Text style={styles.docNumber}>{item.docNumber}</Text>
          )}
          {expiryDays !== null && expiryDays > 0 && expiryDays <= 30 && (
            <Text
              style={[
                styles.expiryWarning,
                { color: expiryDays <= 7 ? '#DC2626' : '#D97706' },
              ]}
            >
              Expires in {expiryDays} day{expiryDays !== 1 ? 's' : ''}
            </Text>
          )}
        </View>

        <StateChip state={item.state} expiresAt={item.expiresAt} />

        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#94A3B8"
          style={styles.chevron}
        />
      </Pressable>

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.expandedContent}>
          {/* Action buttons based on state */}
          <View style={styles.actionButtons}>
            {item.state === 'missing' && (
              <Pressable
                onPress={handleAddInfo}
                style={styles.addButton}
                accessibilityRole="button"
                accessibilityLabel="Add document information"
              >
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Info</Text>
              </Pressable>
            )}

            {(item.state === 'uploaded' || item.state === 'verified') && (
              <>
                <Pressable
                  onPress={handleAddInfo}
                  style={styles.replaceButton}
                  accessibilityRole="button"
                  accessibilityLabel="Replace document"
                >
                  <Ionicons name="refresh-outline" size={16} color="#0D7377" />
                  <Text style={styles.replaceButtonText}>Replace</Text>
                </Pressable>

                <Pressable
                  onPress={handleVerifyToggle}
                  style={[
                    styles.verifyButton,
                    item.state === 'verified' && styles.verifyButtonActive,
                  ]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: item.state === 'verified' }}
                  accessibilityLabel="Mark as verified"
                >
                  <Ionicons
                    name={item.state === 'verified' ? 'checkmark-circle' : 'checkmark-circle-outline'}
                    size={16}
                    color={item.state === 'verified' ? '#FFFFFF' : '#10B981'}
                  />
                  <Text
                    style={[
                      styles.verifyButtonText,
                      item.state === 'verified' && styles.verifyButtonTextActive,
                    ]}
                  >
                    {item.state === 'verified' ? 'Verified' : 'Verify'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Document Number Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Document Number</Text>
            <TextInput
              style={styles.textInput}
              value={localDocNumber}
              onChangeText={handleDocNumberChange}
              onBlur={handleDocNumberBlur}
              placeholder="Enter document number"
              placeholderTextColor="#94A3B8"
              accessibilityLabel="Document number input"
            />
          </View>

          {/* Date Pickers */}
          <View style={styles.dateRow}>
            <View style={[styles.inputGroup, styles.dateInput]}>
              <Text style={styles.inputLabel}>Issued Date</Text>
              <Pressable
                onPress={() => onOpenDatePicker('issuedAt', item.issuedAt)}
                style={styles.dateButton}
                accessibilityRole="button"
                accessibilityLabel="Select issued date"
              >
                <Text style={styles.dateButtonText}>
                  {item.issuedAt ? formatDate(item.issuedAt) : 'Select date'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#64748B" />
              </Pressable>
            </View>

            <View style={[styles.inputGroup, styles.dateInput]}>
              <Text style={styles.inputLabel}>Expiry Date</Text>
              <Pressable
                onPress={() => onOpenDatePicker('expiresAt', item.expiresAt)}
                style={styles.dateButton}
                accessibilityRole="button"
                accessibilityLabel="Select expiry date"
              >
                <Text style={styles.dateButtonText}>
                  {item.expiresAt ? formatDate(item.expiresAt) : 'Select date'}
                </Text>
                <Ionicons name="calendar-outline" size={18} color="#64748B" />
              </Pressable>
            </View>
          </View>

          {/* Notes Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={[styles.textInput, styles.notesInput]}
              value={localNotes}
              onChangeText={handleNotesChange}
              onBlur={handleNotesBlur}
              placeholder="Add notes..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              accessibilityLabel="Notes input"
            />
          </View>

          {/* Verified info */}
          {item.state === 'verified' && item.verifiedAt && (
            <View style={styles.verifiedInfo}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.verifiedInfoText}>
                Verified on {formatDate(item.verifiedAt)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
    overflow: 'hidden',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    minHeight: 56,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing[3],
  },
  mainContent: {
    flex: 1,
    marginRight: spacing[2],
  },
  itemLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#1E293B',
  },
  docNumber: {
    fontSize: fontSize.xs,
    color: '#64748B',
    marginTop: 2,
  },
  expiryWarning: {
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: fontWeight.medium as any,
  },
  stateChip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  stateChipText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
  },
  chevron: {
    marginLeft: spacing[2],
  },
  expandedContent: {
    padding: spacing[3],
    paddingTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing[2],
    marginBottom: spacing[3],
    marginTop: spacing[3],
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D7377',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    minHeight: 44,
    gap: 4,
  },
  addButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#FFFFFF',
  },
  replaceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5F4',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    minHeight: 44,
    gap: 4,
  },
  replaceButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#0D7377',
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    minHeight: 44,
    gap: 4,
  },
  verifyButtonActive: {
    backgroundColor: '#10B981',
  },
  verifyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#10B981',
  },
  verifyButtonTextActive: {
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: spacing[3],
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
    marginBottom: spacing[1],
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.sm,
    color: '#1E293B',
    minHeight: 44,
  },
  notesInput: {
    minHeight: 72,
    paddingTop: spacing[2],
  },
  dateRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  dateInput: {
    flex: 1,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    minHeight: 44,
  },
  dateButtonText: {
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  verifiedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  verifiedInfoText: {
    fontSize: fontSize.xs,
    color: '#10B981',
  },
});

export default memo(ComplianceChecklistItem);
