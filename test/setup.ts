import { afterEach } from "vitest";

const globals = globalThis as { __DEV__?: boolean };
globals.__DEV__ = true;

export function setDevMode(enabled: boolean): void {
  globals.__DEV__ = enabled;
}

afterEach(() => {
  globals.__DEV__ = true;
});
