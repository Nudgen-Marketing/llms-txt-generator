import { h, render } from "preact";
import { useState, useEffect } from "preact/hooks";
import type { CrawlProgress } from "../background/main";
import type { ExistingFileStatus } from "../shared/llms-txt-generator";

type CheckResult = {
  success: boolean;
  error?: string;
  llmsTxt?: ExistingFileStatus;
  llmsTxtContent?: string;
  llmsFullTxt?: ExistingFileStatus;
  llmsFullTxtContent?: string;
};

function Popup() {
  const [inputUrl, setInputUrl] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"llms" | "llmsFull">("llms");
  const [editedLlmsTxt, setEditedLlmsTxt] = useState("");
  const [editedLlmsFullTxt, setEditedLlmsFullTxt] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Initialize and check active tab
  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.url) {
        if (/^(chrome:\/\/|chrome-extension:\/\/|edge:\/\/|about:)/.test(tab.url)) {
          setTabError("Cannot run checker on browser settings or extension pages.");
          setInputUrl("");
        } else {
          try {
            const parsed = new URL(tab.url);
            // Default input to the site's root domain origin
            setInputUrl(parsed.origin);
            triggerCheck(parsed.origin);
          } catch {
            setTabError("Failed to parse website domain.");
          }
        }
      }
    });

    // Listen for progress updates from the service worker
    const messageListener = (message: any) => {
      if (message.type === "crawl_progress") {
        setCrawlProgress(message.progress);
      }
    };
    chrome.runtime.onMessage.addListener(messageListener);

    // Retrieve active crawl status in case it was running in the background
    chrome.runtime.sendMessage({ type: "get_crawl_status" }, (response) => {
      if (response && response.success && response.progress) {
        setCrawlProgress(response.progress);
        if (response.progress.status === "complete" && response.progress.result) {
          setEditedLlmsTxt(response.progress.result.llmsTxt);
          setEditedLlmsFullTxt(response.progress.result.llmsFullTxt);
        }
      }
    });

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, []);

  // Update editor state when a crawl finishes successfully
  useEffect(() => {
    if (crawlProgress && crawlProgress.status === "complete" && crawlProgress.result) {
      if (!editedLlmsTxt) setEditedLlmsTxt(crawlProgress.result.llmsTxt);
      if (!editedLlmsFullTxt) setEditedLlmsFullTxt(crawlProgress.result.llmsFullTxt);
    }
  }, [crawlProgress, editedLlmsTxt, editedLlmsFullTxt]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2500);
  };

  const triggerCheck = (urlToCheck: string) => {
    if (!urlToCheck.trim()) return;
    setIsChecking(true);
    setCheckResult(null);
    setTabError(null);

    chrome.runtime.sendMessage({ type: "check_llms_files", url: urlToCheck }, (response) => {
      setIsChecking(false);
      if (response) {
        setCheckResult(response);
        if (response.success) {
          if (response.llmsTxtContent) setEditedLlmsTxt(response.llmsTxtContent);
          if (response.llmsFullTxtContent) setEditedLlmsFullTxt(response.llmsFullTxtContent);
        }
      } else {
        setCheckResult({ success: false, error: "Failed to connect to background extension worker." });
      }
    });
  };

  const startCrawl = (urlToCrawl: string) => {
    if (!urlToCrawl.trim()) return;
    setEditedLlmsTxt("");
    setEditedLlmsFullTxt("");
    
    // Set immediate client progress indicator state
    setCrawlProgress({
      url: urlToCrawl,
      status: "checking-existing",
      pagesScanned: 0,
    });

    chrome.runtime.sendMessage({ type: "start_crawl", url: urlToCrawl }, (response) => {
      if (response && response.success && response.result) {
        setEditedLlmsTxt(response.result.llmsTxt);
        setEditedLlmsFullTxt(response.result.llmsFullTxt);
        showToast("Crawl complete! Files generated.");
      }
    });
  };

  const clearAllState = () => {
    chrome.runtime.sendMessage({ type: "clear_crawl" }, () => {
      setCrawlProgress(null);
      setCheckResult(null);
      setEditedLlmsTxt("");
      setEditedLlmsFullTxt("");
      // Recheck the input domain
      if (inputUrl) triggerCheck(inputUrl);
    });
  };

  const handleCopy = () => {
    const textToCopy = resultTab === "llms" ? editedLlmsTxt : editedLlmsFullTxt;
    navigator.clipboard.writeText(textToCopy)
      .then(() => showToast("Copied to clipboard!"))
      .catch(() => showToast("Failed to copy content."));
  };

  const handleDownload = () => {
    const textToDownload = resultTab === "llms" ? editedLlmsTxt : editedLlmsFullTxt;
    const filename = resultTab === "llms" ? "llms.txt" : "llms-full.txt";
    
    const blob = new Blob([textToDownload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloading ${filename}...`);
  };

  // Determine progress percentage and text description
  let progressPercent = 0;
  let progressText = "";
  if (crawlProgress) {
    switch (crawlProgress.status) {
      case "checking-existing":
        progressPercent = 15;
        progressText = "Checking existing llms.txt paths...";
        break;
      case "checking-sitemap":
        progressPercent = 30;
        progressText = "Inspecting sitemap.xml...";
        break;
      case "crawling":
        const max = 8;
        const count = crawlProgress.pagesScanned || 0;
        progressPercent = 35 + Math.min((count / max) * 50, 50);
        progressText = `Crawling website pages (${count}/${max} loaded)...`;
        break;
      case "formatting":
        progressPercent = 90;
        progressText = "Assembling Markdown directories...";
        break;
      case "complete":
        progressPercent = 100;
        progressText = "Crawl succeeded!";
        break;
      case "error":
        progressPercent = 100;
        progressText = "Generation failed.";
        break;
    }
  }

  const isCrawling = !!(crawlProgress && 
    crawlProgress.status !== "idle" && 
    crawlProgress.status !== "complete" && 
    crawlProgress.status !== "error");

  const showEditor = editedLlmsTxt || editedLlmsFullTxt;

  return (
    <div class="glass-container animate-slide-in">
      <header class="header-bar">
        <img src="assets/icons/icon128.png" alt="Logo" class="logo-img" />
        <div class="title-group">
          <h1 class="title-main">llms.txt Generator</h1>
          <span class="tagline">CLIENT-SIDE AI INDEX DIRECTORY</span>
        </div>
      </header>

      {/* URL Input Form */}
      <div class="input-group">
        <input
          type="text"
          value={inputUrl}
          onInput={(e) => setInputUrl((e.target as HTMLInputElement).value)}
          placeholder="Enter website URL (e.g. https://example.com)"
          class="input-text"
          disabled={isChecking || isCrawling}
        />
        <button
          onClick={() => triggerCheck(inputUrl)}
          disabled={isChecking || isCrawling || !inputUrl}
          class="btn btn-primary"
        >
          {isChecking ? <span class="spinner"></span> : "Scan"}
        </button>
      </div>

      {/* Local Tab Error Messages */}
      {tabError && <div class="error-banner animate-slide-in">{tabError}</div>}

      {/* Scan Results Checker UI */}
      {checkResult && checkResult.success && !isCrawling && !showEditor && (
        <div class="status-section animate-slide-in">
          {/* llms.txt Row */}
          <div class="status-card">
            <div class="status-info">
              <span class="status-filename">llms.txt</span>
              <span class="status-desc">Primary context index file</span>
            </div>
            <div class="status-actions">
              {checkResult.llmsTxt === "found" ? (
                <span class="badge badge-found">🟢 Exists</span>
              ) : (
                <span class="badge badge-missing">🟡 Missing</span>
              )}
              {checkResult.llmsTxt === "found" ? (
                <button class="btn btn-secondary" onClick={() => setResultTab("llms")}>View</button>
              ) : (
                <button class="btn btn-success" onClick={() => startCrawl(inputUrl)}>Generate</button>
              )}
            </div>
          </div>

          {/* llms-full.txt Row */}
          <div class="status-card">
            <div class="status-info">
              <span class="status-filename">llms-full.txt</span>
              <span class="status-desc">Deep content details file</span>
            </div>
            <div class="status-actions">
              {checkResult.llmsFullTxt === "found" ? (
                <span class="badge badge-found">🟢 Exists</span>
              ) : (
                <span class="badge badge-missing">🟡 Missing</span>
              )}
              {checkResult.llmsFullTxt === "found" && (
                <button class="btn btn-secondary" onClick={() => setResultTab("llmsFull")}>View</button>
              )}
            </div>
          </div>
        </div>
      )}

      {checkResult && !checkResult.success && !isCrawling && (
        <div class="error-banner animate-slide-in">{checkResult.error || "Failed to scan website."}</div>
      )}

      {/* Crawl Progress Layout */}
      {crawlProgress && crawlProgress.status !== "idle" && crawlProgress.status !== "complete" && (
        <div class="progress-section animate-slide-in">
          <div class="progress-header">
            <span class="progress-title">
              {crawlProgress.status === "error" ? "Crawl Failed" : "Indexing Website..."}
            </span>
            <span class="progress-percentage">{Math.round(progressPercent)}%</span>
          </div>
          <div class="progress-track">
            <div
              class="progress-bar"
              style={{
                width: `${progressPercent}%`,
                background: crawlProgress.status === "error" ? "var(--accent-rose)" : undefined,
              }}
            ></div>
          </div>
          <div class="progress-status-text">
            {isCrawling && <span class="spinner"></span>}
            {crawlProgress.status === "error" ? crawlProgress.error || progressText : progressText}
          </div>
        </div>
      )}

      {/* Results Markdown Editor Section */}
      {showEditor && !isCrawling && (
        <div class="editor-section animate-slide-in">
          <div class="tab-bar">
            <button
              class={`tab-btn ${resultTab === "llms" ? "active" : ""}`}
              onClick={() => setResultTab("llms")}
            >
              llms.txt
            </button>
            <button
              class={`tab-btn ${resultTab === "llmsFull" ? "active" : ""}`}
              onClick={() => setResultTab("llmsFull")}
            >
              llms-full.txt
            </button>
          </div>

          <textarea
            class="editor-textarea"
            value={resultTab === "llms" ? editedLlmsTxt : editedLlmsFullTxt}
            onInput={(e) => {
              const val = (e.target as HTMLTextAreaElement).value;
              if (resultTab === "llms") {
                setEditedLlmsTxt(val);
              } else {
                setEditedLlmsFullTxt(val);
              }
            }}
          />

          <div class="editor-footer">
            <div class="editor-footer-left">
              <button class="btn btn-primary" onClick={handleCopy}>
                Copy Raw
              </button>
              <button class="btn btn-secondary" onClick={handleDownload}>
                Download
              </button>
            </div>
            <button class="btn btn-secondary" onClick={clearAllState}>
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification popup */}
      {toast && (
        <div class="toast-container">
          <div class="toast">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

// Render into container
const rootEl = document.getElementById("root");
if (rootEl) {
  render(<Popup />, rootEl);
}
