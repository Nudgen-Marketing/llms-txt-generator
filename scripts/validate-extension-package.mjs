import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

function usage() {
  console.error('Usage: node scripts/validate-extension-package.mjs --zip <path/to/archive.zip> [--zip <path2.zip> ...]');
}

function parseArgs(argv) {
  const zipPaths = [];

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--zip') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value after --zip');
      }
      zipPaths.push(next);
      index += 1;
      continue;
    }

    if (arg.startsWith('--zip=')) {
      zipPaths.push(arg.slice('--zip='.length));
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    zipPaths.push(arg);
  }

  return zipPaths;
}

function runUnzip(args, zipPath) {
  const result = spawnSync('unzip', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() ?? '';
    const stdout = result.stdout?.trim() ?? '';
    const details = stderr || stdout || 'unknown unzip error';
    throw new Error(`Failed unzip command for ${zipPath}: ${details}`);
  }

  return result.stdout ?? '';
}

function normalizeEntry(entry) {
  return entry.replace(/^\.\//, '').trim();
}

function listZipEntries(zipPath) {
  const output = runUnzip(['-Z1', zipPath], zipPath);
  const entries = output
    .split('\n')
    .map((line) => normalizeEntry(line))
    .filter((line) => line.length > 0);

  return new Set(entries);
}

function readZipFile(zipPath, entry) {
  return runUnzip(['-p', zipPath, entry], zipPath);
}

// Check for icons in the ZIP
function validateIcons(entries, manifest, errors) {
  if (manifest.icons && typeof manifest.icons === 'object') {
    for (const [size, path] of Object.entries(manifest.icons)) {
      validatePathExists(entries, path, errors, `icons.${size}`);
    }
  }

  if (manifest.action && typeof manifest.action === 'object' && manifest.action.default_icon) {
    const defaultIcon = manifest.action.default_icon;
    if (typeof defaultIcon === 'object') {
      for (const [size, path] of Object.entries(defaultIcon)) {
        validatePathExists(entries, path, errors, `action.default_icon.${size}`);
      }
    } else if (typeof defaultIcon === 'string') {
      validatePathExists(entries, defaultIcon, errors, 'action.default_icon');
    }
  }
}

function validatePathExists(entries, path, errors, label) {
  const normalized = normalizeEntry(path);

  if (normalized.length === 0) {
    errors.push(`${label} is empty.`);
    return;
  }

  if (!entries.has(normalized)) {
    errors.push(`${label} points to missing file: ${normalized}`);
  }
}

function validateWebAccessibleResources(entries, manifest, errors) {
  const resourcesBlocks = manifest.web_accessible_resources;

  if (!Array.isArray(resourcesBlocks)) {
    return;
  }

  for (const [index, block] of resourcesBlocks.entries()) {
    if (!block || !Array.isArray(block.resources)) {
      continue;
    }

    for (const resource of block.resources) {
      if (typeof resource !== 'string' || resource.length === 0) {
        errors.push(`web_accessible_resources[${index}] has invalid resource entry.`);
        continue;
      }

      if (resource.includes('*')) {
        continue;
      }

      validatePathExists(
        entries,
        resource,
        errors,
        `web_accessible_resources[${index}]`,
      );
    }
  }
}

function validateManifest(zipPath, entries, manifest) {
  const errors = [];

  if (manifest.background && typeof manifest.background === 'object') {
    if (typeof manifest.background.service_worker === 'string') {
      validatePathExists(entries, manifest.background.service_worker, errors, 'background.service_worker');
    }

    if (Array.isArray(manifest.background.scripts)) {
      for (const script of manifest.background.scripts) {
        if (typeof script !== 'string' || script.length === 0) {
          errors.push('background.scripts contains an invalid value.');
          continue;
        }

        validatePathExists(entries, script, errors, 'background.scripts');
      }
    }
  }

  if (manifest.action && typeof manifest.action === 'object') {
    if (typeof manifest.action.default_popup === 'string') {
      validatePathExists(entries, manifest.action.default_popup, errors, 'action.default_popup');
    }
  }

  validateIcons(entries, manifest, errors);
  validateWebAccessibleResources(entries, manifest, errors);

  if (errors.length > 0) {
    const message = errors.map((entry) => `  - ${entry}`).join('\n');
    throw new Error(`Package validation failed for ${zipPath}:\n${message}`);
  }
}

function validateZip(zipInputPath) {
  const zipPath = resolve(zipInputPath);

  if (!existsSync(zipPath)) {
    throw new Error(`Zip not found: ${zipPath}`);
  }

  const entries = listZipEntries(zipPath);

  if (!entries.has('manifest.json')) {
    throw new Error(`Package validation failed for ${zipPath}:\n  - Missing manifest.json at archive root.`);
  }

  const manifestText = readZipFile(zipPath, 'manifest.json');
  let manifest;

  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Package validation failed for ${zipPath}:\n  - Invalid manifest.json: ${message}`);
  }

  validateManifest(zipPath, entries, manifest);

  console.log(`Validated extension package: ${zipPath}`);
}

function main() {
  let zipPaths;

  try {
    zipPaths = parseArgs(process.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    usage();
    process.exit(1);
  }

  if (zipPaths.length === 0) {
    usage();
    process.exit(1);
  }

  for (const zipPath of zipPaths) {
    validateZip(zipPath);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
