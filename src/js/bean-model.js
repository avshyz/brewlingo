/**
 * Shared Bean Model
 * Geometry and shaders for coffee bean rendering
 * Configuration imported from consts.js
 */
import * as THREE from 'three';
import { BEAN_CONFIG, GEOMETRY_TYPES, GEOMETRY_PARAMS } from './consts.js';

// Re-export for backwards compatibility
export { BEAN_CONFIG, GEOMETRY_TYPES };

// Legacy exports (now derived from GEOMETRY_PARAMS)
export const CLASSIC_DEFAULT_DIMS = {
  beanScaleX: GEOMETRY_PARAMS.CLASSIC.beanScaleX,
  beanScaleY: GEOMETRY_PARAMS.CLASSIC.beanScaleY,
  beanScaleZ: GEOMETRY_PARAMS.CLASSIC.beanScaleZ
};

export const SUPERELLIPSE_DEFAULT_DIMS = {
  beanScaleX: GEOMETRY_PARAMS.SUPERELLIPSE.beanScaleX,
  beanScaleY: GEOMETRY_PARAMS.SUPERELLIPSE.beanScaleY,
  beanScaleZ: GEOMETRY_PARAMS.SUPERELLIPSE.beanScaleZ
};

// ============================================
// HELPER FUNCTIONS
// ============================================
function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ============================================
// PARAMETRIC BEAN GEOMETRY - CLASSIC (ellipsoid-based)
// ============================================
export function createBeanGeometryClassic(config = BEAN_CONFIG, params = {}) {
  const {
    segmentsU = 48,
    segmentsV = 32,
    grooveDepth = 0.2,
    grooveWidth = 0.25
  } = params;

  const scaleX = config.beanScaleX;
  const scaleY = config.beanScaleY;
  const scaleZ = config.beanScaleZ;

  const vertices = [];
  const indices = [];
  const uvParams = [];

  for (let iv = 0; iv <= segmentsV; iv++) {
    const v = (iv / segmentsV) * 2 - 1;

    for (let iu = 0; iu <= segmentsU; iu++) {
      const u = (iu / segmentsU) * 2 - 1;

      const theta = Math.acos(v);
      const phi = u * Math.PI;

      let x = Math.sin(theta) * Math.sin(phi) * scaleX;
      let y = Math.cos(theta) * scaleY;
      let z = Math.sin(theta) * Math.cos(phi) * scaleZ;

      const grooveMask = smoothstep(grooveWidth, 0, Math.abs(u));

      if (z > 0) {
        const lengthFactor = 1 - v * v * 0.4;
        z -= grooveDepth * grooveMask * lengthFactor;
        x *= 1 - grooveMask * 0.1;
      }

      z *= 1 + 0.03 * Math.sin(v * Math.PI * 0.5);

      const taper = 1 - Math.abs(v) * 0.08;
      x *= taper;
      z *= taper;

      vertices.push(x, y, z);
      uvParams.push(u, v);
    }
  }

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

// ============================================
// PARAMETRIC BEAN GEOMETRY - SUPERELLIPSE (kidney-shaped)
// ============================================
export function createBeanGeometrySuperellipse(config = BEAN_CONFIG, params = {}) {
  const {
    segmentsU = 48,
    segmentsV = 32,
    grooveDepth = 0.22,
    grooveWidth = 0.28
  } = params;

  // Use config values (allows passing custom config or defaults)
  const scaleX = config.beanScaleX;
  const scaleY = config.beanScaleY;
  const scaleZ = config.beanScaleZ;
  const kidneyAmount = config.kidneyAmount;
  const kidneyOffset = config.kidneyOffset;
  const backBulge = config.backBulge;
  const endPinch = config.endPinch;
  const endPointiness = config.endPointiness;

  const vertices = [];
  const indices = [];
  const uvParams = [];

  for (let iv = 0; iv <= segmentsV; iv++) {
    const v = (iv / segmentsV) * 2 - 1;

    for (let iu = 0; iu <= segmentsU; iu++) {
      const u = (iu / segmentsU) * 2 - 1;
      const phi = u * Math.PI;
      const n = 2.5;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      const signX = Math.sign(sinPhi);
      const signZ = Math.sign(cosPhi);

      let crossX = signX * Math.pow(Math.abs(sinPhi), 2/n);
      let crossZ = signZ * Math.pow(Math.abs(cosPhi), 2/n);

      const absV = Math.abs(v);
      const vSquared = v * v;
      const baseRadius = Math.pow(1 - Math.pow(absV, 2 + endPointiness), 0.5 + endPointiness * 0.5);
      const kidneyShift = kidneyAmount * Math.sin((v - kidneyOffset) * Math.PI * 0.9);
      const zSign = crossZ < 0 ? 1 : 0;
      const bulgeFactor = 1 + backBulge * zSign * (1 - vSquared * 0.5);
      const pinchFactor = 1 - endPinch * Math.pow(absV, 3);

      let x = crossX * baseRadius * scaleX * pinchFactor + kidneyShift * baseRadius * scaleX;
      let y = v * scaleY;
      let z = crossZ * baseRadius * scaleZ * bulgeFactor;

      if (z > 0) {
        const grooveMask = smoothstep(grooveWidth, 0, Math.abs(u));
        const lengthFactor = 1 - vSquared * 0.5;
        z -= grooveDepth * grooveMask * lengthFactor * baseRadius;
        x *= 1 - grooveMask * 0.08;
      }

      const asymmetry = 0.02;
      x += asymmetry * Math.sin(v * Math.PI * 2.1) * baseRadius;
      z *= 1 + asymmetry * Math.sin(v * Math.PI * 1.3);

      vertices.push(x, y, z);
      uvParams.push(u, v);
    }
  }

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

// ============================================
// GEOMETRY SELECTOR
// ============================================
export function createBeanGeometry(config = BEAN_CONFIG, params = {}) {
  const geometryType = config.geometryType || GEOMETRY_TYPES.SUPERELLIPSE;

  if (geometryType === GEOMETRY_TYPES.CLASSIC) {
    return createBeanGeometryClassic(config, params);
  }
  return createBeanGeometrySuperellipse(config, params);
}

// ============================================
// CEL-SHADED BEAN MATERIAL SHADER
// ============================================
export function createBeanShaderUniforms(config = BEAN_CONFIG) {
  return {
    creaseWidth: { value: config.creaseWidth },
    creaseLength: { value: config.creaseLength },
    creaseRadius: { value: config.creaseRadius },
    lightDir: { value: new THREE.Vector3(config.lightX, config.lightY, config.lightZ).normalize() },
    colorEnabled: { value: config.colorEnabled ? 1.0 : 0.0 },
    toonEnabled: { value: config.toonEnabled ? 1.0 : 0.0 },
    rimEnabled: { value: config.rimEnabled ? 1.0 : 0.0 },
    specularEnabled: { value: config.specularEnabled ? 1.0 : 0.0 },
    rimPower: { value: config.rimPower },
    rimIntensity: { value: config.rimIntensity },
    toonBands: { value: config.toonBands },
    specularPower: { value: config.specularPower },
    specularThreshold: { value: config.specularThreshold },
    specularIntensity: { value: config.specularIntensity },
    baseColor: { value: new THREE.Color(config.baseColor) },
    highlightColor: { value: new THREE.Color(config.highlightColor) },
    creaseColor: { value: new THREE.Color(config.creaseColor) }
  };
}

export const BeanShaderVertexShader = `
  attribute vec2 aUvParams;
  varying vec3 vPosition;
  varying vec2 vUvParams;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vPosition = position;
    vUvParams = aUvParams;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const BeanShaderFragmentShader = `
  uniform float creaseWidth;
  uniform float creaseLength;
  uniform float creaseRadius;
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
    vec3 effBaseColor = colorEnabled > 0.5 ? baseColor : vec3(0.0);
    vec3 effHighlightColor = colorEnabled > 0.5 ? highlightColor : vec3(1.0);
    vec3 effCreaseColor = colorEnabled > 0.5 ? creaseColor : vec3(1.0);

    vec3 color;
    if (toonEnabled > 0.5) {
      vec3 lightDirView = normalize((viewMatrix * vec4(lightDir, 0.0)).xyz);
      float NdotL = dot(normal, lightDirView);
      float lightIntensity = (NdotL + 1.0) * 0.5;
      float toon = floor(lightIntensity * toonBands) / toonBands;
      vec3 darkBase = effBaseColor * 0.6;
      color = mix(darkBase, effBaseColor, toon);
    } else {
      color = effBaseColor;
    }

    if (rimEnabled > 0.5) {
      float fresnel = 1.0 - max(dot(normal, viewDir), 0.0);
      fresnel = pow(fresnel, rimPower);
      vec3 rimColor = effHighlightColor * fresnel * rimIntensity;
      color = color + rimColor;
    }

    if (specularEnabled > 0.5) {
      vec3 lightDirView = normalize((viewMatrix * vec4(lightDir, 0.0)).xyz);
      vec3 halfVec = normalize(lightDirView + viewDir);
      float spec = pow(max(dot(normal, halfVec), 0.0), specularPower);
      spec = step(specularThreshold, spec) * specularIntensity;
      vec3 specColor = effHighlightColor * spec;
      color = color + specColor;
    }

    // Rounded rectangle SDF for crease
    float u = vUvParams.x;
    float v = vUvParams.y;
    // Distance from point to rounded rectangle
    vec2 p = abs(vec2(u, v));
    vec2 size = vec2(creaseWidth, creaseLength);
    vec2 q = p - size + creaseRadius;
    float dist = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - creaseRadius;
    float creaseLine = 1.0 - step(0.0, dist);
    creaseLine *= step(0.0, vPosition.z);
    color = mix(color, effCreaseColor, creaseLine);
    color = clamp(color, 0.0, 1.0);
    gl_FragColor = vec4(color, 1.0);
  }
`;

// ============================================
// CMYK POST-PROCESSING SHADER
// ============================================
export function createCMYKShaderUniforms(config = BEAN_CONFIG, isMobile = false) {
  return {
    tDiffuse: { value: null },
    offset: { value: config.cmykOffset },
    time: { value: 0 },
    breatheEnabled: { value: config.cmykBreatheEnabled ? 1.0 : 0.0 },
    breatheIntensity: { value: config.cmykBreatheIntensity },
    breatheSpeed: { value: config.cmykBreatheSpeed },
    breatheWaveFreq: { value: config.cmykBreatheWaveFreq },
    rotationSpeed: { value: config.cmykRotationSpeed },
    verticalWave: { value: isMobile ? 1.0 : 0.0 },
    multiplyBlend: { value: config.cmykMultiplyBlend ? 1.0 : 0.0 }
  };
}

export const CMYKShaderVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const CMYKShaderFragmentShader = `
  uniform sampler2D tDiffuse;
  uniform float offset;
  uniform float time;
  uniform float breatheEnabled;
  uniform float breatheIntensity;
  uniform float breatheSpeed;
  uniform float breatheWaveFreq;
  uniform float rotationSpeed;
  uniform float verticalWave;
  uniform float multiplyBlend;
  varying vec2 vUv;

  const float TAU = 6.28318530718;

  void main() {
    vec4 center = texture2D(tDiffuse, vUv);
    float waveCoord = mix(vUv.x, 1.0 - vUv.y, verticalWave);
    float wavePhase = waveCoord * breatheWaveFreq * TAU - time * breatheSpeed;
    float wave = sin(wavePhase);
    float breathe = 1.0 + breatheEnabled * breatheIntensity * wave;
    float animOffset = offset * breathe;
    float baseAngle = time * rotationSpeed;
    float angleCyan = baseAngle;
    float angleMagenta = baseAngle + 2.094;
    float angleYellow = baseAngle + 4.189;
    vec2 dirCyan = vec2(cos(angleCyan), sin(angleCyan)) * animOffset;
    vec2 dirMagenta = vec2(cos(angleMagenta), sin(angleMagenta)) * animOffset;
    vec2 dirYellow = vec2(cos(angleYellow), sin(angleYellow)) * animOffset;
    vec4 cr = texture2D(tDiffuse, vUv + dirCyan);
    vec4 cm = texture2D(tDiffuse, vUv + dirMagenta);
    vec4 cy = texture2D(tDiffuse, vUv + dirYellow);
    float cyanEdge = max(0.0, cr.a - center.a);
    float magentaEdge = max(0.0, cm.a - center.a);
    float yellowEdge = max(0.0, cy.a - center.a);
    vec3 cyan = vec3(0.0, 1.0, 1.0);
    vec3 magenta = vec3(1.0, 0.0, 1.0);
    vec3 yellow = vec3(1.0, 1.0, 0.0);

    // Blend modes for fringes
    vec3 fringes;
    if (multiplyBlend > 0.5) {
      // Subtractive CMY mixing (like real ink/print)
      // Each CMY color absorbs its RGB complement:
      // Cyan absorbs Red, Magenta absorbs Green, Yellow absorbs Blue
      fringes = vec3(
        1.0 - cyanEdge,      // R: cyan removes red
        1.0 - magentaEdge,   // G: magenta removes green
        1.0 - yellowEdge     // B: yellow removes blue
      );
      // Where no edges exist, make black (matches additive transparency)
      float hasEdge = step(0.001, cyanEdge + magentaEdge + yellowEdge);
      fringes *= hasEdge;
    } else {
      // Additive blend: bright RGB mixing (original behavior)
      fringes = cyan * cyanEdge + magenta * magentaEdge + yellow * yellowEdge;
    }

    float fringeAlpha = max(max(cyanEdge, magentaEdge), yellowEdge);
    vec3 finalColor = mix(fringes, center.rgb, center.a);
    float finalAlpha = max(center.a, fringeAlpha * 0.85);
    gl_FragColor = vec4(finalColor, finalAlpha);
  }
`;
