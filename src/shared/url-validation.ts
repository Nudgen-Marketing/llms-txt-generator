export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
}

const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isPrivateOrReservedIpv4(hostname: string): boolean {
  if (!IPV4_PATTERN.test(hostname)) {
    return false;
  }

  const [firstOctet, secondOctet] = hostname.split(".").map(Number);

  return (
    firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) ||
    (firstOctet === 169 && secondOctet === 254) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168) ||
    (firstOctet === 198 && (secondOctet === 18 || secondOctet === 19)) ||
    firstOctet >= 224
  );
}

function isPrivateOrReservedIpv6(hostname: string): boolean {
  const normalizedHostname = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();

  return (
    normalizedHostname === "::" ||
    normalizedHostname === "::1" ||
    normalizedHostname.startsWith("fc") ||
    normalizedHostname.startsWith("fd") ||
    normalizedHostname.startsWith("fe8") ||
    normalizedHostname.startsWith("fe9") ||
    normalizedHostname.startsWith("fea") ||
    normalizedHostname.startsWith("feb")
  );
}

export function validatePublicHttpUrl(urlStr: string): UrlValidationResult {
  const trimmedUrl = urlStr.trim();

  if (!trimmedUrl) {
    return { isValid: false, error: "Website URL is required." };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return {
      isValid: false,
      error: "Enter a valid website URL starting with http:// or https://.",
    };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      isValid: false,
      error: "Enter a valid website URL starting with http:// or https://.",
    };
  }

  if (!parsedUrl.hostname) {
    return {
      isValid: false,
      error: "Website URL must point to a public website.",
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      isValid: false,
      error: "Website URL cannot include embedded usernames or passwords.",
    };
  }

  const normalizedHostname = parsedUrl.hostname.toLowerCase();

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local") ||
    normalizedHostname.endsWith(".internal")
  ) {
    return {
      isValid: false,
      error: "Website URL must point to a public website, not a local or internal address.",
    };
  }

  const isIpLiteral =
    IPV4_PATTERN.test(normalizedHostname) ||
    normalizedHostname.includes(":") ||
    normalizedHostname.startsWith("[");

  if (isIpLiteral) {
    if (
      isPrivateOrReservedIpv4(normalizedHostname) ||
      isPrivateOrReservedIpv6(normalizedHostname)
    ) {
      return {
        isValid: false,
        error:
          "Website URL must point to a public website, not a private network address.",
      };
    }

    return {
      isValid: false,
      error: "Website URL must use a public domain name, not a raw IP address.",
    };
  }

  if (!normalizedHostname.includes(".")) {
    return {
      isValid: false,
      error: "Website URL must use a public domain name.",
    };
  }

  return { isValid: true };
}

export function isValidPublicHttpUrl(urlStr: string): boolean {
  return validatePublicHttpUrl(urlStr).isValid;
}

export function relabelPublicHttpUrlError(error: string | undefined, label: string): string | undefined {
  if (!error) return error;

  return error.replace(/Website URL/g, label);
}
