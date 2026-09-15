export { EXPLORER } from "./config";
export function shortAddressSafe(a: string, size = 4) {
  return a.length <= size * 2 + 1 ? a : `${a.slice(0, size)}…${a.slice(-size)}`;
}
