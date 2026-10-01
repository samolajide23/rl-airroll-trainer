# Training Garage

Play opens ten ordered categories. Each category opens a mechanic list;
each mechanic opens its ordered training steps. Back returns one level.

Existing drills retain their launchers and difficulty selection. Recent attempt
results are displayed where recorded. Continue Training resumes the last
successfully launched drill; this is not a mastery or lesson-completion score.

Planned mechanics expose their curriculum and a Free Play action, not a simulated
lesson. Half flips, wavedashes, pinches, resets and match scenarios still need
dedicated setups, detectors, feedback and progression gates. The displayed steps
are learning objectives, not separately playable stages yet.

Categories: Car Fundamentals, Recoveries & Movement, Ball Fundamentals, Ground
Control, Aerial Control, Wall & Ceiling Play, Air Dribbles, Pinches, Flip Resets,
and Match Skills. Individual levels describe difficulty; category order is a
recommended path rather than a prerequisite lock.

Catalogue validation: `node --test tools/physics-compare/catalog.test.mjs`.