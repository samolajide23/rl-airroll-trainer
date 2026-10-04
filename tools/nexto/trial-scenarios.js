export function mirrorTrialScenario(scenario) {
  const rotate = values => [-values[0], -values[1], values[2]];
  return { ...scenario, cars: [...scenario.cars].reverse().map(car => ({ ...car,
    position: rotate(car.position), yaw: car.yaw + Math.PI })),
    ball: { position: rotate(scenario.ball.position), velocity: rotate(scenario.ball.velocity) } };
}

export function createTrialScenarios(seed = 1) {
  let state = seed >>> 0;
  let index = 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const car = (x, y, z = 17, boost = 33.333333) => ({
    position: [x, y, z], yaw: Math.atan2(-y, -x), boost,
  });
  const spawns = [[0, 4608], [256, 3840], [-256, 3840], [2048, 2560], [-2048, 2560]];
  return () => {
    const kind = index++ % 5;
    const side = random() < 0.5 ? -1 : 1;
    const lateral = Math.round((random() * 2 - 1) * 1200);
    const ball = { position: [0, 0, 93.15], velocity: [0, 0, 0] };
    if (kind === 0) {
      const first = spawns[Math.floor(random() * spawns.length)];
      const second = spawns[Math.floor(random() * spawns.length)];
      return { name: 'kickoff', cars: [car(first[0], -first[1]), car(second[0], second[1])], ball,
        scriptedKickoff: first[0] === 0 && second[0] === 0 };
    }
    if (kind === 1) {
      ball.position = [lateral, side * 1500, 93.15];
      return { name: 'attack', cars: [car(lateral, side * 500), car(-lateral, side * 4000)], ball };
    }
    if (kind === 2) {
      ball.position = [lateral, side * 3000, 93.15];
      ball.velocity = [side * 150, side * 1400, 0];
      return { name: 'defense', cars: [car(lateral, side * 4400), car(-lateral, side * 1200)], ball };
    }
    if (kind === 3) {
      ball.position = [lateral, 0, 500];
      ball.velocity = [side * 300, side * 400, 200];
      const airborne = car(lateral, -side * 1000, 650, 60);
      airborne.inverted = true;
      return { name: 'recovery', cars: [airborne, car(-lateral, side * 2500)], ball };
    }
    ball.position = [lateral, side * 500, 93.15];
    return { name: 'low-boost', cars: [car(-lateral, -3000, 17, 0), car(lateral, 3000, 17, 0)], ball };
  };
}