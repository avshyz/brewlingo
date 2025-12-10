/**
 * Shared Constants
 * Color configurations and other shared constants
 */

// Roast level color themes
export const ROAST_LEVELS = {
  green: {
    baseColor: '#7A9A6D',
    highlightColor: '#B8C9A8',
    creaseColor: '#5C7A4F'
  },
  ultralight: {
    baseColor: '#C4A484',
    highlightColor: '#E8DCC4',
    creaseColor: '#D4C4A8'
  },
  light: {
    baseColor: '#C4A484',
    highlightColor: '#E8DCC4',
    creaseColor: '#A08060'
  },
  mediumLight: {
    baseColor: '#A68850',
    highlightColor: '#D4BC8A',
    creaseColor: '#7A6438'
  },
  medium: {
    baseColor: '#8B6914',
    highlightColor: '#C9A86C',
    creaseColor: '#5C4A20'
  },
  dark: {
    baseColor: '#5C4532',
    highlightColor: '#8A7058',
    creaseColor: '#3E2E22'
  }
};

// Get all roast levels except green (for Bean Bag preset)
export function getColoredRoastLevels() {
  return Object.entries(ROAST_LEVELS)
    .filter(([key]) => key !== 'green')
    .map(([, value]) => value);
}
