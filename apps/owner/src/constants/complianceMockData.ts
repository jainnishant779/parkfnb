// ============================================================================
// COMPLIANCE MOCK DATA - Industrial Owner Flow
// ============================================================================

import type {
  BookingCompliance,
  ComplianceTemplate,
  WhitelistConfig,
  ComplianceHistoryEvent,
} from '../types/compliance';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const addDays = (date: Date, days: number): string => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString();
};

const subtractDays = (date: Date, days: number): string => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result.toISOString();
};

const now = new Date();

// ============================================================================
// MOCK BOOKINGS (8 bookings with different statuses)
// ============================================================================

export const SEED_BOOKINGS: BookingCompliance[] = [
  // 1. Compliant booking
  {
    id: generateId(),
    bookingRef: 'IND-2024-001',
    clientName: 'John Mitchell',
    clientCompany: 'FastFreight Logistics',
    startAt: addDays(now, 1),
    endAt: addDays(now, 2),
    vehicleType: 'truck',
    slotTier: 'L',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'verified',
        docNumber: 'DL-98765432',
        issuedAt: subtractDays(now, 365),
        expiresAt: addDays(now, 730),
        verifiedAt: subtractDays(now, 2),
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'verified',
        docNumber: 'VP-2024-1234',
        issuedAt: subtractDays(now, 30),
        expiresAt: addDays(now, 335),
        verifiedAt: subtractDays(now, 2),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'verified',
        docNumber: 'INS-FF-2024',
        issuedAt: subtractDays(now, 60),
        expiresAt: addDays(now, 305),
        verifiedAt: subtractDays(now, 2),
      },
      {
        id: generateId(),
        type: 'briefing',
        state: 'verified',
        verifiedAt: subtractDays(now, 2),
        notes: 'Completed online safety briefing',
      },
    ],
    internalNotes: 'Regular customer, always compliant',
    flagged: false,
    markedCompliantAt: subtractDays(now, 2),
  },

  // 2. Missing documents
  {
    id: generateId(),
    bookingRef: 'IND-2024-002',
    clientName: 'Sarah Chen',
    clientCompany: 'QuickHaul Transport',
    startAt: addDays(now, 2),
    endAt: addDays(now, 3),
    vehicleType: 'trailer',
    slotTier: 'L',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'uploaded',
        docNumber: 'DL-45678901',
        issuedAt: subtractDays(now, 200),
        expiresAt: addDays(now, 530),
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'missing',
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'missing',
      },
      {
        id: generateId(),
        type: 'briefing',
        state: 'missing',
      },
    ],
    internalNotes: '',
    flagged: false,
  },

  // 3. Expiring soon
  {
    id: generateId(),
    bookingRef: 'IND-2024-003',
    clientName: 'Mike Rodriguez',
    clientCompany: 'Metro Delivery Co',
    startAt: addDays(now, 3),
    endAt: addDays(now, 4),
    vehicleType: 'van',
    slotTier: 'M',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'verified',
        docNumber: 'DL-11223344',
        issuedAt: subtractDays(now, 700),
        expiresAt: addDays(now, 10), // Expiring in 10 days
        verifiedAt: subtractDays(now, 30),
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'verified',
        docNumber: 'VP-2023-9876',
        issuedAt: subtractDays(now, 350),
        expiresAt: addDays(now, 5), // Expiring in 5 days
        verifiedAt: subtractDays(now, 30),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'verified',
        docNumber: 'INS-MD-2023',
        issuedAt: subtractDays(now, 300),
        expiresAt: addDays(now, 65),
        verifiedAt: subtractDays(now, 30),
      },
    ],
    internalNotes: 'Need to remind about permit renewal',
    flagged: false,
  },

  // 4. Pending verification
  {
    id: generateId(),
    bookingRef: 'IND-2024-004',
    clientName: 'Emily Watson',
    clientCompany: 'CityLink Freight',
    startAt: addDays(now, 4),
    endAt: addDays(now, 5),
    vehicleType: 'truck',
    slotTier: 'L',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'uploaded',
        docNumber: 'DL-55667788',
        issuedAt: subtractDays(now, 100),
        expiresAt: addDays(now, 630),
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'uploaded',
        docNumber: 'VP-2024-5678',
        issuedAt: subtractDays(now, 15),
        expiresAt: addDays(now, 350),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'uploaded',
        docNumber: 'INS-CL-2024',
        issuedAt: subtractDays(now, 20),
        expiresAt: addDays(now, 345),
      },
      {
        id: generateId(),
        type: 'briefing',
        state: 'uploaded',
        notes: 'Briefing certificate attached',
      },
    ],
    internalNotes: 'All docs submitted, awaiting verification',
    flagged: false,
  },

  // 5. Flagged booking
  {
    id: generateId(),
    bookingRef: 'IND-2024-005',
    clientName: 'David Kim',
    clientCompany: 'Prime Haulers',
    startAt: addDays(now, 5),
    endAt: addDays(now, 6),
    vehicleType: 'trailer',
    slotTier: 'L',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'uploaded',
        docNumber: 'DL-UNCLEAR',
        issuedAt: subtractDays(now, 50),
        expiresAt: addDays(now, 315),
        notes: 'Photo quality is poor, need resubmission',
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'verified',
        docNumber: 'VP-2024-3333',
        issuedAt: subtractDays(now, 45),
        expiresAt: addDays(now, 320),
        verifiedAt: subtractDays(now, 5),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'missing',
      },
    ],
    internalNotes: 'Driver ID photo unclear, insurance not provided',
    flagged: true,
    flagReason: 'Document quality issues - requires resubmission',
  },

  // 6. Compliant van booking
  {
    id: generateId(),
    bookingRef: 'IND-2024-006',
    clientName: 'Lisa Park',
    clientCompany: 'Swift Parcels',
    startAt: addDays(now, 6),
    endAt: addDays(now, 7),
    vehicleType: 'van',
    slotTier: 'S',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'verified',
        docNumber: 'DL-99887766',
        issuedAt: subtractDays(now, 400),
        expiresAt: addDays(now, 695),
        verifiedAt: subtractDays(now, 10),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'verified',
        docNumber: 'INS-SP-2024',
        issuedAt: subtractDays(now, 30),
        expiresAt: addDays(now, 335),
        verifiedAt: subtractDays(now, 10),
      },
    ],
    internalNotes: 'Small parcel delivery - minimal requirements',
    flagged: false,
    markedCompliantAt: subtractDays(now, 10),
  },

  // 7. Multiple missing items
  {
    id: generateId(),
    bookingRef: 'IND-2024-007',
    clientName: 'Robert Johnson',
    clientCompany: 'Regional Transport LLC',
    startAt: addDays(now, 7),
    endAt: addDays(now, 8),
    vehicleType: 'truck',
    slotTier: 'M',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'missing',
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'missing',
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'missing',
      },
      {
        id: generateId(),
        type: 'briefing',
        state: 'missing',
      },
    ],
    internalNotes: 'New client - no documents submitted yet',
    flagged: false,
  },

  // 8. Partial compliance
  {
    id: generateId(),
    bookingRef: 'IND-2024-008',
    clientName: 'Amanda Torres',
    clientCompany: 'Express Movers',
    startAt: addDays(now, 8),
    endAt: addDays(now, 9),
    vehicleType: 'van',
    slotTier: 'M',
    checklist: [
      {
        id: generateId(),
        type: 'driverId',
        state: 'verified',
        docNumber: 'DL-44556677',
        issuedAt: subtractDays(now, 500),
        expiresAt: addDays(now, 595),
        verifiedAt: subtractDays(now, 3),
      },
      {
        id: generateId(),
        type: 'permit',
        state: 'uploaded',
        docNumber: 'VP-2024-8888',
        issuedAt: subtractDays(now, 5),
        expiresAt: addDays(now, 360),
      },
      {
        id: generateId(),
        type: 'insurance',
        state: 'missing',
      },
    ],
    internalNotes: 'Waiting for insurance document',
    flagged: false,
  },
];

