import { useLayoutEffect, useEffect } from "react";

/* c8 ignore next 2 -- @preserve */
export const useIsomorphicLayoutEffect = /* @__PURE__ */ (() =>
  typeof document !== "undefined" ? useLayoutEffect : useEffect)();
