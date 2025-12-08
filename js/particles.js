/**
 * Floating 3D Coffee Beans
 * Three.js implementation for Brewlingo landing page
 * Uses procedural geometry - no external models needed
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';

// ============================================
// CMYK SHADER
// ============================================
const CMYKShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.004 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    varying vec2 vUv;

    void main() {
      // Original center sample
      vec4 center = texture2D(tDiffuse, vUv);

      // Offset samples for color fringing
      vec4 cr = texture2D(tDiffuse, vUv + vec2(offset, offset * 0.5));
      vec4 cm = texture2D(tDiffuse, vUv + vec2(-offset * 0.5, offset));
      vec4 cy = texture2D(tDiffuse, vUv + vec2(-offset, -offset * 0.5));

      // Create color fringes only where there's alpha difference (edges)
      float cyanEdge = max(0.0, cr.a - center.a);
      float magentaEdge = max(0.0, cm.a - center.a);
      float yellowEdge = max(0.0, cy.a - center.a);

      // CMYK colors
      vec3 cyan = vec3(0.0, 1.0, 1.0);
      vec3 magenta = vec3(1.0, 0.0, 1.0);
      vec3 yellow = vec3(1.0, 1.0, 0.0);

      // Combine: original bean + colored fringes around edges
      vec3 fringes = cyan * cyanEdge + magenta * magentaEdge + yellow * yellowEdge;
      float fringeAlpha = max(max(cyanEdge, magentaEdge), yellowEdge);

      // Final color: bean on top, fringes behind
      vec3 finalColor = mix(fringes, center.rgb, center.a);
      float finalAlpha = max(center.a, fringeAlpha * 0.8);

      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `
};

// ============================================
// CONFIGURATION
// ============================================
// Detect mobile and debug mode
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

const CONFIG = {
  beanCount: isMobile ? 100 : 200,
  driftSpeed: 0.5,
  rotationSpeed: 3,
  scaleMin: 0.16,
  scaleMax: 0.4,
  depthMin: -5,
  depthMax: 2,
  spreadX: 12,
  spreadY: 8,
  staggerDelay: 11,
  animationDuration: 500,
  overshoot: 1.5
};

// ============================================
// PROCEDURAL COFFEE BEAN SHADER (Cell-shaded)
// ============================================
const CoffeeBeanShader = {
  uniforms: {},
  vertexShader: `
    varying vec3 vPosition;

    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vPosition;

    void main() {
      vec3 pos = vPosition;

      // Crisp white crease line using step function (no smoothing)
      // Line is at x ≈ 0.02-0.08 range, only on +X side
      float lineWidth = 0.03;
      float lineCenter = 0.05;
      float inLineX = step(lineCenter - lineWidth, pos.x) * step(pos.x, lineCenter + lineWidth);

      // Line runs most of the bean length, hard cutoff at ends
      float inLineY = step(-0.7, pos.y) * step(pos.y, 0.7);

      // Only show on the front face (+Z side) of the crease
      float inLineZ = step(0.0, pos.z);

      float creaseLine = inLineX * inLineY * inLineZ;

      // Flat black bean, white line
      vec3 black = vec3(0.0, 0.0, 0.0);
      vec3 white = vec3(1.0, 1.0, 1.0);

      vec3 color = mix(black, white, creaseLine);

      gl_FragColor = vec4(color, 1.0);
    }
  `
};

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer, composer;
let beans = [];
let beanGeometry = null;
let beanMaterial = null;
let gui = null;

// ============================================
// PROCEDURAL BEAN GEOMETRY
// ============================================
function createBeanGeometry() {
  // Create a coffee bean shape using a modified sphere
  // Bean is like an ellipsoid with a crease/groove down one side
  const widthSegments = 32;
  const heightSegments = 24;

  const geometry = new THREE.SphereGeometry(1, widthSegments, heightSegments);
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    let x = positions.getX(i);
    let y = positions.getY(i);
    let z = positions.getZ(i);

    // Flatten into ellipsoid shape (bean proportions) - CHUNKIER
    x *= 0.7;   // Wider than before
    y *= 0.9;   // Slightly shorter
    z *= 0.85;  // Thicker/rounder

    // Add the characteristic coffee bean crease on one side
    // The crease runs along the Y axis on the +X side
    if (x > 0) {
      const creaseDepth = 0.12;
      // Crease is strongest at x=0.3, fades toward edges
      const creaseInfluence = Math.exp(-y * y * 2.5) * Math.exp(-(x - 0.3) * (x - 0.3) * 6);
      x -= creaseDepth * creaseInfluence;
      // Also pinch the z slightly for the crease
      z *= 1 - creaseInfluence * 0.25;
    }

    // Slight taper at the ends
    const taperAmount = 0.1;
    const taper = 1 - Math.abs(y) * taperAmount;
    x *= taper;
    z *= taper;

    positions.setXYZ(i, x, y, z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

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

  // Ambient light - overall brightness
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  // Hemisphere light - natural sky/ground
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb97a56, 0.6);
  scene.add(hemiLight);

  // Key light from front
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(5, 8, 10);
  scene.add(keyLight);

  // Fill light from left
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-4, 2, 3);
  scene.add(fillLight);

  // Post-processing with CMYK effect
  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth,
    window.innerHeight,
    {
      format: THREE.RGBAFormat,
      stencilBuffer: false
    }
  );

  composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  const cmykPass = new ShaderPass(CMYKShader);
  cmykPass.renderToScreen = true;
  composer.addPass(cmykPass);

  // Create shared geometry and material
  beanGeometry = createBeanGeometry();
  beanMaterial = new THREE.ShaderMaterial({
    vertexShader: CoffeeBeanShader.vertexShader,
    fragmentShader: CoffeeBeanShader.fragmentShader
  });

  // Create beans and start animation
  createBeans();
  animate();

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
// CREATE BEANS
// ============================================
function createBeans() {
  for (let i = 0; i < CONFIG.beanCount; i++) {
    // Create mesh with shared geometry and material
    const bean = new THREE.Mesh(beanGeometry, beanMaterial);

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

  composer.render();
}

// ============================================
// RESIZE
// ============================================
function handleResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
