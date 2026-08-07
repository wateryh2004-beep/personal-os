/**
 * Browser-safe R2 failure descriptions. These intentionally exclude provider
 * response bodies, request IDs, signed URLs, and credentials.
 */
export function r2FailureMessage(status: number | null, operation: "upload" | "verify") {
  if (status === 401 || status === 403) {
    return "R2 拒绝写入。请确认 AccessKeyID 与 SecretAccessKey 来自同一个 R2 API Token，且该 Token 对 life-of-hang-files-prod 具有 Object Read & Write 权限。";
  }
  if (status === 404) {
    return "未找到 R2 Bucket。请确认 Bucket 名称为 life-of-hang-files-prod，并使用 Cloudflare R2 的账户级 S3 API Endpoint。";
  }
  if (status === null) {
    return "Vercel 无法连接 R2。请检查 R2_ENDPOINT 是否为 Cloudflare 的账户级 S3 API Endpoint，然后重新部署。";
  }
  return operation === "upload"
    ? `R2 未接受图片上传（HTTP ${status}）。请检查 R2 凭据和 Bucket 权限。`
    : `图片已提交但 R2 未能确认对象（HTTP ${status}）。请稍后重试。`;
}

/** Safe browser-facing messages: never expose a signed URL or provider response body. */
export function directUploadFailureMessage(status: number | null) {
  if (status === null) return "无法连接 Cloudflare R2。浏览器直传请求可能被 CORS 阻止，请确认 R2 Bucket CORS 允许当前网站 Origin。";
  if (status === 401 || status === 403) return "R2 拒绝上传。请检查 presigned URL 签名以及 R2 API Token 的 Object Read & Write 权限。";
  return `R2 未接受上传（HTTP ${status}）。请检查后重试。`;
}
