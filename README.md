# llms.txt Checker & Generator

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Edge%20%7C%20Firefox-orange.svg)](manifest.json)
[![Tech Stack](https://img.shields.io/badge/tech%20stack-Preact%20%2B%20TypeScript%20%2B%20esbuild-brightgreen.svg)](package.json)

An elegant browser extension to check if websites publish `llms.txt` or `llms-full.txt` files (the emerging standard to help AI search engines and LLM web crawlers discover context-optimized content). If these files do not exist, the extension utilizes a fast, client-side webpage crawler to generate them automatically on the fly.

Designed and developed by [Nudgen](https://nudgen.net).

---

## What is `llms.txt`?

The `/llms.txt` file is an emerging proposal for a standard text file placed at the root of a domain to help language models (LLMs) and agentic web crawlers quickly understand a website's structure and access context-optimized markdown summaries of key pages. 
* `/llms.txt` provides a high-level overview, site description, and curated links to essential pages.
* `/llms-full.txt` provides a expanded, aggregated directory containing full details, headings, and context for deeper indexing.

---

## Features

* **Instant Verification**: Checks any website instantly upon opening the popup to see if `/llms.txt` and `/llms-full.txt` exist.
* **Client-Side Sitemap Crawler**: Parses `sitemap.xml` (or falls back to homepage links) to extract up to 20 public, same-origin HTML pages.
* **Metadata Extraction**: Scrapes titles, meta descriptions, and structural headings (h1-h3) from webpages.
* **Interactive Editor & Exporter**: Preview, edit, copy, or download generated `llms.txt` and `llms-full.txt` files directly.
* **Secure & Privacy-First**: 100% client-side. Web indexing runs entirely in your local browser worker environment. No analytics, tracking, or external server hops.
* **Premium Design System**: Built with modern typography, glassmorphism, responsive elements, and smooth CSS micro-animations.

---

## Technical Architecture

The extension is designed with a lightweight Preact popup front-end that communicates asynchronously with a TypeScript background service worker.

```
                  ┌──────────────────────┐
                  │      Preact UI       │
                  │   (src/popup/...)   │
                  └──────────┬───────────┘
                             │ (Async Message Passing)
                             ▼
                  ┌──────────────────────┐
                  │  Service Worker/BG   │
                  │ (src/background/...) │
                  └──────────┬───────────┘
                             │
                             ▼
         ┌───────────────────┴───────────────────┐
         ▼                                       ▼
 ┌──────────────┐                       ┌──────────────┐
 │ Check origin │                       │ Crawl origin │
 │   for files  │                       │   & sitemap  │
 └──────────────┘                       └──────────────┘
```

---

## Developer Commands

### Getting Started

Install the required project dependencies:
```bash
npm install
```

### Build & Run

* **Development (Watch Mode)**:
  Builds the Chrome extension in development mode (no minification, sourcemaps enabled) and watches the filesystem for code edits.
  ```bash
  npm run dev
  ```

* **Build All Targets**:
  Builds distribution-ready assets for Chrome, Edge, and Firefox inside separate subdirectories of the `dist/` folder.
  ```bash
  npm run build
  ```

* **Package Extensions**:
  Builds and compresses extension builds into ready-to-upload ZIP archives in the `artifacts/` folder, running automated bundle validations.
  ```bash
  npm run package:all
  ```

* **Typechecking**:
  ```bash
  npm run typecheck
  ```

---

## Browser Installation

### Google Chrome & Microsoft Edge
1. Build the target: `npm run build:chrome` or `npm run build:edge`.
2. Open your browser and navigate to the extensions management console (`chrome://extensions` or `edge://extensions`).
3. Enable **Developer mode** (toggle in the top-right or sidebar).
4. Click **Load unpacked** in the top-left.
5. Select the corresponding build directory: `dist/chrome` or `dist/edge`.

### Mozilla Firefox
1. Build the target: `npm run build:firefox`.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**
4. Navigate to `dist/firefox/` and select any file inside (such as `manifest.json`).

---

## Project Structure

```
├── manifest.json              # Base WebExtension Manifest V3 schema
├── package.json               # Dependencies and build script specifications
├── tsconfig.json              # TypeScript compilation rules
├── esbuild.config.mjs         # Bundler configuration file
├── assets/                    # Icons and extension image assets
├── dist/                      # Target-specific build output directory (generated)
├── artifacts/                 # Production-packaged ZIP files (generated)
├── scripts/                   # Automated build, package, and validation scripts
└── src/
    ├── background/
    │   └── main.ts            # Extension service worker (handles async check & crawl states)
    ├── popup/
    │   ├── index.html         # Front-end HTML shell
    │   └── main.tsx           # Preact popup UI and local state controller
    └── shared/
        ├── llms-txt-generator.ts # Main client-side crawling & text compilation library
        ├── url-validation.ts     # URL validation safety checks (prevents local network crawls)
        └── webextension.ts       # Cross-browser wrapper utilities
```

---

## License & Support

Developed by [Nudgen](https://nudgen.net). For inquiries, support, or security notifications, please contact [contact@nudgen.net](mailto:contact@nudgen.net).
