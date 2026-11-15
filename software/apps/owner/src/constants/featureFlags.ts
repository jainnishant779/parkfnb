// Feature flags for the owner app.
//
// ENABLE_TYPE_SPECIFIC_UI gates the per-owner-type specialty surfaces
// (residential_community → Properties/Staff tabs + zoned slot UI,
//  industrial_facility → Compliance tab + StaffRoles, empty_land → LotSetup
//  tab + Disputes-replaces-Promotions, etc.). Backend has no per-type
// branching beyond the business_name / land_label fields, so the simpler
// individual / commercial_property layout (Listings + Earnings) is the
// default for everyone while the specialty UI is shelved. Flip to true to
// re-enable without rewriting any of the gated code below.
export const ENABLE_TYPE_SPECIFIC_UI = false;
