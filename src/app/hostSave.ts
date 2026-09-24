// Saving a file when the app runs embedded in a host page (e.g. a published claude.ai Artifact),
// where ordinary downloads are blocked but the host offers a `downloads` capability that asks the
// viewer to confirm the save. Everywhere else this reports 'unavailable' and callers fall back.

interface HostDownloads {
  save(req: { filename: string; data: Blob | string }): Promise<{ status: string }>;
}
interface HostClaude {
  use(name: string): Promise<unknown>;
}

let cached: Promise<HostDownloads | null> | null = null;

function hostDownloads(): Promise<HostDownloads | null> {
  if (cached) return cached;
  const claude = (globalThis as { claude?: HostClaude }).claude;
  if (!claude || typeof claude.use !== 'function') return (cached = Promise.resolve(null));
  cached = Promise.race([
    claude.use('downloads').then((d) => (d && typeof (d as HostDownloads).save === 'function' ? (d as HostDownloads) : null)).catch(() => null),
    new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
  ]);
  return cached;
}

/** True when the host can save files for us (resolves quickly to false outside such hosts). */
export async function canHostSave(): Promise<boolean> {
  return (await hostDownloads()) !== null;
}

/** Ask the host to save a file. 'declined' = the viewer said no; 'unavailable' = use another route. */
export async function hostSave(filename: string, data: Blob | string): Promise<'saved' | 'declined' | 'unavailable'> {
  const d = await hostDownloads();
  if (!d) return 'unavailable';
  try {
    await d.save({ filename, data });
    return 'saved';
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'declined' || code === 'rate_limited') return 'declined';
    return 'unavailable';
  }
}
