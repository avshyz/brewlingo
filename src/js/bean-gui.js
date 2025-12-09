/**
 * Shared GUI Controls for Bean Visualization
 * Consolidates duplicate lil-gui setup code between particles.js and debug-bean.js
 */

// ============================================
// GUI STATE PERSISTENCE
// ============================================
const GUI_STORAGE_KEY = 'brewlingo-gui-state';

export function getGuiState() {
  try {
    return JSON.parse(localStorage.getItem(GUI_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function saveGuiState(state) {
  localStorage.setItem(GUI_STORAGE_KEY, JSON.stringify(state));
}

/**
 * Create a folder with persistent open/close state
 * @param {GUI} parent - Parent GUI or folder
 * @param {string} name - Folder name
 * @param {boolean} defaultOpen - Whether folder should be open by default
 * @returns {GUI} The created folder
 */
export function createFolder(parent, name, defaultOpen = false) {
  const folder = parent.addFolder(name);
  const state = getGuiState();
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Restore saved state or use default
  if (state[key] !== undefined) {
    state[key] ? folder.open() : folder.close();
  } else {
    defaultOpen ? folder.open() : folder.close();
  }

  // Listen for open/close and persist
  folder.onOpenClose((f) => {
    const current = getGuiState();
    current[key] = !f._closed;
    saveGuiState(current);
  });

  return folder;
}

/**
 * Add a reset button to a folder
 * @param {GUI} folder - The folder to add reset to
 * @param {Function} callback - Optional callback after reset
 */
export function addResetButton(folder, callback) {
  folder.add({ reset: () => {
    folder.reset();
    if (callback) callback();
  }}, 'reset').name('↺ Reset');
}

// ============================================
// BEAN SHAPE CONTROLS
// ============================================

/**
 * Setup bean dimension controls (Width, Length, Thickness)
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with beanScaleX/Y/Z
 * @param {Function} rebuildGeometry - Callback to rebuild geometry
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean }
 */
export function setupBeanDimensionControls(parent, config, rebuildGeometry, options = {}) {
  const { withReset = false, createSubfolder = false, folderName = 'Shape' } = options;
  const folder = createSubfolder ? createFolder(parent, folderName) : parent;

  folder.add(config, 'beanScaleX', 0.3, 1, 0.01).name('Width').onFinishChange(rebuildGeometry);
  folder.add(config, 'beanScaleY', 0.3, 1, 0.01).name('Length').onFinishChange(rebuildGeometry);
  folder.add(config, 'beanScaleZ', 0.3, 1, 0.01).name('Thickness').onFinishChange(rebuildGeometry);

  if (withReset) {
    addResetButton(folder, rebuildGeometry);
  }

  return folder;
}

/**
 * Setup kidney curve controls
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with kidney params
 * @param {Function} rebuildGeometry - Callback to rebuild geometry
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean }
 */
export function setupKidneyCurveControls(parent, config, rebuildGeometry, options = {}) {
  const { withReset = false, createSubfolder = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'Kidney Curve') : parent;

  folder.add(config, 'kidneyAmount', 0, 0.5, 0.01).name('Amount').onFinishChange(rebuildGeometry);
  folder.add(config, 'kidneyOffset', -0.3, 0.3, 0.01).name('Offset').onFinishChange(rebuildGeometry);
  folder.add(config, 'backBulge', 0, 0.5, 0.01).name('Back Bulge').onFinishChange(rebuildGeometry);
  folder.add(config, 'endPinch', 0, 0.6, 0.01).name('End Pinch').onFinishChange(rebuildGeometry);
  folder.add(config, 'endPointiness', 0, 0.5, 0.01).name('Pointiness').onFinishChange(rebuildGeometry);

  if (withReset) {
    addResetButton(folder, rebuildGeometry);
  }

  return folder;
}

/**
 * Setup crease controls
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with crease params
 * @param {THREE.ShaderMaterial} material - Bean material with uniforms
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean, includeRadius: boolean }
 */
export function setupCreaseControls(parent, config, material, options = {}) {
  const { withReset = false, createSubfolder = false, includeRadius = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'Crease') : parent;

  folder.add(config, 'creaseWidth', 0.01, 0.1, 0.001).name('Width').onChange(v => {
    material.uniforms.creaseWidth.value = v;
  });
  folder.add(config, 'creaseLength', 0.3, 0.95, 0.01).name('Length').onChange(v => {
    material.uniforms.creaseLength.value = v;
  });

  if (includeRadius) {
    folder.add(config, 'creaseRadius', 0, 0.1, 0.005).name('Radius').onChange(v => {
      material.uniforms.creaseRadius.value = v;
    });
  }

  if (withReset) {
    addResetButton(folder, () => {
      material.uniforms.creaseWidth.value = config.creaseWidth;
      material.uniforms.creaseLength.value = config.creaseLength;
      if (includeRadius) {
        material.uniforms.creaseRadius.value = config.creaseRadius;
      }
    });
  }

  return folder;
}

// ============================================
// STYLE CONTROLS
// ============================================

/**
 * Setup color controls
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with color params
 * @param {THREE.ShaderMaterial} material - Bean material with uniforms
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean }
 */
export function setupColorControls(parent, config, material, options = {}) {
  const { withReset = false, createSubfolder = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'Colors') : parent;

  folder.add(config, 'colorEnabled').name('Enable').onChange(v => {
    material.uniforms.colorEnabled.value = v ? 1.0 : 0.0;
  });
  folder.addColor(config, 'baseColor').name('Bean').onChange(v => {
    material.uniforms.baseColor.value.set(v);
  });
  folder.addColor(config, 'highlightColor').name('Highlight').onChange(v => {
    material.uniforms.highlightColor.value.set(v);
  });
  folder.addColor(config, 'creaseColor').name('Crease').onChange(v => {
    material.uniforms.creaseColor.value.set(v);
  });

  if (withReset) {
    addResetButton(folder, () => {
      material.uniforms.colorEnabled.value = config.colorEnabled ? 1.0 : 0.0;
      material.uniforms.baseColor.value.set(config.baseColor);
      material.uniforms.highlightColor.value.set(config.highlightColor);
      material.uniforms.creaseColor.value.set(config.creaseColor);
    });
  }

  return folder;
}

/**
 * Setup cel shading controls (toon, rim, specular)
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with cel shading params
 * @param {THREE.ShaderMaterial} material - Bean material with uniforms
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean }
 */
export function setupCelShadingControls(parent, config, material, options = {}) {
  const { withReset = false, createSubfolder = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'Cel Shading') : parent;

  folder.add(config, 'toonEnabled').name('☀ Toon').onChange(v => {
    material.uniforms.toonEnabled.value = v ? 1.0 : 0.0;
  });
  folder.add(config, 'toonBands', 1, 6, 1).name('Bands').onChange(v => {
    material.uniforms.toonBands.value = v;
  });
  folder.add(config, 'rimEnabled').name('✨ Rim').onChange(v => {
    material.uniforms.rimEnabled.value = v ? 1.0 : 0.0;
  });
  folder.add(config, 'rimIntensity', 0, 1.5, 0.05).name('Rim Intensity').onChange(v => {
    material.uniforms.rimIntensity.value = v;
  });
  folder.add(config, 'rimPower', 0.5, 5, 0.1).name('Rim Sharpness').onChange(v => {
    material.uniforms.rimPower.value = v;
  });
  folder.add(config, 'specularEnabled').name('💫 Specular').onChange(v => {
    material.uniforms.specularEnabled.value = v ? 1.0 : 0.0;
  });
  folder.add(config, 'specularIntensity', 0, 1.5, 0.05).name('Spec Intensity').onChange(v => {
    material.uniforms.specularIntensity.value = v;
  });
  folder.add(config, 'specularThreshold', 0.1, 0.9, 0.05).name('Spec Threshold').onChange(v => {
    material.uniforms.specularThreshold.value = v;
  });
  folder.add(config, 'specularPower', 8, 128, 4).name('Spec Sharpness').onChange(v => {
    material.uniforms.specularPower.value = v;
  });

  if (withReset) {
    addResetButton(folder, () => syncCelUniforms(config, material));
  }

  return folder;
}

/**
 * Sync all cel shading uniforms from config
 * @param {Object} config - CONFIG object
 * @param {THREE.ShaderMaterial} material - Bean material
 */
export function syncCelUniforms(config, material) {
  material.uniforms.toonEnabled.value = config.toonEnabled ? 1.0 : 0.0;
  material.uniforms.toonBands.value = config.toonBands;
  material.uniforms.rimEnabled.value = config.rimEnabled ? 1.0 : 0.0;
  material.uniforms.rimIntensity.value = config.rimIntensity;
  material.uniforms.rimPower.value = config.rimPower;
  material.uniforms.specularEnabled.value = config.specularEnabled ? 1.0 : 0.0;
  material.uniforms.specularIntensity.value = config.specularIntensity;
  material.uniforms.specularThreshold.value = config.specularThreshold;
  material.uniforms.specularPower.value = config.specularPower;
}

/**
 * Setup light direction controls
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with lightX/Y/Z
 * @param {THREE.ShaderMaterial} material - Bean material with uniforms
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean }
 */
export function setupLightDirectionControls(parent, config, material, options = {}) {
  const { withReset = false, createSubfolder = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'Light Direction') : parent;

  const updateLightDir = () => {
    material.uniforms.lightDir.value.set(config.lightX, config.lightY, config.lightZ).normalize();
  };

  folder.add(config, 'lightX', -1, 1, 0.1).name('X').onChange(updateLightDir);
  folder.add(config, 'lightY', -1, 1, 0.1).name('Y').onChange(updateLightDir);
  folder.add(config, 'lightZ', -1, 1, 0.1).name('Z').onChange(updateLightDir);

  if (withReset) {
    addResetButton(folder, updateLightDir);
  }

  return folder;
}

/**
 * Setup CMYK halo post-processing controls
 * @param {GUI} parent - Parent folder
 * @param {Object} config - CONFIG object with cmyk params
 * @param {ShaderPass} cmykPass - CMYK post-processing pass
 * @param {Object} options - { withReset: boolean, createSubfolder: boolean, includeWaveFreq: boolean }
 */
export function setupCMYKControls(parent, config, cmykPass, options = {}) {
  const { withReset = false, createSubfolder = false, includeWaveFreq = false } = options;
  const folder = createSubfolder ? createFolder(parent, 'CMYK Halo') : parent;

  folder.add(config, 'cmykOffset', 0.001, 0.015, 0.0005).name('Offset').onChange(v => {
    cmykPass.uniforms.offset.value = v;
  });
  folder.add(config, 'cmykRotationSpeed', 0, 2, 0.05).name('Rotation').onChange(v => {
    cmykPass.uniforms.rotationSpeed.value = v;
  });
  folder.add(config, 'cmykBreatheEnabled').name('Breathe').onChange(v => {
    cmykPass.uniforms.breatheEnabled.value = v ? 1.0 : 0.0;
  });
  folder.add(config, 'cmykBreatheIntensity', 0, 1, 0.05).name('Breathe Amount').onChange(v => {
    cmykPass.uniforms.breatheIntensity.value = v;
  });
  folder.add(config, 'cmykBreatheSpeed', 0, 3, 0.1).name('Breathe Speed').onChange(v => {
    cmykPass.uniforms.breatheSpeed.value = v;
  });

  if (includeWaveFreq) {
    folder.add(config, 'cmykBreatheWaveFreq', 0.5, 5, 0.25).name('Wave Frequency').onChange(v => {
      cmykPass.uniforms.breatheWaveFreq.value = v;
    });
  }

  if (withReset) {
    addResetButton(folder, () => syncCmykUniforms(config, cmykPass));
  }

  return folder;
}

/**
 * Sync all CMYK uniforms from config
 * @param {Object} config - CONFIG object
 * @param {ShaderPass} cmykPass - CMYK post-processing pass
 */
export function syncCmykUniforms(config, cmykPass) {
  cmykPass.uniforms.offset.value = config.cmykOffset;
  cmykPass.uniforms.rotationSpeed.value = config.cmykRotationSpeed;
  cmykPass.uniforms.breatheEnabled.value = config.cmykBreatheEnabled ? 1.0 : 0.0;
  cmykPass.uniforms.breatheIntensity.value = config.cmykBreatheIntensity;
  cmykPass.uniforms.breatheSpeed.value = config.cmykBreatheSpeed;
}

// ============================================
// COMPLETE STYLE FOLDER SETUP
// ============================================

/**
 * Setup a complete Style folder with all sub-controls
 * @param {GUI} gui - Root GUI instance
 * @param {Object} config - CONFIG object
 * @param {THREE.ShaderMaterial} material - Bean material
 * @param {ShaderPass} cmykPass - CMYK post-processing pass
 * @param {Object} options - { withReset: boolean, includeWaveFreq: boolean }
 */
export function setupStyleFolder(gui, config, material, cmykPass, options = {}) {
  const { withReset = false, includeWaveFreq = false } = options;
  const styleFolder = createFolder(gui, '🎨 Style');

  setupColorControls(styleFolder, config, material, { withReset, createSubfolder: true });
  setupCelShadingControls(styleFolder, config, material, { withReset, createSubfolder: true });
  setupLightDirectionControls(styleFolder, config, material, { withReset, createSubfolder: true });
  setupCMYKControls(styleFolder, config, cmykPass, { withReset, createSubfolder: true, includeWaveFreq });

  return styleFolder;
}

/**
 * Setup a complete Bean folder with shape controls
 * @param {GUI} gui - Root GUI instance
 * @param {Object} config - CONFIG object
 * @param {THREE.ShaderMaterial} material - Bean material
 * @param {Function} rebuildGeometry - Callback to rebuild geometry
 * @param {Object} options - { withReset: boolean, includeCreaseRadius: boolean, includeSizeControls: boolean }
 */
export function setupBeanFolder(gui, config, material, rebuildGeometry, options = {}) {
  const { withReset = false, includeCreaseRadius = false, includeSizeControls = false } = options;
  const beanFolder = createFolder(gui, '🫘 Bean');

  if (includeSizeControls) {
    const sizeSub = createFolder(beanFolder, 'Size');
    sizeSub.add(config, 'scaleMin', 0.05, 0.3, 0.01).name('Min').onFinishChange(options.onSizeChange);
    sizeSub.add(config, 'scaleMax', 0.1, 0.6, 0.01).name('Max').onFinishChange(options.onSizeChange);
  }

  setupBeanDimensionControls(beanFolder, config, rebuildGeometry, { withReset, createSubfolder: true });
  setupKidneyCurveControls(beanFolder, config, rebuildGeometry, { withReset, createSubfolder: true });
  setupCreaseControls(beanFolder, config, material, { withReset, createSubfolder: true, includeRadius: includeCreaseRadius });

  return beanFolder;
}
