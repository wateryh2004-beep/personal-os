import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A long Notes discussion can contain the note, prior turns, and a
    // continuation marker. The framework default is 1 MB, which is too small
    // for the product's intentional long-document workflow.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
