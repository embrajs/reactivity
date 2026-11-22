import { describe, expect, it } from "vitest";
import { computed, derived, reactiveList, readable, watch, writable } from "../src";

describe("serialization (toJSON, toString, valueOf)", () => {
  it("supports JSON.stringify on writable, readable, computed, derived, and nested signals", () => {
    const inner$ = writable({ count: 2 });
    const outer$ = writable(inner$);
    const [r$, setR] = readable("ok");
    const c$ = computed(() => inner$.get().count * 10);
    const d$ = derived(c$, (n) => ({ total: n }));
    const date$ = writable(new Date("2026-01-01T00:00:00.000Z"));

    expect(JSON.stringify({ outer: outer$, r: r$, c: c$, d: d$, date: date$ })).toBe(
      '{"outer":{"count":2},"r":"ok","c":20,"d":{"total":20},"date":"2026-01-01T00:00:00.000Z"}',
    );

    setR("done");
    expect(r$.toJSON()).toBe("done");
    expect(outer$.toJSON()).toEqual({ count: 2 });

    const null$ = writable(null);
    expect(null$.toJSON()).toBeNull();
  });

  it("supports toString and valueOf, including Symbol values", () => {
    const n$ = writable(42);
    const sym$ = writable(Symbol("tag"));

    expect(`${n$}`).toBe("42");
    expect(String(n$)).toBe("42");
    expect((n$ as unknown as number) + 8).toBe(50);
    expect(n$.valueOf()).toBe(42);
    expect(sym$.toString()).toBe("Symbol(tag)");
  });

  it("tracks dependencies when toJSON, toString, or valueOf is called inside computed or watch", () => {
    const a$ = writable(1);
    const list = reactiveList([10, 20]);

    const json$ = computed(() => JSON.stringify({ a: a$, list }));
    expect(json$.get()).toBe('{"a":1,"list":[10,20]}');

    a$.set(2);
    list.push(30);
    expect(json$.get()).toBe('{"a":2,"list":[10,20,30]}');

    let lastStr = "";
    const stop = watch(
      () => {
        lastStr = `${a$}`;
      },
      { sync: true },
    );
    expect(lastStr).toBe("2");
    a$.set(3);
    expect(lastStr).toBe("3");
    stop();
  });
});
