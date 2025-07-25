/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default {
  async rewrites() {
    return [
      {
        source: '/ocr',
        destination: 'http://localhost:8000/ocr',
      },
    ];
  },
};
