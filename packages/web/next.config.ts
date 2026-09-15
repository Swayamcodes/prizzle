import type { NextConfig } from 'next';

const config: NextConfig = {
  // @prizzle/core is a workspace package consumed as TypeScript source,
  // so Next must transpile it rather than expecting pre-built output.
  transpilePackages: ['@prizzle/core'],
};

export default config;