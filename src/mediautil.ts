// Pure helpers of the media viewers. This module imports nothing, so the unit
// tests load it without the JupyterLab packages.

// Seconds moved by one press of Left or Right and by the back and forward
// buttons.
export const SEEK_STEP = 5;

// The parts of the file the browser holds past the played time, as [from, to]
// fractions of the duration, for the seek slider (ACC-AUDIO-132-BUFFERED).
// None while the duration is unknown.
export function bufferedParts(
  buffered: Pick<TimeRanges, 'length' | 'start' | 'end'>,
  duration: number,
  time: number
): [number, number][] {
  if (!(Number.isFinite(duration) && duration > 0)) {
    return [];
  }
  const parts: [number, number][] = [];
  for (let i = 0; i < buffered.length; i++) {
    const from = Math.max(buffered.start(i), time);
    const to = Math.min(buffered.end(i), duration);
    if (to > from) {
      parts.push([from / duration, to / duration]);
    }
  }
  return parts;
}

// The peaks answer of the server part: per channel, one byte per millisecond,
// channel 0 first, 0 for silence to 255 for full scale. Anything else throws.
export function readPeaks(
  bytes: Uint8Array,
  duration: number,
  channels: number
): Float32Array[] {
  const points = bytes.length / channels;
  if (
    !(Number.isFinite(duration) && duration > 0) ||
    (channels !== 1 && channels !== 2) ||
    !Number.isInteger(points) ||
    !points
  ) {
    throw new Error(
      `Not peaks: ${bytes.length} bytes, ${channels} channels, ${duration} s`
    );
  }
  return Array.from({ length: channels }, (_, c) =>
    Float32Array.from(
      bytes.subarray(c * points, (c + 1) * points),
      v => v / 255
    )
  );
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
