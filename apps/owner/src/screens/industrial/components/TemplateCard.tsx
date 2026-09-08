// ============================================================================
// TEMPLATE CARD - Compliance Template Display & Editor
// ============================================================================

import React, { memo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { spacing, borderRadius } from '../../../theme/spacing';
import { fontSize, fontWeight } from '../../../theme/typography';
import type {
  ComplianceTemplate,
  ComplianceItemType,
  TemplateScope,
} from '../../../types/compliance';
import {
  COMPLIANCE_ITEM_LABELS,
  VEHICLE_TYPE_LABELS,
  SLOT_TIER_LABELS,
} from '../../../types/compliance';

// ============================================================================
// TYPES
// ============================================================================

interface TemplateCardProps {
  template: ComplianceTemplate;
  onEdit: (template: ComplianceTemplate) => void;
  onDelete: (templateId: string) => void;
  testID?: string;
}

interface TemplateEditorModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (template: Omit<ComplianceTemplate, 'id' | 'createdAt' | 'updatedAt'>) => void;
  initialTemplate?: ComplianceTemplate;
  testID?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ITEM_TYPES: ComplianceItemType[] = ['driverId', 'permit', 'insurance', 'briefing'];
const EXPIRY_OPTIONS = [7, 14, 21, 30];

// ============================================================================
// SEGMENTED CONTROL COMPONENT
// ============================================================================

interface SegmentedControlProps {
  options: { key: number; label: string }[];
  selectedKey: number;
  onSelect: (key: number) => void;
}

const SegmentedControl = memo(function SegmentedControl({
  options,
  selectedKey,
  onSelect,
}: SegmentedControlProps) {
  return (
    <View style={segmentStyles.container}>
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={() => onSelect(option.key)}
          style={[
            segmentStyles.option,
            selectedKey === option.key && segmentStyles.optionSelected,
          ]}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedKey === option.key }}
        >
          <Text
            style={[
              segmentStyles.optionText,
              selectedKey === option.key && segmentStyles.optionTextSelected,
            ]}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const segmentStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: borderRadius.md,
    padding: 2,
  },
  option: {
    flex: 1,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    borderRadius: borderRadius.md - 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  optionSelected: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  optionText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  optionTextSelected: {
    color: '#1E293B',
  },
});

// ============================================================================
// TEMPLATE EDITOR MODAL
// ============================================================================

