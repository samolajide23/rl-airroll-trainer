/**
 * Rocket League free air-roll + shared aerial control mapping.
 *
 * Holding powerslide/handbrake while airborne remaps yaw → roll (unless a
 * directional air-roll button is already providing roll). Same rule in Free
 * Play, Rings, and DAR drills.
 */

/**
 * @template {object} T
 * @param {T & { powerslide?: boolean, yaw?: number, roll?: number }} input
 * @param {{ onGround?: boolean }} car
 * @returns {T & { yaw: number, roll: number }}
 */
export function withFreeAirRoll(input, car) {
  const yaw = input.yaw ?? 0;
  const roll = input.roll ?? 0;
  if (car.onGround || !input.powerslide || roll !== 0) {
    return /** @type {T & { yaw: number, roll: number }} */ ({
      ...input,
      yaw,
      roll,
    });
  }
  return /** @type {T & { yaw: number, roll: number }} */ ({
    ...input,
    roll: yaw,
    yaw: 0,
  });
}

/**
 * Build pitch/yaw/roll for aerial step from a control snapshot + optional DAR lock.
 * Applies free air-roll when airborne.
 *
 * @param {{
 *   pitch?: number,
 *   yaw?: number,
 *   roll?: number,
 *   powerslide?: boolean,
 *   airLeft?: boolean,
 *   airRight?: boolean,
 * }} input
 * @param {{
 *   onGround?: boolean,
 *   airRollLock?: "left" | "right" | null,
 * }} [opts]
 * @returns {{ pitch: number, yaw: number, roll: number, airLeft: boolean, airRight: boolean }}
 */
export function aerialControlAxes(input, opts = {}) {
  let airLeft = Boolean(input.airLeft);
  let airRight = Boolean(input.airRight);
  if (opts.airRollLock === "left") airRight = false;
  if (opts.airRollLock === "right") airLeft = false;

  let roll = 0;
  if (airRight) roll += 1;
  if (airLeft) roll -= 1;
  roll = Math.max(-1, Math.min(1, roll));

  const mapped = withFreeAirRoll(
    {
      powerslide: Boolean(input.powerslide),
      yaw: input.yaw ?? 0,
      roll,
      pitch: input.pitch ?? 0,
    },
    { onGround: Boolean(opts.onGround) },
  );

  return {
    pitch: Math.max(-1, Math.min(1, mapped.pitch ?? 0)),
    yaw: Math.max(-1, Math.min(1, mapped.yaw)),
    roll: Math.max(-1, Math.min(1, mapped.roll)),
    airLeft,
    airRight,
  };
}
