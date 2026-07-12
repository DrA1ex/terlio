import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function unscopedName(name) {
  return String(name ?? '').replace(/^@[^/]+\//, '');
}

function displayName(name) {
  const value = unscopedName(name);
  return value.replace(/(^|[-_])([a-z])/g, (_, separator, letter) => `${separator}${letter.toUpperCase()}`);
}

function primaryBin(packageData) {
  const name = unscopedName(packageData.name);
  const { bin } = packageData;

  if (typeof bin === 'string') return { name, path: bin };
  if (!bin || typeof bin !== 'object') return { name, path: null };

  const entries = Object.entries(bin);
  const [binName, binPath] = entries.find(([entryName]) => entryName === name) ?? entries[0] ?? [name, null];
  return { name: binName, path: binPath };
}

export const packageMetadata = Object.freeze(packageJson);
export const packageName = packageMetadata.name;
export const packageVersion = packageMetadata.version;
export const packageUnscopedName = unscopedName(packageName);
export const packageDisplayName = displayName(packageName);
export const packagePrimaryBin = Object.freeze(primaryBin(packageMetadata));
export const packageBinName = packagePrimaryBin.name;
export const packageBinPath = packagePrimaryBin.path;
export const packageNpxCommand = `npx ${packageBinName}`;
export const packageHomeDirectoryName = `.${packageUnscopedName}`;
export const packageEnvPrefix = packageUnscopedName.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
export const packageHomeEnv = `${packageEnvPrefix}_HOME`;
