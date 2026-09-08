#!/usr/bin/env node

/**
 * @file convert-tokens.js
 * @description Design System Token to CSS Variable Generator
 * 
 * This script transforms Figma/W3C design tokens (`design-tokens.tokens.json`) into 
 * production-ready CSS variables, adhering to modern Design Token specifications and 
 * strict color tiering architecture:
 * 
 * 1. PRIMITIVE COLORS (Foundations):
 *    - Raw palette values (Key colors, tonal palettes: 0..100).
 *    - Prefix: `--primitive-color-*`
 *    - RULE: Foundational only. DO NOT apply directly to UI components.
 * 
 * 2. COLOR ROLES (Semantic Tokens):
 *    - Application layer tokens mapped dynamically to primitive CSS variables (`var(--primitive-color-...)`).
 *    - Prefix: `--color-*`
 *    - RULE: Use these directly in UI components (buttons, surfaces, text, borders).
 * 
 * 3. SPACING, TYPOGRAPHY & EFFECTS:
 *    - Standardized dimensional, typographic, and elevation tokens.
 * 
 * Usage:
 *   node convert-tokens.js
 *   node convert-tokens.js --input ./design-tokens.tokens.json --output ./styles/tokens.css
 *   node convert-tokens.js --split --outdir ./styles/tokens/
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION & CLI ARGUMENT PARSING
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: path.resolve(process.cwd(), 'design-tokens.tokens.json'),
    output: path.resolve(process.cwd(), 'styles', 'tokens.css'),
    split: false,
    outdir: path.resolve(process.cwd(), 'styles', 'tokens'),
    includeUtilities: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      options.input = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--output' || arg === '-o') {
      options.output = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--split' || arg === '-s') {
      options.split = true;
    } else if (arg === '--outdir' || arg === '-d') {
      options.outdir = path.resolve(process.cwd(), args[++i]);
      options.split = true;
    } else if (arg === '--no-utilities') {
      options.includeUtilities = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Design System Token to CSS Variable Converter

Usage:
  node convert-tokens.js [options]

Options:
  -i, --input <file>       Path to source design tokens JSON (default: ./design-tokens.tokens.json)
  -o, --output <file>      Path to output consolidated CSS file (default: ./styles/tokens.css)
  -s, --split              Output modular CSS files by category
  -d, --outdir <dir>       Directory for split output files (default: ./styles/tokens/)
  --no-utilities           Skip generating typography & elevation utility classes
  -h, --help               Show this help message
`);
}

// ============================================================================
// UTILITY FUNCTIONS & FORMATTERS
// ============================================================================

/**
 * Converts strings to clean kebab-case.
 * @param {string} str 
 * @returns {string}
 */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Normalizes 8-digit hex colors (#rrggbbaa) to 6-digit hex or rgba.
 * If alpha is 'ff', returns 6-digit hex (#rrggbb).
 * Otherwise converts to rgba(r, g, b, a).
 * @param {string} hex 
 * @returns {string}
 */
function normalizeColor(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
  
  // 8-digit hex #RRGGBBAA
  if (hex.length === 9) {
    const alpha = hex.slice(7, 9).toLowerCase();
    if (alpha === 'ff') {
      return hex.slice(0, 7).toLowerCase();
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = parseFloat((parseInt(alpha, 16) / 255).toFixed(3));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return hex.toLowerCase();
}

/**
 * Formats dimension numbers to pixel values with 'px'.
 * 0 values are formatted as 0px or 0.
 * @param {number|string} val 
 * @returns {string}
 */
function formatPx(val) {
  if (val === 0 || val === '0') return '0px';
  if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))) {
    return `${val}px`;
  }
  return String(val);
}

// ============================================================================
// TOKEN PROCESSORS
// ============================================================================

/**
 * Maps Primitive Colors from the design token structure to CSS variables.
 * Returns:
 * - cssLines: array of formatted CSS variable declarations
 * - pathMap: Map of raw JSON token paths (e.g. 'primitives colors.primary color palette.primary100') to CSS variable names
 */
function processPrimitives(primitivesData) {
  const cssLines = [];
  const pathMap = new Map();

  if (!primitivesData) return { cssLines, pathMap };

  // Helper to generate normalized variable name
  function getPrimitiveVarName(groupKey, itemKey) {
    if (groupKey === 'key color group') {
      const name = itemKey.replace(' key color', '');
      return `--primitive-color-key-${slugify(name)}`;
    }
    if (groupKey === 'neutral variant color palette') {
      const num = itemKey.replace('neutralvariant', '');
      return `--primitive-color-neutral-variant-${num}`;
    }
    const match = itemKey.match(/^([a-z]+)(\d+)$/);
    if (match) {
      return `--primitive-color-${match[1]}-${match[2]}`;
    }
    return `--primitive-color-${slugify(groupKey)}-${slugify(itemKey)}`;
  }

  // Iterate through primitive groups
  for (const [groupKey, groupObj] of Object.entries(primitivesData)) {
    const formattedGroupTitle = groupKey
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    cssLines.push(`  /* --- ${formattedGroupTitle} --- */`);

    for (const [itemKey, itemObj] of Object.entries(groupObj)) {
      const fullPath = `primitives colors.${groupKey}.${itemKey}`;
      const varName = getPrimitiveVarName(groupKey, itemKey);
      const colorVal = normalizeColor(itemObj.value);

      pathMap.set(fullPath, varName);
      cssLines.push(`  ${varName}: ${colorVal};`);
    }
    cssLines.push('');
  }

  return { cssLines, pathMap };
}

/**
 * Maps Color Roles (Semantic tokens) to CSS variables.
 * Resolves token references to primitive CSS variables `var(--primitive-color-...)`.
 */
function processColorRoles(colorRolesData, pathMap) {
  const cssLines = [];

  if (!colorRolesData) return cssLines;

  // Semantic grouping for readability
  const groups = {
    'Primary Roles': ['primary', 'on primary', 'primary container', 'on primary container'],
    'Secondary Roles': ['secondary', 'on secondary', 'secondary container', 'on secondary container'],
    'Tertiary Roles': ['tertiary', 'on tertiary', 'tertiary container', 'on tertiary container'],
    'Error & Feedback Roles': ['error', 'on error', 'error container', 'on error container'],
    'Surface & Background Roles': [
      'surface color',
      'on surface',
      'surface variant',
      'on surface variant',
      'surface container highest',
      'surface container high',
      'surface container',
      'surface container low',
      'surface container lowest',
      'inverse surface',
      'inverse on surface',
      'surface tint'
    ]
  };

  const processed = new Set();

  for (const [groupTitle, roleKeys] of Object.entries(groups)) {
    cssLines.push(`  /* --- ${groupTitle} --- */`);

    for (const roleKey of roleKeys) {
      if (!colorRolesData[roleKey]) continue;
      processed.add(roleKey);

      const roleObj = colorRolesData[roleKey];
      const roleVarName = `--color-${slugify(roleKey)}`;
      
      // Resolve reference: "{primitives colors.key color group.primary key color}"
      const refRaw = (roleObj.value || '').replace(/^\{|\}$/g, '').trim();
      const targetVar = pathMap.get(refRaw);

      if (targetVar) {
        cssLines.push(`  ${roleVarName}: var(${targetVar}); /* ${refRaw} */`);
        // Provide convenient --color-surface alias if token is surface color
        if (roleKey === 'surface color') {
          cssLines.push(`  --color-surface: var(${roleVarName});`);
        }
      } else {
        // Fallback in case of raw unlinked value
        cssLines.push(`  ${roleVarName}: ${normalizeColor(roleObj.value)};`);
        if (roleKey === 'surface color') {
          cssLines.push(`  --color-surface: var(${roleVarName});`);
        }
      }
    }
    cssLines.push('');
  }

  // Any remaining role keys not categorized above
  const remainingKeys = Object.keys(colorRolesData).filter(k => !processed.has(k));
  if (remainingKeys.length > 0) {
    cssLines.push(`  /* --- Other Semantic Roles --- */`);
    for (const roleKey of remainingKeys) {
      const roleObj = colorRolesData[roleKey];
      const roleVarName = `--color-${slugify(roleKey)}`;
      const refRaw = (roleObj.value || '').replace(/^\{|\}$/g, '').trim();
      const targetVar = pathMap.get(refRaw);
      if (targetVar) {
        cssLines.push(`  ${roleVarName}: var(${targetVar});`);
      } else {
        cssLines.push(`  ${roleVarName}: ${normalizeColor(roleObj.value)};`);
      }
    }
    cssLines.push('');
  }

  return cssLines;
}

/**
 * Processes Spacing Collection into standard CSS variables and shorthand aliases.
 */
function processSpacing(spacingData) {
  const cssLines = [];

  if (!spacingData) return cssLines;

  // Friendly shorthand mapping
  const aliasMap = {
    'no spacing': ['--spacing-0', '--spacing-none'],
    'extra small spacing': ['--spacing-xs', '--spacing-4'],
    'small spacing': ['--spacing-sm', '--spacing-8'],
    'medium spacing': ['--spacing-md', '--spacing-12'],
    'base spacing': ['--spacing-base', '--spacing-16'],
    'large spacing': ['--spacing-lg', '--spacing-20'],
    'extra large spacing': ['--spacing-xl', '--spacing-24'],
    'very large spacing': ['--spacing-2xl', '--spacing-32'],
  };

  for (const [key, item] of Object.entries(spacingData)) {
    const rawVal = item.value;
    const pxVal = formatPx(rawVal);
    const remVal = (rawVal / 16).toFixed(4).replace(/\.?0+$/, '') + 'rem';
    const mainVar = `--spacing-${slugify(key)}`;

    cssLines.push(`  ${mainVar}: ${pxVal}; /* ${remVal} */`);

    // Output convenient shorthands
    const aliases = aliasMap[key.toLowerCase()];
    if (aliases) {
      for (const alias of aliases) {
        cssLines.push(`  ${alias}: var(${mainVar});`);
      }
    }
  }

  return cssLines;
}

/**
 * Processes Effects / Elevation Shadows into CSS box-shadow variables.
 */
function processEffects(effectData) {
  const cssLines = [];
  const utilities = [];

  if (!effectData) return { cssLines, utilities };

  for (const [key, item] of Object.entries(effectData)) {
    const shadowName = slugify(key);
    const val = item.value;

    if (val && typeof val === 'object') {
      const offsetX = formatPx(val.offsetX || 0);
      const offsetY = formatPx(val.offsetY || 0);
      const radius = formatPx(val.radius || 0);
      const spread = formatPx(val.spread || 0);
      const color = normalizeColor(val.color || '#000000');

      const shadowValue = `${offsetX} ${offsetY} ${radius} ${spread} ${color}`;
      const varName = `--shadow-${shadowName.replace('-shadow', '')}`;
      const effectVarName = `--effect-${shadowName}`;

      cssLines.push(`  ${varName}: ${shadowValue};`);
      cssLines.push(`  ${effectVarName}: var(${varName});`);

      utilities.push(`.shadow-${shadowName.replace('-shadow', '')} {\n  box-shadow: var(${varName});\n}`);
    }
  }

  return { cssLines, utilities };
}

/**
 * Processes Typography tokens into CSS variables and utility classes.
 */
function processTypography(typographyData) {
  const cssLines = [];
  const utilities = [];

  if (!typographyData) return { cssLines, utilities };

  // Global typography baseline
  cssLines.push(`  /* Global Font Family */`);
  cssLines.push(`  --font-family-base: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;`);
  cssLines.push('');

  for (const [scaleKey, props] of Object.entries(typographyData)) {
    const scaleSlug = slugify(scaleKey);
    cssLines.push(`  /* --- ${scaleKey.toUpperCase()} --- */`);

    const fontSize = props.fontSize ? formatPx(props.fontSize.value) : '16px';
    const lineHeight = props.lineHeight ? formatPx(props.lineHeight.value) : '24px';
    const fontWeight = props.fontWeight ? props.fontWeight.value : '400';
    const letterSpacing = props.letterSpacing ? formatPx(props.letterSpacing.value) : '0px';
    const fontFamily = props.fontFamily ? `'${props.fontFamily.value}', var(--font-family-base)` : 'var(--font-family-base)';

    cssLines.push(`  --typography-${scaleSlug}-font-family: ${fontFamily};`);
    cssLines.push(`  --typography-${scaleSlug}-font-size: ${fontSize};`);
    cssLines.push(`  --typography-${scaleSlug}-line-height: ${lineHeight};`);
    cssLines.push(`  --typography-${scaleSlug}-font-weight: ${fontWeight};`);
    cssLines.push(`  --typography-${scaleSlug}-letter-spacing: ${letterSpacing};`);
    cssLines.push('');

    // Generate utility class
    utilities.push(`.text-${scaleSlug} {
  font-family: var(--typography-${scaleSlug}-font-family);
  font-size: var(--typography-${scaleSlug}-font-size);
  line-height: var(--typography-${scaleSlug}-line-height);
  font-weight: var(--typography-${scaleSlug}-font-weight);
  letter-spacing: var(--typography-${scaleSlug}-letter-spacing);
}`);
  }

  return { cssLines, utilities };
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

function generate(options) {
  console.log(`\n======================================================`);
  console.log(`🚀 Design Tokens to CSS Variables Generator`);
  console.log(`======================================================`);
  console.log(`Reading tokens from: ${options.input}`);

  if (!fs.existsSync(options.input)) {
    console.error(`❌ Error: Input token file not found at ${options.input}`);
    process.exit(1);
  }

  const rawJson = fs.readFileSync(options.input, 'utf-8');
  const tokens = JSON.parse(rawJson);

  // 1. Process Primitives & build reference map
  const { cssLines: primitiveLines, pathMap } = processPrimitives(tokens['primitives colors']);

  // 2. Process Color Roles referencing Primitives
  const colorRoleLines = processColorRoles(tokens['color roles'], pathMap);

  // 3. Process Spacing
  const spacingLines = processSpacing(tokens['spacing collection']);

  // 4. Process Effects
  const { cssLines: effectLines, utilities: shadowUtilities } = processEffects(tokens['effect']);

  // 5. Process Typography
  const { cssLines: typographyLines, utilities: typographyUtilities } = processTypography(tokens['typography']);

  // Build Master Consolidated CSS
  const consolidatedCss = `/**
 * ============================================================================
 * DESIGN SYSTEM TOKENS - CSS VARIABLES
 * Auto-generated from: design-tokens.tokens.json
 * Generation Date: ${new Date().toISOString()}
 * ============================================================================
 *
 * COLOR ARCHITECTURE NOTICE:
 * ----------------------------------------------------------------------------
 * 1. PRIMITIVE COLORS (--primitive-color-*):
 *    Foundational color palette. DO NOT USE DIRECTLY IN UI COMPONENTS.
 *    These serve strictly as the backing source for Color Roles.
 *
 * 2. COLOR ROLES (--color-*):
 *    Semantic UI tokens. USE THESE IN ALL UI COMPONENTS (buttons, surfaces,
 *    text, borders, cards, states).
 * ============================================================================
 */

:root {
  /* ==========================================================================
     1. PRIMITIVE COLORS (FOUNDATIONS - DO NOT APPLY DIRECTLY TO UI)
     ========================================================================== */
${primitiveLines.join('\n')}

  /* ==========================================================================
     2. COLOR ROLES (SEMANTIC - APPLY TO UI COMPONENTS)
     ========================================================================== */
${colorRoleLines.join('\n')}

  /* ==========================================================================
     3. SPACING COLLECTION
     ========================================================================== */
${spacingLines.join('\n')}

  /* ==========================================================================
     4. ELEVATION & SHADOW EFFECTS
     ========================================================================== */
${effectLines.join('\n')}

  /* ==========================================================================
     5. TYPOGRAPHY TOKENS
     ========================================================================== */
${typographyLines.join('\n')}
}

${options.includeUtilities ? `/* ==========================================================================
   TYPOGRAPHY UTILITY CLASSES
   ========================================================================== */
${typographyUtilities.join('\n\n')}

/* ==========================================================================
   SHADOW & ELEVATION UTILITY CLASSES
   ========================================================================== */
${shadowUtilities.join('\n\n')}
` : ''}`;

  // Write single consolidated file
  const outDir = path.dirname(options.output);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(options.output, consolidatedCss, 'utf-8');
  console.log(`✅ Generated consolidated CSS: ${options.output}`);

  // If split option is enabled, write individual category files
  if (options.split) {
    if (!fs.existsSync(options.outdir)) {
      fs.mkdirSync(options.outdir, { recursive: true });
    }

    // 1. Primitives CSS
    fs.writeFileSync(
      path.join(options.outdir, 'primitives.css'),
      `/**
 * PRIMITIVE COLORS (FOUNDATIONS)
 * WARNING: Do NOT use directly in UI components.
 */
:root {\n${primitiveLines.join('\n')}\n}\n`,
      'utf-8'
    );

    // 2. Color Roles CSS
    fs.writeFileSync(
      path.join(options.outdir, 'color-roles.css'),
      `/**
 * COLOR ROLES (SEMANTIC)
 * USE THESE IN UI COMPONENTS.
 */
:root {\n${colorRoleLines.join('\n')}\n}\n`,
      'utf-8'
    );

    // 3. Spacing CSS
    fs.writeFileSync(
      path.join(options.outdir, 'spacing.css'),
      `:root {\n${spacingLines.join('\n')}\n}\n`,
      'utf-8'
    );

    // 4. Effects CSS
    fs.writeFileSync(
      path.join(options.outdir, 'effects.css'),
      `:root {\n${effectLines.join('\n')}\n}\n\n${shadowUtilities.join('\n\n')}\n`,
      'utf-8'
    );

    // 5. Typography CSS
    fs.writeFileSync(
      path.join(options.outdir, 'typography.css'),
      `:root {\n${typographyLines.join('\n')}\n}\n\n${typographyUtilities.join('\n\n')}\n`,
      'utf-8'
    );

    // 6. Index (aggregates all split files)
    fs.writeFileSync(
      path.join(options.outdir, 'index.css'),
      `@import './primitives.css';\n@import './color-roles.css';\n@import './spacing.css';\n@import './effects.css';\n@import './typography.css';\n`,
      'utf-8'
    );

    console.log(`✅ Generated modular CSS bundle in: ${options.outdir}`);
  }

  console.log(`\n🎉 Conversion complete! Statistics:`);
  console.log(`   - Primitive colors: ${pathMap.size} variables`);
  console.log(`   - Color roles:      ${Object.keys(tokens['color roles'] || {}).length} variables`);
  console.log(`   - Spacing tokens:   ${Object.keys(tokens['spacing collection'] || {}).length} variables (+ shorthands)`);
  console.log(`   - Typography scales:${Object.keys(tokens['typography'] || {}).length} sets`);
  console.log(`   - Shadow effects:   ${Object.keys(tokens['effect'] || {}).length} elevation levels`);
  console.log(`======================================================\n`);
}

// Module export & direct CLI execution
if (require.main === module) {
  const options = parseArgs();
  generate(options);
} else {
  module.exports = {
    generate,
    processPrimitives,
    processColorRoles,
    processSpacing,
    processEffects,
    processTypography,
    normalizeColor,
    slugify
  };
}
