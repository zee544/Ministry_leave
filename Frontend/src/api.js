
const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ""
).replace(/\/+$/, "");

export function apiUrl(path) {
  if (import.meta.env.PROD) {
    const configuredUrl = API_BASE_URL && new URL(API_BASE_URL);
    const hostname = configuredUrl?.hostname
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "")
      .toLowerCase();
    const isLoopback = hostname === "localhost"
      || hostname === "::1"
      || hostname === "0.0.0.0"
      || /^127\./.test(hostname || "");

    if (!configuredUrl || configuredUrl.protocol !== "https:" || isLoopback) {
      throw new Error('Set VITE_API_URL to the deployed backend URL before building for production.');
    }
  }

  const normalizedPath = path.startsWith("/")
    ? path
    : `/${path}`;

  return `${API_BASE_URL}${normalizedPath}`;
}
