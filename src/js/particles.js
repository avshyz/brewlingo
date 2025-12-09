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

// ============================================
// CONFIGURATION
// ============================================
const isMobile = window.innerWidth <= 640;
const isDebug = new URLSearchParams(window.location.search).get('d') === '1';

const CONFIG = {
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
  cmykOffset: 0.002,
  cmykBreatheEnabled: true,
  cmykBreatheIntensity: 0.5,
  cmykBreatheSpeed: 0.8,
  cmykBreatheWaveFreq: 0.5,
  cmykRotationSpeed: 0.4,
  creaseWidth: 0.035,
  creaseLength: 0.7,
  // Bean shape
  beanScaleX: 0.6,
  beanScaleY: 0.75,
  beanScaleZ: 0.5,
  // Animation state
  paused: false,
  // Collision settings
  collisionEnabled: true,
  collisionDamping: 0.8,
  collisionRadiusMultiplier: 0.5,
  // Cel-shading settings
  toonEnabled: false,
  rimEnabled: false,
  specularEnabled: true,
  rimPower: 2.0,
  rimIntensity: 0.6,
  toonBands: 3,
  specularPower: 64.0,
  specularThreshold: 0.5,
  specularIntensity: 0.8,
  lightX: 0.5,
  lightY: 1.0,
  lightZ: 0.3,
  // Bean colors
  colorEnabled: false,
  baseColor: '#C4A484',      // Light roasted coffee
  highlightColor: '#E8DCC4', // Warm cream highlight
  creaseColor: '#E5D9C3'     // Light brown-beige crease
};

