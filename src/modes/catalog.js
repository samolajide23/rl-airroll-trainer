import { GHOST_ALIGN_DIFFICULTIES } from "./ghostDifficulties.js";
import { ROLL_TOUCH_MASTERY } from "../shared/rollTouchTraining.js";
import { RECOVERY_MASTERY } from "../shared/recoveryTraining.js";
import { MOVEMENT_TRAINING } from "../shared/movementTraining.js";

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
const ORIGINAL_PHASES = [
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
        create: (ctx, options, module) => new module.RingsMode(ctx, options),
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
        title: "First Touch · Stationary Ball",
        description: "Learn deliberate ground touches: find contact, square the nose, place the ball, add pace and follow the play.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { ...options, variant: "static" }),
      },
      {
        id: "ball-roll-touch",
        title: "Roll-to-Touch",
        description: "Roll during the approach to present the right contact.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { ...options, variant: "rollTouch" }),
      },
      {
        id: "ball-soft",
        title: "Soft Touches",
        description: "Cushion an incoming ground ball and keep the next touch available.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { ...options, variant: "soft" }),
      },
      {
        id: "ball-recovery",
        title: "Recovery",
        description: "After the touch, get back wheels-down quickly.",
        available: true,
        load: () => import("./ballContact.js"),
        create: (ctx, options, module) => new module.BallContactMode(ctx, { ...options, variant: "recovery" }),
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
        description: "Match the ball's aerial speed and stay close for three seconds after a touch.",
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

const existing = new Map(ORIGINAL_PHASES.flatMap(phase => phase.modes).map(mode => [mode.id, mode]));
for (const id of Object.keys(MOVEMENT_TRAINING)) existing.set(id, {
  id, available: true,
  load: () => import("./movement.js"),
  create: (ctx, options, module) => new module.MovementMode(ctx, { ...options, variant: id }),
});

function mechanic(id, title, level, steps, drillId, options = {}) {
  const drill = existing.get(drillId);
  return {
    ...(drill ?? {}), id: drill?.id ?? id, title, level, steps,
    description: steps[0], available: Boolean(drill?.available), ...options,
  };
}

export function previousTrainingDrill(id, masteryStep = 0) {
  const modes = PHASES[0].modes.filter(mode => mode.available);
  const index = modes.findIndex(mode => mode.id === id);
  if (index < 0) return null;
  const step = Math.max(0, Math.trunc(masteryStep)) - 1;
  const previous = modes[(index - 1 + modes.length) % modes.length];
  return step >= 0
    ? { def: modes[index], masteryStep: step }
    : { def: previous, masteryStep: previous.steps.length - 1 };
}

export function nextTrainingDrill(id, masteryStep = 0) {
  const modes = PHASES[0].modes.filter(mode => mode.available);
  const index = modes.findIndex(mode => mode.id === id);
  if (index < 0) return null;
  const step = Math.max(0, Math.trunc(masteryStep)) + 1;
  return step < modes[index].steps.length
    ? { def: modes[index], masteryStep: step }
    : { def: modes[(index + 1) % modes.length], masteryStep: 0 };
}

export const STATIC_BALL_MASTERY = [
  { title: "Find Contact", goal: "Approach the stationary ground ball and make contact.", success: "Any car contact before the 15-second round ends.", benefit: "Learn spacing and steering into the ball.", cue: "Line up before accelerating; watch where your nose will meet the ball.", playable: true },
  { title: "Square the Nose", goal: "Make deliberate front contact rather than clipping the ball with the side.", success: "First contact with the front of the car; outgoing direction is not scored.", benefit: "Build predictable, repeatable touches.", cue: "Finish steering before the touch so your nose meets the ball squarely." },
  { title: "Place the Touch", goal: "Send the ball through a wide target gate, including targets left and right.", success: "A front touch sends the ball through the requested gate.", benefit: "Learn contact angles for passes and shots.", cue: "Choose your approach angle before committing to contact." },
  { title: "Add Pace", goal: "Reach the target within a requested ball-speed range.", success: "Front contact, then cross the gate at the requested ground pace: 28.8-43.2 km/h initially.", benefit: "Add purposeful power without losing accuracy.", cue: "Adjust approach speed while keeping the same contact line." },
  { title: "Stay in the Play", goal: "Place the touch, then stay in control and follow its path.", success: "Front contact and a target hit, then follow within 600 uu for 0.5 seconds, wheels-down and facing the ball. No speed-band requirement.", benefit: "Stay available for the next touch instead of overcommitting.", cue: "Plan your exit and follow-through before striking the ball." },
].map(step => ({ ...step, playable: true }));

export const SOFT_TOUCH_MASTERY = [
  { title: "Take the Sting Out", goal: "Meet a slowly approaching ground ball and cushion its arrival.", success: "Reduce the ball's incoming speed with a deliberate first touch.", benefit: "Receive a pass without sending it straight back away.", cue: "Match the arrival and give the ball room to settle." },
  { title: "Keep It Close", goal: "Cushion the incoming ball into a position you can reach again.", success: "Reduce its pace and keep the ball within playable reach after the touch.", benefit: "Turn a reception into a controlled next action.", cue: "Watch the space between your car and the ball, not just its speed." },
  { title: "Choose the Exit", goal: "Guide the cushioned ball toward a nearby left or right target.", success: "Keep the reception close while directing it into the requested exit area.", benefit: "Receive into useful space instead of stopping without a plan.", cue: "Choose your exit before the ball arrives; use a small contact angle." },
  { title: "Match the Approach", goal: "Adapt the same controlled reception to different incoming speeds and angles.", success: "Cushion the ball into reachable space across varied ground-ball approaches.", benefit: "Handle imperfect passes without relying on one rehearsed setup.", cue: "Read the incoming line early and adjust your movement before contact." },
  { title: "Make the Next Touch", goal: "Cushion the ball, follow it and make a deliberate second contact.", success: "Complete a controlled reception, then reach the ball for a separate second touch.", benefit: "Connect the first touch to a pass, carry or next play.", cue: "Leave yourself a route to the ball rather than chasing a loose first touch." },
];

export const STATIC_BALL_PLAN = [
  { setup: "Start 700-1,100 uu from the ball, with up to 150 uu lateral offset and 10 degrees of heading variation.", feedback: "Contact or no contact, plus time to first touch." },
  { setup: "Start 800-1,200 uu away, with up to 200 uu lateral offset and 15 degrees of heading variation.", feedback: "Front, side, rear or roof contact; no contact on timeout." },
  { setup: "Start 900-1,300 uu away, with up to 250 uu lateral offset and 20 degrees of heading variation. Varied practice cycles nine approach lines up to 65 degrees left or right. A 600 uu-wide gate sits 1,400 uu beyond the ball on that line.", feedback: "Target hit, missed left, missed right, too high, wrong contact or no contact." },
  { setup: "Use the Place the Touch bounds and target a 28.8-43.2 km/h ground-speed band at the gate.", feedback: "Target accuracy and gate speed; too soft or too hard only when the target is hit." },
  { setup: "Use the Place the Touch bounds. After a target hit, follow within 600 uu for 0.5 seconds, grounded and facing within 30 degrees of the ball, within 3 seconds of crossing.", feedback: "Target accuracy, then controlled follow-through, too far away, facing away or not wheels-down." },
];

export const PHASES = [
  {
    id: "fundamentals", title: "Foundations", blurb: "Build car control and deliberate first touches.", tags: ["Foundation"], modes: [
      mechanic("driving", "Driving & Boost", "Beginner", MOVEMENT_TRAINING.driving.steps.map(step => step.title), "driving"),
      mechanic("dodges", "Jumps & Dodges", "Beginner", MOVEMENT_TRAINING.dodges.steps.map(step => step.title), "dodges"),
      ...["ball-static", "ball-roll-touch", "ball-soft", "ball-recovery"].map(id => {
        const drill = existing.get(id);
        return mechanic(id, drill.title, "Beginner", id === "ball-static" ? STATIC_BALL_MASTERY.map(step => step.title) : id === "ball-soft" ? SOFT_TOUCH_MASTERY.map(step => step.title) : id === "ball-roll-touch" ? ROLL_TOUCH_MASTERY.map(step => step.title) : RECOVERY_MASTERY.map(step => step.title), id,
          { tags: id === "ball-recovery" ? ["Ball", "Recovery"] : ["Ball"] });
      }),
    ]
  },
  {
    id: "recoveries", title: "Movement & Recoveries", blurb: "Turn efficiently, preserve speed and land ready.", tags: ["Recovery", "Competitive"], modes: [
      mechanic("powerslide", "Powerslide & Quick Turns", "Beginner", ["Release grip to turn tightly", "Blend steering with short powerslide holds", "Exit facing the next play", "Repeat at different speeds"]),
      mechanic("landing", "Landing Recovery", "Beginner", ["Recognise the landing surface", "Rotate wheels toward the surface", "Align with your momentum", "Land with powerslide"]),
      mechanic("air-roll-recovery", "Air Roll Recovery", "Beginner to Intermediate", ["Read your orientation before landing", "Use air roll to face the surface", "Align the wheels with your momentum", "Recover from wall and aerial touches"]),
      mechanic("flip-cancel", "Flip Cancel", "Beginner to Intermediate", ["Learn controlled front and backflips", "Apply opposite pitch to cancel rotation", "Compare early and late cancels", "Apply the technique to half flips and speed flips"], undefined, { tags: ["Flip Cancel"] }),
      mechanic("half-flip", "Half Flip Lab", "Beginner to Intermediate", ["Choose from six interactive teaching systems", "Learn the backflip, cancel, rotation and exit", "Compare normal-speed unaided results"], undefined, {
        tags: ["Flip Cancel"], available: true,
        load: () => import("./halfFlip.js"),
        create: (ctx, options, module) => new module.HalfFlipMode(ctx, options),
      }),
      mechanic("wavedash", "Wavedash", "Intermediate", ["Make a low jump", "Raise the nose before landing", "Dodge forward as the rear wheels touch", "Maintain momentum through the landing", "Progress to side and diagonal dashes"]),
      mechanic("speed-flip", "Speed Flip", "Advanced", ["Perform a shallow diagonal flip", "Immediately cancel with backward pitch", "Keep the nose on the intended line", "Recover wheels-down while boosting", "Compare arrival times from varied starts"], undefined, { tags: ["Flip Cancel", "Kickoff"] }),
      mechanic("chain-dash", "Chain Dashes", "Advanced", ["Keep each jump low", "Link dashes without losing momentum", "Vary direction while chaining", "Recover cleanly after the final dash"], undefined, { section: "Advanced variations" }),
      mechanic("wall-dash", "Wall Dashes", "Expert", ["Align the car along the wall", "Time a low jump and dodge into the surface", "Maintain wheel contact and forward speed", "Link wall dashes and exit safely"], undefined, { section: "Advanced variations", tags: ["Wall"] }),
    ]
  },
  {
    id: "ground-control", title: "Ground Control & Flicks", blurb: "Keep possession and turn a controlled carry into a finish.", tags: ["Ground", "Ball", "Competitive"], modes: [
      mechanic("catch", "Ball Catch", "Beginner to Intermediate", ["Match a falling ball's speed", "Cushion the first touch", "Settle the ball into a carry", "Repeat with varied trajectories"]),
      mechanic("ground-dribble", "Ground Dribble", "Intermediate", ["Balance the ball on the hood", "Match its speed with small inputs", "Carry through changes of pace", "Keep possession before a flick"]),
      mechanic("bounce-dribble", "Bounce Dribble", "Intermediate", ["Create a controlled bounce", "Match the ball between bounces", "Touch just after the bounce", "Change direction while maintaining rhythm", "Finish into a target"]),
      mechanic("dribble-turns", "Dribble Turns", "Intermediate", ["Carry the ball on a straight line", "Shift its position before turning", "Steer without rolling it off the hood", "Link turns in both directions"]),
      mechanic("flick-timing", "Flick Timing", "Intermediate", ["Establish a stable carry", "Place the ball for the launch", "Jump while retaining contact", "Compare immediate and delayed releases"]),
      mechanic("flick", "Front Flick", "Intermediate", ["Position the ball forward on the hood", "Jump into the carry", "Front flip to release the ball", "Control height, power and placement"]),
      mechanic("diagonal-flick", "Diagonal Flick", "Intermediate", ["Offset the ball on the hood", "Jump without losing the carry", "Dodge diagonally through the ball", "Aim both left and right"]),
      mechanic("45-flick", "45-Degree Flick", "Advanced", ["Set a stable hood carry", "Turn the car after jumping", "Release with a diagonal backflip", "Control power and placement"]),
      mechanic("angled-flicks", "90 / 180-Degree Flicks", "Advanced", ["Rotate farther during the jump", "Retain the ball through the turn", "Time the release at 90 and 180 degrees", "Repeat both turning directions"], undefined, { section: "Advanced variations" }),
      mechanic("delayed-flick", "Delayed Flick", "Advanced", ["Jump with a controlled carry", "Hold the ball while airborne", "Delay the dodge to change the release", "Finish before the dodge window expires"], undefined, { section: "Advanced variations" }),
      mechanic("musty-flick", "Musty Flick", "Expert", ["Position the ball for the scoop", "Pitch the nose downward after jumping", "Backflip through the ball", "Control the release into a target"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
      mechanic("breezi-flick", "Breezi Flick", "Expert", ["Begin from a controlled carry", "Rotate into the musty setup", "Keep the ball within reach", "Time the scoop and recover"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
    ]
  },
  {
    id: "shooting", title: "Shooting & Finishing", blurb: "Place deliberate shots with consistent power.", tags: ["Shooting", "Competitive"], modes: [
      mechanic("shooting", "Ground Shot Placement", "Beginner", ["Approach the ball on a controlled line", "Aim at near-post and far-post targets", "Adjust the contact point to change direction", "Repeat from varied angles"]),
      mechanic("power-shot", "Power Shots", "Intermediate", ["Build a direct approach", "Meet the ball with the nose", "Time the dodge through contact", "Balance power with placement"]),
      mechanic("hook-shot", "Hook Shots", "Intermediate", ["Approach from beside the ball", "Turn into a clean contact", "Generate power without losing the angle", "Repeat from both sides"]),
      mechanic("bounce-shot", "Bounce Shots & Half Volleys", "Intermediate", ["Read the bounce height", "Meet the ball just after the bounce", "Adjust the approach for a half volley", "Aim varied rebounds into targets"]),
      mechanic("air-roll-shot", "Air Roll Shots", "Advanced", ["Jump into the shooting approach", "Use air roll to present the striking corner", "Dodge through the intended line", "Recover after the finish"], undefined, { tags: ["Aerial", "Air Roll"] }),
      mechanic("redirect", "Redirects", "Advanced", ["Read the incoming ball", "Choose the redirection angle", "Meet the ball without overcommitting", "Progress from ground to aerial redirects"]),
      mechanic("aerial-finishing", "Aerial Finishing", "Advanced", ["Read the ball's flight", "Reach it with controlled boost", "Choose a purposeful contact point", "Place the finish and recover"], undefined, { tags: ["Aerial"] }),
      mechanic("double-touch", "Double Touches", "Expert", ["Set a readable backboard rebound", "Follow the first touch", "Adjust flight for the second contact", "Finish from varied rebound angles"], undefined, { tags: ["Aerial", "Backboard"] }),
    ]
  },
  {
    id: "air-roll", title: "Aerial Control", blurb: "Orientation first, then precision in flight.", tags: ["Aerial"], modes: [
      mechanic("basic-aerial", "Basic Aerial", "Beginner", ["Jump and pitch toward the target", "Use boost to build height", "Make small flight corrections", "Land safely after the approach"]),
      mechanic("fast-aerial", "Fast Aerial", "Intermediate", ["Jump and pitch upward", "Boost through the takeoff", "Release pitch before the second jump", "Reach a target without an accidental backflip", "Vary target height and direction"]),
      mechanic("ghost-align", "Target Pose", "Beginner", ["Match nose and roof to the ghost", "Hold the orientation steadily", "Repeat left and right adjustments", "Reduce assistance with harder poses"], "ghost-align"),
      mechanic("dar-sequences", "Air Roll Sequences", "Intermediate", ["Isolate pitch, yaw and roll", "Combine successive rotations", "Stop accurately at each pose", "Repeat sequences without overshooting"], "dar-sequences"),
      mechanic("directional-air-roll", "Directional Air Roll", "Intermediate to Advanced", ["Isolate left and right air roll", "Add pitch and yaw corrections", "Hold a flight line while rotating", "Change direction without losing control"], undefined, { tags: ["Air Roll"] }),
      mechanic("rings", "Rings", "Advanced", ["Fly through the first gate", "Control speed between gates", "Align before changing direction", "Complete the course consistently"], "rings"),
    ]
  },
  {
    id: "air-dribble", title: "Air Dribbles", blurb: "Build a controlled carry one touch at a time.", tags: ["Aerial", "Ball"], modes: [
      ...["dribble-pop", "dribble-boost", "dribble-hover", "dribble-wall", "dribble-steer"].map(id => {
        const drill = existing.get(id);
        return mechanic(id, drill.title, id === "dribble-steer" ? "Advanced" : "Intermediate", [drill.description, "Match the ball's velocity", "Keep touches soft and deliberate", "Repeat before varying the setup"], id, { tags: id === "dribble-wall" ? ["Wall"] : [] });
      }),
      mechanic("air-dribble-carry", "Soft Touches & Carries", "Advanced", ["Set a controlled aerial approach", "Meet the underside with soft touches", "Stay close while matching ball speed", "Carry toward varied targets"]),
      mechanic("air-dribble-bump", "Air Dribble Bump", "Expert", ["Carry the ball toward goal", "Read the defender's approach", "Separate to intercept the defender", "Keep the ball on a scoring line"], undefined, { section: "Advanced scenarios", tags: ["Competitive"] }),
    ]
  },
  {
    id: "wall", title: "Wall & Ceiling Play", blurb: "Read rebounds and move from surfaces into flight.", tags: ["Wall"], modes: [
      mechanic("wall-takeoff", "Wall Takeoffs", "Intermediate", ["Drive smoothly up the wall", "Read the ball's separation", "Jump clear of the surface", "Rotate toward the ball", "Land safely on wall or floor"]),
      mechanic("wall-shot", "Wall Shots", "Intermediate", ["Approach the ball along the wall", "Choose a clean striking angle", "Jump into the shot", "Recover onto wall or floor"], undefined, { tags: ["Shooting"] }),
      mechanic("wall-clear", "Wall Clears", "Intermediate", ["Read the incoming ball on the wall", "Choose a safe downfield direction", "Clear with controlled contact", "Recover for the next play"], undefined, { tags: ["Defense"] }),
      mechanic("wall-carry", "Wall Carries", "Intermediate", ["Guide the ball onto the wall", "Match its speed along the surface", "Keep controlled car-ball separation", "Choose a pass or aerial exit"]),
      mechanic("backboard", "Backboard Reads", "Advanced", ["Read the first rebound", "Choose a takeoff point", "Match the ball's height", "Meet varied rebound angles"], undefined, { tags: ["Backboard"] }),
      mechanic("backboard-clear", "Backboard Clears", "Advanced", ["Reach the defensive backboard", "Read the rebound before contact", "Clear toward a safe side", "Land ready for the follow-up"], undefined, { tags: ["Defense", "Backboard"] }),
      mechanic("ceiling-shot", "Ceiling Shots", "Expert", ["Set the ball up from the wall", "Reach the ceiling under control", "Fall away while preserving the flip", "Meet the ball on the descent", "Use the flip to finish"], undefined, { tags: ["Ceiling", "Shooting"] }),
      mechanic("ceiling-drop", "Ceiling Drops", "Advanced", ["Reach the ceiling with control", "Leave the surface without jumping", "Retain the dodge on descent", "Choose the timing of the next contact"], undefined, { tags: ["Ceiling"] }),
      mechanic("wall-redirect", "Wall Redirects", "Expert", ["Read a pass approaching the wall", "Separate from the surface", "Redirect into a target", "Recover after the airborne touch"], undefined, { section: "Advanced variations", tags: ["Shooting"] }),
      mechanic("ceiling-double-touch", "Ceiling Double Touches", "Expert", ["Set a ceiling approach", "Create a readable backboard rebound", "Follow the first contact", "Place the second touch into goal"], undefined, { section: "Advanced variations", tags: ["Ceiling", "Backboard", "Shooting"] }),
    ]
  },
  {
    id: "match", title: "Defense & Challenges", blurb: "Protect the goal and choose useful challenge windows.", tags: ["Defense", "Competitive"], modes: [
      mechanic("shadow", "Shadow Defense", "Intermediate", ["Match the attacker's speed", "Stay between the ball and goal", "Turn while maintaining defensive position", "Recognise the challenge window", "Recover after the challenge"]),
      mechanic("ground-save", "Ground Saves", "Beginner", ["Read the incoming shot", "Cover goal-line and front-post targets", "Save toward a safe area", "Recover for a second touch"]),
      mechanic("aerial-save", "Aerial Saves", "Intermediate", ["Read a high shot early", "Take off toward the interception", "Clear away from the goal mouth", "Land ready for the next shot"], undefined, { tags: ["Aerial"] }),
      mechanic("backboard-defense", "Backboard Defense", "Advanced", ["Cover the threatening rebound", "Choose a surface or aerial interception", "Deny the follow-up shot", "Recover without abandoning the goal"], undefined, { tags: ["Backboard", "Wall"] }),
      mechanic("safe-clear", "Safe Clears", "Intermediate", ["Read the pressure before contact", "Choose a safe outlet", "Generate controlled distance", "Avoid returning the ball to the attacker"]),
      mechanic("challenge-timing", "Challenge Timing", "Intermediate", ["Read the attacker's next touch", "Identify a reachable challenge window", "Commit without diving past the ball", "Recover when the challenge is beaten"]),
      mechanic("fake-challenge", "Fake Challenges", "Advanced", ["Approach to threaten a challenge", "Brake or turn before committing", "Read the forced touch", "Re-engage from a useful position"]),
      mechanic("recovery-save", "Recovery Saves", "Advanced", ["Recognise the shot after an awkward landing", "Recover toward an interception line", "Make the save with the available contact", "Prepare for a follow-up"], undefined, { tags: ["Recovery"] }),
    ]
  },
  {
    id: "kickoffs", title: "Kickoffs & 50/50s", blurb: "Control first contact and contested-ball outcomes.", tags: ["Kickoff", "Competitive"], modes: [
      mechanic("standard-kickoff", "Standard Kickoff", "Beginner", ["Approach the centre of the ball", "Manage boost through the run-up", "Time the final dodge into contact", "Recover after the first collision"]),
      mechanic("diagonal-kickoff", "Diagonal Kickoff", "Intermediate", ["Choose the line from a diagonal spawn", "Keep the car aligned with the ball", "Time the contact dodge", "Repeat from both sides"]),
      mechanic("speed-flip-kickoff", "Speed Flip Kickoff", "Advanced", ["Apply a consistent speed flip", "Keep boost aligned with the run-up", "Reach a controlled final contact", "Compare outcomes rather than arrival alone"], undefined, { tags: ["Flip Cancel"] }),
      mechanic("delayed-kickoff", "Delayed Kickoff", "Intermediate", ["Vary arrival time deliberately", "Read the opponent's contact", "Meet the ball on a useful line", "Recover if the delay loses possession"]),
      mechanic("wavedash-kickoff", "Wavedash Kickoff", "Advanced", ["Set up a controlled kickoff contact", "Land into a timed wavedash", "Carry momentum into the next play", "Repeat across spawn positions"]),
      mechanic("kickoff-recovery", "Kickoff Recovery", "Intermediate", ["Read the kickoff collision", "Rotate toward the landing surface", "Preserve useful momentum", "Choose ball pressure or a safe exit"], undefined, { tags: ["Recovery"] }),
      mechanic("ground-50", "Ground 50/50s", "Intermediate", ["Stay behind the intended contact line", "Use car position to block the opponent", "Practise low, front and side contacts", "Control the ball's exit direction"], undefined, { tags: ["Ground", "Challenge"] }),
      mechanic("air-50", "Aerial 50/50s", "Advanced", ["Match the contested ball's height", "Present a useful blocking surface", "Control the exit direction through contact", "Recover after the aerial collision"], undefined, { tags: ["Aerial", "Challenge"] }),
      mechanic("kickoff-cheat", "Kickoff Cheat", "Intermediate", ["Follow behind the kickoff taker", "Read the first contact before committing", "Reach a loose ball without overextending", "Retreat when the opponent wins possession"], undefined, { section: "Team scenarios", tags: ["Team"] }),
    ]
  },
  {
    id: "resets", title: "Flip Resets", blurb: "Earn the flip, keep control, then use it.", tags: ["Aerial", "Reset"], modes: [
      mechanic("flip-reset", "Basic Flip Reset", "Advanced to Expert", ["Fly inverted near the ball", "Align all four wheels with the underside", "Match the ball's velocity", "Make four-wheel contact to earn a reset", "Separate while retaining control"]),
      mechanic("reset-control", "Reset Control", "Expert", ["Earn a repeatable reset", "Separate without pushing the ball away", "Reorient while retaining the flip", "Choose the next contact deliberately"]),
      mechanic("reset-shot", "Reset Shot", "Expert", ["Earn a controlled reset", "Set the ball ahead of the car", "Use the stored flip to finish", "Aim at varied goal targets"], undefined, { tags: ["Shooting"] }),
      mechanic("reset-flick", "Reset Flick", "Expert", ["Earn a reset near the ball", "Position the ball for a flick", "Release the stored dodge through contact", "Control the finish"]),
      mechanic("pop-reset", "Pop Reset", "Expert", ["Match the underside of the ball", "Earn the reset with a controlled pop", "Follow the separation", "Use the flip for the next touch"]),
      mechanic("musty-reset", "Musty Reset", "Expert", ["Earn a reset with controlled separation", "Rotate into the musty setup", "Backflip through the ball", "Place the finish"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
      mechanic("stall-reset", "Stall Reset", "Expert", ["Practise a consistent stall input", "Align wheels beneath the ball", "Use the stall to manage contact", "Separate with the reset retained"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
      mechanic("ceiling-reset", "Ceiling Reset", "Expert", ["Reach the ceiling under control", "Regain a dodge through surface contact", "Separate and approach the ball", "Use the retained dodge to finish"], undefined, { section: "Advanced variations", tags: ["Ceiling"] }),
      mechanic("reset-flip-variations", "Side / Backflip Resets", "Expert", ["Earn a controlled reset", "Choose a side-flip or backflip release", "Reposition for a useful follow-up", "Practise both directional variations"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
      mechanic("double-flip-reset", "Double Flip Reset", "Expert", ["Earn the first reset", "Use the flip to reposition", "Align all four wheels for a second reset", "Finish with the second flip"], undefined, { section: "Advanced variations" }),
      mechanic("double-reset", "Chained Resets", "Expert", ["Earn a controlled first reset", "Use the flip to reposition beneath the ball", "Match speed and align all four wheels again", "Link successive resets", "Finish without losing control"], undefined, { section: "Advanced variations", tags: ["Freestyle"] }),
    ]
  },
  {
    id: "pinches", title: "Pinches", blurb: "Compression, approach angle and precise timing.", tags: ["Pinch", "Specialist"], modes: [
      mechanic("ground-pinch", "Ground Pinch", "Advanced", ["Recognise the ball-floor compression point", "Approach a stationary ball", "Time the dodge into the ball and floor", "Generate repeatable exit speed", "Aim at a target", "Repeat with a moving ball"], undefined, { tags: ["Ground"] }),
      mechanic("kuxir-pinch", "Kuxir Pinch", "Expert", ["Carry the ball along the side wall", "Create car-ball separation", "Align with the ball-wall compression point", "Time the dodge into the contact", "Generate consistent power", "Aim downfield from varied setups"], undefined, { tags: ["Wall"] }),
      mechanic("ceiling-pinch", "Ceiling Pinch", "Expert", ["Lift the ball toward the ceiling", "Match its upward trajectory", "Align above the ball", "Compress the ball against the ceiling", "Control the downfield exit"], undefined, { tags: ["Ceiling"] }),
    ]
  },
].map(phase => ({ ...phase, modes: phase.modes.map(mode => ({ ...mode, tags: [...new Set([...phase.tags, ...(mode.tags ?? [])])] })) }));

export const FREE_PLAY = existing.get("arena");
export const ARENA_1V1 = {
  id: "arena-1v1", title: "Arena 1v1", description: "Five-minute soccar against Nexto.", available: true,
  load: () => import("./arena1v1.js"),
  create: (ctx, options, module) => new module.Arena1v1Mode(ctx),
};
export const GAME_MODES = [FREE_PLAY, ARENA_1V1, ...PHASES.flatMap(phase => phase.modes)];

export { GHOST_ALIGN_DIFFICULTIES };
