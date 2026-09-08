import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  FlatList,
  Platform,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// ============================================================================
// TYPES
// ============================================================================

export interface PickerOption {
  value: string;
  label: string;
}

export interface FormPickerInputProps {
  label: string;
  value: string;
  valueLabel?: string;
  options: PickerOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  containerStyle?: ViewStyle;
  disabled?: boolean;
  searchable?: boolean;
}

// ============================================================================
// THEME
// ============================================================================

const pickerTheme = {
  background: colors.white,
  backgroundDisabled: colors.gray[100],
  border: colors.gray[300],
  borderFocused: colors.primary[500],
  borderError: colors.error[500],
  text: colors.gray[900],
  textDisabled: colors.gray[400],
  placeholder: colors.gray[400],
  label: colors.gray[700],
  helper: colors.gray[500],
  error: colors.error[500],
  required: colors.error[500],
  modalBackground: 'rgba(0, 0, 0, 0.5)',
  optionSelected: colors.primary[50],
  optionSelectedText: colors.primary[600],
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function FormPickerInput({
  label,
  value,
  valueLabel,
  options,
  onSelect,
  placeholder = 'Select an option',
  required = false,
  error,
  helperText,
  containerStyle,
  disabled = false,
}: FormPickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = valueLabel || selectedOption?.label;

  const getBorderColor = () => {
    if (error) return pickerTheme.borderError;
    if (isOpen) return pickerTheme.borderFocused;
    return pickerTheme.border;
  };

  const handleSelect = (optionValue: string) => {
    onSelect(optionValue);
    setIsOpen(false);
  };

  const renderOption = ({ item }: { item: PickerOption }) => {
    const isSelected = item.value === value;
    return (
      <Pressable
        style={[styles.option, isSelected && styles.optionSelected]}
        onPress={() => handleSelect(item.value)}
        accessibilityRole="menuitem"
        accessibilityState={{ selected: isSelected }}
      >
        <Text
          style={[styles.optionText, isSelected && styles.optionTextSelected]}
        >
          {item.label}
        </Text>
        {isSelected && (
          <Ionicons
            name="checkmark"
            size={20}
            color={pickerTheme.optionSelectedText}
          />
        )}
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required && <Text style={styles.required}> *</Text>}
      </View>

      {/* Picker Button */}
      <Pressable
        style={[
          styles.pickerButton,
          {
            borderColor: getBorderColor(),
            backgroundColor: disabled
              ? pickerTheme.backgroundDisabled
              : pickerTheme.background,
          },
        ]}
        onPress={() => !disabled && setIsOpen(true)}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}${required ? ', required' : ''}`}
        accessibilityHint={`Current value: ${displayValue || 'None selected'}. Tap to select.`}
        accessibilityState={{ disabled, expanded: isOpen }}
      >
        <Text
          style={[
            styles.pickerText,
            !displayValue && styles.placeholderText,
            disabled && styles.disabledText,
          ]}
          numberOfLines={1}
        >
          {displayValue || placeholder}
        </Text>
        <Ionicons
          name="chevron-down"
          size={20}
          color={disabled ? pickerTheme.textDisabled : pickerTheme.text}
        />
      </Pressable>

      {/* Helper / Error Text */}
      {(error || helperText) && (
        <View style={styles.bottomTextContainer}>
          <Text
            style={[
              styles.bottomText,
              error ? styles.errorText : styles.helperText,
            ]}
            accessibilityLiveRegion={error ? 'polite' : 'none'}
          >
            {error || helperText}
          </Text>
        </View>
      )}

      {/* Options Modal */}
      {isOpen ? (

        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsOpen(false)}
        >
          <SafeAreaView style={styles.modalSafeArea}>
            <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label}</Text>
                <Pressable
                  onPress={() => setIsOpen(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={24} color={pickerTheme.text} />
                </Pressable>
              </View>

              {/* Options List */}
              <FlatList
                data={options}
                renderItem={renderOption}
                keyExtractor={(item) => item.value}
                showsVerticalScrollIndicator={false}
                style={styles.optionsList}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
              />
            </Pressable>
          </SafeAreaView>
        </Pressable>
      
      ) : null}
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[3],
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: spacing[1],
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium as any,
    color: pickerTheme.label,
  },
  required: {
    fontSize: fontSize.sm,
    color: pickerTheme.required,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: borderRadius.lg,
    minHeight: 52,
    paddingHorizontal: spacing[4],
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  pickerText: {
    flex: 1,
    fontSize: fontSize.base,
    color: pickerTheme.text,
  },
  placeholderText: {
    color: pickerTheme.placeholder,
  },
  disabledText: {
    color: pickerTheme.textDisabled,
  },
  bottomTextContainer: {
    marginTop: spacing[1],
    paddingHorizontal: spacing[1],
  },
  bottomText: {
    fontSize: fontSize.xs,
  },
  helperText: {
    color: pickerTheme.helper,
  },
  errorText: {
    color: pickerTheme.error,
  },

  // Modal Styles
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
    backgroundColor: pickerTheme.modalBackground,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing[5],
  },
  modalSafeArea: {
    width: '100%',
    maxHeight: '80%',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    maxHeight: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold as any,
    color: pickerTheme.text,
  },
  optionsList: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[4],
  },
  optionSelected: {
    backgroundColor: pickerTheme.optionSelected,
  },
  optionText: {
    fontSize: fontSize.base,
    color: pickerTheme.text,
  },
  optionTextSelected: {
    color: pickerTheme.optionSelectedText,
    fontWeight: fontWeight.medium as any,
  },
  separator: {
    height: 1,
    backgroundColor: colors.gray[100],
  },
});
