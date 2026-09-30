# Car visual calibration

The game hitbox is not a body-length calibration reference. Existing GLB car
geometry is retained; no extracted game meshes or textures are distributed.

## Dimensional evidence (2026-09-30)

User-supplied public database README identifies its contents as UModel game
exports, up to Season 10. Skeleton chunks were read in memory, without adding
the artwork to this project. Export origin is the uploader's claim, not an
Epic-issued authenticity certificate. Measurements are used as reference facts.

- Fennec `Body_Grain_SK.psk`, Drive file `1yGzqgttRIFeNYmFOtmRhQW6Zx3fhOiQi`:
  front wheel translation X 48.81388473510742 uu, rear -36.51449966430664 uu.
- Dominus `Body_MuscleCar_SK.psk`, Drive file `152SYW8QQAdXHrJ17ffLX2ox-LphyNgTs`:
  front X 50.33267593383789 uu, rear -35.16732406616211 uu.
- Octane: no matching export located yet; use RocketSim front/rear X
  51.25 / -33.75 uu. This remains a simulation-wheelbase approximation.

These positions are direct root children; no parent transform composition is
required. PSK REFSKELT records are 120 bytes, parent at offset72, position at92.
Wheelbase, unlike body bounding-box length, is independent of spoiler/bumpers.

Existing model wheel meshes are identified by FR/FL/BR/BL names, with rim and
tread components grouped into one pivot. Body scale is uniform and derived from
front/rear wheel centres. The source geometry is not stretched to fill a hitbox.
Wheel centres/radii then follow the verified physical suspension independently;
steering and roll are visual only. Asset labels disagree about handedness, so
side mapping uses geometry coordinates rather than text labels.

Exhaust uses supplied Fennec/Dominus chassis-socket positions as an approximation
to the root frame (root/chassis rest translations were zero). Octane uses an
explicit approximate emitter. This does not certify chassis animation parity.

## Browser measurements after calibration

Approximate full visual length: Octane1.381m, Fennec1.404m, Dominus1.494m.
Front/back tire radii: Octane/Fennec0.125/0.15m; Dominus0.12/0.135m.
The collision box, root, velocities, arena, and ball sizes remain unchanged.

Limitations: fan-body geometry can still differ in shape, imported suspension
links do not articulate, and Octane still needs matching source skeleton data.
This is a measured calibration improvement, not exact current-game art parity.