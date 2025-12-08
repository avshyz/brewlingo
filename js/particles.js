/**
 * Floating 3D Coffee Beans
 * Procedural geometry with cel-shaded look + CMYK post-processing halo
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import GUI from 'lil-gui';

// ============================================
// CONFIGURATION
// ============================================
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

const CONFIG = {
  beanCount: isMobile ? 180 : 200,
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
  cmykOffset: 0.004,
  creaseWidth: 0.035,
  creaseLength: 0.7,
  // Bean shape
  beanScaleX: 0.6,
  beanScaleY: 0.75,
  beanScaleZ: 0.5,
  // Animation state
  paused: false
};

// ============================================
// CMYK POST-PROCESSING SHADER (edge halo effect)
// ============================================
const CMYKShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: CONFIG.cmykOffset }
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

      // Offset samples for color fringing at edges
      vec4 cr = texture2D(tDiffuse, vUv + vec2(offset, offset * 0.5));
      vec4 cm = texture2D(tDiffuse, vUv + vec2(-offset * 0.5, offset));
      vec4 cy = texture2D(tDiffuse, vUv + vec2(-offset, -offset * 0.5));

      // Create color fringes only where there's alpha difference (silhouette edges)
      float cyanEdge = max(0.0, cr.a - center.a);
      float magentaEdge = max(0.0, cm.a - center.a);
      float yellowEdge = max(0.0, cy.a - center.a);

      // CMYK colors
      vec3 cyan = vec3(0.0, 1.0, 1.0);
      vec3 magenta = vec3(1.0, 0.0, 1.0);
      vec3 yellow = vec3(1.0, 1.0, 0.0);

      // Combine: colored fringes around edges
      vec3 fringes = cyan * cyanEdge + magenta * magentaEdge + yellow * yellowEdge;
      float fringeAlpha = max(max(cyanEdge, magentaEdge), yellowEdge);

      // Final: bean on top, fringes behind at edges only
      vec3 finalColor = mix(fringes, center.rgb, center.a);
      float finalAlpha = max(center.a, fringeAlpha * 0.85);

      gl_FragColor = vec4(finalColor, finalAlpha);
    }
  `
};

// ============================================
// PARAMETRIC BEAN GEOMETRY
// ============================================
function createBeanGeometry(params = {}) {
  const {
    segmentsU = 48,
    segmentsV = 32,
    // Bean proportions from CONFIG
    scaleX = CONFIG.beanScaleX,
    scaleY = CONFIG.beanScaleY,
    scaleZ = CONFIG.beanScaleZ,
    grooveDepth = 0.2,
    grooveWidth = 0.25,
    creaseWidth = CONFIG.creaseWidth,
    creaseLength = CONFIG.creaseLength
  } = params;

  const vertices = [];
  const indices = [];
  const uvParams = [];  // Store raw u,v for shader-based crease calculation

  // Generate vertices on parametric surface
  for (let iv = 0; iv <= segmentsV; iv++) {
    const v = (iv / segmentsV) * 2 - 1; // -1 to 1 (along bean length)

    for (let iu = 0; iu <= segmentsU; iu++) {
      const u = (iu / segmentsU) * 2 - 1; // -1 to 1 (across groove)

      // Base ellipsoid using spherical coordinates
      const theta = Math.acos(v);
      const phi = u * Math.PI;

      // Ellipsoid base position
      let x = Math.sin(theta) * Math.sin(phi) * scaleX;
      let y = Math.cos(theta) * scaleY;
      let z = Math.sin(theta) * Math.cos(phi) * scaleZ;

      // Groove calculation - affects front side (positive Z)
      const grooveMask = smoothstep(grooveWidth, 0, Math.abs(u));

      // Apply groove - push inward on Z
      if (z > 0) {
        const lengthFactor = 1 - v * v * 0.4; // Less groove at tips
        z -= grooveDepth * grooveMask * lengthFactor;
        // Pinch X slightly in groove
        x *= 1 - grooveMask * 0.1;
      }

      // Slight asymmetry
      z *= 1 + 0.03 * Math.sin(v * Math.PI * 0.5);

      // Gentle taper at ends
      const taper = 1 - Math.abs(v) * 0.08;
      x *= taper;
      z *= taper;

      vertices.push(x, y, z);
      uvParams.push(u, v);  // Store raw parametric coords
    }
  }

  // Generate triangle indices
  for (let iv = 0; iv < segmentsV; iv++) {
    for (let iu = 0; iu < segmentsU; iu++) {
      const a = iv * (segmentsU + 1) + iu;
      const b = a + 1;
      const c = a + (segmentsU + 1);
      const d = c + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('aUvParams', new THREE.Float32BufferAttribute(uvParams, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ============================================
// CEL-SHADED BEAN MATERIAL (black + white crease)
// ============================================
const BeanShader = {
  uniforms: {
    creaseWidth: { value: CONFIG.creaseWidth },
    creaseLength: { value: CONFIG.creaseLength }
  },
  vertexShader: `
    attribute vec2 aUvParams;
    varying vec3 vPosition;
    varying vec2 vUvParams;

    void main() {
      vPosition = position;
      vUvParams = aUvParams;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float creaseWidth;
    uniform float creaseLength;
    varying vec3 vPosition;
    varying vec2 vUvParams;

    void main() {
      // Pure black base
      vec3 color = vec3(0.0);

      // Calculate crease from parametric coords
      float u = vUvParams.x;
      float v = vUvParams.y;

      // Crisp crease with 90deg square ends
      float inWidth = step(abs(u), creaseWidth);
      float inLength = step(abs(v), creaseLength);
      float creaseLine = inWidth * inLength;

      // Only show crease on front face (positive Z)
      creaseLine *= step(0.0, vPosition.z);

      // Mix black and white
      color = mix(color, vec3(1.0), creaseLine);

      gl_FragColor = vec4(color, 1.0);
    }
  `
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
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  // Post-processing for CMYK halo effect
  const renderTarget = new THREE.WebGLRenderTarget(
    window.innerWidth * pixelRatio,
    window.innerHeight * pixelRatio,
    { format: THREE.RGBAFormat, stencilBuffer: false }
  );

  composer = new EffectComposer(renderer, renderTarget);
  composer.addPass(new RenderPass(scene, camera));

  cmykPass = new ShaderPass(CMYKShader);
  cmykPass.renderToScreen = true;
  composer.addPass(cmykPass);

  // Create geometry and material
  beanGeometry = createBeanGeometry();
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
let debounceTimer = null;
function debouncedReset() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(resetBeans, 150);
}

function setupGUI() {
  gui = new GUI({ title: 'Debug UI' });
  gui.close();

  const beansFolder = gui.addFolder('Beans');
  beansFolder.close();
  beansFolder.add(CONFIG, 'beanCount', 10, 300, 1).name('Count').onFinishChange(resetBeans);
  beansFolder.add(CONFIG, 'scaleMin', 0.05, 0.3, 0.01).name('Scale Min').onFinishChange(resetBeans);
  beansFolder.add(CONFIG, 'scaleMax', 0.1, 0.6, 0.01).name('Scale Max').onFinishChange(resetBeans);
  beansFolder.add(CONFIG, 'creaseWidth', 0.01, 0.1, 0.001).name('Crease Width').onChange(v => {
    beanMaterial.uniforms.creaseWidth.value = v;
  });
  beansFolder.add(CONFIG, 'creaseLength', 0.3, 0.95, 0.01).name('Crease Length').onChange(v => {
    beanMaterial.uniforms.creaseLength.value = v;
  });

  const shapeFolder = gui.addFolder('Bean Shape');
  shapeFolder.close();
  shapeFolder.add(CONFIG, 'beanScaleX', 0.3, 1, 0.05).name('Width').onFinishChange(rebuildGeometry);
  shapeFolder.add(CONFIG, 'beanScaleY', 0.3, 1, 0.05).name('Length').onFinishChange(rebuildGeometry);
  shapeFolder.add(CONFIG, 'beanScaleZ', 0.3, 1, 0.05).name('Thickness').onFinishChange(rebuildGeometry);

  const moveFolder = gui.addFolder('Movement');
  moveFolder.close();
  moveFolder.add(CONFIG, 'driftSpeed', 0, 1, 0.01).name('Drift Speed').onFinishChange(updateVelocities);
  moveFolder.add(CONFIG, 'rotationSpeed', 0, 5, 0.1).name('Spin Speed').onFinishChange(updateVelocities);
  moveFolder.add(CONFIG, 'paused').name('⏸ Pause');

  const spreadFolder = gui.addFolder('Spread');
  spreadFolder.close();
  spreadFolder.add(CONFIG, 'spreadX', 5, 25, 1).name('Spread X').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'spreadY', 3, 15, 1).name('Spread Y').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'depthMin', -10, 0, 0.5).name('Depth Min').onFinishChange(resetBeans);
  spreadFolder.add(CONFIG, 'depthMax', 0, 10, 0.5).name('Depth Max').onFinishChange(resetBeans);

  const cmykFolder = gui.addFolder('CMYK Halo');
  cmykFolder.close();
  cmykFolder.add(CONFIG, 'cmykOffset', 0.001, 0.015, 0.0005).name('Offset').onChange(v => {
    cmykPass.uniforms.offset.value = v;
  });

  const animFolder = gui.addFolder('Animation');
  animFolder.close();
  animFolder.add(CONFIG, 'staggerDelay', 5, 50, 1).name('Stagger (ms)').onFinishChange(debouncedReset);
  animFolder.add(CONFIG, 'animationDuration', 200, 2000, 50).name('Duration (ms)').onFinishChange(debouncedReset);
  animFolder.add(CONFIG, 'elasticAmplitude', 0.5, 3, 0.1).name('Amplitude').onFinishChange(debouncedReset);
  animFolder.add(CONFIG, 'elasticPeriod', 0.1, 1, 0.05).name('Period').onFinishChange(debouncedReset);

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
  beanGeometry = createBeanGeometry();
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
function handleResize() {
  const pixelRatio = Math.min(window.devicePixelRatio, 3);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(pixelRatio);
  composer.setSize(window.innerWidth * pixelRatio, window.innerHeight * pixelRatio);
}

// ============================================
// START
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
