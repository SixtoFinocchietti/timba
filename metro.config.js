const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro 0.84 enables package exports (exports field) by default, but
// react-dom 19's exports field causes resolution failures for react-dom/client
// on web builds. Classic file resolution handles this correctly.
config.resolver.unstable_enablePackageExports = false;

// bochas 3D (ago 2026): Metro no trata .glb como asset por default, así
// que require('bocha_pool.glb') fallaba al intentar parsearlo como código.
// Ya no incluye 'fbx': se migró de FBXLoader a GLTFLoader y el .fbx viejo
// se borró — tenerlo junto al .glb con el mismo nombre base rompía el
// build standalone (Gradle: "Duplicate resources", ambos colapsan al mismo
// nombre de recurso Android sin extensión; Expo Go nunca lo mostró porque
// esa conversión a recursos nativos solo pasa en builds standalone/EAS).
config.resolver.assetExts.push('glb');

module.exports = config;