export function TemplateEditorModal({
  visible,
  onClose,
  onSave,
  initialTemplate,
  testID,
}: TemplateEditorModalProps) {
  const insets = useSafeAreaInsets();
  const isEditing = !!initialTemplate;

  const [name, setName] = useState(initialTemplate?.name || '');
  const [scope, setScope] = useState<TemplateScope>(initialTemplate?.scope || 'vehicleType');
  const [scopeValue, setScopeValue] = useState(initialTemplate?.scopeValue || 'truck');
  const [requiredTypes, setRequiredTypes] = useState<ComplianceItemType[]>(
    initialTemplate?.requiredTypes || ['driverId', 'permit', 'insurance']
  );
  const [expiryWarningDays, setExpiryWarningDays] = useState(
    initialTemplate?.expiryWarningDays || 14
  );

  // Reset form state when modal opens or initialTemplate changes
  useEffect(() => {
    if (visible) {
      setName(initialTemplate?.name || '');
      setScope(initialTemplate?.scope || 'vehicleType');
      setScopeValue(initialTemplate?.scopeValue || 'truck');
      setRequiredTypes(initialTemplate?.requiredTypes || ['driverId', 'permit', 'insurance']);
      setExpiryWarningDays(initialTemplate?.expiryWarningDays || 14);
    }
  }, [visible, initialTemplate]);

  // Toggle required type
  const handleToggleType = useCallback((type: ComplianceItemType) => {
    setRequiredTypes((current) =>
      current.includes(type)
        ? current.filter((t) => t !== type)
        : [...current, type]
    );
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      scope,
      scopeValue,
      requiredTypes,
      expiryWarningDays,
    });
    onClose();
  }, [name, scope, scopeValue, requiredTypes, expiryWarningDays, onSave, onClose]);

  // Get scope value options
  const scopeValueOptions = scope === 'vehicleType'
    ? Object.entries(VEHICLE_TYPE_LABELS).map(([key, label]) => ({ key, label }))
    : Object.entries(SLOT_TIER_LABELS).map(([key, label]) => ({ key, label }));

  if (!visible) return null;

  return visible ? (

      <View style={modalStyles.backdrop}>
        <Pressable style={modalStyles.backdropPressable} onPress={onClose} />

        <View
          style={[
            modalStyles.container,
            { paddingBottom: insets.bottom + spacing[4] },
          ]}
        >
          {/* Header */}
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>
              {isEditing ? 'Edit Template' : 'Create Template'}
            </Text>
            <Pressable
              onPress={onClose}
              style={modalStyles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView
            style={modalStyles.scrollView}
            contentContainerStyle={modalStyles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Name Input */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.inputLabel}>Template Name</Text>
              <TextInput
                style={modalStyles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Heavy Vehicle Standard"
                placeholderTextColor="#94A3B8"
                accessibilityLabel="Template name"
              />
            </View>

            {/* Scope Selection */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.inputLabel}>Scope</Text>
              <View style={modalStyles.scopeButtons}>
                <Pressable
                  onPress={() => {
                    setScope('vehicleType');
                    setScopeValue('truck');
                  }}
                  style={[
                    modalStyles.scopeButton,
                    scope === 'vehicleType' && modalStyles.scopeButtonSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scope === 'vehicleType' }}
                >
                  <Ionicons
                    name="car-outline"
                    size={18}
                    color={scope === 'vehicleType' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text
                    style={[
                      modalStyles.scopeButtonText,
                      scope === 'vehicleType' && modalStyles.scopeButtonTextSelected,
                    ]}
                  >
                    By Vehicle
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setScope('slotTier');
                    setScopeValue('L');
                  }}
                  style={[
                    modalStyles.scopeButton,
                    scope === 'slotTier' && modalStyles.scopeButtonSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: scope === 'slotTier' }}
                >
                  <Ionicons
                    name="resize-outline"
                    size={18}
                    color={scope === 'slotTier' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text
                    style={[
                      modalStyles.scopeButtonText,
                      scope === 'slotTier' && modalStyles.scopeButtonTextSelected,
                    ]}
                  >
                    By Slot Size
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Scope Value Selection */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.inputLabel}>
                {scope === 'vehicleType' ? 'Vehicle Type' : 'Slot Size'}
              </Text>
              <View style={modalStyles.chipRow}>
                {scopeValueOptions.map((option) => (
                  <Pressable
                    key={option.key}
                    onPress={() => setScopeValue(option.key)}
                    style={[
                      modalStyles.chip,
                      scopeValue === option.key && modalStyles.chipSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: scopeValue === option.key }}
                  >
                    <Text
                      style={[
                        modalStyles.chipText,
                        scopeValue === option.key && modalStyles.chipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Required Items */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.inputLabel}>Required Documents</Text>
              {ITEM_TYPES.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => handleToggleType(type)}
                  style={modalStyles.toggleRow}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: requiredTypes.includes(type) }}
                >
                  <Text style={modalStyles.toggleLabel}>
                    {COMPLIANCE_ITEM_LABELS[type]}
                  </Text>
                  <Switch
                    value={requiredTypes.includes(type)}
                    onValueChange={() => handleToggleType(type)}
                    trackColor={{ false: '#E2E8F0', true: '#7FC5BF' }}
                    thumbColor={requiredTypes.includes(type) ? '#0D7377' : '#FFFFFF'}
                  />
                </Pressable>
              ))}
            </View>

            {/* Expiry Warning */}
            <View style={modalStyles.inputGroup}>
              <Text style={modalStyles.inputLabel}>Expiry Warning (days before)</Text>
              <SegmentedControl
                options={EXPIRY_OPTIONS.map((d) => ({ key: d, label: `${d}d` }))}
                selectedKey={expiryWarningDays}
                onSelect={setExpiryWarningDays}
              />
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={modalStyles.actions}>
            <Pressable
              onPress={onClose}
              style={modalStyles.cancelButton}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={modalStyles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSave}
              style={[
                modalStyles.saveButton,
                !name.trim() && modalStyles.saveButtonDisabled,
              ]}
              disabled={!name.trim()}
              accessibilityRole="button"
              accessibilityLabel="Save template"
            >
              <Text style={modalStyles.saveButtonText}>Save Template</Text>
            </Pressable>
          </View>
        </View>
      </View>
    
    ) : null;
}

