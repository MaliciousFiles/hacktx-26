import { describe, expect, it } from "vitest";
import { decodeEntities, htmlToPlainText, textSpanLocator, uniqueSpan } from "./document";

describe("deterministic HTML helpers", () => {
  it("strips tags and decodes entities without inventing words", () => {
    const html = `<html><body><div>Yeas &#x2014; Bell, C.; Mu&ntilde;oz</div><script>evil()</script></body></html>`;
    // &ntilde; is not in the small entity table — numeric/hex and core entities only.
    const plain = htmlToPlainText(`<html><body><div>Yeas &#x2014; Bell, C.; Mu&#xF1;oz</div><script>evil()</script></body></html>`);
    expect(plain).toBe("Yeas — Bell, C.; Muñoz");
    expect(plain).not.toContain("evil");
    void html;
  });

  it("requires unique spans for provenance needles", () => {
    expect(uniqueSpan("Alders; Buckley; Cain", "Buckley").locator).toBe("text:8-15");
    expect(() => uniqueSpan("Harris; Harris Davila", "Harris")).toThrow(/not unique/);
    expect(textSpanLocator(0, 4)).toBe("text:0-4");
  });

  it("decodes only explicit entities", () => {
    expect(decodeEntities("A &amp; B &#65;")).toBe("A & B A");
  });
});
