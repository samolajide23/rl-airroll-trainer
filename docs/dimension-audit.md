# Standard soccar dimension audit

Checked 2026-09-30. 1 uu = 1 cm; rendering uses 0.01 metres per uu.
No field/ball/hitbox sizes were enlarged to compensate for camera perspective.

| Quantity | Current reference value | Render equivalent |
|---|---:|---:|
| Field width | 8192 uu | 81.92 m |
| Field length, excluding goals | 10240 uu | 102.40 m |
| Ceiling plane | 2048 uu | 20.48 m |
| Goal opening width | 1785.51 uu | 17.8551 m |
| Goal opening height | 642.775 uu | 6.42775 m |
| Goal depth | 880 uu | 8.80 m |
| Ball collision diameter | 182.5 uu | 1.825 m |
| Ball kickoff centre height | 93.15 uu | 0.9315 m |
| Octane/Fennec collision box L/W/H | 120.507 / 86.6994 / 38.6591 uu | 1.20507 / 0.866994 / 0.386591 m |
| Dominus collision box L/W/H | 130.427 / 85.7799 / 33.8 uu | 1.30427 / 0.857799 / 0.338 m |

## Evidence and conflicting numbers

- [Version-pinned RocketSim constants](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/src/RLConst.h)
  establish field extents, ceiling, sphere collision radius and boost locations.
- [Version-pinned CarConfig](https://github.com/mtheall/RocketSim/blob/2da51b1dac7b8127127613a5ff30e490bdd70dd8/src/Sim/Car/CarConfig/CarConfig.cpp)
  provides box dimensions, offsets, wheel radii and suspension locations; explains
  why commonly circulated hitbox dimensions differ from its inertia-matched values.
- [RLBot useful values](https://github.com/RLBot/RLBot/wiki/Useful-Game-Values)
  was readable in this audit. It is explicitly deprecated and last edited in 2024.
  Agrees on width/length/goal dimensions but lists ceiling **2044**, ball radius
  **92.75**, and one small-pad Y of **3310** rather than RocketSim's **3308**.
  It also warns pad positions vary by map. These conflicts are recorded, not
  resolved by assuming either source describes the current game perfectly.
- Every one of **8020** browser collision triangles was compared with the
  SHA-256-verified CMF reference pack: **zero different vertices**. This proves
  scale/geometry consistency with that reference, not current live-game identity.
  Re-run `npm run physics:dimensions` after fixture setup.

## Visual body limitations

Imported body geometry is *not* the collision hitbox. Body length is currently
normalized to hitbox length, with uniform scale retaining original proportions.
This is a presentation approximation, not verified live-game asset sizing.
The imported wheels can be identified, but no verified body/mesh calibration
source establishes that stretching width or height to the hitbox would be correct.
Their geometry is therefore not distorted to match an unrelated box.

Measured Octane visible L/W/H: 1.20507 / 0.62429 / 0.53525 m.
Its wheel spacing and tire silhouette need asset-specific calibration if a
closer body match is required. Existing nominal-rest floor alignment is retained.
Actual suspension movement is not animated into the imported wheel meshes.

## Corrections from this audit

- Car contact shadow previously used a 2.1 × 3.1 m footprint—far larger than
  the roughly 0.87 × 1.21 m hitbox. It now derives from the selected hitbox
  with only 20% soft-edge allowance and rotates with the car's heading.
- Ball shadow derives from its actual diameter instead of a fixed oversized disc.
- Ceiling indicator is on the actual 20.48 m plane, not 4 cm above it.
- Reset clears visible ball rotation too.

Camera framing remains user-configurable. A 4:3 embedded preview will not look
identical to a 16:9 game window even when physical dimensions match. Decorative
city/stadium geometry has no gameplay collision and is intentionally original.
Coupled contacts still fail the strict parity suite; sizing consistency does not
resolve collision timing, camera feel or device latency.