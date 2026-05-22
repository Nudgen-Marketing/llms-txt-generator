import { validatePublicHttpUrl } from "./url-validation";

const MAX_HTML_PAGES = 20;
const MAX_SITEMAP_INDEX_CHILDREN = 8;
const MAX_TEXT_CHARS = 120_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

type FetchLike = typeof fetch;

export type ExistingFileStatus = "found" | "missing" | "error";

export type LlmsTxtPage = {
  url: string;
  title: string;
  description: string;
  headings: string[];
};

export type LlmsTxtGeneratorResult = {
  normalizedUrl: string;
  domain: string;
  siteName: string;
  pagesScanned: number;
  skippedUrlsCount: number;
  existingFiles: {
    llmsTxt: ExistingFileStatus;
    llmsFullTxt: ExistingFileStatus;
  };
  warnings: string[];
  llmsTxt: string;
  llmsFullTxt: string;
};

type CrawlState = {
  normalizedUrl: string;
  rootUrl: URL;
  allowedOrigins: Set<string>;
  pages: LlmsTxtPage[];
  sitemapFound: boolean;
  sitemapUrls: string[];
  robotsFound: boolean;
  existingFiles: LlmsTxtGeneratorResult["existingFiles"];
  warnings: string[];
  skippedUrlsCount: number;
};

type FetchTextResult = {
  status: number;
  ok: boolean;
  url: string;
  contentType: string;
  text: string;
};

export function normalizeLlmsGeneratorUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const validation = validatePublicHttpUrl(withProtocol);
  if (!validation.isValid) {
    throw new Error(validation.error || "Enter a valid public website URL.");
  }

  const parsed = new URL(withProtocol);
  parsed.hash = "";
  return parsed.toString();
}

export async function generateLlmsTxtFiles(
  rawUrl: string,
  fetchImpl: FetchLike = fetch,
  onProgress?: (
    phase:
      | "checking-existing"
      | "checking-sitemap"
      | "crawling"
      | "formatting"
      | "complete",
    pagesScanned: number,
  ) => void,
): Promise<LlmsTxtGeneratorResult> {
  const normalizedUrl = normalizeLlmsGeneratorUrl(rawUrl);
  const parsedUrl = new URL(normalizedUrl);
  const rootUrl = new URL(parsedUrl.origin);
  const state: CrawlState = {
    normalizedUrl,
    rootUrl,
    allowedOrigins: buildAllowedOrigins(rootUrl),
    pages: [],
    sitemapFound: false,
    sitemapUrls: [],
    robotsFound: false,
    existingFiles: {
      llmsTxt: "missing",
      llmsFullTxt: "missing",
    },
    warnings: [],
    skippedUrlsCount: 0,
  };

  if (onProgress) onProgress("checking-existing", 0);
  await inspectExistingFiles(state, fetchImpl);

  if (onProgress) onProgress("checking-sitemap", 0);
  await inspectSitemap(state, fetchImpl);

  if (onProgress) onProgress("crawling", 0);
  await crawlHtmlPages(state, fetchImpl, (scanned) => {
    if (onProgress) onProgress("crawling", scanned);
  });

  if (state.pages.length === 0) {
    throw new Error(
      "We could not read any public HTML pages from this website. Try a reachable homepage URL.",
    );
  }

  if (onProgress) onProgress("formatting", state.pages.length);
  const siteName = inferSiteName(state);
  const canonicalRootUrl = getCanonicalRootUrl(state);
  const llmsTxt = buildLlmsTxt({
    ...state,
    rootUrl: canonicalRootUrl,
    siteName,
  });
  const llmsFullTxt = buildLlmsFullTxt({
    ...state,
    rootUrl: canonicalRootUrl,
    siteName,
  });

  if (onProgress) onProgress("complete", state.pages.length);

  return {
    normalizedUrl,
    domain: canonicalRootUrl.hostname,
    siteName,
    pagesScanned: state.pages.length,
    skippedUrlsCount: state.skippedUrlsCount,
    existingFiles: state.existingFiles,
    warnings: state.warnings,
    llmsTxt,
    llmsFullTxt,
  };
}

async function inspectExistingFiles(state: CrawlState, fetchImpl: FetchLike) {
  state.existingFiles.llmsTxt = await inspectFileStatus(
    new URL("/llms.txt", state.rootUrl),
    fetchImpl,
  );
  state.existingFiles.llmsFullTxt = await inspectFileStatus(
    new URL("/llms-full.txt", state.rootUrl),
    fetchImpl,
  );
  const robotsStatus = await inspectFileStatus(
    new URL("/robots.txt", state.rootUrl),
    fetchImpl,
  );
  state.robotsFound = robotsStatus === "found";
}

