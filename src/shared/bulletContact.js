import { Vector3 } from "three";
import { bulletAdd as add, bulletSubtract as subtract, bulletScale as scale, bulletDot as dot } from "./bulletMath.js";

const round = Math.fround;

function triangleWeights(first, second, third) {
  const edgeSecond = subtract(second, first), edgeThird = subtract(third, first);
  const towardOrigin = scale(first, -1);
  const firstSecond = dot(edgeSecond, towardOrigin), firstThird = dot(edgeThird, towardOrigin);
  if (firstSecond <= 0 && firstThird <= 0) return [1, 0, 0];
  const fromSecond = scale(second, -1);
  const secondSecond = dot(edgeSecond, fromSecond), secondThird = dot(edgeThird, fromSecond);
  if (secondSecond >= 0 && secondThird <= secondSecond) return [0, 1, 0];
  const areaThird = round(round(firstSecond * secondThird) - round(secondSecond * firstThird));
  if (areaThird <= 0 && firstSecond >= 0 && secondSecond <= 0) {
    const weight = round(firstSecond / round(firstSecond - secondSecond));
    return [round(1 - weight), weight, 0];
  }
  const fromThird = scale(third, -1);
  const thirdSecond = dot(edgeSecond, fromThird), thirdThird = dot(edgeThird, fromThird);
  if (thirdThird >= 0 && thirdSecond <= thirdThird) return [0, 0, 1];
  const areaSecond = round(round(thirdSecond * firstThird) - round(firstSecond * thirdThird));
  if (areaSecond <= 0 && firstThird >= 0 && thirdThird <= 0) {
    const weight = round(firstThird / round(firstThird - thirdThird));
    return [round(1 - weight), 0, weight];
  }
  const areaFirst = round(round(secondSecond * thirdThird) - round(thirdSecond * secondThird));
  const secondDifference = round(secondThird - secondSecond), thirdDifference = round(thirdSecond - thirdThird);
  if (areaFirst <= 0 && secondDifference >= 0 && thirdDifference >= 0) {
    const weight = round(secondDifference / round(secondDifference + thirdDifference));
    return [0, round(1 - weight), weight];
  }
  const inverse = round(1 / round(round(areaFirst + areaSecond) + areaThird));
  const secondWeight = round(areaSecond * inverse), thirdWeight = round(areaThird * inverse);
  return [round(round(1 - secondWeight) - thirdWeight), secondWeight, thirdWeight];
}

export function sphereBoxWitness(boxCenter, basis, half, margin, sphereCenter, radius) {
  const offset = scale(add(boxCenter, sphereCenter), 0.5);
  const boxOrigin = subtract(boxCenter, offset), sphereOrigin = subtract(sphereCenter, offset);
  const rows = ["x", "y", "z"].map(axis => new Vector3(...basis.map(vector => vector[axis])));
  const simplex = [];
  let direction = new Vector3(0, 1, 0), squaredDistance = round(1e18);
  let pointBox, pointSphere, lastDifference;
  for (let iteration = 0; iteration < 1000; iteration++) {
    const support = new Vector3(...basis.map((vector, index) => dot(vector, scale(direction, -1)) >= 0 ? half[index] : -half[index]));
    const boxPoint = add(boxOrigin, new Vector3(...rows.map(row => dot(row, support))));
    const difference = subtract(boxPoint, sphereOrigin);
    const delta = dot(direction, difference);
    if (simplex.some(vertex => {
      const separation = subtract(vertex.difference, difference);
      return dot(separation, separation) <= round(0.0001);
    }) || lastDifference?.equals(difference)) break;
    if (round(squaredDistance - delta) <= round(squaredDistance * round(1e-6))) break;
    simplex.push({ difference, boxPoint, spherePoint: sphereOrigin });
    lastDifference = difference;
    if (simplex.length === 1) {
      pointBox = boxPoint;
      pointSphere = sphereOrigin;
    } else {
      let weights;
      if (simplex.length === 2) {
        const edge = subtract(simplex[1].difference, simplex[0].difference);
        const projection = dot(edge, scale(simplex[0].difference, -1));
        const squared = dot(edge, edge);
        const weight = projection > 0 ? projection < squared ? round(projection / squared) : 1 : 0;
        weights = [round(1 - weight), weight];
        pointBox = add(simplex[0].boxPoint, scale(subtract(simplex[1].boxPoint, simplex[0].boxPoint), weight));
        pointSphere = add(simplex[0].spherePoint, scale(subtract(simplex[1].spherePoint, simplex[0].spherePoint), weight));
      } else if (simplex.length === 3) {
        weights = triangleWeights(...simplex.map(vertex => vertex.difference));
        pointBox = add(add(scale(simplex[0].boxPoint, weights[0]), scale(simplex[1].boxPoint, weights[1])), scale(simplex[2].boxPoint, weights[2]));
        pointSphere = add(add(scale(simplex[0].spherePoint, weights[0]), scale(simplex[1].spherePoint, weights[1])), scale(simplex[2].spherePoint, weights[2]));
      } else return null;
      for (let index = simplex.length - 1; index >= 0; index--) {
        if (weights[index] !== 0) continue;
        simplex[index] = simplex[simplex.length - 1];
        simplex.pop();
      }
    }
    const nextDirection = subtract(pointBox, pointSphere);
    const nextSquared = dot(nextDirection, nextDirection);
    if (nextSquared < round(1e-6)) return null;
    const previousSquared = squaredDistance;
    squaredDistance = nextSquared;
    if (round(previousSquared - squaredDistance) <= round(round(2 ** -23) * previousSquared)) break;
    direction = nextDirection;
  }
  if (!pointBox || !pointSphere) return null;
  const length = round(Math.sqrt(dot(direction, direction)));
  const inverseLength = round(1 / length);
  const normal = scale(direction, inverseLength);
  const distance = round(round(1 / inverseLength) - round(margin + radius));
  const spherePoint = add(add(pointSphere, scale(direction, round(radius / round(Math.sqrt(squaredDistance))))), offset);
  const boxPoint = add(spherePoint, scale(normal, distance));
  return { normal, boxPoint, spherePoint, distance };
}