import type { NextConfig } from 'next';
import { join } from 'path';

const nextConfig: NextConfig = {
  // Fija la raíz del proyecto (hay otros lockfiles en directorios padre).
  outputFileTracingRoot: join(__dirname),
  turbopack: { root: join(__dirname) },
};

export default nextConfig;
