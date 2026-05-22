type ExtensionApi = typeof chrome;

type GlobalWithExtensions = typeof globalThis & {
  browser?: ExtensionApi;
  chrome?: ExtensionApi;
};

const globalWithExtensions = globalThis as GlobalWithExtensions;

function getExtensionApi(): ExtensionApi {
  const api = globalWithExtensions.browser ?? globalWithExtensions.chrome;
  if (!api) {
    throw new Error('WebExtension API is unavailable.');
  }
  return api;
}

function usesBrowserNamespace(): boolean {
  return !!globalWithExtensions.browser;
}

export function hasExtensionApi(): boolean {
  return !!(globalWithExtensions.browser ?? globalWithExtensions.chrome);
}

export function isProtectedPageUrl(url: string): boolean {
  return /^(chrome:\/\/|chrome-extension:\/\/|edge:\/\/|about:)/.test(url);
}

export async function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const api = getExtensionApi();
  if (usesBrowserNamespace()) {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  return new Promise((resolve) => {
    api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

export async function sendRuntimeMessage<TMessage, TResponse = unknown>(
  message: TMessage,
): Promise<TResponse> {
  const api = getExtensionApi();
  if (usesBrowserNamespace()) {
    return api.runtime.sendMessage(message) as Promise<TResponse>;
  }

  return new Promise((resolve, reject) => {
    api.runtime.sendMessage(message, (response: TResponse) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

export async function getTab(tabId: number): Promise<chrome.tabs.Tab> {
  const api = getExtensionApi();
  if (usesBrowserNamespace()) {
    return api.tabs.get(tabId);
  }

  return new Promise((resolve, reject) => {
    api.tabs.get(tabId, (tab) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(tab);
    });
  });
}

export async function executeScript(
  details: Parameters<typeof chrome.scripting.executeScript>[0],
): Promise<chrome.scripting.InjectionResult<unknown>[] | void> {
  const api = getExtensionApi();
  if (usesBrowserNamespace()) {
    return api.scripting.executeScript(details);
  }

  return new Promise((resolve, reject) => {
    api.scripting.executeScript(details, (results) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(results);
    });
  });
}

export async function storageGet<T>(key: string): Promise<T | undefined> {
  const api = getExtensionApi();
  if (!api.storage?.local) {
    return undefined;
  }

  if (usesBrowserNamespace()) {
    const result = await api.storage.local.get(key);
    return result[key] as T | undefined;
  }

  return new Promise((resolve) => {
    api.storage.local.get([key], (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  const api = getExtensionApi();
  if (!api.storage?.local) {
    return;
  }

  if (usesBrowserNamespace()) {
    await api.storage.local.set({ [key]: value });
    return;
  }

  return new Promise((resolve) => {
    api.storage.local.set({ [key]: value }, () => resolve());
  });
}

export async function sessionStorageGet<T>(key: string): Promise<T | undefined> {
  const api = getExtensionApi();
  // Fallback to local storage if session storage is not available in manifest
  const storage = api.storage.session ?? api.storage.local;
  if (!storage) {
    return undefined;
  }

  if (usesBrowserNamespace()) {
    const result = await storage.get(key);
    return result[key] as T | undefined;
  }

  return new Promise((resolve) => {
    storage.get([key], (result) => {
      resolve(result[key] as T | undefined);
    });
  });
}

export async function sessionStorageSet<T>(key: string, value: T): Promise<void> {
  const api = getExtensionApi();
  const storage = api.storage.session ?? api.storage.local;
  if (!storage) {
    return;
  }

  if (usesBrowserNamespace()) {
    await storage.set({ [key]: value });
    return;
  }

  return new Promise((resolve) => {
    storage.set({ [key]: value }, () => resolve());
  });
}
