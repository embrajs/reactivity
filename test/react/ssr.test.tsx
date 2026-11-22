import { writable } from "@embra/reactivity";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Reactive,
  useComputed,
  useComputedValue,
  useDerived,
  useDerivedValue,
  useReadable,
  useValue,
  useWatch,
  useWritable,
} from "../../src/react";

describe("SSR (node environment)", () => {
  it("renders all hooks and <Reactive> cleanly via renderToString", () => {
    const count$ = writable(3);

    function App() {
      const localW$ = useWritable(10);
      const [localR$] = useReadable(20);
      const val = useValue(count$);
      const plain = useValue("ok");
      const compVal = useComputedValue(() => count$.value + localW$.value);
      const derVal = useDerivedValue([count$, localR$], (c, r) => c + r);
      const compNode$ = useComputed(() => count$.value * 2);
      const derNode$ = useDerived(count$, (c) => c * 3);
      useWatch(() => undefined);

      return (
        <div>
          {`${val}|${plain}|${compVal}|${derVal}|${useValue(compNode$)}|${useValue(derNode$)}|`}
          <Reactive>{() => count$.value * 10}</Reactive>
        </div>
      );
    }

    const html = renderToString(<App />).replaceAll("<!-- -->", "");
    expect(html).toContain("3|ok|13|23|6|9|30");
  });
});
