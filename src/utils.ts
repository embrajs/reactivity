export function arrayShallowEqual(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) {
    return true;
  }
  if (!Array.isArray(previous) || !Array.isArray(next)) {
    return false;
  }
  const length = previous.length;
  if (length !== next.length) {
    return false;
  }
  for (let i = 0; i < length; i++) {
    if (!Object.is(previous[i], next[i])) {
      return false;
    }
  }
  return true;
}
