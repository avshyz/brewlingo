/**
 * Debug Bean Viewer
 * Single large-scale bean with OrbitControls for inspection
 * Imports bean model from shared module to stay in sync across branches
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
// CONFIGURATION (imports from shared module + view options)
// ============================================
const CONFIG = {
  // Import all bean settings from shared module
  ...BEAN_CONFIG,
  // View options (debug page specific)
  autoRotate: false,
  showWireframe: false,
  backgroundColor: '#ffffff',
  cmykEnabled: false,  // Off by default for distraction-free sculpting
  // Multi-bean mode settings
  multiBeanMode: false,
  beanCount: 200,
  scaleMin: 0.05,
  scaleMax: 0.48,
  spreadX: 12,
  spreadY: 8,
  depthMin: -5,
  depthMax: 2,
  driftSpeed: 0.5,
  rotationSpeed: 3
};

// ============================================
// SHADERS (from shared module)
// ============================================
const CMYKShader = {
  uniforms: createCMYKShaderUniforms(CONFIG, false),
  vertexShader: CMYKShaderVertexShader,
  fragmentShader: CMYKShaderFragmentShader
};

const BeanShader = {
  uniforms: createBeanShaderUniforms(CONFIG),
  vertexShader: BeanShaderVertexShader,
  fragmentShader: BeanShaderFragmentShader
};

// ============================================
// GLOBALS
// ============================================
let scene, camera, renderer, composer, cmykPass, controls;
let bean, beanGeometry, beanMaterial, wireframeMesh;
let gui = null;
let multiBeans = [];
let cmykController = null;  // Reference to update checkbox when multi-bean mode toggles CMYK

// ============================================
// INITIALIZATION
// ============================================
function init() {
  const canvas = document.getElementById('bean-canvas');
  if (!canvas) return;

  // Scene (no background - use CSS background for dot pattern, allows CMYK alpha edge detection)
  scene = new THREE.Scene();

  // Camera
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(0, 0, 3);

  // Renderer (alpha: true required for CMYK edge effect to work)
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  // Post-processing
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  cmykPass = new ShaderPass(CMYKShader);
  cmykPass.renderToScreen = true;
  cmykPass.enabled = CONFIG.cmykEnabled;  // Off by default for sculpting
  composer.addPass(cmykPass);

  // OrbitControls for mouse rotation
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = CONFIG.autoRotate;
  controls.autoRotateSpeed = 1.0;
  // Offset target to the right to account for GUI panel on the right (~250px)
  controls.target.set(0.25, 0, 0);
  camera.position.set(0.25, 0, 3);

  // Create bean
  beanGeometry = createBeanGeometry(CONFIG);
  beanMaterial = new THREE.ShaderMaterial({
    uniforms: BeanShader.uniforms,
    vertexShader: BeanShader.vertexShader,
    fragmentShader: BeanShader.fragmentShader,
    side: THREE.DoubleSide
  });
  bean = new THREE.Mesh(beanGeometry, beanMaterial);
  scene.add(bean);

  // Wireframe overlay (initially hidden)
  const wireframeMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    transparent: true,
    opacity: 0.3
  });
  wireframeMesh = new THREE.Mesh(beanGeometry, wireframeMaterial);
  wireframeMesh.visible = CONFIG.showWireframe;
  scene.add(wireframeMesh);

  // Setup GUI
  setupGUI();

  // Start animation
  animate();

  // Handle resize
  window.addEventListener('resize', handleResize);
}

// ============================================
// DEBUG GUI
// ============================================

// Store initial config for reset
const INITIAL_CONFIG = JSON.parse(JSON.stringify(CONFIG));

// Helper to add reset button to a folder
function addResetButton(folder, callback) {
  folder.add({ reset: () => {
    folder.reset();
    if (callback) callback();
  }}, 'reset').name('↺ Reset');
}

// View-only keys to exclude from export (not part of bean model)
const VIEW_KEYS = [
  'autoRotate', 'showWireframe', 'backgroundColor', 'cmykEnabled',
  'multiBeanMode', 'beanCount', 'scaleMin', 'scaleMax',
  'spreadX', 'spreadY', 'depthMin', 'depthMax', 'driftSpeed', 'rotationSpeed'
];

// Export current config as JS object (only changed values, excluding view settings)
function exportConfig() {
  const changes = {};
  for (const key in CONFIG) {
    if (VIEW_KEYS.includes(key)) continue;
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

function setupGUI() {
  gui = new GUI({ title: 'Bean Inspector' });

  // Export button at top level
  gui.add({ exportConfig }, 'exportConfig').name('📋 Copy Changes');
  gui.add({ resetAll: () => {
    gui.reset();
    rebuildGeometry();
    syncUniforms();
  }}, 'resetAll').name('↺ Reset All');

  // View Controls
  const viewFolder = gui.addFolder('View');
  viewFolder.add(CONFIG, 'multiBeanMode').name('🫘 Multi-Bean Mode').onChange(toggleMultiBeanMode);
  cmykController = viewFolder.add(CONFIG, 'cmykEnabled').name('✨ CMYK Halo').onChange(v => {
    cmykPass.enabled = v;
  });
  viewFolder.add(CONFIG, 'autoRotate').name('Auto Rotate').onChange(v => {
    controls.autoRotate = v;
  });
  viewFolder.add(CONFIG, 'showWireframe').name('Wireframe').onChange(v => {
    wireframeMesh.visible = v && !CONFIG.multiBeanMode;
  });
  viewFolder.addColor(CONFIG, 'backgroundColor').name('Background').onChange(v => {
    document.body.style.backgroundColor = v;
  });
  viewFolder.add({ resetCamera: () => {
    camera.position.set(0.25, 0, 3);
    controls.target.set(0.25, 0, 0);
    controls.update();
  }}, 'resetCamera').name('Reset Camera');
  addResetButton(viewFolder, () => {
    document.body.style.backgroundColor = CONFIG.backgroundColor;
    controls.autoRotate = CONFIG.autoRotate;
    wireframeMesh.visible = CONFIG.showWireframe;
  });
  viewFolder.open();

  // Bean Dimensions
  const shapeFolder = gui.addFolder('Bean Dimensions');
  shapeFolder.add(CONFIG, 'beanScaleX', 0.3, 1, 0.01).name('Width').onChange(rebuildGeometry);
  shapeFolder.add(CONFIG, 'beanScaleY', 0.3, 1, 0.01).name('Length').onChange(rebuildGeometry);
  shapeFolder.add(CONFIG, 'beanScaleZ', 0.3, 1, 0.01).name('Thickness').onChange(rebuildGeometry);
  addResetButton(shapeFolder, rebuildGeometry);
  shapeFolder.open();

  // Crease
  const creaseFolder = gui.addFolder('Crease');
  creaseFolder.add(CONFIG, 'creaseWidth', 0.01, 0.1, 0.001).name('Width').onChange(v => {
    beanMaterial.uniforms.creaseWidth.value = v;
  });
  creaseFolder.add(CONFIG, 'creaseLength', 0.3, 0.95, 0.01).name('Length').onChange(v => {
    beanMaterial.uniforms.creaseLength.value = v;
  });
  creaseFolder.add(CONFIG, 'creaseRadius', 0, 0.1, 0.005).name('Radius').onChange(v => {
    beanMaterial.uniforms.creaseRadius.value = v;
  });
  addResetButton(creaseFolder, () => {
    beanMaterial.uniforms.creaseWidth.value = CONFIG.creaseWidth;
    beanMaterial.uniforms.creaseLength.value = CONFIG.creaseLength;
    beanMaterial.uniforms.creaseRadius.value = CONFIG.creaseRadius;
  });

  // Style
  const styleFolder = gui.addFolder('Style');

  // Colors subfolder
  const colorSub = styleFolder.addFolder('Colors');
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
  const celSub = styleFolder.addFolder('Cel Shading');
  celSub.add(CONFIG, 'toonEnabled').name('Toon').onChange(v => {
    beanMaterial.uniforms.toonEnabled.value = v ? 1.0 : 0.0;
  });
  celSub.add(CONFIG, 'toonBands', 1, 6, 1).name('Bands').onChange(v => {
    beanMaterial.uniforms.toonBands.value = v;
  });
  celSub.add(CONFIG, 'rimEnabled').name('Rim').onChange(v => {
    beanMaterial.uniforms.rimEnabled.value = v ? 1.0 : 0.0;
  });
  celSub.add(CONFIG, 'rimIntensity', 0, 1.5, 0.05).name('Rim Intensity').onChange(v => {
    beanMaterial.uniforms.rimIntensity.value = v;
  });
  celSub.add(CONFIG, 'rimPower', 0.5, 5, 0.1).name('Rim Sharpness').onChange(v => {
    beanMaterial.uniforms.rimPower.value = v;
  });
  celSub.add(CONFIG, 'specularEnabled').name('Specular').onChange(v => {
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
  addResetButton(celSub, syncCelUniforms);

  // Light Direction
  const lightSub = styleFolder.addFolder('Light Direction');
  const updateLightDir = () => {
    beanMaterial.uniforms.lightDir.value.set(CONFIG.lightX, CONFIG.lightY, CONFIG.lightZ).normalize();
  };
  lightSub.add(CONFIG, 'lightX', -1, 1, 0.1).name('X').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightY', -1, 1, 0.1).name('Y').onChange(updateLightDir);
  lightSub.add(CONFIG, 'lightZ', -1, 1, 0.1).name('Z').onChange(updateLightDir);
  addResetButton(lightSub, updateLightDir);

  // CMYK Halo
  const cmykFolder = gui.addFolder('CMYK Halo');
  cmykFolder.add(CONFIG, 'cmykOffset', 0.001, 0.015, 0.0005).name('Offset').onChange(v => {
    cmykPass.uniforms.offset.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykRotationSpeed', 0, 2, 0.05).name('Rotation').onChange(v => {
    cmykPass.uniforms.rotationSpeed.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheEnabled').name('Breathe').onChange(v => {
    cmykPass.uniforms.breatheEnabled.value = v ? 1.0 : 0.0;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheIntensity', 0, 1, 0.05).name('Breathe Amount').onChange(v => {
    cmykPass.uniforms.breatheIntensity.value = v;
  });
  cmykFolder.add(CONFIG, 'cmykBreatheSpeed', 0, 3, 0.1).name('Breathe Speed').onChange(v => {
    cmykPass.uniforms.breatheSpeed.value = v;
  });
  addResetButton(cmykFolder, syncCmykUniforms);
}

// Sync all uniforms after reset
function syncUniforms() {
  syncCelUniforms();
  syncCmykUniforms();
  beanMaterial.uniforms.creaseWidth.value = CONFIG.creaseWidth;
  beanMaterial.uniforms.creaseLength.value = CONFIG.creaseLength;
  beanMaterial.uniforms.colorEnabled.value = CONFIG.colorEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.baseColor.value.set(CONFIG.baseColor);
  beanMaterial.uniforms.highlightColor.value.set(CONFIG.highlightColor);
  beanMaterial.uniforms.creaseColor.value.set(CONFIG.creaseColor);
  beanMaterial.uniforms.lightDir.value.set(CONFIG.lightX, CONFIG.lightY, CONFIG.lightZ).normalize();
  document.body.style.backgroundColor = CONFIG.backgroundColor;
  controls.autoRotate = CONFIG.autoRotate;
  wireframeMesh.visible = CONFIG.showWireframe;
}

function syncCelUniforms() {
  beanMaterial.uniforms.toonEnabled.value = CONFIG.toonEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.toonBands.value = CONFIG.toonBands;
  beanMaterial.uniforms.rimEnabled.value = CONFIG.rimEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.rimIntensity.value = CONFIG.rimIntensity;
  beanMaterial.uniforms.rimPower.value = CONFIG.rimPower;
  beanMaterial.uniforms.specularEnabled.value = CONFIG.specularEnabled ? 1.0 : 0.0;
  beanMaterial.uniforms.specularIntensity.value = CONFIG.specularIntensity;
  beanMaterial.uniforms.specularThreshold.value = CONFIG.specularThreshold;
  beanMaterial.uniforms.specularPower.value = CONFIG.specularPower;
}

function syncCmykUniforms() {
  cmykPass.uniforms.offset.value = CONFIG.cmykOffset;
  cmykPass.uniforms.rotationSpeed.value = CONFIG.cmykRotationSpeed;
  cmykPass.uniforms.breatheEnabled.value = CONFIG.cmykBreatheEnabled ? 1.0 : 0.0;
  cmykPass.uniforms.breatheIntensity.value = CONFIG.cmykBreatheIntensity;
  cmykPass.uniforms.breatheSpeed.value = CONFIG.cmykBreatheSpeed;
}

function rebuildGeometry() {
  beanGeometry.dispose();
  beanGeometry = createBeanGeometry(CONFIG);
  bean.geometry = beanGeometry;
  wireframeMesh.geometry = beanGeometry;
  // Update multi-beans if in that mode
  multiBeans.forEach(b => { b.geometry = beanGeometry; });
}

// ============================================
// MULTI-BEAN MODE
// ============================================
let isTransitioning = false;

function toggleMultiBeanMode(enabled) {
  if (isTransitioning) return;
  isTransitioning = true;

  if (enabled) {
    transitionToMultiBean();
  } else {
    transitionToSingleBean();
  }
}

function transitionToMultiBean() {
  // Disable controls during transition
  controls.enabled = false;
  wireframeMesh.visible = false;

  // Enable CMYK effect
  CONFIG.cmykEnabled = true;
  cmykPass.enabled = true;
  if (cmykController) cmykController.updateDisplay();

  // Create beans but start them at scale 0
  createMultiBeans(true); // true = start hidden

  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => { isTransitioning = false; }
  });

  // Animate hero bean to a random multi-bean scale and let it drift into the crowd
  const heroTargetScale = CONFIG.scaleMin + Math.random() * (CONFIG.scaleMax - CONFIG.scaleMin);
  bean.userData = {
    targetScale: heroTargetScale,
    vx: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
    vy: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
    vrx: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
    vry: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
    vrz: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
    isHero: true
  };

  // Shrink hero bean to multi-bean size
  tl.to(bean.scale, {
    x: heroTargetScale,
    y: heroTargetScale,
    z: heroTargetScale,
    duration: 0.6,
    ease: 'power2.inOut'
  }, 0);

  // Move hero bean toward center as camera zooms out
  tl.to(bean.position, {
    x: (Math.random() - 0.5) * 2,
    y: (Math.random() - 0.5) * 2,
    z: CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin),
    duration: 0.8,
    ease: 'power2.inOut'
  }, 0);

  // Zoom camera out to multi-view
  tl.to(camera.position, {
    x: 0, y: 0, z: 12,
    duration: 0.8,
    ease: 'power2.inOut'
  }, 0);

  tl.to(controls.target, {
    x: 0, y: 0, z: 0,
    duration: 0.8,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  }, 0);

  // Staggered reveal of multi-beans alongside hero (fast stagger)
  const shuffled = [...multiBeans].sort(() => Math.random() - 0.5);
  shuffled.forEach((b, i) => {
    tl.to(b.scale, {
      x: b.userData.targetScale,
      y: b.userData.targetScale,
      z: b.userData.targetScale,
      duration: 0.4,
      ease: 'elastic.out(1, 0.5)'
    }, 0.15 + i * 0.002);
  });
}

function transitionToSingleBean() {
  // Always zoom back to the original hero bean
  const chosenHero = bean;

  // Disable CMYK effect
  CONFIG.cmykEnabled = false;
  cmykPass.enabled = false;
  if (cmykController) cmykController.updateDisplay();

  // Normalize rotation for shortest path to upright position
  const normalizeAngle = (angle) => {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  };
  chosenHero.rotation.x = normalizeAngle(chosenHero.rotation.x);
  chosenHero.rotation.y = normalizeAngle(chosenHero.rotation.y);
  chosenHero.rotation.z = normalizeAngle(chosenHero.rotation.z);

  // Capture hero's current position for camera targeting
  const heroStartPos = chosenHero.position.clone();

  // Create animation timeline
  const tl = gsap.timeline({
    onComplete: () => {
      clearMultiBeans();
      controls.enabled = true;
      wireframeMesh.visible = CONFIG.showWireframe;
      isTransitioning = false;
    }
  });

  // Shrink other beans quickly
  const shuffled = [...multiBeans].sort(() => Math.random() - 0.5);
  shuffled.forEach((b, i) => {
    tl.to(b.scale, {
      x: 0, y: 0, z: 0,
      duration: 0.3,
      ease: 'power2.in'
    }, i * 0.002);
  });

  // All animations happen simultaneously:
  // - Camera zooms from current position to final position (passing through hero's area)
  // - Hero scales up, moves to center, and rotates to face camera
  const duration = 1.2;

  // Camera moves directly to final position
  tl.to(camera.position, {
    x: 0.25, y: 0, z: 3,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);

  tl.to(controls.target, {
    x: 0.25, y: 0, z: 0,
    duration: duration,
    ease: 'power2.inOut',
    onUpdate: () => controls.update()
  }, 0);

  // Hero scales up
  tl.to(chosenHero.scale, {
    x: 1, y: 1, z: 1,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);

  // Hero moves to center
  tl.to(bean.position, {
    x: 0, y: 0, z: 0,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);

  // Hero rotates to face camera
  tl.to(chosenHero.rotation, {
    x: 0, y: 0, z: 0,
    duration: duration,
    ease: 'power2.inOut'
  }, 0);
}

function createMultiBeans(startHidden = false) {
  for (let i = 0; i < CONFIG.beanCount; i++) {
    const multiBean = new THREE.Mesh(beanGeometry, beanMaterial);

    multiBean.position.set(
      (Math.random() - 0.5) * CONFIG.spreadX * 2,
      (Math.random() - 0.5) * CONFIG.spreadY * 2,
      CONFIG.depthMin + Math.random() * (CONFIG.depthMax - CONFIG.depthMin)
    );

    multiBean.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );

    const targetScale = CONFIG.scaleMin + Math.random() * (CONFIG.scaleMax - CONFIG.scaleMin);

    // Start at 0 scale if animating in, otherwise full scale
    if (startHidden) {
      multiBean.scale.setScalar(0);
    } else {
      multiBean.scale.setScalar(targetScale);
    }

    multiBean.userData = {
      targetScale,
      vx: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vy: (Math.random() - 0.5) * CONFIG.driftSpeed * 0.015,
      vrx: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vry: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008,
      vrz: (Math.random() - 0.5) * CONFIG.rotationSpeed * 0.008
    };

    scene.add(multiBean);
    multiBeans.push(multiBean);
  }
}

function clearMultiBeans() {
  multiBeans.forEach(b => {
    gsap.killTweensOf(b.scale);
    scene.remove(b);
  });
  multiBeans = [];
}

function animateMultiBeans() {
  // Animate all beans including the hero
  const allBeans = [bean, ...multiBeans];
  allBeans.forEach(b => {
    if (!b.userData || !b.userData.vx) return; // Skip if no velocity data

    const { vx, vy, vrx, vry, vrz } = b.userData;

    b.position.x += vx;
    b.position.y += vy;
    b.rotation.x += vrx;
    b.rotation.y += vry;
    b.rotation.z += vrz;

    // Wrap around bounds
    const boundX = CONFIG.spreadX + 2;
    const boundY = CONFIG.spreadY + 2;
    if (b.position.x > boundX) b.position.x = -boundX;
    if (b.position.x < -boundX) b.position.x = boundX;
    if (b.position.y > boundY) b.position.y = -boundY;
    if (b.position.y < -boundY) b.position.y = boundY;
  });
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
  requestAnimationFrame(animate);

  // Update CMYK time for animated effect
  cmykPass.uniforms.time.value += 0.016;

  // Animate multi-beans if in that mode
  if (CONFIG.multiBeanMode) {
    animateMultiBeans();
  }

  // Update controls
  controls.update();

  // Render
  composer.render();
}

// ============================================
// RESIZE
// ============================================
function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  composer.setSize(width, height);
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
