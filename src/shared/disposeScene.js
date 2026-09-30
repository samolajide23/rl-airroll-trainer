export function disposeScene(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  function collect(object, sharedAssets = false) {
    sharedAssets ||= object.userData.sharedAssets === true;
    if (object.geometry && !sharedAssets) geometries.add(object.geometry);
    if (object.material) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        if (!sharedAssets) {
          for (const value of Object.values(material)) {
            if (value?.isTexture) textures.add(value);
          }
        }
      }
    }
    for (const child of object.children) collect(child, sharedAssets);
  }
  collect(root);
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}