const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro 0.84 enables package exports (exports field) by default, but
// react-dom 19's exports field causes resolution failures for react-dom/client
// on web builds. Classic file resolution handles this correctly.
config.resolver.unstable_enablePackageExports = false;

// bochas 3D (ago 2026): Metro no trata .fbx/.glb como asset por default,
// así que require('bocha_pool.fbx') fallaba al intentar parsearlo como
// código. .glb agregado al migrar de FBXLoader a GLTFLoader (bug de
// indexado de UVs específico de FBXLoader con este archivo, confirmado:
// el mesh se ve bien en Blender, mal solo al pasar por FBXLoader).
config.resolver.assetExts.push('fbx', 'glb');

module.exports = config;
