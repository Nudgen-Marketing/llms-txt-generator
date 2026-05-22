import { generateLlmsTxtFiles, ExistingFileStatus, LlmsTxtGeneratorResult } from "../shared/llms-txt-generator";
import { validatePublicHttpUrl } from "../shared/url-validation";

export type CrawlProgress = {
  url: string;
  status: 'idle' | 'checking-existing' | 'checking-sitemap' | 'crawling' | 'formatting' | 'complete' | 'error';
  pagesScanned: number;
  error?: string;
  result?: LlmsTxtGeneratorResult;
};

// Listen for messages from popup or page contexts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "check_llms_files") {
    handleCheckLlmsFiles(message.url).then(sendResponse);
    return true; // Keep channel open for async response
  } else if (message.type === "start_crawl") {
    handleStartCrawl(message.url).then(sendResponse);
    return true;
  } else if (message.type === "clear_crawl") {
    chrome.storage.session.remove("crawlProgress").then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  } else if (message.type === "get_crawl_status") {
    chrome.storage.session.get("crawlProgress").then((res) => {
      sendResponse({ success: true, progress: res.crawlProgress || null });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
  return false;
});

async function handleCheckLlmsFiles(rawUrl: string) {
  try {
    const withProtocol = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;
    const parsed = new URL(withProtocol);
    const origin = parsed.origin;

    // Validate URL safety
    const validation = validatePublicHttpUrl(origin);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const checkFile = async (path: string): Promise<{ status: ExistingFileStatus; content?: string }> => {
      try {
        const checkUrl = new URL(path, origin).toString();
        const response = await fetch(checkUrl, { method: "GET" });
        if (response.ok) {
          const content = await response.text();
          return { status: "found", content: content.slice(0, 120_000) };
        }
        if (response.status === 404) return { status: "missing" };
        return { status: "error" };
      } catch {
        return { status: "error" };
      }
    };

    const llmsTxtRes = await checkFile("/llms.txt");
    const llmsFullTxtRes = await checkFile("/llms-full.txt");

    return {
      success: true,
      llmsTxt: llmsTxtRes.status,
      llmsTxtContent: llmsTxtRes.content,
      llmsFullTxt: llmsFullTxtRes.status,
      llmsFullTxtContent: llmsFullTxtRes.content,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to check website status.",
    };
  }
}

async function handleStartCrawl(rawUrl: string) {
  const normalizedUrl = /^https?:\/\//i.test(rawUrl.trim()) ? rawUrl.trim() : `https://${rawUrl.trim()}`;

  const updateProgress = async (
    status: CrawlProgress["status"],
    pagesScanned = 0,
    result?: LlmsTxtGeneratorResult,
    error?: string
  ) => {
    const progress: CrawlProgress = {
      url: normalizedUrl,
      status,
      pagesScanned,
      error,
      result,
    };
    await chrome.storage.session.set({ crawlProgress: progress });

    // Try to notify runtime listeners
    try {
      chrome.runtime.sendMessage({ type: "crawl_progress", progress }).catch(() => {
        // Suppress errors when popup is closed
      });
    } catch {
      // Suppress
    }
  };

  try {
    await updateProgress("checking-existing", 0);
    const result = await generateLlmsTxtFiles(normalizedUrl, fetch, (phase, pagesScanned) => {
      updateProgress(phase, pagesScanned);
    });

    await updateProgress("complete", result.pagesScanned, result);
    return { success: true, result };
  } catch (error: any) {
    const errorMsg = error.message || "Failed to crawl site.";
    await updateProgress("error", 0, undefined, errorMsg);
    return { success: false, error: errorMsg };
  }
}
