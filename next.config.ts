import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Protect the actual owner login/consent surfaces from UI redressing.
    // Scope this policy so unrelated intentional embeds remain unchanged.
    return ["/login", "/settings/connections/codex/:path*", "/api/oauth/:path*"].map((source) => ({
      source,
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }));
  },
  experimental: {
    // A long Notes discussion can contain the note, prior turns, and a
    // continuation marker. The framework default is 1 MB, which is too small
    // for the product's intentional long-document workflow.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