async function inspectFileStatus(
  url: URL,
  fetchImpl: FetchLike,
): Promise<ExistingFileStatus> {
  try {
    const response = await fetchText(url.toString(), fetchImpl, {
      htmlOnly: false,
    });
    if (response.ok) return "found";
    if (response.status === 404) return "missing";
    return "error";
  } catch {
    return "error";
  }
}

async function inspectSitemap(state: CrawlState, fetchImpl: FetchLike) {
  try {
    const response = await fetchText(
      new URL("/sitemap.xml", state.rootUrl).toString(),
      fetchImpl,
      { htmlOnly: false },
    );
    if (!response.ok) return;
    state.sitemapFound = true;
    state.sitemapUrls = (
      await extractSitemapDocumentUrls(response, state, fetchImpl)
    ).slice(0, 30);
  } catch {
    state.warnings.push(
      "Sitemap could not be read, so the generator used homepage links instead.",
    );
  }
}

async function extractSitemapDocumentUrls(
  response: FetchTextResult,
  state: CrawlState,
  fetchImpl: FetchLike,
) {
  if (!isXmlLikeResponse(response)) {
    state.warnings.push(
      "Sitemap did not return XML, so the generator used homepage links instead.",
    );
    return [];
  }

  if (!isSitemapIndex(response.text)) {
    return extractSitemapUrls(response.text, state).filter(
      (url) => !isLikelySitemapUrl(url),
    );
  }

  const pageUrls: string[] = [];
  const childSitemaps = extractSitemapUrls(response.text, state)
    .filter(isLikelySitemapUrl)
    .slice(0, MAX_SITEMAP_INDEX_CHILDREN);
  let unusableChildren = 0;

  for (const sitemapUrl of childSitemaps) {
    try {
      const childResponse = await fetchText(sitemapUrl, fetchImpl, {
        htmlOnly: false,
      });
      if (
        !childResponse.ok ||
        !isXmlLikeResponse(childResponse) ||
        isSitemapIndex(childResponse.text)
      ) {
        unusableChildren += 1;
        continue;
      }

      for (const url of extractSitemapUrls(childResponse.text, state)) {
        if (isLikelySitemapUrl(url) || pageUrls.includes(url)) continue;
        pageUrls.push(url);
      }
    } catch {
      unusableChildren += 1;
    }
  }

  if (unusableChildren > 0) {
    state.warnings.push(
      `${unusableChildren} sitemap index entries could not be used as page inventory.`,
    );
  }

  return pageUrls;
}

async function crawlHtmlPages(
  state: CrawlState,
  fetchImpl: FetchLike,
  onPageScanned?: (count: number) => void,
) {
  const queue = getInitialPageQueue(state);
  const visited = new Set<string>();
  const visitedPages = new Set<string>();
  const contentFingerprints = new Set<string>();

  while (queue.length > 0 && state.pages.length < MAX_HTML_PAGES) {
    const nextUrl = queue.shift();
    if (!nextUrl || visited.has(nextUrl)) continue;
    visited.add(nextUrl);

    try {
      const response = await fetchText(nextUrl, fetchImpl, { htmlOnly: true });
      if (!response.ok) {
        state.skippedUrlsCount += 1;
        continue;
      }

      const finalUrl = new URL(response.url);
      if (!isAllowedOrigin(finalUrl, state)) {
        state.skippedUrlsCount += 1;
        continue;
      }
      state.allowedOrigins.add(finalUrl.origin);

      const page = extractPageMetadata(response.text, response.url);
      const canonicalPageUrl = canonicalizePageUrl(response.url);
      const pageFingerprint = getPageContentFingerprint(page);
      if (
        visitedPages.has(canonicalPageUrl) ||
        contentFingerprints.has(pageFingerprint)
      ) {
        continue;
      }
      visitedPages.add(canonicalPageUrl);
      contentFingerprints.add(pageFingerprint);
      page.url = canonicalPageUrl;
      state.pages.push(page);

      if (onPageScanned) {
        onPageScanned(state.pages.length);
      }

      if (state.pages.length === 1) {
        for (const link of extractSameOriginLinks(response.text, finalUrl)) {
          if (state.pages.length + queue.length >= MAX_HTML_PAGES + 4) break;
          if (!visited.has(link) && !queue.includes(link)) queue.push(link);
        }
      }
    } catch {
      state.skippedUrlsCount += 1;
    }
  }
}

