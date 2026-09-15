import type { NextConfig } from 'next';

const config: NextConfig = {
  // @prisma/internals loads a real .wasm file from its own install path at
  // runtime — bundling it (the default) breaks that path resolution. Mark
  // it (and anything that imports it) external so Next uses real Node
  // require instead of trying to bundle it.
  serverExternalPackages: ['@prisma/internals', '@prizzle/core'],
};

export default config;