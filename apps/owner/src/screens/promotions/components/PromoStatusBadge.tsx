// PromoStatusBadge Component - Status indicator for promotions
import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import { StatusTag } from '../../../components/ui';
import type { PromoStatus } from '../../../types/promo';
import { getStatusDisplayInfo } from '../../../utils/promoHelpers';

interface PromoStatusBadgeProps {
  status: PromoStatus;
  size?: 'small' | 'medium';
  /** Kept for API compatibility; the kit status pill is text-only. */
  showIcon?: boolean;
  testID?: string;
}

// Helper colour -> kit StatusTag tone
const TONE: Record<string, string> = {
  success: 'ink',
  warning: 'warning',
  danger: 'danger',
  muted: 'grey',
  neutral: 'white',
};

function PromoStatusBadge({
  status,
  size = 'medium',
  testID,
}: PromoStatusBadgeProps) {
  const displayInfo = useMemo(() => getStatusDisplayInfo(status), [status]);
  const isSmall = size === 'small';

  return (
    <View testID={testID} accessibilityLabel={`Status: ${displayInfo.label}`}>
      <StatusTag
        label={displayInfo.label}
        tone={TONE[displayInfo.color] || 'white'}
        style={isSmall ? { paddingHorizontal: 10, paddingVertical: 4 } : undefined}
      />
    </View>
  );
}

export default memo(PromoStatusBadge);