// ============================================================================
// MOCK TEMPLATES (3 templates)
// ============================================================================

export const SEED_TEMPLATES: ComplianceTemplate[] = [
  {
    id: generateId(),
    name: 'Heavy Vehicle Standard',
    scope: 'vehicleType',
    scopeValue: 'truck',
    requiredTypes: ['driverId', 'permit', 'insurance', 'briefing'],
    expiryWarningDays: 14,
    createdAt: subtractDays(now, 90),
    updatedAt: subtractDays(now, 30),
  },
  {
    id: generateId(),
    name: 'Trailer Requirements',
    scope: 'vehicleType',
    scopeValue: 'trailer',
    requiredTypes: ['driverId', 'permit', 'insurance'],
    expiryWarningDays: 14,
    createdAt: subtractDays(now, 90),
    updatedAt: subtractDays(now, 60),
  },
  {
    id: generateId(),
    name: 'Large Slot Premium',
    scope: 'slotTier',
    scopeValue: 'L',
    requiredTypes: ['driverId', 'permit', 'insurance', 'briefing'],
    expiryWarningDays: 21,
    createdAt: subtractDays(now, 60),
    updatedAt: subtractDays(now, 15),
  },
];

// ============================================================================
// MOCK WHITELIST
// ============================================================================

export const SEED_WHITELIST: WhitelistConfig = {
  enabled: false,
  clients: [
    {
      id: generateId(),
      name: 'FastFreight Logistics',
      company: 'FastFreight Inc.',
      addedAt: subtractDays(now, 60),
    },
    {
      id: generateId(),
      name: 'Metro Delivery Co',
      company: 'Metro Delivery Co',
      addedAt: subtractDays(now, 45),
    },
  ],
};

// ============================================================================
// MOCK HISTORY EVENTS
// ============================================================================

export const SEED_HISTORY: ComplianceHistoryEvent[] = [
  {
    id: generateId(),
    createdAt: subtractDays(now, 1),
    label: 'Booking IND-2024-001 marked compliant',
    bookingId: SEED_BOOKINGS[0].id,
    bookingRef: 'IND-2024-001',
    eventType: 'status_change',
  },
  {
    id: generateId(),
    createdAt: subtractDays(now, 2),
    label: 'Insurance document verified for IND-2024-001',
    bookingId: SEED_BOOKINGS[0].id,
    bookingRef: 'IND-2024-001',
    eventType: 'verification',
  },
  {
    id: generateId(),
    createdAt: subtractDays(now, 3),
    label: 'Driver ID uploaded for IND-2024-004',
    bookingId: SEED_BOOKINGS[3].id,
    bookingRef: 'IND-2024-004',
    eventType: 'document_update',
  },
  {
    id: generateId(),
    createdAt: subtractDays(now, 5),
    label: 'Booking IND-2024-005 flagged for review',
    bookingId: SEED_BOOKINGS[4].id,
    bookingRef: 'IND-2024-005',
    eventType: 'flag',
  },
  {
    id: generateId(),
    createdAt: subtractDays(now, 10),
    label: 'Template "Heavy Vehicle Standard" updated',
    eventType: 'template',
  },
];
