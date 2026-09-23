# Parking Space ↔ Barrier schema flow

## Relationship

The assignment is a one-to-one relationship maintained on both MongoDB
documents:

```text
Property._id
    │ 1
    └──────< ParkingSpace.property_id
                    │
                    │ ParkingSpace.device_id (physical string ID)
                    │             =
                    │ Device.device_id (unique physical string ID)
                    │
                    └────────────> Device.parking_space_id (ObjectId back-reference)

Owner._id ──────< ParkingSpace.owner_id
User._id  ──────< Device.owner_id
```

| Collection | Field | Type | Connects to | Purpose |
|---|---|---|---|---|
| `ParkingSpace` | `_id` | ObjectId | `Device.parking_space_id` | Database ID of the bay/slot |
| `ParkingSpace` | `property_id` | ObjectId | `Property._id` | Groups spaces at one property |
| `ParkingSpace` | `owner_id` | ObjectId | `Owner._id` | Business owner of the space |
| `ParkingSpace` | `device_id` | String, nullable | `Device.device_id` | Operational hardware/barrier lookup |
| `ParkingSpace` | `has_smart_barrier` | Boolean | derived from `device_id` | Fast UI/filter flag |
| `Device` | `_id` | ObjectId | internal MongoDB references | Database identity of device record |
| `Device` | `device_id` | String, unique | `ParkingSpace.device_id` | Physical ID printed/configured on barrier |
| `Device` | `parking_space_id` | ObjectId, nullable | `ParkingSpace._id` | Back-reference to its assigned space |
| `Device` | `owner_id` | ObjectId | `User._id` | User account that registered the device |

`device_id` and `_id` are deliberately different: `_id` is MongoDB's internal
record ID; `device_id` is the stable physical barrier ID used by MQTT,
firmware, telemetry, and access commands.

## Admin assignment flow

```text
Admin opens Parking Spaces
  → GET /api/devices/admin/barrier-assignments
  → API returns all spaces + registered barrier/gate/lock devices
  → Admin selects a Barrier ID for a Parking Space ID
  → PUT /api/devices/admin/parking-spaces/:spaceId/barrier
       body: { "barrier_id": "BARRIER-001" }
  → API rejects an unknown or already-assigned barrier
  → ParkingSpace.device_id = "BARRIER-001"
  → ParkingSpace.has_smart_barrier = true
  → Device.parking_space_id = ParkingSpace._id
```

For unassignment, the same endpoint receives `{ "barrier_id": null }`. It
clears `ParkingSpace.device_id`, sets `has_smart_barrier` to `false`, and clears
the matching `Device.parking_space_id`.

## Runtime access flow

```text
Booking.space_id → ParkingSpace._id
ParkingSpace.device_id → Device.device_id
Device.device_id → MQTT/Firebase topic or command target
Device.last_state / last_seen_at → admin and owner telemetry
```

The server treats `ParkingSpace.device_id` as the operational lookup and
`Device.parking_space_id` as the integrity/back-navigation link. The admin API
updates both so booking access and device inventory agree.
