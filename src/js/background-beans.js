/**
 * Parallax 3D Coffee Bean Background
 * Lightweight renderer for language.html and recipe.html
 * Modern preset (specular-only, high contrast black & white)
 *
 * Scene is lazily initialized only when enabled via debug GUI
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';
import {
  createBeanGeometry,
  createBeanShaderUniforms,
  BeanShaderVertexShader,
  BeanShaderFragmentShader,
  createCMYKShaderUniforms,
  CMYKShaderVertexShader,
  CMYKShaderFragmentShader
} from './bean-model.js';
import { BEAN_CONFIG, BACKGROUND_BEANS_CONFIG } from './consts.js';

// ============================================
// CONFIGURATION
// ============================================
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

const CONFIG = {
  // Merge base bean config
  ...BEAN_CONFIG,
  // Apply background beans config
  ...BACKGROUND_BEANS_CONFIG,
  // Runtime state
  beanCount: isMobile ? BACKGROUND_BEANS_CONFIG.beanCountMobile : BACKGROUND_BEANS_CONFIG.beanCountDesktop,
  paused: false,
  // 3D canvas toggle (on by default)
  canvas3DEnabled: true
};

// ============================================
// GLOBALS (lazy initialized)
// ============================================
let scene = null;
let camera = null;
let renderer = null;
let composer = null;
let cmykPass = null;
let beans = [];
let beanGeometry = null;
let beanMaterial = null;
let gui = null;
let dotsMesh = null;
let animationId = null;
let isInitialized = false;
let scrollTimeout = null;
let isScrolling = false;

// ============================================
// INITIALIZATION
// ============================================
function init() {
  // Set up debug GUI
  setupDebugGUI();

  // Create scene immediately if 3D canvas is enabled by default
  if (CONFIG.canvas3DEnabled) {
    toggleCanvas3D(true);
  }
}

// ============================================
// CREATE 3D SCENE (called when toggle is enabled)
// ============================================
function createScene() {
  if (isInitialized) return;

  if (!window.WebGLRenderingContext) {
    console.log('WebGL not supported');
    return;
  }

  const canvas = document.getElementById('background-canvas');
  if (!canvas) return;

  // Shaders (created fresh each time)
  const CMYKShader = {
    uniforms: createCMYKShaderUniforms(CONFIG, isMobile),
    vertexShader: CMYKShaderVertexShader,
    fragmentShader: CMYKShaderFragmentShader
  };

  const BeanShader = {
    uniforms: createBeanShaderUniforms(CONFIG),
    vertexShader: BeanShaderVertexShader,
    fragmentShader: BeanShaderFragmentShader
  };

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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  // Post-processing for CMYK halo effect
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  cmykPass = new ShaderPass(CMYKShader);
  cmykPass.enabled = CONFIG.cmykEnabled;
  composer.addPass(cmykPass);

  // Create bean geometry and material
  beanGeometry = createBeanGeometry(CONFIG);
  beanMaterial = new THREE.ShaderMaterial({
    uniforms: BeanShader.uniforms,
    vertexShader: BeanShader.vertexShader,
    fragmentShader: BeanShader.fragmentShader,
    transparent: true
  });

  // Create dots grid (behind everything)
  createDots();

  // Create beans
  createBeans();

  // Event listeners
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', updateParallax, { passive: true });

  // Initial parallax position
  updateParallax();

  // Start animation
  animate();

  isInitialized = true;
}

// ============================================
// DESTROY 3D SCENE (called when toggle is disabled)
// ============================================
function destroyScene() {
  if (!isInitialized) return;

  // Stop animation
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // Remove event listeners
  window.removeEventListener('resize', onResize);
  window.removeEventListener('scroll', updateParallax);

  // Dispose beans
  beans.forEach(bean => {
    scene.remove(bean);
  });
  beans = [];

  // Dispose dots
  if (dotsMesh) {
    scene.remove(dotsMesh);
    dotsMesh.geometry.dispose();
    dotsMesh.material.dispose();
    dotsMesh = null;
  }

  // Dispose geometry and material
  if (beanGeometry) {
    beanGeometry.dispose();
    beanGeometry = null;
  }
  if (beanMaterial) {
    beanMaterial.dispose();
    beanMaterial = null;
  }

  // Dispose composer and renderer
  if (composer) {
    composer.dispose();
    composer = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // Clear references
  scene = null;
  camera = null;
  cmykPass = null;

  isInitialized = false;
}

// ============================================
// CREATE DOTS GRID
// ============================================
function createDots() {
  if (!scene) return;

  if (dotsMesh) {
    scene.remove(dotsMesh);
    dotsMesh.geometry.dispose();
    dotsMesh.material.dispose();
    dotsMesh = null;
  }

  if (!CONFIG.dotsEnabled) return;

  const positions = [];
  const cols = Math.ceil(CONFIG.dotSpreadX / CONFIG.dotSpacing);
  const rows = Math.ceil(CONFIG.dotSpreadY / CONFIG.dotSpacing);

  for (let i = -cols; i <= cols; i++) {
    for (let j = -rows; j <= rows; j++) {
      positions.push(
        i * CONFIG.dotSpacing,
        j * CONFIG.dotSpacing,
        CONFIG.dotDepth
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(CONFIG.dotColor),
    size: CONFIG.dotSize,
    sizeAttenuation: true
  });

  dotsMesh = new THREE.Points(geometry, material);
  scene.add(dotsMesh);
}

// ============================================
// CREATE BEANS
// ============================================
function createBeans() {
  if (!scene || !beanGeometry || !beanMaterial) return;

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

    // Set scale immediately (no entrance animation)
    bean.scale.setScalar(CONFIG.scaleMax);

    // Store velocities for drift/rotation
    bean.userData = {
      vx: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vy: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vrx: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vry: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vrz: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008
    };

    scene.add(bean);
    beans.push(bean);
  }
}

// ============================================
// PARALLAX
// ============================================
function updateParallax() {
  if (!camera) return;

  const scrollY = window.scrollY;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const scrollProgress = maxScroll > 0 ? Math.min(scrollY / maxScroll, 1) : 0;

  // Move camera Y position based on scroll (subtle depth shift)
  camera.position.y = -scrollProgress * CONFIG.parallaxIntensity * 10;

  // Pause animation while scrolling
  isScrolling = true;
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling = false;
  }, 150);
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
  animationId = requestAnimationFrame(animate);

  if (!composer || !cmykPass) return;

  // Update CMYK time for animated glow
  cmykPass.uniforms.time.value += 0.016;

  // Animate beans (unless paused or scrolling)
  if (!CONFIG.paused && !isScrolling) {
    beans.forEach(bean => {
      const { vx, vy, vrx, vry, vrz } = bean.userData;

      // Drift
      bean.position.x += vx;
      bean.position.y += vy;

      // Rotation
      bean.rotation.x += vrx;
      bean.rotation.y += vry;
      bean.rotation.z += vrz;

      // Wrap at boundaries
      const boundX = CONFIG.spreadX + 2;
      const boundY = CONFIG.spreadY + 2;

      if (bean.position.x > boundX) bean.position.x = -boundX;
      if (bean.position.x < -boundX) bean.position.x = boundX;
      if (bean.position.y > boundY) bean.position.y = -boundY;
      if (bean.position.y < -boundY) bean.position.y = boundY;
    });
  }

  composer.render();
}

// ============================================
// RESIZE
// ============================================
function onResize() {
  if (!camera || !renderer || !composer) return;

  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

// ============================================
// DEBUG GUI
// ============================================

// Store initial values for reset (from imported config)
const INITIAL_CONFIG = {
  // Setup
  beanCount: isMobile ? BACKGROUND_BEANS_CONFIG.beanCountMobile : BACKGROUND_BEANS_CONFIG.beanCountDesktop,
  spreadX: BACKGROUND_BEANS_CONFIG.spreadX,
  spreadY: BACKGROUND_BEANS_CONFIG.spreadY,
  depthMin: BACKGROUND_BEANS_CONFIG.depthMin,
  depthMax: BACKGROUND_BEANS_CONFIG.depthMax,
  scaleMin: BACKGROUND_BEANS_CONFIG.scaleMin,
  scaleMax: BACKGROUND_BEANS_CONFIG.scaleMax,
  // Motion
  paused: false,
  driftSpeed: BACKGROUND_BEANS_CONFIG.driftSpeed,
  rotationSpeed: BACKGROUND_BEANS_CONFIG.rotationSpeed,
  // Parallax
  parallaxIntensity: BACKGROUND_BEANS_CONFIG.parallaxIntensity,
  // Dots
  dotsEnabled: BACKGROUND_BEANS_CONFIG.dotsEnabled,
  dotSpacing: BACKGROUND_BEANS_CONFIG.dotSpacing,
  dotSize: BACKGROUND_BEANS_CONFIG.dotSize,
  dotDepth: BACKGROUND_BEANS_CONFIG.dotDepth,
  dotColor: BACKGROUND_BEANS_CONFIG.dotColor,
  dotSpreadX: BACKGROUND_BEANS_CONFIG.dotSpreadX,
  dotSpreadY: BACKGROUND_BEANS_CONFIG.dotSpreadY,
  // CMYK
  cmykEnabled: BACKGROUND_BEANS_CONFIG.cmykEnabled,
  cmykOffset: BACKGROUND_BEANS_CONFIG.cmykOffset,
  cmykBreatheEnabled: BEAN_CONFIG.cmykBreatheEnabled,
  cmykBreatheIntensity: BEAN_CONFIG.cmykBreatheIntensity,
  cmykBreatheSpeed: BEAN_CONFIG.cmykBreatheSpeed,
  cmykRotationSpeed: BEAN_CONFIG.cmykRotationSpeed
};

function setupDebugGUI() {
  if (!isDebug) return;

  gui = new GUI({ title: '☕ Background Beans' });

  // Position GUI at bottom-right
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = 'auto';
  gui.domElement.style.bottom = '0';
  gui.domElement.style.right = '0';

  // View folder (at top level for quick access)
  const viewFolder = gui.addFolder('👁 View');
  viewFolder.add(CONFIG, 'canvas3DEnabled').name('🫘 3D Background').onChange(toggleCanvas3D);
  viewFolder.add({ hideUI: false }, 'hideUI').name('Hide Page UI').onChange(togglePageUI);

  // Setup folder
  const setupFolder = gui.addFolder('⚙️ Setup');
  setupFolder.add(CONFIG, 'beanCount', 10, 200, 1).name('Bean Count').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'spreadX', 5, 30, 0.5).name('Spread X').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'spreadY', 5, 20, 0.5).name('Spread Y').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'depthMin', -15, 0, 0.5).name('Depth Min').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'depthMax', 0, 10, 0.5).name('Depth Max').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'scaleMin', 0.01, 0.5, 0.01).name('Scale Min').onFinishChange(respawnBeans);
  setupFolder.add(CONFIG, 'scaleMax', 0.1, 1, 0.01).name('Scale Max').onFinishChange(respawnBeans);
  setupFolder.add({ reset: () => resetFolder('setup') }, 'reset').name('↺ Reset Setup');

  // Motion folder
  const motionFolder = gui.addFolder('🎬 Motion');
  motionFolder.add(CONFIG, 'paused').name('Paused');
  motionFolder.add(CONFIG, 'driftSpeed', 0, 2, 0.05).name('Drift Speed').onChange(updateVelocities);
  motionFolder.add(CONFIG, 'rotationSpeed', 0, 5, 0.1).name('Rotation Speed').onChange(updateVelocities);
  motionFolder.add({ reset: () => resetFolder('motion') }, 'reset').name('↺ Reset Motion');

  // Parallax folder
  const parallaxFolder = gui.addFolder('📜 Parallax');
  parallaxFolder.add(CONFIG, 'parallaxIntensity', 0, 1, 0.01).name('Intensity');
  parallaxFolder.add({ scrollTo: 0 }, 'scrollTo', 0, 1, 0.01).name('Scroll Position').onChange(v => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, v * maxScroll);
  });
  parallaxFolder.add({ reset: () => resetFolder('parallax') }, 'reset').name('↺ Reset Parallax');

  // Dots folder
  const dotsFolder = gui.addFolder('⚫ Dots Grid');
  dotsFolder.add(CONFIG, 'dotsEnabled').name('Enabled').onChange(createDots);
  dotsFolder.add(CONFIG, 'dotSpacing', 0.2, 2, 0.05).name('Spacing').onFinishChange(createDots);
  dotsFolder.add(CONFIG, 'dotSize', 0.01, 0.2, 0.005).name('Size').onChange(v => {
    if (dotsMesh) dotsMesh.material.size = v;
  });
  dotsFolder.add(CONFIG, 'dotDepth', -15, 0, 0.5).name('Depth').onChange(v => {
    if (dotsMesh) dotsMesh.position.z = v - CONFIG.dotDepth;
    createDots();
  });
  dotsFolder.addColor(CONFIG, 'dotColor').name('Color').onChange(v => {
    if (dotsMesh) dotsMesh.material.color.set(v);
  });
  dotsFolder.add(CONFIG, 'dotSpreadX', 10, 60, 1).name('Spread X').onFinishChange(createDots);
  dotsFolder.add(CONFIG, 'dotSpreadY', 10, 80, 1).name('Spread Y').onFinishChange(createDots);
  dotsFolder.add({ reset: () => resetFolder('dots') }, 'reset').name('↺ Reset Dots');

  // CMYK folder
  const cmykFolder = gui.addFolder('🌈 CMYK Effect');
  cmykFolder.add(CONFIG, 'cmykEnabled').name('Enabled').onChange(v => {
    if (cmykPass) cmykPass.enabled = v;
  });
  cmykFolder.add(CONFIG, 'cmykOffset', 0, 0.01, 0.0005).name('Offset').onChange(v => {
    if (cmykPass) cmykPass.uniforms.offset.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheEnabled').name('Breathe').onChange(v => {
    if (cmykPass) cmykPass.uniforms.breatheEnabled.value = v ? 1.0 : 0.0;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheIntensity', 0, 2, 0.1).name('Breathe Intensity').onChange(v => {
    if (cmykPass) cmykPass.uniforms.breatheIntensity.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheSpeed', 0, 3, 0.1).name('Breathe Speed').onChange(v => {
    if (cmykPass) cmykPass.uniforms.breatheSpeed.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykRotationSpeed', 0, 2, 0.05).name('Rotation Speed').onChange(v => {
    if (cmykPass) cmykPass.uniforms.rotationSpeed.value = v;
  });
  cmykFolder.add({ reset: () => resetFolder('cmyk') }, 'reset').name('↺ Reset CMYK');
}

function resetFolder(folder) {
  switch (folder) {
    case 'setup':
      CONFIG.beanCount = INITIAL_CONFIG.beanCount;
      CONFIG.spreadX = INITIAL_CONFIG.spreadX;
      CONFIG.spreadY = INITIAL_CONFIG.spreadY;
      CONFIG.depthMin = INITIAL_CONFIG.depthMin;
      CONFIG.depthMax = INITIAL_CONFIG.depthMax;
      CONFIG.scaleMin = INITIAL_CONFIG.scaleMin;
      CONFIG.scaleMax = INITIAL_CONFIG.scaleMax;
      respawnBeans();
      break;
    case 'motion':
      CONFIG.paused = INITIAL_CONFIG.paused;
      CONFIG.driftSpeed = INITIAL_CONFIG.driftSpeed;
      CONFIG.rotationSpeed = INITIAL_CONFIG.rotationSpeed;
      updateVelocities();
      break;
    case 'parallax':
      CONFIG.parallaxIntensity = INITIAL_CONFIG.parallaxIntensity;
      updateParallax();
      break;
    case 'dots':
      CONFIG.dotsEnabled = INITIAL_CONFIG.dotsEnabled;
      CONFIG.dotSpacing = INITIAL_CONFIG.dotSpacing;
      CONFIG.dotSize = INITIAL_CONFIG.dotSize;
      CONFIG.dotDepth = INITIAL_CONFIG.dotDepth;
      CONFIG.dotColor = INITIAL_CONFIG.dotColor;
      CONFIG.dotSpreadX = INITIAL_CONFIG.dotSpreadX;
      CONFIG.dotSpreadY = INITIAL_CONFIG.dotSpreadY;
      createDots();
      break;
    case 'cmyk':
      CONFIG.cmykEnabled = INITIAL_CONFIG.cmykEnabled;
      CONFIG.cmykOffset = INITIAL_CONFIG.cmykOffset;
      CONFIG.cmykBreatheEnabled = INITIAL_CONFIG.cmykBreatheEnabled;
      CONFIG.cmykBreatheIntensity = INITIAL_CONFIG.cmykBreatheIntensity;
      CONFIG.cmykBreatheSpeed = INITIAL_CONFIG.cmykBreatheSpeed;
      CONFIG.cmykRotationSpeed = INITIAL_CONFIG.cmykRotationSpeed;
      if (cmykPass) {
        cmykPass.enabled = CONFIG.cmykEnabled;
        cmykPass.uniforms.offset.value = CONFIG.cmykOffset;
        cmykPass.uniforms.breatheEnabled.value = CONFIG.cmykBreatheEnabled ? 1.0 : 0.0;
        cmykPass.uniforms.breatheIntensity.value = CONFIG.cmykBreatheIntensity;
        cmykPass.uniforms.breatheSpeed.value = CONFIG.cmykBreatheSpeed;
        cmykPass.uniforms.rotationSpeed.value = CONFIG.cmykRotationSpeed;
      }
      break;
  }
  // Update GUI to reflect new values
  if (gui) gui.controllersRecursive().forEach(c => c.updateDisplay());
}

function respawnBeans() {
  if (!scene) return;
  // Remove existing beans
  beans.forEach(bean => scene.remove(bean));
  beans = [];
  // Create new beans with updated config
  createBeans();
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

function togglePageUI(hidden) {
  const elements = document.querySelectorAll('.container, header, footer, .marquee-banner');
  elements.forEach(el => {
    el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    if (hidden) {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    } else {
      el.style.opacity = '1';
      el.style.pointerEvents = '';
    }
  });
}

function toggleCanvas3D(enabled) {
  const canvas = document.getElementById('background-canvas');
  if (!canvas) return;

  CONFIG.canvas3DEnabled = enabled;

  if (enabled) {
    // Create scene if not already initialized
    createScene();

    // Show 3D canvas, hide CSS dots
    canvas.style.transition = 'opacity 0.4s ease';
    canvas.style.opacity = '1';
    canvas.style.pointerEvents = '';
    document.documentElement.classList.add('canvas-3d-active');
  } else {
    // Hide 3D canvas, show CSS dots
    canvas.style.transition = 'opacity 0.4s ease';
    canvas.style.opacity = '0';
    canvas.style.pointerEvents = 'none';
    document.documentElement.classList.remove('canvas-3d-active');

    // Destroy scene after fade out to free resources
    setTimeout(() => {
      if (!CONFIG.canvas3DEnabled) {
        destroyScene();
      }
    }, 400);
  }
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
