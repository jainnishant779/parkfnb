import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import { fontSize, fontWeight } from '../../theme/typography';

// ============================================================================
// TYPES
// ============================================================================

export interface ProgressStep {
  id: string;
  label: string;
}

export interface ProgressHeaderProps {
  title: string;
  subtitle?: string;
  steps: ProgressStep[];
  currentStepIndex: number;
  /**
   * Optional per-step completion flags. When provided, each step is shown
   * as completed/pending **independently** based on its own flag — useful
   * for screens where users can fill sections in any order. When omitted,
   * the legacy sequential rule applies (steps before `currentStepIndex`
   * are completed; the rest are pending).
   */
  /** @deprecated use `stepStatuses` for richer 3-state rendering. */
  completedFlags?: boolean[];
  /**
   * Per-step status:
   *   'complete' — all required fields filled (shows green checkmark)
   *   'partial'  — some fields filled but not all (primary-colored outlined circle)
   *   'pending'  — nothing filled yet (gray)
   * Active style (primary ring + bold label) is layered on top via `currentStepIndex`.
   */
  stepStatuses?: ('complete' | 'partial' | 'pending')[];
  /** When provided, each step pill becomes tappable and calls this on press. */
  onStepPress?: (index: number) => void;
  savedStatus?: 'saved' | 'saving' | 'lastSaved' | 'error';
  lastSavedText?: string;
  onMenuPress?: () => void;
  onBackPress?: () => void;
  showBack?: boolean;
}

// ============================================================================
// THEME
// ============================================================================

