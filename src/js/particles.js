/**
 * Floating 3D Coffee Beans
 * Procedural geometry with cel-shaded look + CMYK post-processing halo
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';
import gsap from 'gsap';
import {
  BEAN_CONFIG,
  createBeanGeometry,
  createBeanShaderUniforms,
  BeanShaderVertexShader,
  BeanShaderFragmentShader,
  createCMYKShaderUniforms,
  CMYKShaderVertexShader,
  CMYKShaderFragmentShader
} from './bean-model.js';

// ============================================
// CONFIGURATION
// ============================================
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

// Merge bean config with scene-specific config
const CONFIG = {
  // View options
  singleBeanMode: false,  // Default unchecked (starts in multi-bean view)
  showUI: true,           // Show landing card UI
  autoRotate: false,
  cmykEnabled: true,      // CMYK on by default for landing
  // Scene settings (not in BEAN_CONFIG)
  beanCount: 200,
  driftSpeed: 0.5,
  rotationSpeed: 3,
  scaleMin: 0.05,
  scaleMax: 0.48,
  depthMin: -5,
  depthMax: 2,
  spreadX: 12,
  spreadY: 8,
  staggerDelay: 10,
  animationDuration: 1000,
  elasticAmplitude: 1.5,
  elasticPeriod: 0.3,
  paused: false,
  collisionEnabled: true,
  collisionDamping: 0.8,
  collisionRadiusMultiplier: 0.5,
  // Import all bean shape/style settings from shared config
  ...BEAN_CONFIG
};

// Store initial config for reset/export functionality
const INITIAL_CONFIG = JSON.parse(JSON.stringify(CONFIG));

// View-only keys to exclude from export (populated dynamically from View folder)
const viewKeys = new Set();

// ============================================
// CMYK POST-PROCESSING SHADER (edge halo effect)
// ============================================
const CMYKShader = {
  uniforms: createCMYKShaderUniforms(CONFIG, isMobile),
  vertexShader: CMYKShaderVertexShader,
  fragmentShader: CMYKShaderFragmentShader
};

// ============================================
// CEL-SHADED BEAN MATERIAL (black + white crease)
// ============================================
const BeanShader = {
  uniforms: createBeanShaderUniforms(CONFIG),
  vertexShader: BeanShaderVertexShader,
  fragmentShader: BeanShaderFragmentShader
};

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer, composer, cmykPass, controls;
let beans = [];
let beanGeometry = null;
let beanMaterial = null;
let gui = null;
let heroBean = null;  // The featured bean in single-bean mode
let isTransitioning = false;
let cmykController = null;  // Reference to update checkbox when mode toggles
let landingCard = null;  // Reference to .landing-card element

// ============================================
// INITIALIZATION
// ============================================
function init() {
  if (!window.WebGLRenderingContext) {
    console.log('WebGL not supported');
    return;
  }

  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;

  // Scene
  scene = new THREE.Scene();

  // Camera
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.z = 12;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true
  });
  const pixelRatio = Math.min(window.devicePixelRatio, 3);
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  // Post-processing for CMYK halo effect
  // Let EffectComposer create and manage its own render targets
  // This ensures setSize() works correctly on window resize
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  cmykPass = new ShaderPass(CMYKShader);
  cmykPass.renderToScreen = true;
  cmykPass.enabled = CONFIG.cmykEnabled;
  composer.addPass(cmykPass);

  // OrbitControls (disabled by default in multi-bean mode)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = CONFIG.autoRotate;
  controls.autoRotateSpeed = 1.0;
  controls.enabled = CONFIG.singleBeanMode;  // Disabled in multi-bean mode

  // Get landing card reference for fade transitions
  landingCard = document.querySelector('.landing-card');

  // Create geometry and material
  beanGeometry = createBeanGeometry(CONFIG);
  beanMaterial = new THREE.ShaderMaterial({
    uniforms: BeanShader.uniforms,
    vertexShader: BeanShader.vertexShader,
    fragmentShader: BeanShader.fragmentShader,
    side: THREE.DoubleSide
  });

  // Create beans
  createBeans();
  animate();

  if (isDebug) {
    setupGUI();
  }

  window.addEventListener('resize', handleResize);
}

// ============================================
// DEBUG GUI
// ============================================
const GUI_STORAGE_KEY = 'brewlingo-gui-state';

function getGuiState() {
  try {
    return JSON.parse(localStorage.getItem(GUI_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveGuiState(state) {
  localStorage.setItem(GUI_STORAGE_KEY, JSON.stringify(state));
}

// Helper to add reset button to a folder
function addResetButton(folder, callback) {
  folder.add({ reset: () => {
    folder.reset();
    if (callback) callback();
  }}, 'reset').name('↺ Reset');
}

// Export current config as JS object (only changed values, excluding view settings)
function exportConfig() {
  const changes = {};
  for (const key in CONFIG) {
    if (viewKeys.has(key)) continue;
    if (JSON.stringify(CONFIG[key]) !== JSON.stringify(INITIAL_CONFIG[key])) {
      changes[key] = CONFIG[key];
    }
  }

  if (Object.keys(changes).length === 0) {
    alert('No changes from defaults!');
    return;
  }

  const output = JSON.stringify(changes, null, 2);
  navigator.clipboard.writeText(output).then(() => {
    console.log('Config copied to clipboard:\n', output);
    alert('Config copied to clipboard! Paste it in chat.');
  }).catch(err => {
    console.error('Failed to copy:', err);
    prompt('Copy this config:', output);
  });
}

// Sync all uniforms after reset
function syncUniforms() {
  // Cel shading
  beanMaterial.uniforms.toonEnabled.value = CONFIG.toonEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.toonBands.value = CONFIG.toonBands;
  beanMaterial.uniforms.rimEnabled.value = CONFIG.rimEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.rimIntensity.value = CONFIG.rimIntensity;
  beanMaterial.uniforms.rimPower.value = CONFIG.rimPower;
  beanMaterial.uniforms.specularEnabled.value = CONFIG.specularEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.specularIntensity.value = CONFIG.specularIntensity;
  beanMaterial.uniforms.specularThreshold.value = CONFIG.specularThreshold;
  beanMaterial.uniforms.specularPower.value = CONFIG.specularPower;
  // Colors
  beanMaterial.uniforms.colorEnabled.value = CONFIG.colorEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.baseColor.value.set(CONFIG.baseColor);
  beanMaterial.uniforms.highlightColor.value.set(CONFIG.highlightColor);
  beanMaterial.uniforms.creaseColor.value.set(CONFIG.creaseColor);
  // Crease
  beanMaterial.uniforms.creaseWidth.value = CONFIG.creaseWidth;
  beanMaterial.uniforms.creaseLength.value = CONFIG.creaseLength;
  // Light
  beanMaterial.uniforms.lightDir.value.set(CONFIG.lightX, CONFIG.lightY, CONFIG.lightZ).normalize();
  // CMYK
  cmykPass.uniforms.offset.value = CONFIG.cmykOffset;
  cmykPass.uniforms.rotationSpeed.value = CONFIG.cmykRotationSpeed;
  cmykPass.uniforms.breatheEnabled.value = CONFIG.cmykBreatheEnabled ? 1.0 : 0.0;
  cmykPass.uniforms.breatheIntensity.value = CONFIG.cmykBreatheIntensity;
  cmykPass.uniforms.breatheSpeed.value = CONFIG.cmykBreatheSpeed;
}

// Helper to create a folder with persistent open/close state
function createFolder(parent, name) {
  const folder = parent.addFolder(name);
  const state = getGuiState();
  const key = name.toLowerCase().replace(/\s+/g, '-');

  // Restore saved state (default to closed)
  if (state[key]) {
    folder.open();
  } else {
    folder.close();
  }

  // Listen for open/close and persist
  folder.onOpenClose((f) => {
    const current = getGuiState();
    current[key] = !f._closed;
    saveGuiState(current);
  });

  return folder;
}

let debounceTimer = null;
function debouncedReset() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(resetBeans, 150);
}

// Toggle landing card visibility
function toggleLandingCard(visible) {
  if (!landingCard) return;
  gsap.to(landingCard, {
    opacity: visible ? 1 : 0,
    duration: 0.3,
    ease: 'power2.inOut',
    onComplete: () => {
      landingCard.style.pointerEvents = visible ? 'auto' : 'none';
    }
  });
}

// Toggle single bean mode (wrapper for transition functions)
function toggleSingleBeanMode(enabled) {
  if (isTransitioning) return;
  isTransitioning = true;

  if (enabled) {
    transitionToSingleBean();
  } else {
    transitionToMultiBean();
  }
}

function setupGUI() {
  gui = new GUI({ title: 'Debug UI' });
  // Debug UI always starts open when d=1
  gui.open();
  gui.onOpenClose((g) => {
    const current = getGuiState();
    current['gui-root'] = !g._closed;
    saveGuiState(current);
  });

  // Top-level buttons
  gui.add({ exportConfig }, 'exportConfig').name('📋 Copy Changes');
  gui.add({ resetAll: () => {
    gui.reset();
    rebuildGeometry();
    syncUniforms();
    if (!CONFIG.singleBeanMode) {
      resetBeans();
    }
  }}, 'resetAll').name('↺ Reset All');

  // ============================================
  // 👁 VIEW - Mode and display options
  // ============================================
  // Helper to add control to View folder and track key for export exclusion
  const addViewControl = (key) => {
    viewKeys.add(key);
    return viewFolder.add(CONFIG, key);
  };

  const viewFolder = createFolder(gui, '👁 View');
  addViewControl('singleBeanMode').name('🫘 Single Bean Mode').onChange(toggleSingleBeanMode);
  addViewControl('showUI').name('👁 Show UI').onChange(toggleLandingCard);
  cmykController = addViewControl('cmykEnabled').name('✨ CMYK Halo').onChange(v => {
    cmykPass.enabled = v;
  });
  addViewControl('autoRotate').name('Auto Rotate').onChange(v => {
    controls.autoRotate = v;
  });
  addResetButton(viewFolder, () => {
    cmykPass.enabled = CONFIG.cmykEnabled;
    controls.autoRotate = CONFIG.autoRotate;
    if (landingCard) {
      landingCard.style.opacity = CONFIG.showUI ? 1 : 0;
      landingCard.style.pointerEvents = CONFIG.showUI ? 'auto' : 'none';
    }
  });

  // ============================================
  // ⚙️ SETUP - Scene configuration
  // ============================================
  const setupFolder = createFolder(gui, '⚙️ Setup');

  const spawnSub = createFolder(setupFolder, 'Spawn Area');
  spawnSub.add(CONFIG, 'beanCount', 10, 300, 1).name('Bean Count').onFinishChange(resetBeans);
  spawnSub.add(CONFIG, 'spreadX', 5, 25, 1).name('Width').onFinishChange(resetBeans);
  spawnSub.add(CONFIG, 'spreadY', 3, 15, 1).name('Height').onFinishChange(resetBeans);
  spawnSub.add(CONFIG, 'depthMin', -10, 0, 0.5).name('Near').onFinishChange(resetBeans);
  spawnSub.add(CONFIG, 'depthMax', 0, 10, 0.5).name('Far').onFinishChange(resetBeans);
  addResetButton(spawnSub, resetBeans);

  const entrySub = createFolder(setupFolder, 'Entry Animation');
  entrySub.add(CONFIG, 'staggerDelay', 5, 50, 1).name('Delay Between').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'animationDuration', 200, 2000, 50).name('Pop Duration').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'elasticAmplitude', 0.5, 3, 0.1).name('Bounce Strength').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'elasticPeriod', 0.1, 1, 0.05).name('Bounce Speed').onFinishChange(debouncedReset);
  addResetButton(entrySub, debouncedReset);

  // ============================================
  // 🫘 BEAN - Object shape and size
  // ============================================
  const beanFolder = createFolder(gui, '🫘 Bean');

  const sizeSub = createFolder(beanFolder, 'Spawn Size Range');
  sizeSub.add(CONFIG, 'scaleMin', 0.05, 0.3, 0.01).name('Min').onFinishChange(resetBeans);
  sizeSub.add(CONFIG, 'scaleMax', 0.1, 0.6, 0.01).name('Max').onFinishChange(resetBeans);
  addResetButton(sizeSub, resetBeans);

  const shapeSub = createFolder(beanFolder, 'Shape');
  shapeSub.add(CONFIG, 'beanScaleX', 0.3, 1, 0.05).name('Width').onFinishChange(rebuildGeometry);
  shapeSub.add(CONFIG, 'beanScaleY', 0.3, 1, 0.05).name('Length').onFinishChange(rebuildGeometry);
  shapeSub.add(CONFIG, 'beanScaleZ', 0.3, 1, 0.05).name('Thickness').onFinishChange(rebuildGeometry);
  addResetButton(shapeSub, rebuildGeometry);

  const kidneySub = createFolder(beanFolder, 'Kidney Curve');
  kidneySub.add(CONFIG, 'kidneyAmount', 0, 0.5, 0.01).name('Amount').onFinishChange(rebuildGeometry);
  kidneySub.add(CONFIG, 'kidneyOffset', -0.3, 0.3, 0.01).name('Offset').onFinishChange(rebuildGeometry);
  kidneySub.add(CONFIG, 'backBulge', 0, 0.5, 0.01).name('Back Bulge').onFinishChange(rebuildGeometry);
  kidneySub.add(CONFIG, 'endPinch', 0, 0.6, 0.01).name('End Pinch').onFinishChange(rebuildGeometry);
  kidneySub.add(CONFIG, 'endPointiness', 0, 0.5, 0.01).name('Pointiness').onFinishChange(rebuildGeometry);
  addResetButton(kidneySub, rebuildGeometry);

  const creaseSub = createFolder(beanFolder, 'Crease');
  creaseSub.add(CONFIG, 'creaseWidth', 0.01, 0.1, 0.001).name('Width').onChange(v => {
    beanMaterial.uniforms.creaseWidth.value = v;
  });
  creaseSub.add(CONFIG, 'creaseLength', 0.3, 0.95, 0.01).name('Length').onChange(v => {
    beanMaterial.uniforms.creaseLength.value = v;
  });
  addResetButton(creaseSub, () => {
    beanMaterial.uniforms.creaseWidth.value = CONFIG.creaseWidth;
    beanMaterial.uniforms.creaseLength.value = CONFIG.creaseLength;
  });

  // ============================================
  // 🎨 STYLE - Visual appearance
  // ============================================
  const styleFolder = createFolder(gui, '🎨 Style');

  // Colors subfolder
  const colorSub = createFolder(styleFolder, 'Colors');
  colorSub.add(CONFIG, 'colorEnabled').name('Enable').onChange(v => {
    beanMaterial.uniforms.colorEnabled.value = v ? 1.0 : 0.0;
  });
  colorSub.addColor(CONFIG, 'baseColor').name('Bean').onChange(v => {
    beanMaterial.uniforms.baseColor.value.set(v);
  });
  colorSub.addColor(CONFIG, 'highlightColor').name('Highlight').onChange(v => {
    beanMaterial.uniforms.highlightColor.value.set(v);
  });
  colorSub.addColor(CONFIG, 'creaseColor').name('Crease').onChange(v => {
    beanMaterial.uniforms.creaseColor.value.set(v);
  });
  addResetButton(colorSub, () => {
    beanMaterial.uniforms.colorEnabled.value = CONFIG.colorEnabled ? 1.0 : 0.0;
    beanMaterial.uniforms.baseColor.value.set(CONFIG.baseColor);
    beanMaterial.uniforms.highlightColor.value.set(CONFIG.highlightColor);
    beanMaterial.uniforms.creaseColor.value.set(CONFIG.creaseColor);
  });

  // Cel Shading subfolder
  const celSub = createFolder(styleFolder, 'Cel Shading');
  celSub.add(CONFIG, 'toonEnabled').name('☀ Toon').onChange(v => {
    beanMaterial.uniforms.toonEnabled.value = v ? 1.0 : 0.0;
  });
  celSub.add(CONFIG, 'toonBands', 1, 6, 1).name('Bands').onChange(v => {
    beanMaterial.uniforms.toonBands.value = v;
  });
  celSub.add(CONFIG, 'rimEnabled').name('✨ Rim').onChange(v => {
    beanMaterial.uniforms.rimEnabled.value = v ? 1.0 : 0.0;
  });
  celSub.add(CONFIG, 'rimIntensity', 0, 1.5, 0.05).name('Rim Intensity').onChange(v => {
    beanMaterial.uniforms.rimIntensity.value = v;
  });
  celSub.add(CONFIG, 'rimPower', 0.5, 5, 0.1).name('Rim Sharpness').onChange(v => {
    beanMaterial.uniforms.rimPower.value = v;
  });
  celSub.add(CONFIG, 'specularEnabled').name('💫 Specular').onChange(v => {
    beanMaterial.uniforms.specularEnabled.value = v ? 1.0 : 0.0;
  });
  celSub.add(CONFIG, 'specularIntensity', 0, 1.5, 0.05).name('Spec Intensity').onChange(v => {
    beanMaterial.uniforms.specularIntensity.value = v;
  });
  celSub.add(CONFIG, 'specularThreshold', 0.1, 0.9, 0.05).name('Spec Threshold').onChange(v => {
    beanMaterial.uniforms.specularThreshold.value = v;
  });
  celSub.add(CONFIG, 'specularPower', 8, 128, 4).name('Spec Sharpness').onChange(v => {
    beanMaterial.uniforms.specularPower.value = v;
  });
  addResetButton(celSub, () => {
    beanMaterial.uniforms.toonEnabled.value = CONFIG.toonEnabled ? 1.0 : 0.0;
    beanMaterial.uniforms.toonBands.value = CONFIG.toonBands;
    beanMaterial.uniforms.rimEnabled.value = CONFIG.rimEnabled ? 1.0 : 0.0;
    beanMaterial.uniforms.rimIntensity.value = CONFIG.rimIntensity;
    beanMaterial.uniforms.rimPower.value = CONFIG.rimPower;
    beanMaterial.uniforms.specularEnabled.value = CONFIG.specularEnabled ? 1.0 : 0.0;
    beanMaterial.uniforms.specularIntensity.value = CONFIG.specularIntensity;
    beanMaterial.uniforms.specularThreshold.value = CONFIG.specularThreshold;
    beanMaterial.uniforms.specularPower.value = CONFIG.specularPower;
  });

  // Light Direction subfolder
  const lightSub = createFolder(styleFolder, 'Light Direction');
  const updateLightDir = () => {
    beanMaterial.uniforms.lightDir.value.set(CONFIG.lightX, CONFIG.lightY, CONFIG.lightZ).normalize();
  };
  lightSub.add(CONFIG, 'lightX', -1, 1, 0.1).name('X').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightY', -1, 1, 0.1).name('Y').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightZ', -1, 1, 0.1).name('Z').onChange(updateLightDir);
  addResetButton(lightSub, updateLightDir);

  // CMYK Halo subfolder
  const cmykSub = createFolder(styleFolder, 'CMYK Halo');
  cmykSub.add(CONFIG, 'cmykOffset', 0.001, 0.015, 0.0005).name('Offset').onChange(v => {
    cmykPass.uniforms.offset.value = v;
  });
  cmykSub.add(CONFIG, 'cmykRotationSpeed', 0, 2, 0.05).name('Rotation').onChange(v => {
    cmykPass.uniforms.rotationSpeed.value = v;
  });
  cmykSub.add(CONFIG, 'cmykBreatheEnabled').name('Breathe').onChange(v => {
    cmykPass.uniforms.breatheEnabled.value = v ? 1.0 : 0.0;
  });
  cmykSub.add(CONFIG, 'cmykBreatheIntensity', 0, 1, 0.05).name('Breathe Amount').onChange(v => {
    cmykPass.uniforms.breatheIntensity.value = v;
  });
  cmykSub.add(CONFIG, 'cmykBreatheSpeed', 0, 3, 0.1).name('Breathe Speed').onChange(v => {
    cmykPass.uniforms.breatheSpeed.value = v;
  });
  cmykSub.add(CONFIG, 'cmykBreatheWaveFreq', 0.5, 5, 0.25).name('Wave Frequency').onChange(v => {
    cmykPass.uniforms.breatheWaveFreq.value = v;
  });
  addResetButton(cmykSub, () => {
    cmykPass.uniforms.offset.value = CONFIG.cmykOffset;
    cmykPass.uniforms.rotationSpeed.value = CONFIG.cmykRotationSpeed;
    cmykPass.uniforms.breatheEnabled.value = CONFIG.cmykBreatheEnabled ? 1.0 : 0.0;
    cmykPass.uniforms.breatheIntensity.value = CONFIG.cmykBreatheIntensity;
    cmykPass.uniforms.breatheSpeed.value = CONFIG.cmykBreatheSpeed;
    cmykPass.uniforms.breatheWaveFreq.value = CONFIG.cmykBreatheWaveFreq;
  });

  // ============================================
  // 🎬 PLAYBACK - Runtime controls
  // ============================================
  const playbackFolder = createFolder(gui, '🎬 Playback');

  const motionSub = createFolder(playbackFolder, 'Motion');
  motionSub.add(CONFIG, 'driftSpeed', 0, 1, 0.01).name('Drift').onFinishChange(updateVelocities);
  motionSub.add(CONFIG, 'rotationSpeed', 0, 5, 0.1).name('Spin').onFinishChange(updateVelocities);
  addResetButton(motionSub, updateVelocities);

  // Top-level playback controls (always visible)
  gui.add(CONFIG, 'paused').name('⏸ Pause');
  gui.add({ reset: resetBeans }, 'reset').name('🔄 Reset & Replay');
}

function resetBeans() {
  beans.forEach(bean => {
    gsap.killTweensOf(bean.scale);
    scene.remove(bean);
  });
  beans = [];
  createBeans();
}

function rebuildGeometry() {
  // Rebuild geometry with new shape params, update all beans
  beanGeometry.dispose();
  beanGeometry = createBeanGeometry(CONFIG);
  beans.forEach(bean => {
    bean.geometry = beanGeometry;
  });
}

function updateVelocities() {
  beans.forEach(bean => {
    bean.userData.vx = (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015;
    bean.userData.vy = (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015;
    bean.userData.vrx = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;
    bean.userData.vry = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;
    bean.userData.vrz = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;
  });
}

// ============================================
// MULTI/SINGLE BEAN MODE TRANSITIONS
// ============================================
function transitionToSingleBean() {
  // Disable controls during transition
  controls.enabled = false;

  // Find bean closest to screen center (project to screen space)
  let closestBean = beans[0];
  let closestDist = Infinity;

  beans.forEach(bean => {
    if (bean.scale.x <= 0) return; // Skip hidden beans
    // Project bean position to normalized device coordinates
    const projected = bean.position.clone().project(camera);
    // Distance from screen center (0,0 in NDC)
    const dist = Math.sqrt(projected.x * projected.x + projected.y * projected.y);
    if (dist < closestDist) {
      closestDist = dist;
      closestBean = bean;
    }
  });

  heroBean = closestBean;

  // Capture hero's current position for camera target
  const heroPos = heroBean.position.clone();

  // Calculate camera position: 3 units in front of hero (towards camera)
  const cameraTargetPos = {
    x: heroPos.x,
    y: heroPos.y,
    z: heroPos.z + 3
  };

  // Normalize hero rotation for shortest path to face camera
  const normalizeAngle = (angle) => {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  };
  heroBean.rotation.x = normalizeAngle(heroBean.rotation.x);
  heroBean.rotation.y = normalizeAngle(heroBean.rotation.y);
  heroBean.rotation.z = normalizeAngle(heroBean.rotation.z);

  // Turn off CMYK halo for single bean mode
  CONFIG.cmykEnabled = false;
  cmykPass.enabled = false;
  if (cmykController) cmykController.updateDisplay();

  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => {
      // Set controls target to hero position and enable
      controls.target.set(heroPos.x, heroPos.y, heroPos.z);
      controls.update();
      controls.enabled = true;
      // Toggle body class for CSS z-index/pointer-events
      document.body.classList.add('single-bean-mode');
      isTransitioning = false;
    }
  });

  const duration = 1.4;

  // Fade out landing card (respecting showUI setting)
  if (landingCard && CONFIG.showUI) {
    tl.to(landingCard, {
      opacity: 0,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => { landingCard.style.pointerEvents = 'none'; }
    }, 0.1);
  }

  // Camera pans TO the hero position
  tl.to(camera.position, {
    x: cameraTargetPos.x,
    y: cameraTargetPos.y,
    z: cameraTargetPos.z,
    duration: duration,
    ease: 'expo.inOut'
  }, 0);

  // Animate controls.target to hero position (for smooth orbit pivot)
  tl.to(controls.target, {
    x: heroPos.x,
    y: heroPos.y,
    z: heroPos.z,
    duration: duration,
    ease: 'expo.inOut',
    onUpdate: () => controls.update()
  }, 0);

  // Hero scales up to full size (stays in place!)
  tl.to(heroBean.scale, {
    x: 1, y: 1, z: 1,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);

  // Hero rotates to face camera (upright position)
  tl.to(heroBean.rotation, {
    x: 0, y: 0, z: 0,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);

  // Pop away other beans with stagger
  const otherBeans = beans.filter(b => b !== heroBean);
  const shuffled = otherBeans.sort(() => Math.random() - 0.5);
  const popStart = 0.6;

  shuffled.forEach((b, i) => {
    const startScale = b.scale.x;
    // Pop UP slightly then shrink to 0
    tl.to(b.scale, {
      x: startScale * 1.3,
      y: startScale * 1.3,
      z: startScale * 1.3,
      duration: 0.1,
      ease: 'power2.out'
    }, popStart + i * 0.003);
    tl.to(b.scale, {
      x: 0, y: 0, z: 0,
      duration: 0.15,
      ease: 'back.in(2)'
    }, popStart + i * 0.003 + 0.1);
  });
}

function transitionToMultiBean() {
  // Disable controls during transition
  controls.enabled = false;
  // Remove body class immediately so landing page is clickable as it fades in
  document.body.classList.remove('single-bean-mode');

  // Turn on CMYK halo for multi bean mode
  CONFIG.cmykEnabled = true;
  cmykPass.enabled = true;
  if (cmykController) cmykController.updateDisplay();

  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => {
      controls.target.set(0, 0, 0);
      controls.update();
      isTransitioning = false;
    }
  });

  const duration = 1.4;

  // Fade in landing card (respecting showUI setting)
  if (landingCard && CONFIG.showUI) {
    landingCard.style.pointerEvents = 'auto';
    tl.to(landingCard, {
      opacity: 1,
      duration: 0.4,
      ease: 'power2.in'
    }, 0.8);
  }

  // Camera zooms out to origin
  tl.to(camera.position, {
    x: 0, y: 0, z: 12,
    duration: duration,
    ease: 'expo.inOut'
  }, 0);

  // Animate controls.target back to origin
  tl.to(controls.target, {
    x: 0, y: 0, z: 0,
    duration: duration,
    ease: 'expo.inOut',
    onUpdate: () => controls.update()
  }, 0);

  // Shrink hero bean to multi-bean scale if it exists
  if (heroBean) {
    const heroTargetScale = CONFIG.scaleMin + Math.random() * (CONFIG.scaleMax - CONFIG.scaleMin);
    heroBean.userData.targetScale = heroTargetScale;
    heroBean.userData.vx = (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015;
    heroBean.userData.vy = (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015;
    heroBean.userData.vrx = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;
    heroBean.userData.vry = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;
    heroBean.userData.vrz = (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008;

    tl.to(heroBean.scale, {
      x: heroTargetScale,
      y: heroTargetScale,
      z: heroTargetScale,
      duration: 0.6,
      ease: 'power2.inOut'
    }, 0);

    // Move hero to random position
    tl.to(heroBean.position, {
      x: (Math.random() - 0.5) * CONFIG.spreadX * 2,
      y: (Math.random() - 0.5) * CONFIG.spreadY * 2,
      z: CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin),
      duration: 0.8,
      ease: 'power2.inOut'
    }, 0);
  }

  // Pop-reveal all other beans with stagger
  const otherBeans = beans.filter(b => b !== heroBean);
  const shuffled = otherBeans.sort(() => Math.random() - 0.5);

  shuffled.forEach((b, i) => {
    const targetScale = b.userData.targetScale;
    const popDelay = 0.15 + i * 0.002;

    // Reset position for hidden beans
    b.position.set(
      (Math.random() - 0.5) * CONFIG.spreadX * 2,
      (Math.random() - 0.5) * CONFIG.spreadY * 2,
      CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin)
    );

    // Pop UP first (overshoot), then settle to target
    tl.to(b.scale, {
      x: targetScale * 1.4,
      y: targetScale * 1.4,
      z: targetScale * 1.4,
      duration: 0.12,
      ease: 'power2.out'
    }, popDelay);
    tl.to(b.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: 0.25,
      ease: 'back.out(3)'
    }, popDelay + 0.12);
  });
}

// ============================================
// CREATE BEANS
// ============================================
function createBeans() {
  for (let i = 0; i < CONFIG.beanCount; i++) {
    const bean = new THREE.Mesh(beanGeometry, beanMaterial);

    bean.position.set(
      (Math.random() - 0.5) * CONFIG.spreadX * 2,
      (Math.random() - 0.5) * CONFIG.spreadY * 2,
      CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin)
    );

    bean.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    const targetScale = CONFIG.scaleMin + Math.random() * (CONFIG.scaleMax - CONFIG.scaleMin);
    bean.scale.setScalar(0);

    bean.userData = {
      targetScale,
      vx: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vy: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vrx: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vry: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vrz: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008
    };

    scene.add(bean);
    beans.push(bean);
  }

  revealBeansStaggered();
}

// ============================================
// STAGGERED REVEAL
// ============================================
function revealBeansStaggered() {
  const shuffled = [...beans].sort(() => Math.random() - 0.5);

  shuffled.forEach((bean, i) => {
    const delay = i * CONFIG.staggerDelay / 1000;
    const duration = CONFIG.animationDuration / 1000;

    gsap.to(bean.scale, {
      x: bean.userData.targetScale,
      y: bean.userData.targetScale,
      z: bean.userData.targetScale,
      duration,
      delay,
      ease: `elastic.out(${CONFIG.elasticAmplitude}, ${CONFIG.elasticPeriod})`
    });
  });
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
  requestAnimationFrame(animate);

  // Update CMYK time for animated glow
  cmykPass.uniforms.time.value += 0.016; // ~60fps delta

  // Update OrbitControls (handles damping, auto-rotate)
  controls.update();

  // Animate beans only in multi-bean mode and not paused
  if (!CONFIG.singleBeanMode && !CONFIG.paused) {
    beans.forEach(bean => {
      const { vx, vy, vrx, vry, vrz } = bean.userData;

      if (bean.scale.x > 0) {
        bean.position.x += vx;
        bean.position.y += vy;

        bean.rotation.x += vrx;
        bean.rotation.y += vry;
        bean.rotation.z += vrz;

        const boundX = CONFIG.spreadX + 2;
        const boundY = CONFIG.spreadY + 2;

        if (bean.position.x > boundX) bean.position.x = -boundX;
        if (bean.position.x < -boundX) bean.position.x = boundX;
        if (bean.position.y > boundY) bean.position.y = -boundY;
        if (bean.position.y < -boundY) bean.position.y = boundY;
      }
    });
  }

  composer.render();
}

// ============================================
// RESIZE
// ============================================
let resizeTimeout = null;

function handleResize() {
  // Debounce resize events for performance
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(performResize, 50);
}

function performResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  // Skip if dimensions are invalid or globals not ready
  if (width === 0 || height === 0 || !renderer || !camera || !composer) return;

  const pixelRatio = Math.min(window.devicePixelRatio, 3);

  // Update camera
  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  // Update renderer - setPixelRatio must come before setSize
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height);

  // Update composer - use display size, not pixel-scaled size
  // EffectComposer handles pixelRatio internally via renderer.getPixelRatio()
  composer.setSize(width, height);

  // Adjust spread based on aspect ratio to maintain visual density
  const baseAspect = 16 / 9;
  const currentAspect = width / height;
  const aspectRatio = currentAspect / baseAspect;
  CONFIG.spreadX = 12 * Math.max(0.8, Math.min(1.5, aspectRatio));
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
