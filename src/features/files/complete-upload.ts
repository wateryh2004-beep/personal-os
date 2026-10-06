/** Retry only the same completion ID, never start a fresh upload after a lost reply. */
export async function completeFileUpload(documentId: string, fetcher: typeof fetch = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher("/api/files/upload-url", {
        method: "PATCH", signal: AbortSignal.timeout(240_000),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }),
      });
      if (attempt === 0 && response.status >= 500) continue;
      return response;
    } catch {
      if (attempt === 1) throw new Error("文件已上传，但最终保存状态未确认；请刷新检查，不要重复上传原文件。");
    }
  }
  throw new Error("文件确认结果未收到，请刷新检查；不要重复上传原文件。");
}
