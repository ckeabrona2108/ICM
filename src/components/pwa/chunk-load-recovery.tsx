const RECOVERY_SCRIPT = `
(() => {
  const storageKey = "icm:chunk-load-recovery";
  const retryWindowMs = 5 * 60 * 1000;

  const getMessage = (value) => {
    if (typeof value === "string") return value;
    if (value && typeof value.message === "string") return value.message;
    return "";
  };

  const isChunkFailure = (message, target) => {
    const source = target && typeof target.src === "string" ? target.src : "";
    return /ChunkLoadError|Loading chunk .+ failed|Failed to fetch dynamically imported module/i.test(message)
      || source.includes("/_next/static/chunks/");
  };

  const recover = (message, target) => {
    if (!isChunkFailure(message, target)) return;

    const now = Date.now();
    const lastRetry = Number(sessionStorage.getItem(storageKey) || 0);
    if (now - lastRetry < retryWindowMs) return;

    sessionStorage.setItem(storageKey, String(now));
    const url = new URL(window.location.href);
    url.searchParams.set("__chunk_retry", String(now));
    window.location.replace(url.toString());
  };

  window.addEventListener("error", (event) => {
    recover(getMessage(event.error) || event.message || "", event.target);
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    recover(getMessage(event.reason), null);
  });

  window.addEventListener("load", () => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("__chunk_retry")) return;
    url.searchParams.delete("__chunk_retry");
    window.history.replaceState(window.history.state, "", url.toString());
  }, { once: true });
})();
`;

export function ChunkLoadRecovery() {
  return <script dangerouslySetInnerHTML={{ __html: RECOVERY_SCRIPT }} />;
}
