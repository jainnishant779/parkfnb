/** What the backend sends for properties, spaces and availability, after the camelCase transform in lib/api.ts (`_id` arrives as `id`). */

export interface Property {
  id: string;
  /** a bare id in the list, populated (with `userId`) on a single property */
  ownerId?: string | { id: string; userId?: string; isVerified?: boolean };
  propertyName: string;
  address: string;
  city: string;
  /** a two-letter code (the apps' convention) or, on older records, the full name */
  state: string;
  postalCode: string;
  country?: string;
  locationLat: number;
  locationLng: number;
  accessInstructions?: string;
  propertyImages: string[];
  isActive: boolean;
  createdAt?: string;
  /** every space of the property, deleted ones included: only the list sends it */
  totalSpaces?: number;
}

export type SpaceStatus = 'active' | 'inactive' | 'maintenance' | 'unavailable';
export type BookingMode = 'instant' | 'request' | 'both';

export interface Space {
  id: string;
  /** a bare id in a property's list, the populated property on a single space */
  propertyId: string | Pick<Property, 'id' | 'propertyName' | 'address' | 'city' | 'state' | 'postalCode' | 'locationLat' | 'locationLng' | 'propertyImages'>;
  ownerId?: unknown;
  spaceNumber: string;
  spaceType: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters?: number;
  allowedVehicleTypes: string[];
  spaceDescription?: string;
  spaceImages: string[];
  pricePerHour: number;
  pricePerDay?: number;
  pricePerMonth?: number;
  status: SpaceStatus;
  bookingMode: BookingMode;
  hasEvCharging?: boolean;
  deviceId?: string | null;
  hasSmartBarrier?: boolean;
  isAvailable: boolean;
  averageRating?: number;
  createdAt?: string;
}

export interface AvailabilitySlot {
  id: string;
  spaceId: string;
  /** 0 = Sunday */
  dayOfWeek: number;
  /** "HH:MM", 24 hour */
  availableFrom: string;
  availableTo: string;
  isAvailable: boolean;
}

/** What the forms send. Prices go in `pricePerHour/Day/Month`: the backend keeps the `hourlyRate` aliases in step itself. */
export interface PropertyInput {
  propertyName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  locationLat: number;
  locationLng: number;
  accessInstructions: string;
  propertyImages: string[];
}

export interface SpaceInput {
  spaceNumber: string;
  spaceType: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters?: number;
  allowedVehicleTypes: string[];
  spaceDescription: string;
  spaceImages: string[];
  pricePerHour: number;
  /** null clears a price that was set (the backend only writes what it is sent) */
  pricePerDay?: number | null;
  pricePerMonth?: number | null;
  bookingMode: BookingMode;
  hasEvCharging: boolean;
  isAvailable: boolean;
}

export interface ScheduleInput {
  dayOfWeek: number;
  availableFrom: string;
  availableTo: string;
  isAvailable: boolean;
}
