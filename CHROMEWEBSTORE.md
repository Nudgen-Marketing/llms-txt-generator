# Store Listing Documentation: llms.txt Checker & Generator

This file contains copy, guidelines, and permissions justifications for publishing the extension to the Chrome Web Store, Microsoft Edge Addons, and Firefox Add-ons dashboards.

---

## Extension Meta

- **Name**: llms.txt Checker & Generator
- **Detailed Description**:
  Check if websites have an `llms.txt` or `llms-full.txt` index file (an emerging standard to help AI search engines and LLM web crawlers discover context-optimized content). 

  If a site does not have these files, the extension's built-in crawler parses up to 8 public pages client-side using sitemaps and webpage links, then automatically builds properly structured `llms.txt` and `llms-full.txt` files. You can preview, edit, copy, or download the generated markdown files instantly!

- **Key Search Tags**: `llms.txt`, `AI crawling`, `search optimization`, `SEO`, `sitemap reader`, `markdown creator`

---

## Permissions Justification

Chrome, Edge, and Firefox developer panels require clear justifications for broad host permissions. Use the copy below for submissions:

1. **`host_permissions` (`http://*/*`, `https://*/*`)**:
   - **Required for**: Querying arbitrary websites to check if `/llms.txt` and `/llms-full.txt` files exist, and crawling pages to generate directories.
   - **Justification**: The extension is a utility checker that runs entirely client-side. To check the file status of *any* domain visited by the user, the background script must make fetch requests to those origins. Without these permissions, web-level CORS policies would block the checks. No data is sent to external servers; fetches are purely local to the user's browser.
   
2. **`activeTab`**:
   - **Required for**: Discovering the URL of the active tab when the user opens the popup.
   - **Justification**: Used to automatically pre-populate the input box with the URL/origin of the active website the user is inspecting.

3. **`storage`**:
   - **Required for**: Persisting the active crawler state across background worker lifecycles.
   - **Justification**: Chrome's Manifest V3 background service workers are ephemeral and can sleep. The storage API (`chrome.storage.session`) is used to save crawled pages and active progress so that if the service worker terminates during a crawl, the progress state is preserved and restored when the popup is opened.

---

## Privacy Policy Statement

- **Data Collection**: No personal data, browsing history, or website content is collected, stored, or transmitted to any remote servers.
- **Processing Location**: All HTTP checks, site crawlers, and markdown generators run strictly client-side inside the user's local extension service worker context.
- **Third-Party Services**: The extension does not integrate with any analytics tools, advertising trackers, or cloud storage backends.
