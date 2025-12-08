#!/usr/bin/env node

/**
 * Generates an Open Graph image (1200x630) from the bean SVG
 *
 * Usage: node scripts/generate-og-image.js
 *
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const BEAN_SIZE = 280; // Size of the bean in the final image
const BACKGROUND_COLOR = '#FF4D1F'; // Header red-orange

async function generateOGImage() {
  const svgPath = path.join(__dirname, '..', 'assets', 'bean.svg');
  const outputPath = path.join(__dirname, '..', 'assets', 'og-image.png');

  // Read and modify SVG to set explicit size
  let svgContent = fs.readFileSync(svgPath, 'utf8');

  // Add width/height attributes for sharp to render at correct size
  svgContent = svgContent.replace(
    '<svg ',
    `<svg width="${BEAN_SIZE}" height="${BEAN_SIZE}" `
  );

  // Create the bean image from SVG
  const beanBuffer = await sharp(Buffer.from(svgContent))
    .resize(BEAN_SIZE, BEAN_SIZE, { fit: 'contain' })
    .png()
    .toBuffer();

  // Create the final OG image with background and centered bean
  await sharp({
    create: {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      channels: 4,
      background: BACKGROUND_COLOR
    }
  })
    .composite([
      {
        input: beanBuffer,
        left: Math.round((OG_WIDTH - BEAN_SIZE) / 2),
        top: Math.round((OG_HEIGHT - BEAN_SIZE) / 2)
      }
    ])
    .png()
    .toFile(outputPath);

  console.log(`✓ Generated OG image: ${outputPath}`);
  console.log(`  Size: ${OG_WIDTH}x${OG_HEIGHT}px`);
}

generateOGImage().catch(err => {
  console.error('Error generating OG image:', err.message);
  process.exit(1);
});
