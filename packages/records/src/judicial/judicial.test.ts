import { describe, expect, it } from "vitest";
import { findJusticeAttribution, opinionDateFromText } from "./shared";
import { parseScotxIndex } from "./scotx";

describe("deterministic judicial extractors", () => {
  it("attributes only an explicit justice byline", () => {
    const plain = "Delivered March 14, 2025\nJustice Blacklock delivered the opinion of the Court.\n";
    expect(opinionDateFromText(plain)).toBe("2025-03-14");
    expect(findJusticeAttribution(plain, ["Blacklock"])).toMatchObject({
      kind: "authored",
      label: "Blacklock",
    });
    expect(findJusticeAttribution(plain, ["Hecht"])).toBeUndefined();
  });

  it("parses dissent/concurrence short forms", () => {
    const plain = "Boyd, J., dissenting.\nLehrmann, J., concurring.";
    expect(findJusticeAttribution(plain, ["Boyd"])?.kind).toBe("dissented");
    expect(findJusticeAttribution(plain, ["Lehrmann"])?.kind).toBe("concurred");
  });

  it("harvests only official txcourts opinion/order links", () => {
    const html = `
      <html><body>
        <a href="/media/opinion.pdf">Opinion</a>
        <a href="https://example.com/evil.pdf">Ignore</a>
        <a href="https://search.txcourts.gov/SearchMedia.aspx?MediaVersionID=1">Order</a>
      </body></html>`;
    const links = parseScotxIndex(html, "https://www.txcourts.gov/supreme/orders-opinions/");
    expect(links.map((link) => link.href)).toEqual([
      "https://www.txcourts.gov/media/opinion.pdf",
      "https://search.txcourts.gov/SearchMedia.aspx?MediaVersionID=1",
    ]);
  });
});