function getInitialPageQueue(state: CrawlState) {
  const queue = [state.rootUrl.toString()];
  if (state.normalizedUrl !== state.rootUrl.toString()) {
    queue.push(state.normalizedUrl);
  }
  for (const url of state.sitemapUrls) {
    if (queue.length >= MAX_HTML_PAGES + 4) break;
    if (!queue.includes(url)) queue.push(url);
  }
  return queue;
}

async function fetchText(
  url: string,
  fetchImpl: FetchLike,
  options: { htmlOnly: boolean },
  redirectsLeft = MAX_REDIRECTS,
): Promise<FetchTextResult> {
  const validation = validatePublicHttpUrl(url);
  if (!validation.isValid) {
    throw new Error(validation.error || "URL is not safe to fetch.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        // User-agent modification is forbidden in standard browser fetch, so we let the browser handle it.
        accept: options.htmlOnly
          ? "text/html,application/xhtml+xml"
          : "text/plain,text/html,application/xml,text/xml,*/*",
      },
    });

    if (isRedirect(response.status) && redirectsLeft > 0) {
      const location = response.headers.get("location");
      if (!location)
        throw new Error("Redirect response did not include a location.");
      const redirectedUrl = new URL(location, url).toString();
      return fetchText(redirectedUrl, fetchImpl, options, redirectsLeft - 1);
    }

    const contentType = response.headers.get("content-type") || "";
    if (
      options.htmlOnly &&
      contentType &&
      !/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(contentType)
    ) {
      return { status: response.status, ok: false, url, contentType, text: "" };
    }

    const text = (await response.text()).slice(0, MAX_TEXT_CHARS);
    return {
      status: response.status,
      ok: response.ok,
      url,
      contentType,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRedirect(status: number) {
  return status >= 300 && status < 400;
}

function extractSitemapUrls(xml: string, state: CrawlState) {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const candidate = decodeHtmlEntities(match[1] || "").trim();
    const normalized = normalizeSameOriginCandidate(
      candidate,
      state.rootUrl,
      state.allowedOrigins,
    );
    if (normalized && !isAllowedOrigin(new URL(normalized), state)) continue;
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  }
  return urls;
}

function isSitemapIndex(xml: string) {
  return /<sitemapindex\b/i.test(xml);
}

function isXmlLikeResponse(response: FetchTextResult) {
  return (
    /\b(?:application|text)\/(?:xml|xhtml\+xml)\b/i.test(
      response.contentType,
    ) || /<\?xml|<urlset\b|<sitemapindex\b/i.test(response.text)
  );
}

function isLikelySitemapUrl(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  return /(?:^|[-_/])sitemap(?:[-_.]|$)|sitemap\.xml$/.test(pathname);
}

function extractSameOriginLinks(html: string, baseUrl: URL) {
  const links: string[] = [];
  for (const match of stripScriptAndStyle(html).matchAll(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi,
  )) {
    const normalized = normalizeSameOriginCandidate(
      decodeHtmlEntities(match[1] || ""),
      baseUrl,
    );
    if (!normalized || links.includes(normalized)) continue;
    if (isLikelyDocumentUrl(normalized)) links.push(normalized);
  }
  return links;
}

