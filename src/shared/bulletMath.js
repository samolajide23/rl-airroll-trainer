import { Vector3 } from "three";

const round = Math.fround;
export const bulletDot = (first, second) => round(round(first.x * second.x) + round(round(first.y * second.y) + round(first.z * second.z)));
export const bulletCross = (first, second) => new Vector3(
  round(round(first.y * second.z) - round(first.z * second.y)),
  round(round(first.z * second.x) - round(first.x * second.z)),
  round(round(first.x * second.y) - round(first.y * second.x)));
export const bulletSubtract = (first, second) => new Vector3(...["x", "y", "z"].map(axis => round(first[axis] - second[axis])));
export const bulletAdd = (first, second) => new Vector3(...["x", "y", "z"].map(axis => round(first[axis] + second[axis])));
export const bulletScale = (vector, scalar) => new Vector3(...["x", "y", "z"].map(axis => round(vector[axis] * scalar)));

export function normalizeSse(vector, squared = bulletDot(vector, vector)) {
  const exponent = Math.floor(Math.log2(squared));
  const parity = exponent - 2 * Math.floor(exponent / 2);
  const mantissa = squared / 2 ** exponent;
  const bin = Math.floor((mantissa - 1) * 1024);
  const midpoint = (1 + (bin + 0.5) / 1024) * 2 ** parity;
  const estimate = round(Math.round(8192 / Math.sqrt(midpoint)) / 8192 * 2 ** -Math.floor(exponent / 2));
  const half = round(squared * 0.5);
  const firstProduct = round(half * estimate);
  const secondProduct = round(firstProduct * estimate);
  const inverse = round(estimate * round(1.5 - secondProduct));
  for (const axis of ["x", "y", "z"]) vector[axis] = round(vector[axis] * inverse);
  return vector;
}