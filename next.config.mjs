/** @type {import('next').NextConfig} */
const resolvedImageHosts = (() => {
  const hosts = new Set([
    "images.unsplash.com",
    "s3.icecreammusic.net",
    "avatars.yandex.net",
    "localhost",
    "127.0.0.1"
  ]);
  const candidateUrls = [process.env.NEXT_PUBLIC_S3_URL, process.env.S3_ENDPOINT];
  for (const candidate of candidateUrls) {
    if (!candidate) continue;
    try {
      hosts.add(new URL(candidate).hostname);
    } catch {
      // ignore invalid env values
    }
  }
  return Array.from(hosts);
})();

const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true
  },
  images: {
    remotePatterns: [
      ...resolvedImageHosts.flatMap((hostname) => [
        { protocol: "https", hostname },
        { protocol: "http", hostname }
      ]),
      { protocol: "https", hostname: "**.userapi.com" },
      { protocol: "http", hostname: "**.userapi.com" }
    ]
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"]
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.output = config.output ?? {};
      config.output.chunkLoadTimeout = 300000;
    }
    return config;
  }
};

export default nextConfig;
