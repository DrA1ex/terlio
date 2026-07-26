import fs from 'node:fs';
import path from 'node:path';

export function createLegacySessionBackend({ filesystem = fs, durability = 'atomic' } = {}) {
  const defaultDurability = durability === 'fsync' ? 'fsync' : 'atomic';
  return {
    ensureRootDirectory(directory) {
      try {
        const stat = filesystem.statSync(directory);
        if (!stat.isDirectory()) throw new Error(`Session path is not a directory: ${directory}`);
        return;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      filesystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') filesystem.chmodSync(directory, 0o700);
      assertDirectory(filesystem, directory);
    },
    realpath(target) {
      return filesystem.realpathSync(target);
    },
    ensureDirectory(directory) {
      assertNotSymlink(filesystem, directory, 'session directory');
      filesystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (process.platform !== 'win32') filesystem.chmodSync(directory, 0o700);
      assertDirectory(filesystem, directory);
    },
    list(directory) {
      assertNotSymlink(filesystem, directory, 'session directory');
      return filesystem.readdirSync(directory);
    },
    exists(file) {
      try {
        filesystem.lstatSync(file);
        return true;
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },
    isSymlink(file) {
      try {
        return filesystem.lstatSync(file).isSymbolicLink();
      } catch (error) {
        if (error?.code === 'ENOENT') return false;
        throw error;
      }
    },
    size(file) {
      assertNotSymlink(filesystem, file, 'session file');
      return filesystem.statSync(file).size;
    },
    read(file) {
      assertNotSymlink(filesystem, file, 'session file');
      const flags = filesystem.constants.O_RDONLY | noFollowFlag(filesystem);
      const fd = filesystem.openSync(file, flags);
      try {
        return filesystem.readFileSync(fd, 'utf8');
      } finally {
        filesystem.closeSync(fd);
      }
    },
    write(file, data, options = {}) {
      writePrivateFile(filesystem, file, data, { fsync: options.durability === 'fsync' });
    },
    writeAtomic(file, data, options = {}) {
      const requestedDurability = options.durability === 'fsync' ? 'fsync' : defaultDurability;
      const directory = path.dirname(file);
      this.ensureDirectory(directory);
      assertNotSymlink(filesystem, file, 'session file');
      const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${randomSuffix()}.tmp`);
      let completed = false;
      try {
        writePrivateFile(filesystem, temporary, data, {
          exclusive: true,
          fsync: requestedDurability === 'fsync',
        });
        assertNotSymlink(filesystem, file, 'session file');
        filesystem.renameSync(temporary, file);
        if (process.platform !== 'win32') filesystem.chmodSync(file, 0o600);
        completed = true;
      } finally {
        if (!completed) {
          try { filesystem.unlinkSync(temporary); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
        }
      }
    },
    rename(from, to) {
      assertNotSymlink(filesystem, to, 'session file');
      filesystem.renameSync(from, to);
    },
    remove(file) {
      assertNotSymlink(filesystem, file, 'session file');
      filesystem.unlinkSync(file);
    },
  };
}

function writePrivateFile(filesystem, file, data, { exclusive = false, fsync = false } = {}) {
  assertNotSymlink(filesystem, file, 'session file');
  const flags = filesystem.constants.O_WRONLY | filesystem.constants.O_CREAT |
    filesystem.constants.O_TRUNC | noFollowFlag(filesystem) |
    (exclusive ? filesystem.constants.O_EXCL : 0);
  const fd = filesystem.openSync(file, flags, 0o600);
  try {
    filesystem.writeFileSync(fd, String(data), { encoding: 'utf8' });
    if (fsync) filesystem.fsyncSync(fd);
  } finally {
    filesystem.closeSync(fd);
  }
  if (process.platform !== 'win32') filesystem.chmodSync(file, 0o600);
}

function assertNotSymlink(filesystem, target, label) {
  try {
    if (filesystem.lstatSync(target).isSymbolicLink()) {
      throw new Error(`Refusing symbolic link ${label}: ${target}`);
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

function assertDirectory(filesystem, directory) {
  if (!filesystem.statSync(directory).isDirectory()) throw new Error(`Session path is not a directory: ${directory}`);
}

function noFollowFlag(filesystem) {
  return Number(filesystem.constants.O_NOFOLLOW) || 0;
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
