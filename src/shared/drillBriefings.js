export const objectiveBriefings = {
  dodges: [
    ['Jump once and land on your wheels.', ['One jump only', 'Clear 60 uu of height', 'Land steadily', 'No boost']],
    ['Hold jump to go higher, then land.', ['Hold jump for 0.18 seconds', 'Clear 180 uu of height', 'Land on your wheels', 'No second jump or boost']],
    ['Jump twice without flipping.', ['Release, then press jump again', 'Keep directional input neutral', 'Clear 250 uu and land steadily', 'No boost']],
    ['Flip forward and land steadily.', ['Forward dodge', 'Travel at least 400 uu forward', 'Land on your wheels', 'No boost']],
    ['Flip in the requested direction.', ['Follow the direction shown', 'Travel at least 300 uu that way', 'Land on your wheels', 'No boost']],
  ],
  'ball-static': [
    ['Drive into the ball.', ['Touch it before time runs out']],
    ['Hit the ball with your nose.', ['First touch uses the front of the car']],
    ['Hit the ball through the gate.', ['Use the front of the car', 'One touch through the requested gate']],
    ['Hit the gate at the requested pace.', ['Use the front of the car', 'Hit the gate', 'Ball speed: 28.8-43.2 km/h']],
    ['Hit the gate, then follow the ball.', ['Use the front of the car', 'Hit the gate', 'Stay within 600 uu for half a second', 'Keep wheels down and face the ball']],
  ],
  'ball-soft': [
    ['Soften the incoming ball.', ['Slow its incoming speed by at least 40%']],
    ['Soften the ball and stay close.', ['Slow it by at least 40%', 'Stay within 450 uu for half a second']],
    ['Receive the ball into the marked exit.', ['Soften the first touch', 'Stay close for half a second', 'Reach the requested exit within 3 seconds']],
    ['Receive arrivals from different angles.', ['Slow the ball by at least 40%', 'Stay within 450 uu for half a second']],
    ['Soften the ball, then touch it again.', ['Soften the first touch', 'Stay close for half a second', 'Make a separate ground touch within 3 seconds']],
  ],
  'ball-roll-touch': [
    ['Air roll into the ball.', ['Deliberately roll before contact', 'Touch the ball while airborne']],
    ['Roll upright before touching the ball.', ['Air roll before contact', 'Arrive upright', 'Touch while airborne']],
    ['Roll upright and strike with your nose.', ['Air roll before contact', 'Arrive upright and airborne', 'Use the front of the car']],
    ['Make a controlled aerial front touch.', ['Roll upright before contact', 'Use the front of the car', 'Ball speed: 10.8-32.4 km/h']],
    ['Make the aerial touch, then land.', ['Controlled front touch at 10.8-32.4 km/h', 'Land upright within 3 seconds', 'Stay steady for 0.35 seconds']],
  ],
  'ball-recovery': [
    ['Rotate onto your wheels before landing.', ['Land within 4 seconds', 'Stay upright and steady for 0.35 seconds']],
    ['Land facing the way you are moving.', ['Stable wheels-down landing', 'Face your travel direction', 'Keep at least 10.8 km/h']],
    ['Land, then keep driving forward.', ['Land steadily along your travel', 'Keep at least 10.8 km/h', 'Drive 150 uu forward within 1.5 seconds']],
    ['Touch the ball in the air, then land.', ['One airborne touch', 'Land within 3 seconds of contact', 'Stay upright and steady']],
    ['Touch, land, and drive out.', ['One airborne touch', 'Land along your travel within 3 seconds', 'Drive 150 uu forward within 1.5 seconds']],
  ],
};

export function drillBriefing(variant, index, step) {
  const id = { static: 'ball-static', soft: 'ball-soft', rollTouch: 'ball-roll-touch', recovery: 'ball-recovery' }[variant] || variant;
  const briefing = objectiveBriefings[id]?.[index];
  return { title: briefing?.[0] || step.goal, detail: (briefing?.[1] || step.requirements)?.join(' / ') || step.success };
}