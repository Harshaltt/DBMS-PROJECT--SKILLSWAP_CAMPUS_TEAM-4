/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native / large server-only packages are loaded by Node at runtime,
  // not bundled by webpack.
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'sharp', 'pg', 'bcryptjs'],
  // The embedding model files must ship with the server build.
  outputFileTracingIncludes: { '/api/**/*': ['./models/**/*'] },
  poweredByHeader: false,
};
export default nextConfig;