// ============================================
// CMYK POST-PROCESSING SHADER (edge halo effect)
// ============================================
const CMYKShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: CONFIG.cmykOffset },
    time: { value: 0 },
    breatheEnabled: { value: CONFIG.cmykBreatheEnabled ? 1.0 : 0.0 },
    breatheIntensity: { value: CONFIG.cmykBreatheIntensity },
    breatheSpeed: { value: CONFIG.cmykBreatheSpeed },
    breatheWaveFreq: { value: CONFIG.cmykBreatheWaveFreq },
    rotationSpeed: { value: CONFIG.cmykRotationSpeed },
    verticalWave: { value: isMobile ? 1.0 : 0.0 }
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
    uniform float time;
    uniform float breatheEnabled;
    uniform float breatheIntensity;
    uniform float breatheSpeed;
    uniform float breatheWaveFreq;
    uniform float rotationSpeed;
    uniform float verticalWave;
    varying vec2 vUv;

    const float TAU = 6.28318530718;

    void main() {
      // Original center sample
      vec4 center = texture2D(tDiffuse, vUv);

      // Traveling wave: sin(kx - ωt)
      // Desktop: left to right (use vUv.x)
      // Mobile: top to bottom (use vUv.y, inverted so wave travels downward)
      float waveCoord = mix(vUv.x, 1.0 - vUv.y, verticalWave);
      float wavePhase = waveCoord * breatheWaveFreq * TAU - time * breatheSpeed;
      float wave = sin(wavePhase);

      // Apply breathing modulation (when enabled)
      float breathe = 1.0 + breatheEnabled * breatheIntensity * wave;
      float animOffset = offset * breathe;

      // Slowly rotating angle for each color channel (120° apart)
      float baseAngle = time * rotationSpeed;
      float angleCyan = baseAngle;
      float angleMagenta = baseAngle + 2.094; // +120°
      float angleYellow = baseAngle + 4.189;  // +240°

      // Calculate rotating offset directions
      vec2 dirCyan = vec2(cos(angleCyan), sin(angleCyan)) * animOffset;
      vec2 dirMagenta = vec2(cos(angleMagenta), sin(angleMagenta)) * animOffset;
      vec2 dirYellow = vec2(cos(angleYellow), sin(angleYellow)) * animOffset;

      // Offset samples for color fringing at edges
      vec4 cr = texture2D(tDiffuse, vUv + dirCyan);
      vec4 cm = texture2D(tDiffuse, vUv + dirMagenta);
      vec4 cy = texture2D(tDiffuse, vUv + dirYellow);

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
    creaseLength: { value: CONFIG.creaseLength },
    // Cel-shading uniforms
    lightDir: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
    colorEnabled: { value: 0.0 },
    toonEnabled: { value: 0.0 },
    rimEnabled: { value: 0.0 },
    specularEnabled: { value: 1.0 },
    rimPower: { value: 2.0 },
    rimIntensity: { value: 0.6 },
    toonBands: { value: 3.0 },
    specularPower: { value: 64.0 },
    specularThreshold: { value: 0.5 },
    specularIntensity: { value: 0.8 },
    baseColor: { value: new THREE.Color(0xC4A484) },      // Light roasted coffee
    highlightColor: { value: new THREE.Color(0xE8DCC4) }, // Warm cream highlight
    creaseColor: { value: new THREE.Color(0xE5D9C3) }     // Light brown-beige crease
  },
  vertexShader: `
    attribute vec2 aUvParams;
    varying vec3 vPosition;
    varying vec2 vUvParams;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vPosition = position;
      vUvParams = aUvParams;

      // Transform normal to view space for lighting
      vNormal = normalize(normalMatrix * normal);

      // Calculate view direction (camera looks down -Z in view space)
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mvPosition.xyz);

      gl_Position = projectionMatrix * mvPosition;
    }
  `,
  fragmentShader: `
    uniform float creaseWidth;
    uniform float creaseLength;
    uniform vec3 lightDir;
    uniform float colorEnabled;
    uniform float toonEnabled;
    uniform float rimEnabled;
    uniform float specularEnabled;
    uniform float rimPower;
    uniform float rimIntensity;
    uniform float toonBands;
    uniform float specularPower;
    uniform float specularThreshold;
    uniform float specularIntensity;
    uniform vec3 baseColor;
    uniform vec3 highlightColor;
    uniform vec3 creaseColor;

    varying vec3 vPosition;
    varying vec2 vUvParams;
    varying vec3 vNormal;
    varying vec3 vViewDir;

    void main() {
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewDir);

      // Get effective colors based on colorEnabled toggle
      vec3 effBaseColor = colorEnabled > 0.5 ? baseColor : vec3(0.0);       // Black when disabled
      vec3 effHighlightColor = colorEnabled > 0.5 ? highlightColor : vec3(1.0); // White when disabled
      vec3 effCreaseColor = colorEnabled > 0.5 ? creaseColor : vec3(1.0);   // White when disabled

      // ================================
      // 1. QUANTIZED TOON LIGHTING (or flat base color)
      // ================================
      vec3 color;
      if (toonEnabled > 0.5) {
        // Transform light direction to view space for consistency
        vec3 lightDirView = normalize((viewMatrix * vec4(lightDir, 0.0)).xyz);
        float NdotL = dot(normal, lightDirView);

        // Remap from [-1, 1] to [0, 1] and quantize into bands
        float lightIntensity = (NdotL + 1.0) * 0.5;
        float toon = floor(lightIntensity * toonBands) / toonBands;

        // Create base color with toon shading - blend from darker to lighter
        vec3 darkBase = effBaseColor * 0.6;  // Shadow tone
        color = mix(darkBase, effBaseColor, toon);
      } else {
        // Flat base color (old look)
        color = effBaseColor;
      }

      // ================================
      // 2. RIM LIGHTING (Fresnel)
      // ================================
      if (rimEnabled > 0.5) {
        float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
        fresnel = pow(fresnel, rimPower);
        vec3 rimColor = effHighlightColor * fresnel * rimIntensity;
        color = color + rimColor;
      }

      // ================================
      // 3. SPECULAR HIGHLIGHT (Anime-style)
      // ================================
      if (specularEnabled > 0.5) {
        vec3 lightDirView = normalize((viewMatrix * vec4(lightDir, 0.0)).xyz);
        vec3 halfVec = normalize(lightDirView + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), specularPower);
        // Hard cutoff for cel-shaded look
        spec = step(specularThreshold, spec) * specularIntensity;
        vec3 specColor = effHighlightColor * spec;
        color = color + specColor;
      }

      // ================================
      // 4. CREASE LINE
      // ================================
      float u = vUvParams.x;
      float v = vUvParams.y;

      float inWidth = step(abs(u), creaseWidth);
      float inLength = step(abs(v), creaseLength);
      float creaseLine = inWidth * inLength;

      // Only show crease on front face (positive Z)
      creaseLine *= step(0.0, vPosition.z);

      // ================================
      // COMBINE ALL EFFECTS
      // ================================
      // Crease line on top
      color = mix(color, effCreaseColor, creaseLine);

      // Clamp to prevent over-brightening
      color = clamp(color, 0.0, 1.0);

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
