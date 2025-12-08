/**
 * Floating 3D Coffee Beans
 * Three.js implementation for Brewlingo landing page
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import GUI from 'lil-gui';

// ============================================
// CONFIGURATION
// ============================================
// Detect mobile and debug mode
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

const CONFIG = {
  beanCount: isMobile ? 90 : 121,
  driftSpeed: 0.36,
  rotationSpeed: 2,
  scaleMin: 0.08,
  scaleMax: 0.21,
  depthMin: -5,
  depthMax: 2,
  spreadX: 12,
  spreadY: 8,
  staggerDelay: 11,
  animationDuration: 500,
  overshoot: 1.35,
  modelPath: 'assets/coffee_bean/scene.gltf'
};

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer;
let beans = [];
let beanModel = null;
let gui = null;
let diffuseTexture = null;

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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Ambient light - overall brightness
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Hemisphere light - natural sky/ground
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb97a56, 0.6);
  scene.add(hemiLight);

  // Key light from front - casts shadows
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(5, 8, 10);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.camera.left = -15;
  keyLight.shadow.camera.right = 15;
  keyLight.shadow.camera.top = 15;
  keyLight.shadow.camera.bottom = -15;
  keyLight.shadow.bias = -0.001;
  scene.add(keyLight);

  // Fill light from left
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-4, 2, 3);
  scene.add(fillLight);

  // Load model
  loadBeanModel();

  // Setup debug GUI only if ?d=1
  if (isDebug) {
    setupGUI();
  }

  window.addEventListener('resize', handleResize);
}

// ============================================
// DEBUG GUI
// ============================================

// Debounce helper
let debounceTimer = null;
function debouncedReset() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(resetBeans, 150);
}

function setupGUI() {
  gui = new GUI({ title: 'Bean Controls' });

  // Beans folder
  const beansFolder = gui.addFolder('Beans');
  beansFolder.add(CONFIG, 'beanCount', 10, 200, 1).name('Count').onFinishChange(resetBeans);
  beansFolder.add(CONFIG, 'scaleMin', 0.02, 0.2, 0.01).name('Scale Min').onFinishChange(resetBeans);
  beansFolder.add(CONFIG, 'scaleMax', 0.05, 0.4, 0.01).name('Scale Max').onFinishChange(resetBeans);

  // Movement folder
  const moveFolder = gui.addFolder('Movement');
  moveFolder.add(CONFIG, 'driftSpeed', 0, 0.5, 0.01).name('Drift Speed').onFinishChange(updateVelocities);
  moveFolder.add(CONFIG, 'rotationSpeed', 0, 3, 0.05).name('Spin Speed').onFinishChange(updateVelocities);

  // Spread folder
  const spreadFolder = gui.addFolder('Spread');
  spreadFolder.add(CONFIG, 'spreadX', 5, 25, 1).name('Spread X').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'spreadY', 3, 15, 1).name('Spread Y').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'depthMin', -10, 0, 0.5).name('Depth Min').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'depthMax', 0, 10, 0.5).name('Depth Max').onFinishChange(resetBeans);

  // Animation folder - these reset automatically with debounce
  const animFolder = gui.addFolder('Animation');
  animFolder.add(CONFIG, 'staggerDelay', 5, 50, 1).name('Stagger Delay (ms)').onFinishChange(debouncedReset);
  animFolder.add(CONFIG, 'animationDuration', 200, 1000, 50).name('Anim Duration (ms)').onFinishChange(debouncedReset);
  animFolder.add(CONFIG, 'overshoot', 1, 1.5, 0.05).name('Overshoot').onFinishChange(debouncedReset);

  // Actions
  gui.add({ reset: resetBeans }, 'reset').name('🔄 Reset & Replay');
}

function resetBeans() {
  // Kill any running GSAP tweens and remove existing beans
  beans.forEach(bean => {
    gsap.killTweensOf(bean.scale);
    scene.remove(bean);
  });
  beans = [];

  // Create new beans
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

// ============================================
// MODEL LOADING
// ============================================
function loadBeanModel() {
  const loader = new GLTFLoader();

  // Setup Draco decoder for compressed models
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');
  loader.setDRACOLoader(dracoLoader);

  // Load the diffuse texture first
  const textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    'assets/coffee_bean/textures/Coffee_DM_01_01_diffuse.png',
    function(diffuseTexture) {
      diffuseTexture.colorSpace = THREE.SRGBColorSpace;
      diffuseTexture.flipY = false; // GLTF models typically need this

      // Now load the model
      loader.load(
        CONFIG.modelPath,
        function(gltf) {
          beanModel = gltf.scene;

          // Apply the diffuse texture to all meshes and enable shadows
          beanModel.traverse((child) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                map: diffuseTexture,
                roughness: 0.7,
                metalness: 0.1
              });
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });

          createBeans();
          animate();
        },
        function(xhr) {
          console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
          console.error('Error loading bean model:', error);
        }
      );
    }
  );
}

// ============================================
// CREATE BEANS
// ============================================
function createBeans() {
  for (let i = 0; i < CONFIG.beanCount; i++) {
    // Clone the entire loaded model
    const bean = beanModel.clone();

    // Random position
    bean.position.set(
      (Math.random() - 0.5) * CONFIG.spreadX * 2,
      (Math.random() - 0.5) * CONFIG.spreadY * 2,
      CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin)
    );

    // Random rotation
    bean.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    // Random scale - start at 0 (invisible)
    const targetScale = CONFIG.scaleMin +
      Math.random() * (CONFIG.scaleMax - CONFIG.scaleMin);
    bean.scale.setScalar(0); // Start invisible

    // Store velocity data for animation
    bean.userData = {
      vx: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vy: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vrx: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vry: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vrz: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      targetScale: targetScale
    };

    scene.add(bean);
    beans.push(bean);
  }

  // Start staggered reveal
  revealBeansStaggered();
}

// ============================================
// STAGGERED REVEAL (GSAP)
// ============================================
function revealBeansStaggered() {
  // Shuffle beans for random reveal order
  const shuffled = [...beans].sort(() => Math.random() - 0.5);

  shuffled.forEach((bean, i) => {
    const targetScale = bean.userData.targetScale;
    const delay = i * CONFIG.staggerDelay / 1000; // Convert to seconds for GSAP
    const duration = CONFIG.animationDuration / 1000;

    // GSAP elastic ease gives us the spring/bounce effect
    gsap.to(bean.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: duration,
      delay: delay,
      ease: `elastic.out(1, ${0.3 / (CONFIG.overshoot - 1 + 0.01)})` // Dynamic bounce based on overshoot
    });
  });
}

// ============================================
// ANIMATION
// ============================================
function animate() {
  requestAnimationFrame(animate);

  beans.forEach(bean => {
    const { vx, vy, vrx, vry, vrz } = bean.userData;

    // Only animate if bean is visible (GSAP handles scale)
    if (bean.scale.x > 0) {
      // Drift
      bean.position.x += vx;
      bean.position.y += vy;

      // Spin (rotate around own axis)
      bean.rotation.x += vrx;
      bean.rotation.y += vry;
      bean.rotation.z += vrz;

      // Wrap around edges
      const boundX = CONFIG.spreadX + 2;
      const boundY = CONFIG.spreadY + 2;

      if (bean.position.x > boundX) bean.position.x = -boundX;
      if (bean.position.x < -boundX) bean.position.x = boundX;
      if (bean.position.y > boundY) bean.position.y = -boundY;
      if (bean.position.y < -boundY) bean.position.y = boundY;
    }
  });

  renderer.render(scene, camera);
}

// ============================================
// RESIZE
// ============================================
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
