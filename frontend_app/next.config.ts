import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Without this, Turbopack walks up past the repo and picks a stray
  // lockfile in the home directory as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
