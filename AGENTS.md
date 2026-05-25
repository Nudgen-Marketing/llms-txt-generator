# AI Agent Reference Guide (AGENTS.md)

Welcome, Agent. This document outlines the technical architecture, message passing protocols, security constraints, and build processes of the `llms-txt-generator` repository to help you plan and execute code modifications efficiently and safely.

---

## 1. Project Directory & Core Files

* **Manifest**: [manifest.json](file:///Users/mac/Projects/llms-txt-generator/manifest.json) holds permissions, icon specifications, and background worker endpoints.
* **Background Worker**: [src/background/main.ts](file:///Users/mac/Projects/llms-txt-generator/src/background/main.ts) coordinates asynchronous task requests (checking, crawling) and maintains session storage state.
* **Popup Front-End**: [src/popup/main.tsx](file:///Users/mac/Projects/llms-txt-generator/src/popup/main.tsx) handles user input, shows crawl status progress bars, and renders markdown editors.
* **Shared Generator**: [src/shared/llms-txt-generator.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/llms-txt-generator.ts) contains all client-side parsing, sitemap discovery, HTML fetching, metadata extraction, and markdown structure output.
* **URL Safety Validation**: [src/shared/url-validation.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/url-validation.ts) validates input URLs and blocks attempts to access private, local, loopback, or reserved IP subnets.
* **Cross-Browser Shim**: [src/shared/webextension.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/webextension.ts) translates APIs between Chrome's callback-based syntax and standardized promise APIs.

---

## 2. Message Passing Protocol

Communication between the popup context and the background worker is strictly asynchronous, handled via `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`.

### Client Requests to Background

1. **`check_llms_files`**: Check if `/llms.txt` and `/llms-full.txt` exist.
   * **Request Payload**: `{ type: "check_llms_files", url: string }`
   * **Response Payload**: 
     ```typescript
     {
       success: boolean;
       error?: string;
       llmsTxt?: "found" | "missing" | "error";
       llmsTxtContent?: string;      // Snippet of found file (up to 120,000 characters)
       llmsFullTxt?: "found" | "missing" | "error";
       llmsFullTxtContent?: string; // Snippet of found file (up to 120,000 characters)
     }
     ```

2. **`start_crawl`**: Begin a new website crawl to generate markdown directories.
   * **Request Payload**: `{ type: "start_crawl", url: string }`
   * **Response Payload**: `{ success: boolean, result?: LlmsTxtGeneratorResult, error?: string }`

3. **`clear_crawl`**: Wipe current crawler session storage state.
   * **Request Payload**: `{ type: "clear_crawl" }`
   * **Response Payload**: `{ success: boolean, error?: string }`

4. **`get_crawl_status`**: Retrieve current crawl progress from background memory (used when the popup is reopened during an active crawl).
   * **Request Payload**: `{ type: "get_crawl_status" }`
   * **Response Payload**: `{ success: boolean, progress: CrawlProgress | null, error?: string }`

### Background Broadcasts to Client

The background worker sends live status updates to the popup:
* **Message Payload**: `{ type: "crawl_progress", progress: CrawlProgress }`
* **Progress States**: `idle` ➔ `checking-existing` ➔ `checking-sitemap` ➔ `crawling` ➔ `formatting` ➔ `complete` (or `error`).

---

## 3. Crawler Details & Constants

Keep the following configuration limits in mind when modifying [src/shared/llms-txt-generator.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/llms-txt-generator.ts):

* **`MAX_HTML_PAGES`**: 20. The background crawler will parse up to 20 pages, though the popup UI displays a visual progress denominator of 8.
* **`MAX_SITEMAP_INDEX_CHILDREN`**: 8. Prevents loading excessive sub-sitemaps from nested indices.
* **`MAX_TEXT_CHARS`**: 120,000 characters. Files larger than this are truncated to avoid browser memory issues.
* **`FETCH_TIMEOUT_MS`**: 8,000 ms. Pages failing to respond within 8 seconds are skipped.
* **`MAX_REDIRECTS`**: 3 redirects. Prevents infinite redirect loops.

### Metadata Extraction Logic
1. **Title**: Checks `<title>` tag, falls back to `<meta property="og:title">`, and then the domain name. Truncated to 120 chars.
2. **Description**: Checks `<meta name="description">`, `og:description`, `twitter:description`. Truncated to 220 chars.
3. **Headings**: Extracts up to 8 unique `<h1>`, `<h2>`, and `<h3>` inner text contents per page, stripping inner HTML tags.

---

## 4. Build & Package Pipeline

The build uses a customized esbuild config ([esbuild.config.mjs](file:///Users/mac/Projects/llms-txt-generator/esbuild.config.mjs) and [scripts/build-extension.mjs](file:///Users/mac/Projects/llms-txt-generator/scripts/build-extension.mjs)):

* **Transpilation**: Bundles TypeScript and JSX/TSX (using Preact's `h` factory configuration).
* **Minification**: Disabled (`minify: false`) to ensure store reviewers can inspect code readability directly.
* **Firefox Manifest Conversion**: Since Firefox does not fully support service workers in Manifest V3 yet, the build script automatically replaces the `background.service_worker` block with a `background.scripts` array when targeting Firefox.
* **Package Validation**: The packaging script runs [scripts/validate-extension-package.mjs](file:///Users/mac/Projects/llms-txt-generator/scripts/validate-extension-package.mjs), which decompresses the built ZIP file and verifies the integrity of referenced paths (scripts, icons, popup pages).

---

## 5. Guidelines for Code Changes

* **No Node/Server Modules**: All shared code must execute in standard web browser contexts (both popup main thread and background worker service thread). Avoid Node-specific globals (`process`, `Buffer`) or file system/net APIs.
* **Safety First**: Do not modify or relax the URL validator in [src/shared/url-validation.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/url-validation.ts) without extreme precaution. It blocks access to local ports or metadata endpoints (e.g. `169.254.169.254`) that would introduce security vulnerabilities.
* **Minimal Permissions Policy**: Do not request permissions that are not actively used by the extension. In compliance with the Chrome Web Store policy, the `scripting` permission and its associated wrapper functions in [src/shared/webextension.ts](file:///Users/mac/Projects/llms-txt-generator/src/shared/webextension.ts) have been removed. The extension only uses `"activeTab"`, `"storage"`, and `"host_permissions"` (`http://*/*`, `https://*/*`).
* **Keep Clean Header Banners**: Keep the header template script in [scripts/build-extension.mjs](file:///Users/mac/Projects/llms-txt-generator/scripts/build-extension.mjs) intact; it marks built files with target-specific markers.
* **Pre-Commit Checks**: Always run `npm run typecheck` and `npm run package:all` before completing a task to verify bundle validity.