function normalizeSameOriginCandidate(
  rawUrl: string,
  baseUrl: URL,
  allowedOrigins: Set<string> = new Set([baseUrl.origin]),
) {
  try {
    const cleanUrl = rawUrl.replace(/\\\//g, "/").trim();
    if (
      !cleanUrl ||
      cleanUrl.startsWith("#") ||
      /^mailto:|^tel:|^javascript:/i.test(cleanUrl)
    )
      return null;
    const parsed = new URL(cleanUrl, baseUrl);
    parsed.hash = "";
    if (!allowedOrigins.has(parsed.origin)) return null;
    if (!validatePublicHttpUrl(parsed.toString()).isValid) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function canonicalizePageUrl(rawUrl: string) {
  const parsed = new URL(rawUrl);
  parsed.hash = "";

  for (const key of Array.from(parsed.searchParams.keys())) {
    if (isTrackingQueryParam(key)) parsed.searchParams.delete(key);
  }

  parsed.searchParams.sort();
  if (parsed.pathname !== "/" && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
  }

  return parsed.toString();
}

function isTrackingQueryParam(key: string) {
  return /^(?:utm_|fbclid$|gclid$|dclid$|gbraid$|wbraid$|mc_cid$|mc_eid$|mkt_tok$|ref$|ref_src$|spm$|yclid$)/i.test(
    key,
  );
}

function getPageContentFingerprint(page: LlmsTxtPage) {
  return `${normalizeFingerprintText(page.title)}|${normalizeFingerprintText(page.description)}`;
}

function normalizeFingerprintText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildAllowedOrigins(rootUrl: URL) {
  const origins = new Set<string>([rootUrl.origin]);
  const hostname = rootUrl.hostname;
  const pairedHostname = hostname.startsWith("www.")
    ? hostname.replace(/^www\./, "")
    : `www.${hostname}`;
  try {
    const paired = new URL(rootUrl.toString());
    paired.hostname = pairedHostname;
    origins.add(paired.origin);
  } catch {
    // Ignore malformed hostname pairs.
  }
  return origins;
}

function isAllowedOrigin(url: URL, state: CrawlState) {
  return state.allowedOrigins.has(url.origin);
}

function getCanonicalRootUrl(state: CrawlState) {
  const firstPageUrl = state.pages[0]?.url;
  if (!firstPageUrl) return state.rootUrl;

  const firstPageOrigin = new URL(firstPageUrl).origin;
  if (!state.allowedOrigins.has(firstPageOrigin)) return state.rootUrl;
  return new URL(firstPageOrigin);
}

function isLikelyDocumentUrl(url: string) {
  const pathname = new URL(url).pathname.toLowerCase();
  return !/\.(?:png|jpe?g|gif|webp|svg|ico|css|js|json|pdf|zip|mp4|mov|avi|mp3|woff2?|ttf|eot)$/i.test(
    pathname,
  );
}

function extractPageMetadata(html: string, url: string): LlmsTxtPage {
  const title = normalizeText(
    getTagText(html, "title") ||
      getMetaContent(html, "og:title") ||
      new URL(url).hostname,
  );
  const description = normalizeText(
    getMetaContent(html, "description") ||
      getMetaContent(html, "og:description") ||
      getMetaContent(html, "twitter:description") ||
      "",
  );
  const headings = extractHeadings(html);

  return {
    url,
    title: trimSentence(title, 120),
    description: trimSentence(description, 220),
    headings,
  };
}

function extractHeadings(html: string) {
  const headings: string[] = [];
  for (const match of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const text = trimSentence(normalizeText(stripTags(match[1] || "")), 120);
    if (text && !headings.includes(text)) headings.push(text);
    if (headings.length >= 8) break;
  }
  return headings;
}

// Simple browser-safe string utilities
function getTagText(html: string, tag: string) {
  const match = html.match(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  return match?.[1] ? stripTags(match[1]) : "";
}

function getMetaContent(html: string, name: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0] || "";
    const tagName = getAttribute(tag, "name").toLowerCase();
    const property = getAttribute(tag, "property").toLowerCase();
    if (tagName === name.toLowerCase() || property === name.toLowerCase()) {
      return getAttribute(tag, "content");
    }
  }
  return "";
}

function getAttribute(tag: string, attr: string) {
  const match = tag.match(new RegExp(`\\s${attr}=["']([^"']*)["']`, "i"));
  return decodeHtmlEntities(match?.[1] || "");
}

function stripTags(value: string) {
  return stripScriptAndStyle(value).replace(/<[^>]+>/g, " ");
}

function stripScriptAndStyle(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ");
}

function normalizeText(value: string) {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function trimSentence(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function inferSiteName(state: CrawlState) {
  const home = state.pages[0];
  if (!home) return state.rootUrl.hostname.replace(/^www\./, "");
  const title = home.title.split(/[|—-]/)[0]?.trim();
  return title || state.rootUrl.hostname.replace(/^www\./, "");
}

function buildLlmsTxt(state: CrawlState & { siteName: string }) {
  const home = state.pages[0];
  const overview =
    home?.description || `Official website for ${state.siteName}.`;
  const keyPages = getCuratedKeyPages(state.pages);
  const optionalPages = state.pages
    .filter((page) => !keyPages.includes(page))
    .slice(0, 6);
  const sitemapUrl = new URL("/sitemap.xml", state.rootUrl).toString();
  const optionalSection =
    optionalPages.length > 0
      ? `\n## Optional\n\n${optionalPages.map(formatLlmsLink).join("\n")}\n`
      : "";

  return cleanMarkdown(`# ${state.siteName}
 
> ${overview}
 
${state.siteName} is available at ${state.rootUrl.origin}. This file summarizes the public website structure for AI agents and agentic browsers.
 
## Key Pages
 
${keyPages.map(formatLlmsLink).join("\n")}
${optionalSection}
 
## Sitemaps
 
${state.sitemapFound || state.sitemapUrls.length > 0 ? `- [Sitemap](${sitemapUrl})` : "- No sitemap was detected during generation."}
${state.robotsFound ? `- [Robots policy](${new URL("/robots.txt", state.rootUrl).toString()})` : ""}
 
## Guidance
 
- Prefer the key pages above for a fast overview before deeper crawling.
- Use public, crawlable HTML pages as the source of truth.
- Do not treat this file as a ranking signal or replacement for normal SEO, accessibility, and content quality.
- For expanded page details, see ${state.rootUrl.origin}/llms-full.txt.
`);
}

function getCuratedKeyPages(pages: LlmsTxtPage[]) {
  const home = pages[0];
  const stablePages = pages.filter(
    (page) => page !== home && isStableOverviewPage(page.url),
  );
  const fallbackPages = pages.filter(
    (page) => page !== home && !stablePages.includes(page),
  );
  return [home, ...stablePages, ...fallbackPages].filter(Boolean).slice(0, 6);
}

function isStableOverviewPage(url: string) {
  const pathname =
    new URL(url).pathname.toLowerCase().replace(/\/+$/g, "") || "/";
  if (pathname === "/") return true;
  if (isLikelyDetailPage(pathname)) return false;
  return /(?:^|\/)(about|blog|categories?|company|contact|docs?|documentation|features?|help|news|polic(?:y|ies)|pricing|privacy|products?|resources?|services?|support|terms)(?:\/|$)/i.test(
    pathname,
  );
}

function isLikelyDetailPage(pathname: string) {
  return /(?:\d{4,}|\d{4}\/\d{2}|\/p\/|\/post\/|\/posts\/|\/article\/|\/articles\/)/i.test(
    pathname,
  );
}

function formatLlmsLink(page: LlmsTxtPage) {
  return `- [${page.title}](${page.url})${page.description ? `: ${page.description}` : ""}`;
}

function buildLlmsFullTxt(state: CrawlState & { siteName: string }) {
  const sitemapUrl = new URL("/sitemap.xml", state.rootUrl).toString();
  const pageInventory = state.pages
    .map((page, index) => {
      const headings = page.headings.length
        ? `\n  - Headings: ${page.headings.join("; ")}`
        : "";
      const description = page.description
        ? `\n  - Summary: ${page.description}`
        : "";
      return `${index + 1}. [${page.title}](${page.url})${description}${headings}`;
    })
    .join("\n\n");

  return cleanMarkdown(`# ${state.siteName} Full Site Context
 
Generated from ${state.rootUrl.origin}.
 
## Site Overview
 
- Site name: ${state.siteName}
- Domain: ${state.rootUrl.hostname}
- Pages scanned: ${state.pages.length}
- Skipped URLs: ${state.skippedUrlsCount}
- Existing llms.txt: ${state.existingFiles.llmsTxt}
- Existing llms-full.txt: ${state.existingFiles.llmsFullTxt}
 
## Page Inventory
 
${pageInventory}
 
## Discovered Resources
 
${state.sitemapFound || state.sitemapUrls.length > 0 ? `- Sitemap: ${sitemapUrl}` : "- Sitemap: not detected"}
${state.robotsFound ? `- Robots policy: ${new URL("/robots.txt", state.rootUrl).toString()}` : "- Robots policy: not detected"}
 
## Crawl Notes
 
${state.warnings.length > 0 ? state.warnings.map((warning) => `- ${warning}`).join("\n") : "- No generator warnings."}
 
## Agent Guidance
 
- Start with the homepage and key product, documentation, pricing, about, contact, policy, and blog pages when present.
- Respect robots.txt and normal access controls.
- Use page titles, meta descriptions, headings, and canonical public URLs as the primary site map.
- This file is a convenience summary for agents. It does not guarantee AI search visibility.
`);
}

function cleanMarkdown(value: string) {
  return `${value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
