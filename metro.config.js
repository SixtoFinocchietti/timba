const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro 0.84 enables package exports (exports field) by default, but
// react-dom 19's exports field causes resolution failures for react-dom/client
// on web builds. Classic file resolution handles this correctly.
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
