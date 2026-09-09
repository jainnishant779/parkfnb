import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ViewStyle,
  TextInput,
  Keyboard,
  ScrollView,
} from 'react-native';
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
  borderFocused: '#0D7377',
  borderError: colors.error[500],
  text: colors.gray[900],
  textDisabled: colors.gray[400],
  placeholder: colors.gray[400],
  label: colors.gray[700],
  helper: colors.gray[500],
  error: colors.error[500],
  required: colors.error[500],
  optionSelected: '#E8F5F4',
  optionSelectedText: '#0D7377',
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
  searchable = false,
}: FormPickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = valueLabel || selectedOption?.label;
  const showSearch = searchable || options.length > 7;

  const filteredOptions = searchQuery.trim()
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchQuery.toLowerCase().trim()),
      )
    : options;

  const handleToggle = () => {
    if (disabled) return;
    Keyboard.dismiss();
    setIsOpen((prev) => !prev);
    setSearchQuery('');
  };

  const handleSelect = (optionValue: string) => {
    onSelect(optionValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const getBorderColor = () => {
    if (error) return pickerTheme.borderError;
    if (isOpen) return pickerTheme.borderFocused;
    return pickerTheme.border;
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {required && <Text style={styles.required}> *</Text>}
      </View>

      {/* Picker Trigger Button */}
      <Pressable
        style={[
          styles.pickerButton,
          {
            borderColor: getBorderColor(),
            backgroundColor: disabled
              ? pickerTheme.backgroundDisabled
              : pickerTheme.background,
          },
          isOpen && styles.pickerButtonOpen,
        ]}
        onPress={handleToggle}
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
          name={isOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={disabled ? pickerTheme.textDisabled : (isOpen ? pickerTheme.borderFocused : pickerTheme.text)}
        />
      </Pressable>

      {/* Inline Dropdown Options */}
      {isOpen && (
        <View style={styles.dropdownContainer}>
          {showSearch && (
            <View style={styles.searchContainer}>
              <Ionicons
                name="search"
                size={16}
                color={colors.gray[400]}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder={`Search ${label.toLowerCase()}...`}
                placeholderTextColor={colors.gray[400]}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={colors.gray[400]} />
                </Pressable>
              )}
            </View>
          )}

          <ScrollView
            nestedScrollEnabled={true}
            keyboardShouldPersistTaps="handled"
            style={styles.dropdownScroll}
            showsVerticalScrollIndicator={true}
          >
            {filteredOptions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No options found</Text>
              </View>
            ) : (
              filteredOptions.map((item, index) => {
                const isSelected = item.value === value;
                return (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.option,
                      isSelected && styles.optionSelected,
                      index < filteredOptions.length - 1 && styles.optionBorder,
                    ]}
                    onPress={() => handleSelect(item.value)}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.optionTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={pickerTheme.optionSelectedText}
                      />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {/* Helper / Error Text (shown when closed) */}
      {!isOpen && (error || helperText) && (
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
    backgroundColor: pickerTheme.background,
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
  pickerButtonOpen: {
    borderColor: pickerTheme.borderFocused,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
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

  // Dropdown list styles
  dropdownContainer: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: pickerTheme.borderFocused,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    maxHeight: 250,
    ...Platform.select({
      ios: {
        shadowColor: colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
    backgroundColor: colors.gray[50],
  },
  searchIcon: {
    marginRight: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.gray[900],
    paddingVertical: 4,
  },
  dropdownScroll: {
    flexGrow: 0,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3] + 2,
    minHeight: 48,
  },
  optionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
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
    fontWeight: fontWeight.semibold as any,
  },
  emptyContainer: {
    padding: spacing[4],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.gray[400],
  },
});
