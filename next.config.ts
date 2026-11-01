import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export
  output: 'export',
  
  // If your site will be hosted in a subdirectory (e.g., https://yourdomain.com/app)
  // Uncomment and modify the following:
  // basePath: '/app',
  
  // Add trailing slashes to URLs (recommended for static hosting)
  trailingSlash: true,
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // If you're using React's strict mode (recommended)
  reactStrictMode: true,

  // One root layout per language (so <html lang> is right in the static HTML)
  // means there is no single layout to compose a 404 from; see global-not-found.tsx.
  experimental: {
    globalNotFound: true,
  },
  
  // If you need to configure allowed domains for images
  // images: {
  //   unoptimized: true,
  //   domains: ['example.com', 'cdn.example.com'],
  // },
  
  // Environment variables that should be available in the browser
  // (remember to prefix with NEXT_PUBLIC_)
  env: {
    // NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.example.com',
  },
  
  // If you need to add custom webpack configuration
  // webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
  //   // Perform customizations to webpack config
  //   return config;
  // },
};

export default nextConfig;