import { describe, expect, it } from "vitest";
import {
  absolutizeUrl,
  buildSourceDocument,
  hashNode,
  isSchemeCircular,
  paginateListing,
  parseListingPage,
  sha256Hex,
  upsertSourceDocuments,
} from "./feeds.js";

function pageJson(nids: number[], totalPages = 1, page = 1): string {
  return JSON.stringify({
    meta: {
      total_items: nids.length,
      total_pages: totalPages,
      current_page: page,
      per_page: 20,
      content_type: "circular",
    },
    meta_tags: {},
    data: {
      content_type_name: "circular",
      nodes: nids.map((nid) => ({
        nid,
        title: `योजना circular ${nid}`,
        display_date: "2026-01-01",
        department: "समाज विकास",
        url: `/node/${nid}`,
      })),
    },
  });
}

describe("discover feeds (plan §12 discover)", () => {
  it("parses the CMS response shape and enforces meta/data", () => {
    const parsed = parseListingPage(JSON.parse(pageJson([1, 2])));
    expect(parsed.meta.total_items).toBe(2);
    expect(parsed.nodes).toHaveLength(2);
    expect(() => parseListingPage({})).toThrow(/meta\/data/);
    // Live API: 0-result filters return { message: "No records found" } -> empty page.
    const none = parseListingPage({ message: "No records found" });
    expect(none.nodes).toEqual([]);
    expect(none.meta.total_items).toBe(0);
    // Live API: a matched filter with no `nodes` key -> empty node list, not a throw.
    const noNodes = parseListingPage({ meta: { total_items: 0, total_pages: 0, current_page: 1, per_page: 0, content_type: "circular" }, data: { content_type_name: "circular" } });
    expect(noNodes.nodes).toEqual([]);
  });

  it("filters circulars by Marathi dept or title terms", () => {
    expect(isSchemeCircular({ department: "आरोग्य", title: "x" })).toBe(true);
    expect(isSchemeCircular({ title: "शिष्यवृत्ती वाटप" })).toBe(true);
    expect(
      isSchemeCircular({ department: "roads", title: "road repair" }),
    ).toBe(false);
  });

  it("filters circulars by English dept/title (live CMS shape)", () => {
    expect(
      isSchemeCircular({ department: "Health Department", title: "x" }),
    ).toBe(true);
    expect(isSchemeCircular({ title: "Scholarship for girl students" })).toBe(
      true,
    );
    expect(
      isSchemeCircular({ department: "Land Acquisition", title: "NOC for building permission" }),
    ).toBe(false);
  });

  it("sha256 is stable and changes on one byte", () => {
    const node = { nid: 1, title: "योजना" };
    expect(hashNode(node)).toBe(hashNode({ nid: 1, title: "योजना" }));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
    expect(hashNode({ nid: 1, title: "a" })).not.toBe(
      hashNode({ nid: 1, title: "b" }),
    );
  });

  it("absolutizes relative node + file paths against the PMC CMS base", () => {
    expect(absolutizeUrl("/node/42428")).toBe(
      "https://webadmin.pmc.gov.in/node/42428",
    );
    expect(
      absolutizeUrl("/sites/default/files/circular/Circular_5.pdf"),
    ).toBe(
      "https://webadmin.pmc.gov.in/sites/default/files/circular/Circular_5.pdf",
    );
    expect(absolutizeUrl("https://webadmin.pmc.gov.in/x.pdf")).toBe(
      "https://webadmin.pmc.gov.in/x.pdf",
    );
    expect(absolutizeUrl(null)).toBeUndefined();
  });

  it("builds the source_documents upsert shape keyed on nid (string)", () => {
    const row = buildSourceDocument(
      {
        nid: 42428,
        title: "t",
        display_date: "1 October 2026",
        url: "/node/42428",
        file: "https://webadmin.pmc.gov.in/sites/default/files/circular/Circular_5.pdf",
      },
      "circular",
    );
    expect(row.source_system).toBe("pmc_webadmin_circular");
    expect(row.external_id).toBe("42428");
    expect(row.title).toBe("t");
    expect(row.published_at).toBe("1 October 2026");
    expect(row.source_url).toBe("https://webadmin.pmc.gov.in/node/42428");
    expect(row.file_url).toBe(
      "https://webadmin.pmc.gov.in/sites/default/files/circular/Circular_5.pdf",
    );
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("absolutizes a relative file path and falls back to /node/<nid>", () => {
    const row = buildSourceDocument(
      { nid: "42", title: "t", file: "/sites/default/files/2026-01/a.pdf" },
      "circular",
    );
    expect(row.source_url).toBe("https://webadmin.pmc.gov.in/node/42");
    expect(row.file_url).toBe(
      "https://webadmin.pmc.gov.in/sites/default/files/2026-01/a.pdf",
    );
  });

  it("paginates via meta.total_pages and stops on empty page", async () => {
    const res = await paginateListing("circular", {
      perPage: 20,
      maxPages: 2,
      offline: true,
      fixturePages: new Map([
        [1, pageJson([11], 2, 1)],
        [2, pageJson([], 2, 2)],
      ]),
    });
    expect(res.pages).toHaveLength(2);
    expect(res.nodes.map((n) => n.nid)).toEqual([11]);
  });

  it("upsertSourceDocuments delegates and no-ops on empty rows", async () => {
    let calls = 0;
    const out = await upsertSourceDocuments(
      [buildSourceDocument({ nid: 1, title: "t" }, "circular")],
      {
        upsert: async (rows) => {
          calls = rows.length;
          return { inserted: 1, updated: 0 };
        },
      },
    );
    expect(out).toEqual({ inserted: 1, updated: 0 });
    expect(calls).toBe(1);
    expect(
      await upsertSourceDocuments([], {
        upsert: async () => ({ inserted: 1, updated: 0 }),
      }),
    ).toEqual({ inserted: 0, updated: 0 });
  });
});
