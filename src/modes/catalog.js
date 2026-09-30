import { GHOST_ALIGN_DIFFICULTIES } from "./ghostDifficulties.js";

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   available: boolean,
 *   needsDifficulty?: boolean,
 *   load?: () => Promise<any>,
 *   create?: (ctx: object, options: object, module: any) => { start(): void, stop(): void, update(dt: number, now: number): void }
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
        load: () => import("./freePlay.js"),
        create: (ctx, options, module) => new module.FreePlayMode(ctx),
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
        load: () => import("./ghostAlign.js"),
        create: (ctx, options, module) => new module.GhostAlignMode(ctx, options),
      },
      {
        id: "dar-sequences",
        title: "DAR Sequences",
        description:
          "Tetris-style move queue — clear NOW, peek the next rolls/pitches on the left.",
        available: true,
        load: () => import("./sequenceMode.js"),
        create: (ctx, options, module) => new module.SequenceMode(ctx),
      },
      {
        id: "rings",
        title: "Rings",
        description:
          "Free-fly a hoop course — boost and air roll to thread glowing rings.",
        available: true,
        load: () => import("./ringsMode.js"),
        create: (ctx, options, module) => new module.RingsMode(ctx),
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
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { variant: "static" }),
      },
      {
        id: "ball-roll-touch",
        title: "Roll-to-Touch",
        description: "Roll during the approach to present the right contact.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { variant: "rollTouch" }),
      },
      {
        id: "ball-soft",
        title: "Soft Touches",
        description: "Nudge the ball a few car-lengths — strength matters.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { variant: "soft" }),
      },
      {
        id: "ball-recovery",
        title: "Recovery",
        description: "After the touch, get back wheels-down quickly.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { variant: "recovery" }),
      },
    ],
  },
  {
    id: "air-dribble",
    title: "Air Dribble",
    blurb: "Pop, boost tap, hover, wall, and steer — uses your boost bind.",
    modes: [
      {
        id: "dribble-pop",
        title: "Pop & Chase",
        description: "Small pop, then jump/boost for 2–3 touches.",
        available: true,
        load: () => import("./dribbleBridge.js"),
        create: (ctx, options, module) => new module.DribbleBridgeMode(ctx, { variant: "popChase" }),
      },
      {
        id: "dribble-boost",
        title: "Boost Tapping",
        description: "Pulse boost to a target — holding too long fails.",
        available: true,
        load: () => import("./dribbleBridge.js"),
        create: (ctx, options, module) => new module.DribbleBridgeMode(ctx, { variant: "boostTap" }),
      },
      {
        id: "dribble-hover",
        title: "Hover & Hold",
        description: "Keep the ball near your nose while barely moving.",
        available: true,
        load: () => import("./dribbleBridge.js"),
        create: (ctx, options, module) => new module.DribbleBridgeMode(ctx, { variant: "hover" }),
      },
      {
        id: "dribble-wall",
        title: "Wall-to-Air",
        description: "Pop off the wall and follow with air rolls.",
        available: true,
        load: () => import("./dribbleBridge.js"),
        create: (ctx, options, module) => new module.DribbleBridgeMode(ctx, { variant: "wallAir" }),
      },
      {
        id: "dribble-steer",
        title: "Side-Steer Dribble",
        description: "Carry on the nose while steering with DAR.",
        available: true,
        load: () => import("./dribbleBridge.js"),
        create: (ctx, options, module) => new module.DribbleBridgeMode(ctx, { variant: "steerDribble" }),
      },
    ],
  },
];

/** Flat list for lookups */
export const GAME_MODES = PHASES.flatMap((p) => p.modes);

export { GHOST_ALIGN_DIFFICULTIES };
