/** @type {import("next").NextConfig} */
const nextConfig = {
  basePath: "/zetta",
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;
