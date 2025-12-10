/**
 * Shared Constants
 * All configuration for Three.js bean rendering across the app
 */

// ============================================
// GEOMETRY
// ============================================
export const GEOMETRY_TYPES = {
  CLASSIC: "classic",
  SUPERELLIPSE: "superellipse",
};

export const GEOMETRY_PARAMS = {
  CLASSIC: {
    segmentsU: 48,
    segmentsV: 32,
    grooveDepth: 0.2,
    grooveWidth: 0.25,
    // Default dimensions
    beanScaleX: 0.55,
    beanScaleY: 0.65,
    beanScaleZ: 0.4,
  },
  SUPERELLIPSE: {
    segmentsU: 48,
    segmentsV: 32,
    grooveDepth: 0.22,
    grooveWidth: 0.28,
    // Default dimensions
    beanScaleX: 0.45,
    beanScaleY: 0.66,
    beanScaleZ: 0.35,
  },
};

// ============================================
// BEAN SHAPE & SHADING
// ============================================
export const BEAN_CONFIG = {
  // Bean shape (superellipse defaults)
  beanScaleX: 0.45,
  beanScaleY: 0.66,
  beanScaleZ: 0.35,
  // Kidney deformation
  kidneyAmount: 0.02,
  kidneyOffset: 0.3,
  // Asymmetric bulge (flat front, domed back)
  backBulge: 0.25,
  // End pinch
  endPinch: 0,
  endPointiness: 0.14,
  // Crease
  creaseWidth: 0.027,
  creaseLength: 0.7,
  creaseRadius: 0.02,
  // Cel-shading settings (blend preset defaults)
  toonEnabled: true,
  rimEnabled: true,
  specularEnabled: true,
  rimPower: 5,
  rimIntensity: 1.15,
  toonBands: 3,
  specularPower: 36,
  specularThreshold: 0.25,
  specularIntensity: 0.5,
  lightX: 0.5,
  lightY: 1.0,
  lightZ: 0.3,
  // Bean colors (blend preset defaults)
  colorEnabled: true,
  baseColor: "#C4A484",
  highlightColor: "#E8DCC4",
  creaseColor: "#E5D9C3",
  // CMYK effect
  cmykOffset: 0.002,
  cmykBreatheEnabled: true,
  cmykBreatheIntensity: 0.5,
  cmykBreatheSpeed: 0.8,
  cmykBreatheWaveFreq: 0.5,
  cmykRotationSpeed: 0.4,
};

// ============================================
// VISUAL PRESETS
// ============================================
export const VISUAL_PRESETS = {
  classic: {
    geometryType: GEOMETRY_TYPES.CLASSIC,
    toonEnabled: false,
    rimEnabled: false,
    specularEnabled: false,
    colorEnabled: false,
    blendMode: false,
  },
  modern: {
    geometryType: GEOMETRY_TYPES.SUPERELLIPSE,
    toonEnabled: false,
    rimEnabled: false,
    specularEnabled: true,
    colorEnabled: false,
    blendMode: false,
  },
  singleOrigin: {
    geometryType: GEOMETRY_TYPES.SUPERELLIPSE,
    toonEnabled: true,
    toonBands: 3,
    rimEnabled: true,
    rimIntensity: 1.15,
    rimPower: 5,
    specularEnabled: true,
    specularIntensity: 0.5,
    specularThreshold: 0.25,
    specularPower: 36,
    colorEnabled: true,
    blendMode: false,
  },
  blend: {
    geometryType: GEOMETRY_TYPES.SUPERELLIPSE,
    toonEnabled: true,
    toonBands: 3,
    rimEnabled: true,
    rimIntensity: 1.15,
    rimPower: 5,
    specularEnabled: true,
    specularIntensity: 0.5,
    specularThreshold: 0.25,
    specularPower: 36,
    colorEnabled: true,
    blendMode: true,
  },
};

// ============================================
// ROAST COLORS
// ============================================
export const ROAST_LEVELS = {
  green: {
    baseColor: "#7A9A6D",
    highlightColor: "#B8C9A8",
    creaseColor: "#5C7A4F",
  },
  ultralight: {
    baseColor: "#C4A484",
    highlightColor: "#E8DCC4",
    creaseColor: "#D4C4A8",
  },
  light: {
    baseColor: "#C4A484",
    highlightColor: "#E8DCC4",
    creaseColor: "#A08060",
  },
  mediumLight: {
    baseColor: "#A68850",
    highlightColor: "#D4BC8A",
    creaseColor: "#7A6438",
  },
  medium: {
    baseColor: "#8B6914",
    highlightColor: "#C9A86C",
    creaseColor: "#5C4A20",
  },
  dark: {
    baseColor: "#5C4532",
    highlightColor: "#8A7058",
    creaseColor: "#3E2E22",
  },
};

// Get all roast levels with weighted probabilities for Blend preset
// Dark has 1/3 probability, green has 1/10 probability relative to others
export function getColoredRoastLevels() {
  const weighted = [];
  const baseWeight = 30;

  Object.entries(ROAST_LEVELS).forEach(([key, value]) => {
    let count;
    if (key === "green") {
      count = baseWeight / 10;
    } else if (key === "dark") {
      count = baseWeight / 3;
    } else {
      count = baseWeight;
    }

    for (let i = 0; i < count; i++) {
      weighted.push(value);
    }
  });

  return weighted;
}

// ============================================
// LANDING PAGE CONFIG (index.html)
// ============================================
export const LANDING_PAGE_CONFIG = {
  // Scene settings
  beanCount: 200,
  spreadX: 12,
  spreadY: 8,
  depthMin: -5,
  depthMax: 2,
  scaleMin: 0.1,
  scaleMax: 0.43,
  // Animation
  driftSpeed: 0.5,
  rotationSpeed: 3,
  staggerDelay: 10,
  animationDuration: 1000,
  elasticAmplitude: 1.5,
  elasticPeriod: 0.3,
  // Collision
  collisionEnabled: true,
  collisionDamping: 0.8,
  collisionRadiusMultiplier: 0.5,
  // Landing card transition
  cardFadeScale: 2,
  cardFadeDuration: 0.9,
  // Defaults
  preset: "blend",
  cmykEnabled: true,
  roastLevel: "light",
  blendMode: true,
};

// ============================================
// BACKGROUND BEANS CONFIG (language.html, recipe.html)
// ============================================
export const BACKGROUND_BEANS_CONFIG = {
  // Bean count
  beanCountDesktop: 60,
  beanCountMobile: 80,
  // Spawn area
  spreadX: 14,
  spreadY: 10,
  depthMin: -4,
  depthMax: 5,
  // Scale range
  scaleMin: 0.08,
  scaleMax: 0.35,
  // Animation (slower than landing page)
  driftSpeed: 0.05,
  rotationSpeed: 0.7,
  // Parallax
  parallaxIntensity: 0.5,
  // Dot grid
  dotsEnabled: true,
  dotSpacing: 0.45,
  dotSize: 0.06,
  dotDepth: -15,
  dotColor: "#1a1a1a",
  dotSpreadX: 30,
  dotSpreadY: 40,
  // Modern preset overrides
  toonEnabled: false,
  rimEnabled: false,
  specularEnabled: true,
  colorEnabled: false,
  // CMYK effect
  cmykEnabled: true,
  cmykOffset: 0.0005,
};

