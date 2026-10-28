// Pure helpers of the media viewers. This module imports nothing, so the unit
// tests load it without the JupyterLab packages.

// Above this size an audio file plays from its URL and is never decoded:
// decoding holds the whole file and its samples in browser memory.
export const WAVEFORM_LIMIT = 100 * 1024 * 1024;

// Seconds moved by one press of Left or Right and by the back and forward
// buttons.
export const SEEK_STEP = 5;

export function drawsWaveform(size: number): boolean {
  return size <= WAVEFORM_LIMIT;
}

// [h:]mm:ss with `digits` decimals of a second; '--:--' while the time is
// unknown.
export function formatTime(seconds: number, digits = 1): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '--:--';
  }
  // Round once, so 59.96 s reads 01:00.0 and never 00:60.0, and 3599.96 s
  // enters the hours branch instead of reading 59:60.
  const scale = 10 ** digits;
  const total = Math.round(seconds * scale) / scale;
  const s = (total % 60).toFixed(digits).padStart(digits ? 3 + digits : 2, '0');
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${String(minutes).padStart(2, '0')}:${s}`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${s}`;
}

// Binary units, as the file browser shows sizes.
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return unit ? `${value.toFixed(1)} ${units[unit]}` : `${value} B`;
}
