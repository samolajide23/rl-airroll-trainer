export const GHOST_ALIGN_DIFFICULTIES = [
  {
    id: "easy", label: "Easy",
    description: "Nose pointed skyward — practice DAR while flying straight up.",
    alignThreshold: 0.82, holdTime: 0.2, pitchSpan: 0, rollSpan: Math.PI * 2,
    keepUpright: false, poseMode: "noseUp",
  },
  {
    id: "medium", label: "Medium",
    description: "Balanced precision — tipped and sideways poses.",
    alignThreshold: 0.92, holdTime: 0.35, pitchSpan: Math.PI * 0.85, rollSpan: Math.PI * 0.85,
    keepUpright: false, poseMode: "random",
  },
  {
    id: "hard", label: "Hard",
    description: "Tight match, longer hold, full random (incl. inverted).",
    alignThreshold: 0.97, holdTime: 0.55, pitchSpan: Math.PI, rollSpan: Math.PI,
    keepUpright: false, poseMode: "random",
  },
];