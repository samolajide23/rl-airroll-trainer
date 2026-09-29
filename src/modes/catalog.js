import { BallContactMode } from "./ballContact.js";
import { DribbleBridgeMode } from "./dribbleBridge.js";
import { FreePlayMode } from "./freePlay.js";
import { GhostAlignMode, GHOST_ALIGN_DIFFICULTIES } from "./ghostAlign.js";
import { RingsMode } from "./ringsMode.js";
import { SequenceMode } from "./sequenceMode.js";

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   available: boolean,
 *   needsDifficulty?: boolean,
 *   create?: (ctx: object, options?: object) => { start(): void, stop(): void, update(dt: number, now: number): void }
 * }} GameModeDef
 */

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   blurb: string,
 *   modes: GameModeDef[]
 * }} PhaseDef
 */

/** @type {PhaseDef[]} */
export const PHASES = [
  {
    id: "free-play",
    title: "Free Play",
    blurb: "Drive a full soccar arena — ground, aerials, and the ball.",
    modes: [
      {
        id: "arena",
        title: "Arena",
        description:
          "Free roam with RL-style driving. Jump, dodge, finite boost + pads, air roll, ball. Reset car / skip ball.",
        available: true,
        create: (ctx) => new FreePlayMode(ctx),
      },
    ],
  },
  {
    id: "air-roll",
    title: "Air Roll",
    blurb: "No ball — master pitch, yaw, and directional air roll.",
    modes: [
      {
        id: "ghost-align",
        title: "Target Pose",
        description:
          "Match a ghost car orientation and hold it. Core fine control drill.",
        available: true,
        needsDifficulty: true,
        create: (ctx, options) => new GhostAlignMode(ctx, options),
      },
      {
        id: "dar-sequences",
        title: "DAR Sequences",
        description:
          "Tetris-style move queue — clear NOW, peek the next rolls/pitches on the left.",
        available: true,
        create: (ctx) => new SequenceMode(ctx),
      },
      {
        id: "rings",
        title: "Rings",
        description:
          "Free-fly a hoop course — boost and air roll to thread glowing rings.",
        available: true,
        create: (ctx) => new RingsMode(ctx),
      },
    ],
  },
  {
    id: "ball-contact",
    title: "Ball Contact",
    blurb: "Air roll into touches — which part of the car, how hard, recover.",
    modes: [
      {
        id: "ball-static",
        title: "Static Ball Contact",
        description: "Hit a still mid-air ball with nose, roof, or side.",
        available: true,
        create: (ctx) => new BallContactMode(ctx, { variant: "static" }),
      },
      {
        id: "ball-roll-touch",
        title: "Roll-to-Touch",
        description: "Roll during the approach to present the right contact.",
        available: true,
        create: (ctx) => new BallContactMode(ctx, { variant: "rollTouch" }),
      },
      {
        id: "ball-soft",
        title: "Soft Touches",
        description: "Nudge the ball a few car-lengths — strength matters.",
        available: true,
        create: (ctx) => new BallContactMode(ctx, { variant: "soft" }),
      },
      {
        id: "ball-recovery",
        title: "Recovery",
        description: "After the touch, get back wheels-down quickly.",
        available: true,
        create: (ctx) => new BallContactMode(ctx, { variant: "recovery" }),
      },
    ],
  },
  {
    id: "air-dribble",
    title: "Air Dribble",
    blurb: "Pop, boost tap, hover, wall, and steer — Shift/A to boost.",
    modes: [
      {
        id: "dribble-pop",
        title: "Pop & Chase",
        description: "Small pop, then jump/boost for 2–3 touches.",
        available: true,
        create: (ctx) => new DribbleBridgeMode(ctx, { variant: "popChase" }),
      },
      {
        id: "dribble-boost",
        title: "Boost Tapping",
        description: "Pulse boost to a target — holding too long fails.",
        available: true,
        create: (ctx) => new DribbleBridgeMode(ctx, { variant: "boostTap" }),
      },
      {
        id: "dribble-hover",
        title: "Hover & Hold",
        description: "Keep the ball near your nose while barely moving.",
        available: true,
        create: (ctx) => new DribbleBridgeMode(ctx, { variant: "hover" }),
      },
      {
        id: "dribble-wall",
        title: "Wall-to-Air",
        description: "Pop off the wall and follow with air rolls.",
        available: true,
        create: (ctx) => new DribbleBridgeMode(ctx, { variant: "wallAir" }),
      },
      {
        id: "dribble-steer",
        title: "Side-Steer Dribble",
        description: "Carry on the nose while steering with DAR.",
        available: true,
        create: (ctx) =>
          new DribbleBridgeMode(ctx, { variant: "steerDribble" }),
      },
    ],
  },
];

/** Flat list for lookups */
export const GAME_MODES = PHASES.flatMap((p) => p.modes);

export { GHOST_ALIGN_DIFFICULTIES };
