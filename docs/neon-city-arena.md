# Neon-city arena presentation

Original procedural city scenery, inspired by the atmosphere of a nighttime
urban stadium. No Rocket League meshes, textures, logos, or signs are copied.

## Local export inspection

The supplied Neo Tokyo folder contains PSK/PSKX geometry, TGA images, Unreal
material metadata and animations. It is not a browser-ready scene: actor
placement, complete material graphs, and redistribution permission were not
provided. Direct use would require conversion and rights verification.
Only descriptive bounds were inspected for scale reference.

Use the **Standard** soccar layout, not the legacy elevated Neo Tokyo layout:

- Field: 8192 × 10240 uu; ceiling 2048 uu.
- Goal opening: 1785.51 × 642.775 uu; depth 880 uu.
- 28 small and 6 large boost pads at existing RocketSim coordinates.
- Pickup amounts: 12 / 100; respawn timers: 4 / 10 seconds.
- Pad bases are approximately 48 / 84 uu in visual radius. These are *not*
  the larger 144 / 208 uu pickup cylinders.

City geometry stays outside the arena. Goal trim is outside the nominal opening.
Curved surfaces retain the existing collision-matched triangle renderer. No
scenery is added to physics. Depleted boost pads retain a dark base while all
luminous pickup elements are hidden.

Physics is still approximate at complex contacts and pad lock/timing edges;
this visual pass does not certify complete live-game parity. Existing trajectory
budgets remain unchanged.