const headerTheme = {
  background: colors.white,
  title: colors.gray[900],
  subtitle: colors.gray[600],
  stepActive: colors.primary[600],
  stepCompleted: colors.success[500],
  stepPending: colors.gray[300],
  stepText: colors.gray[500],
  stepTextActive: colors.primary[600],
  savedText: colors.success[500],
  savingText: colors.gray[500],
  errorText: colors.error[500],
  lineCompleted: colors.success[500],
  linePending: colors.gray[200],
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProgressHeader({
  title,
  subtitle,
  steps,
  currentStepIndex,
  completedFlags,
  stepStatuses,
  onStepPress,
  savedStatus = 'saved',
  lastSavedText,
  onMenuPress,
  onBackPress,
  showBack = true,
}: ProgressHeaderProps) {
  const getSavedStatusText = () => {
    switch (savedStatus) {
      case 'saved':
        return 'All changes saved';
      case 'saving':
        return 'Saving...';
      case 'lastSaved':
        return lastSavedText || 'Last saved recently';
      case 'error':
        return 'Changes not saved';
      default:
        return '';
    }
  };

  const getSavedStatusColor = () => {
    switch (savedStatus) {
      case 'saved':
        return headerTheme.savedText;
      case 'saving':
        return headerTheme.savingText;
      case 'error':
        return headerTheme.errorText;
      default:
        return headerTheme.savingText;
    }
  };

  const getSavedStatusIcon = () => {
    switch (savedStatus) {
      case 'saved':
        return 'checkmark-circle';
      case 'saving':
        return 'sync';
      case 'error':
        return 'alert-circle';
      default:
        return 'time';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Row: Back, Title Area, Menu */}
      <View style={styles.topRow}>
        {showBack && onBackPress ? (
          <Pressable
            onPress={onBackPress}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Ionicons name="arrow-back" size={24} color={headerTheme.title} />
          </Pressable>
        ) : (
          <View style={styles.backButton} />
        )}

        <View style={styles.titleContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {onMenuPress ? (
          <Pressable
            onPress={onMenuPress}
            style={styles.menuButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="More options"
            accessibilityRole="button"
          >
            <Ionicons name="ellipsis-vertical" size={20} color={headerTheme.title} />
          </Pressable>
        ) : (
          <View style={styles.menuButton} />
        )}
      </View>

      {/* Progress Steps. Each step's status is determined independently
          when `stepStatuses` (or legacy `completedFlags`) is provided —
          sections can be filled in any order. When neither is supplied
          we fall back to the sequential rule. */}
      <View style={styles.stepsContainer}>
        {steps.map((step, index) => {
          // Resolve a 3-state status: complete | partial | pending.
          let status: 'complete' | 'partial' | 'pending';
          if (stepStatuses && stepStatuses[index]) {
            status = stepStatuses[index];
          } else if (completedFlags) {
            status = completedFlags[index] ? 'complete' : 'pending';
          } else {
            status = index < currentStepIndex ? 'complete' : 'pending';
          }

          const isCompleted = status === 'complete';
          const isPartial = status === 'partial';
          const isActive = index === currentStepIndex;

          // Connector turns green only when *both* sides are complete —
          // otherwise it stays gray (consistent with independent steps).
          const nextStatus =
            stepStatuses?.[index + 1] ??
            (completedFlags?.[index + 1] ? 'complete' : 'pending');
          const connectorComplete = isCompleted && nextStatus === 'complete';

          return (
            <React.Fragment key={step.id}>
              {/* Step Indicator — Pressable when a tap handler is provided,
                  otherwise rendered with onPress disabled so the visual
                  doesn't change. */}
              <Pressable
                style={styles.stepItem}
                onPress={onStepPress ? () => onStepPress(index) : undefined}
                disabled={!onStepPress}
                accessibilityRole={onStepPress ? 'button' : undefined}
                accessibilityLabel={onStepPress ? `Go to ${step.label}` : undefined}
                hitSlop={6}
              >
                <View
                  style={[
                    styles.stepCircle,
                    isCompleted && styles.stepCircleCompleted,
                    isPartial && styles.stepCirclePartial,
                    !isCompleted && !isPartial && styles.stepCirclePending,
                  ]}
                >
                  {isCompleted ? (
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  ) : (
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  )}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isCompleted && styles.stepLabelCompleted,
                    isPartial && styles.stepLabelPartial,
                  ]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
              </Pressable>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    connectorComplete ? styles.connectorCompleted : styles.connectorPending,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Saved Status */}
      <View style={styles.savedStatusContainer}>
        <Ionicons
          name={getSavedStatusIcon()}
          size={14}
          color={getSavedStatusColor()}
        />
        <Text style={[styles.savedStatusText, { color: getSavedStatusColor() }]}>
          {getSavedStatusText()}
        </Text>
      </View>
    </View>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    backgroundColor: headerTheme.background,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF4FF',
    borderRadius: 20,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold as any,
    color: headerTheme.title,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: headerTheme.subtitle,
    textAlign: 'center',
    marginTop: spacing[1],
  },
  menuButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },

  // Progress Steps
  stepsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  stepItem: {
    alignItems: 'center',
    minWidth: 60,
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  stepCircleCompleted: {
    backgroundColor: headerTheme.stepCompleted, // green
  },
  stepCirclePending: {
    backgroundColor: headerTheme.stepPending,   // gray
  },
  // Partial = section started but not finished. Solid amber fill so it
  // reads at a glance against the green/gray neighbors.
  stepCirclePartial: {
    backgroundColor: '#F59E0B',                 // amber-500
  },
  stepNumber: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold as any,
    color: colors.white,
  },
  stepLabel: {
    fontSize: fontSize.xs,
    color: headerTheme.stepText,
    textAlign: 'center',
  },
  stepLabelCompleted: {
    color: headerTheme.stepCompleted,
  },
  stepLabelPartial: {
    color: '#B45309',                            // amber-700, readable on white
    fontWeight: fontWeight.medium as any,
  },
  connector: {
    height: 2,
    flex: 1,
    maxWidth: 40,
    marginHorizontal: spacing[2],
    marginBottom: spacing[4],
  },
  connectorCompleted: {
    backgroundColor: headerTheme.lineCompleted,
  },
  connectorPending: {
    backgroundColor: headerTheme.linePending,
  },

  // Saved Status
  savedStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  savedStatusText: {
    fontSize: fontSize.xs,
  },
});
