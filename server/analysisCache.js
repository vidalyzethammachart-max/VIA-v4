import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const pending = new Map();

// Stores validated model results/usage, never raw media, request bodies, or API keys.
// A persistent/shared directory is required for reuse across host replacements.
export async function cachedAnalysis(identity, compute) {
  const directory = resolve(process.env.AI_ANALYSIS_CACHE_DIR || 'logs/analysis-cache');
  const hash = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const file = join(directory, `${hash}.json`);
  const activeKey = file;
  const active = pending.get(activeKey);
  if (active) return { value: structuredClone(await active), cacheHit: true };
  const operation = (async () => {
    await mkdir(directory, {recursive:true});
    try { return {cached: true, value: JSON.parse(await readFile(file, 'utf8'))}; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Analysis cache cannot be read; inspect storage before retrying.'); }
    let lock;
    try { lock = await open(`${file}.lock`, 'wx'); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const busy = new Error('Analysis is already running or delivery needs inspection. Do not replay automatically.');
      busy.status = 409;
      busy.code = 'analysis_pending';
      throw busy;
    }
    let keepLock = false;
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const value = await compute();
      // Once a provider has succeeded, never recompute merely because persistence failed.
      keepLock = true;
      await writeFile(temporary, JSON.stringify(value), {mode:0o600});
      await rename(temporary, file);
      keepLock = false;
      return {cached:false, value};
    } catch (error) {
      keepLock ||= Boolean(error.deliveryUnknown);
      throw error;
    } finally {
      await lock.close();
      if (!keepLock) await unlink(`${file}.lock`);
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  })();
  const shared = operation.then(result => result.value);
  // Avoid an unhandled rejected companion promise when there is no second caller.
  shared.catch(() => {});
  pending.set(activeKey, shared);
  try {
    const result = await operation;
    return { value: structuredClone(result.value), cacheHit: result.cached };
  } finally { pending.delete(activeKey); }
}
