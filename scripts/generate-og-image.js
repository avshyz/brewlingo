#!/usr/bin/env node

/**
 * Generates an Open Graph image (1200x630) from the bean SVG
 * Uses Puppeteer for full CSS support (blend modes, etc.)
 *
 * Usage: npm run generate-og
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const BEAN_SIZE = 280;
const DOT_SPACING = 35;
const DOT_SIZE = 4;

async function generateOGImage() {
  const svgPath = path.join(__dirname, '..', 'public', 'assets', 'favicon.svg');
  const outputPath = path.join(__dirname, '..', 'public', 'assets', 'og-image.png');

  // Read the SVG content
  let svgContent = fs.readFileSync(svgPath, 'utf8');

  // Remove the background rect to make it transparent
  svgContent = svgContent.replace(/<rect[^>]*fill="#FFFFFF"[^>]*\/>/, '');

  // Generate dots for background
  const dots = [];
  for (let y = 0; y < OG_HEIGHT; y += DOT_SPACING) {
    for (let x = 0; x < OG_WIDTH; x += DOT_SPACING) {
      dots.push(`<circle cx="${x}" cy="${y}" r="${DOT_SIZE / 2}" fill="#1a1a1a" fill-opacity="0.4"/>`);
    }
  }

  // Create the full HTML page with proper CSS
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; }
        body {
          width: ${OG_WIDTH}px;
          height: ${OG_HEIGHT}px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: white;
          position: relative;
          overflow: hidden;
        }
        .dots {
          position: absolute;
          inset: 0;
        }
        .vignette {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 65% 65% at center, transparent 60%, rgba(255,255,255,0.95) 100%);
          pointer-events: none;
        }
        .bean {
          width: ${BEAN_SIZE}px;
          height: ${BEAN_SIZE}px;
          position: relative;
          z-index: 1;
        }
        .bean svg {
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <svg class="dots" width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        ${dots.join('\n')}
      </svg>
      <div class="bean">
        ${svgContent}
      </div>
      <div class="vignette"></div>
    </body>
    </html>
  `;

  // Launch Puppeteer and render
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setViewport({
    width: OG_WIDTH,
    height: OG_HEIGHT,
    deviceScaleFactor: 1
  });

  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: {
      x: 0,
      y: 0,
      width: OG_WIDTH,
      height: OG_HEIGHT
    }
  });

  await browser.close();

  console.log(`✓ Generated OG image: ${outputPath}`);
  console.log(`  Size: ${OG_WIDTH}x${OG_HEIGHT}px`);
}

generateOGImage().catch(err => {
  console.error('Error generating OG image:', err.message);
  process.exit(1);
});
