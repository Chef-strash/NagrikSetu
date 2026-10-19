/**
 * Discovery over the PMC CMS listing API (plan stage 1, no LLM).
 * Response shape: docs/PMC_SOURCE_VERIFICATION_2026-10-04.md section 2:
 * `{ meta: { total_items, total_pages, ... }, data: { nodes: [...] } }`.
 */
import { createHash } from "node:crypto";
import {
  isSchemeDepartment,
  isSchemeTitle,
  listingUrl,
  type ListingContentType,
} from "../sources/registry.js";
import { fetchWithPolicy } from "../sources/http.js";

/** Base for resolving relative node URLs and file paths from the CMS feed. */
export const PMC_DOCUMENT_BASE_URL = "https://webadmin.pmc.gov.in";

export interface ListingNode {
  nid?: number | string;
  title?: string;
  display_date?: string;
  end_date?: string | null;
  file?: string | null;
  file_size?: string | null;
  file_type?: string | null;
  changed?: string | null;
  department?: string | null;
  ward_name?: string | null;
  address?: string | null;
  location?: string | null;
  url?: string;
  link?: string | null;
  circular_no?: string | null;
  [key: string]: unknown;
}

export interface ListingMeta {
  total_items: number;
  total_pages: number;
  current_page: number;
  per_page: number;
  content_type: string;
}

export interface ListingPage {
  meta: ListingMeta;
  nodes: ListingNode[];
}

export function parseListingPage(json: unknown): ListingPage {
  if (typeof json !== "object" || json === null) {
    throw new Error("listing response must be an object");
  }
  const root = json as Record<string, unknown>;
  const meta = root["meta"] as Record<string, unknown> | undefined;
  const data = root["data"] as Record<string, unknown> | undefined;
  if (!meta || !data) {
    // A 0-result filter returns `{ "message": "No records found" }` (not an error).
    if (typeof root["message"] === "string") {
      return {
        meta: { total_items: 0, total_pages: 0, current_page: 1, per_page: 0, content_type: "" },
        nodes: [],
      };
    }
    throw new Error("listing response missing meta/data");
  }
  // The live API omits `nodes` entirely when a filter matches nothing.
  const rawNodes = data["nodes"];
  const nodes = Array.isArray(rawNodes) ? (rawNodes as ListingNode[]) : [];
  const num = (v: unknown, name: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`listing meta.${name} must be a number`);
    }
    return v;
  };
  return {
    meta: {
      total_items: num(meta["total_items"] ?? 0, "total_items"),
      total_pages: num(meta["total_pages"] ?? 0, "total_pages"),
      current_page: num(meta["current_page"] ?? 1, "current_page"),
      per_page: num(meta["per_page"] ?? nodes.length, "per_page"),
      content_type: String(meta["content_type"] ?? ""),
    },
    nodes,
  };
}

/** Keep circulars whose dept is watched OR whose title hits scheme terms (EN + Marathi). */
export function isSchemeCircular(node: ListingNode): boolean {
  return isSchemeDepartment(node.department) || isSchemeTitle(node.title);
}

/**
 * Absolutize a node path against the PMC document base. Absolute URLs pass
 * through unchanged; `/node/42428` -> `https://webadmin.pmc.gov.in/node/42428`;
 * `/sites/default/files/..` -> `https://webadmin.pmc.gov.in/sites/default/files/..`.
 */
export function absolutizeUrl(
  path: string | null | undefined,
  base: string = PMC_DOCUMENT_BASE_URL,
): string | undefined {
  if (typeof path !== "string") return undefined;
  const trimmed = path.trim();
  if (trimmed === "") return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return undefined;
  }
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashNode(node: ListingNode): string {
  return sha256Hex(JSON.stringify(node));
}

export interface SourceDocumentRow {
  source_system: string;
  external_id: string | undefined;
  title: string;
  published_at: string | undefined;
  source_url: string;
  file_url: string | undefined;
  content_hash: string;
  extracted_text?: string | null;
  relevance?: string;
  status?: string;
}

export function sourceSystemFor(contentType: ListingContentType): string {
  switch (contentType) {
    case "circular":
      return "pmc_webadmin_circular";
    case "schemes":
      return "pmc_webadmin_scheme";
    case "citizen_charter":
      return "pmc_webadmin_charter";
    default:
      return `pmc_webadmin_${contentType}`;
  }
}

export interface BuildSourceDocumentOptions {
  /** Base URL for absolutizing relative node paths (default the PMC CMS base). */
  baseUrl?: string;
  relevance?: string;
  status?: string;
  extracted_text?: string | null;
}

export function buildSourceDocument(
  node: ListingNode,
  contentType: ListingContentType,
  opts: BuildSourceDocumentOptions = {},
): SourceDocumentRow {
  const base = opts.baseUrl ?? PMC_DOCUMENT_BASE_URL;
  const nid =
    node.nid !== undefined && node.nid !== null ? String(node.nid) : undefined;
  const sourceUrl =
    absolutizeUrl(node.url, base) ?? `${base}/node/${nid ?? "unknown"}`;
  const fileUrl = absolutizeUrl(node.file, base);
  const row: SourceDocumentRow = {
    source_system: sourceSystemFor(contentType),
    external_id: nid,
    title: node.title ?? "(untitled)",
    published_at: node.display_date ?? undefined,
    source_url: sourceUrl,
    file_url: fileUrl,
    content_hash: hashNode(node),
  };
  if (opts.extracted_text !== undefined) row.extracted_text = opts.extracted_text;
  if (opts.relevance !== undefined) row.relevance = opts.relevance;
  if (opts.status !== undefined) row.status = opts.status;
  return row;
}

export interface PaginateOptions {
  perPage?: number;
  maxPages?: number;
  offline?: boolean;
  fixturePages?: Map<number, string>;
}

export async function paginateListing(
  contentType: ListingContentType,
  options: PaginateOptions = {},
): Promise<{ pages: ListingPage[]; nodes: ListingNode[] }> {
  const { perPage = 20, maxPages = 50, offline = false, fixturePages } = options;
  const pages: ListingPage[] = [];
  const nodes: ListingNode[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= maxPages) {
    const url = listingUrl(contentType, page, perPage);
    const res = await fetchWithPolicy(url, {
      offline,
      fixtureText: fixturePages?.get(page),
    });
    if (!res.ok || res.text === undefined) {
      throw new Error(`discover ${contentType} page ${page} failed: ${res.error}`);
    }
    const parsed = parseListingPage(JSON.parse(res.text) as unknown);
    pages.push(parsed);
    nodes.push(...parsed.nodes);
    totalPages = parsed.meta.total_pages;
    if (parsed.nodes.length === 0) break;
    page += 1;
  }
  return { pages, nodes };
}

export interface SourceDocumentsWriter {
  upsert(rows: SourceDocumentRow[]): Promise<{ inserted: number; updated: number }>;
}

export async function upsertSourceDocuments(
  rows: SourceDocumentRow[],
  writer: SourceDocumentsWriter,
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  return writer.upsert(rows);
}
