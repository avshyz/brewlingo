/**
 * Floating 3D Coffee Beans
 * Procedural geometry with cel-shaded look + CMYK post-processing halo
 */
import * as THREE from 'three';
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
let scene, camera, renderer, composer, cmykPass;
let beans = [];
let beanGeometry = null;
let beanMaterial = null;
let gui = null;

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
  composer.addPass(cmykPass);

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

function setupGUI() {
  gui = new GUI({ title: 'Debug UI' });
  const state = getGuiState();
  if (state['gui-root']) {
    gui.open();
  } else {
    gui.close();
  }
  gui.onOpenClose((g) => {
    const current = getGuiState();
    current['gui-root'] = !g._closed;
    saveGuiState(current);
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

  const entrySub = createFolder(setupFolder, 'Entry Animation');
  entrySub.add(CONFIG, 'staggerDelay', 5, 50, 1).name('Delay Between').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'animationDuration', 200, 2000, 50).name('Pop Duration').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'elasticAmplitude', 0.5, 3, 0.1).name('Bounce Strength').onFinishChange(debouncedReset);
  entrySub.add(CONFIG, 'elasticPeriod', 0.1, 1, 0.05).name('Bounce Speed').onFinishChange(debouncedReset);

  // ============================================
  // 🫘 BEAN - Object shape and size
  // ============================================
  const beanFolder = createFolder(gui, '🫘 Bean');

  const sizeSub = createFolder(beanFolder, 'Size');
  sizeSub.add(CONFIG, 'scaleMin', 0.05, 0.3, 0.01).name('Min').onFinishChange(resetBeans);
  sizeSub.add(CONFIG, 'scaleMax', 0.1, 0.6, 0.01).name('Max').onFinishChange(resetBeans);

  const shapeSub = createFolder(beanFolder, 'Shape');
  shapeSub.add(CONFIG, 'beanScaleX', 0.3, 1, 0.05).name('Width').onFinishChange(rebuildGeometry);
  shapeSub.add(CONFIG, 'beanScaleY', 0.3, 1, 0.05).name('Length').onFinishChange(rebuildGeometry);
  shapeSub.add(CONFIG, 'beanScaleZ', 0.3, 1, 0.05).name('Thickness').onFinishChange(rebuildGeometry);

  const creaseSub = createFolder(beanFolder, 'Crease');
  creaseSub.add(CONFIG, 'creaseWidth', 0.01, 0.1, 0.001).name('Width').onChange(v => {
    beanMaterial.uniforms.creaseWidth.value = v;
  });
  creaseSub.add(CONFIG, 'creaseLength', 0.3, 0.95, 0.01).name('Length').onChange(v => {
    beanMaterial.uniforms.creaseLength.value = v;
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

  // Light Direction subfolder
  const lightSub = createFolder(styleFolder, 'Light Direction');
  const updateLightDir = () => {
    beanMaterial.uniforms.lightDir.value.set(CONFIG.lightX, CONFIG.lightY, CONFIG.lightZ).normalize();
  };
  lightSub.add(CONFIG, 'lightX', -1, 1, 0.1).name('X').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightY', -1, 1, 0.1).name('Y').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightZ', -1, 1, 0.1).name('Z').onChange(updateLightDir);

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

  // ============================================
  // 🎬 PLAYBACK - Runtime controls
  // ============================================
  const playbackFolder = createFolder(gui, '🎬 Playback');

  const motionSub = createFolder(playbackFolder, 'Motion');
  motionSub.add(CONFIG, 'driftSpeed', 0, 1, 0.01).name('Drift').onFinishChange(updateVelocities);
  motionSub.add(CONFIG, 'rotationSpeed', 0, 5, 0.1).name('Spin').onFinishChange(updateVelocities);

  // Top-level controls (always visible)
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

  if (!CONFIG.paused) {
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
