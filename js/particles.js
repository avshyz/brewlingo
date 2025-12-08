/**
 * Floating 3D Coffee Beans
 * Three.js implementation for Brewlingo landing page
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  beanCount: 100,
  driftSpeed: 0.12,
  rotationSpeed: 0.4,
  beanScale: { min: 0.08, max: 0.18 },
  depth: { min: -4, max: 2 },
  spread: { x: 12, y: 8 },
  modelPath: 'assets/coffee_bean/scene.gltf'
};

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer;
let beans = [];
let beanModel = null;

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

  window.addEventListener('resize', handleResize);
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
              child.castShadow = true;
              child.receiveShadow = true;
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
      (Math.random() - 0.5) * CONFIG.spread.x * 2,
      (Math.random() - 0.5) * CONFIG.spread.y * 2,
      CONFIG.depth.min + Math.random() * (CONFIG.depth.max - CONFIG.depth.min)
    );

    // Random rotation
    bean.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    // Random scale
    const scale = CONFIG.beanScale.min +
      Math.random() * (CONFIG.beanScale.max - CONFIG.beanScale.min);
    bean.scale.setScalar(scale);

    // Store velocity data for animation
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
// ANIMATION
// ============================================
function animate() {
  requestAnimationFrame(animate);

  beans.forEach(bean => {
    const { vx, vy, vrx, vry, vrz } = bean.userData;

    // Move
    bean.position.x += vx;
    bean.position.y += vy;

    // Rotate
    bean.rotation.x += vrx;
    bean.rotation.y += vry;
    bean.rotation.z += vrz;

    // Wrap around edges
    const boundX = CONFIG.spread.x + 2;
    const boundY = CONFIG.spread.y + 2;

    if (bean.position.x > boundX) bean.position.x = -boundX;
    if (bean.position.x < -boundX) bean.position.x = boundX;
    if (bean.position.y > boundY) bean.position.y = -boundY;
    if (bean.position.y < -boundY) bean.position.y = boundY;
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