// ============================================================================
// TEMPLATE CARD COMPONENT
// ============================================================================

function TemplateCard({
  template,
  onEdit,
  onDelete,
  testID,
}: TemplateCardProps) {
  const scopeLabel = template.scope === 'vehicleType'
    ? VEHICLE_TYPE_LABELS[template.scopeValue as keyof typeof VEHICLE_TYPE_LABELS]
    : SLOT_TIER_LABELS[template.scopeValue as keyof typeof SLOT_TIER_LABELS];

  return (
    <View style={cardStyles.container} testID={testID}>
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <Text style={cardStyles.name}>{template.name}</Text>
          <View style={cardStyles.scopeBadge}>
            <Text style={cardStyles.scopeText}>
              {template.scope === 'vehicleType' ? 'Vehicle' : 'Slot'}: {scopeLabel}
            </Text>
          </View>
        </View>

        <View style={cardStyles.headerActions}>
          <Pressable
            onPress={() => onEdit(template)}
            style={cardStyles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="Edit template"
          >
            <Ionicons name="create-outline" size={18} color="#64748B" />
          </Pressable>
          <Pressable
            onPress={() => onDelete(template.id)}
            style={cardStyles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="Delete template"
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </Pressable>
        </View>
      </View>

      <View style={cardStyles.body}>
        <Text style={cardStyles.sectionLabel}>Required:</Text>
        <View style={cardStyles.itemsRow}>
          {template.requiredTypes.map((type) => (
            <View key={type} style={cardStyles.itemBadge}>
              <Ionicons name="checkmark" size={12} color="#10B981" />
              <Text style={cardStyles.itemText}>
                {COMPLIANCE_ITEM_LABELS[type]}
              </Text>
            </View>
          ))}
        </View>

        <Text style={cardStyles.expiryText}>
          Expiry warning: {template.expiryWarningDays} days
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// MODAL STYLES
// ============================================================================

const modalStyles = StyleSheet.create({
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
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '95%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
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
  scopeButtons: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  scopeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    minHeight: 48,
  },
  scopeButtonSelected: {
    backgroundColor: '#0D7377',
  },
  scopeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: '#64748B',
  },
  scopeButtonTextSelected: {
    color: '#FFFFFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: '#F1F5F9',
    minHeight: 36,
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: '#0D7377',
  },
  chipText: {
    fontSize: fontSize.sm,
    color: '#64748B',
  },
  chipTextSelected: {
    color: '#FFFFFF',
    fontWeight: fontWeight.medium as any,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[2],
    minHeight: 48,
  },
  toggleLabel: {
    fontSize: fontSize.sm,
    color: '#1E293B',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
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
  saveButton: {
    flex: 2,
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: '#0D7377',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#FFFFFF',
  },
});

// ============================================================================
// CARD STYLES
// ============================================================================

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing[3],
  },
  headerLeft: {
    flex: 1,
    marginRight: spacing[2],
  },
  name: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold as any,
    color: '#1E293B',
    marginBottom: spacing[1],
  },
  scopeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    backgroundColor: '#F1F5F9',
    borderRadius: borderRadius.sm,
  },
  scopeText: {
    fontSize: fontSize.xs,
    color: '#64748B',
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {},
  sectionLabel: {
    fontSize: fontSize.xs,
    color: '#94A3B8',
    marginBottom: spacing[1],
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[1],
    marginBottom: spacing[2],
  },
  itemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    backgroundColor: '#ECFDF5',
    borderRadius: borderRadius.sm,
  },
  itemText: {
    fontSize: fontSize.xs,
    color: '#059669',
  },
  expiryText: {
    fontSize: fontSize.xs,
    color: '#64748B',
  },
});

export default memo(TemplateCard);
