const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro 0.84 enables package exports (exports field) by default, but
// react-dom 19's exports field causes resolution failures for react-dom/client
// on web builds. Classic file resolution handles this correctly.
config.resolver.unstable_enablePackageExports = false;

// bochas 3D (ago 2026): Metro no trata .glb/.dat como asset por default,
// así que require('bocha_pool.glb') fallaba al intentar parsearlos como
// código. Ya no incluye 'fbx': se migró de FBXLoader a GLTFLoader y el
// .fbx viejo se borró — tenerlo junto al .glb con el mismo nombre base
// rompía el build standalone (Gradle: "Duplicate resources", ambos
// colapsan al mismo nombre de recurso Android sin extensión; Expo Go
// nunca lo mostró porque esa conversión a recursos nativos solo pasa en
// builds standalone/EAS).
//
// 'dat': las 16 texturas de bochas + brillo.png se renombraron de
// .jpg/.png a .dat — bug real de build standalone (ago 2026): React
// Native compila jpg/jpeg/png como recursos "drawable-*dpi" de Android
// (@react-native/assets-registry/path-support.js, pensado para
// consumirse solo desde <Image>, con variantes por densidad), mientras
// que cualquier otra extensión de asset cae en "raw" (un recurso simple,
// legible por bytes). decodificarPNG.ts/jpeg-js necesitan leer los bytes
// crudos del archivo (no mostrarlo con <Image>) — con drawable, la URI
// que devuelve expo-asset no es legible ("no protocol", confirmado con
// logcat en el APK instalado); con .dat cae en raw, igual que el .glb,
// que sí se pudo leer. El formato real (jpeg/png) se pasa aparte como
// parámetro explícito en cargarTexturaDesdeUri — el nombre del archivo
// no necesita reflejarlo.
config.resolver.assetExts.push('glb', 'dat');

module.exports = config;
