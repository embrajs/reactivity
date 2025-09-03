import { isReadable, isWritable } from "../utils";

/**
 * Enables custom formatting for Readable and Writable objects in Chrome DevTools.
 * It is enabled in development by default.
 *
 * @see {@link https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html}
 */
export function customFormatter(): void {
  if (typeof window === "undefined") {
    return;
  }

  const valStyle = { style: "color:#a225c2" };
  const numberStyle = { style: "color:#268bd2" };
  const stringStyle = { style: "color:#e28c5f" };
  const keywordStyle = { style: "color:#eb2f96" };

  // custom formatter for Chrome
  // https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html
  const formatter = {
    header: (obj: unknown) =>
      isReadable(obj)
        ? ["div", valStyle, `${isWritable(obj) ? "Writable" : "Readable"}`, `<`, formatValue(obj.value), `>`]
        : null,
    hasBody: () => false,
  };

  function formatValue(v: unknown) {
    if (typeof v === "number") {
      return ["span", numberStyle, v];
    } else if (typeof v === "string") {
      return ["span", stringStyle, v];
    } else if (typeof v === "boolean") {
      return ["span", keywordStyle, v];
    } else if (typeof v === "object" && v !== null) {
      return ["object", { object: v }];
    } else {
      return ["span", stringStyle, String(v)];
    }
  }

  ((window as any).devtoolsFormatters ??= []).push(formatter);
}
