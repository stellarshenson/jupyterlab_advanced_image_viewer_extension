import { bufferedParts, formatSize, formatTime, readPeaks } from '../mediautil';
import { stepPath } from '../navigate';

describe('formatTime', () => {
  it('reads minutes, seconds and tenths', () => {
    expect(formatTime(0)).toBe('00:00.0');
    expect(formatTime(15)).toBe('00:15.0');
    expect(formatTime(60)).toBe('01:00.0');
    expect(formatTime(222.04)).toBe('03:42.0');
  });

  // 59.96 s rounds to a full minute, never to 00:60.0.
  it('carries a rounded-up second into the minutes', () => {
    expect(formatTime(59.96)).toBe('01:00.0');
    expect(formatTime(59.6, 0)).toBe('01:00');
  });

  it('drops the tenths when asked for whole seconds', () => {
    expect(formatTime(60, 0)).toBe('01:00');
    expect(formatTime(7.2, 0)).toBe('00:07');
  });

  // DEF-MEDIA-12: an hour or more reads h:mm:ss instead of 104:00.
  it('uses hours for a total of an hour or more', () => {
    expect(formatTime(3600)).toBe('1:00:00.0');
    expect(formatTime(6240)).toBe('1:44:00.0');
    expect(formatTime(6240, 0)).toBe('1:44:00');
    expect(formatTime(3725.5, 0)).toBe('1:02:06');
  });

  // The branch is chosen after rounding, so an hour less a tenth of a second
  // reads as an hour, never as 59:60.
  it('picks the hours branch after rounding', () => {
    expect(formatTime(3599.96, 0)).toBe('1:00:00');
    expect(formatTime(3599.4, 1)).toBe('59:59.4');
  });

  // A stream without a length reports Infinity, a file not yet loaded NaN.
  it('shows an unknown time as dashes', () => {
    expect(formatTime(NaN)).toBe('--:--');
    expect(formatTime(Infinity)).toBe('--:--');
  });
});

describe('formatSize', () => {
  it('uses binary units with one decimal', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(960044)).toBe('937.5 KB');
    expect(formatSize(100 * 1024 * 1024)).toBe('100.0 MB');
  });
});

// ACC-AUDIO-132-BUFFERED: the fill of the seek slider.
describe('bufferedParts', () => {
  const ranges = (...pairs: [number, number][]) => ({
    length: pairs.length,
    start: (i: number) => pairs[i][0],
    end: (i: number) => pairs[i][1]
  });

  it('gives no fill without ranges', () => {
    expect(bufferedParts(ranges(), 60, 0)).toEqual([]);
  });

  it('gives each range as fractions of the duration', () => {
    expect(bufferedParts(ranges([0, 15], [30, 45]), 60, 0)).toEqual([
      [0, 0.25],
      [0.5, 0.75]
    ]);
  });

  it('shows a range under the played part only past the played end', () => {
    expect(bufferedParts(ranges([0, 15], [30, 45]), 60, 6)).toEqual([
      [0.1, 0.25],
      [0.5, 0.75]
    ]);
    expect(bufferedParts(ranges([0, 15]), 60, 20)).toEqual([]);
  });

  it('gives no fill while the duration is unknown', () => {
    for (const duration of [0, NaN, Infinity]) {
      expect(bufferedParts(ranges([0, 15]), duration, 0)).toEqual([]);
    }
  });
});

// ACC-AUDIO-54 and ACC-WAVE-121: the peaks of the server part, or an error.
describe('readPeaks', () => {
  it('splits the channels and scales 0..255 to 0..1', () => {
    const [left, right] = readPeaks(
      Uint8Array.from([0, 255, 51, 102, 204, 0]),
      0.003,
      2
    );
    expect(Array.from(left)).toEqual([0, 1, 0.2].map(Math.fround));
    expect(Array.from(right)).toEqual([0.4, 0.8, 0].map(Math.fround));
    expect(readPeaks(Uint8Array.from([255]), 0.001, 1)).toHaveLength(1);
  });

  it('throws on an answer that is not peaks', () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    expect(() => readPeaks(bytes, 0.003, 2)).toThrow();
    expect(() => readPeaks(bytes, 0.003, 0)).toThrow();
    expect(() => readPeaks(bytes, 0.003, 3)).toThrow();
    expect(() => readPeaks(bytes, NaN, 1)).toThrow();
    expect(() => readPeaks(bytes, 0, 1)).toThrow();
    expect(() => readPeaks(new Uint8Array(0), 0.003, 1)).toThrow();
  });
});

// ACC-KEYS-63 and the image Left / Right: the file one step away in the
// listed order, stopping at either end.
describe('stepPath', () => {
  const paths = ['d/a.wav', 'd/b.wav', 'd/c.wav'];

  it('steps forward and back in the given order', () => {
    expect(stepPath(paths, 'd/b.wav', 1)).toBe('d/c.wav');
    expect(stepPath(paths, 'd/b.wav', -1)).toBe('d/a.wav');
    expect(stepPath(['d/c.wav', 'd/a.wav'], 'd/c.wav', 1)).toBe('d/a.wav');
  });

  it('stops at the first and the last file', () => {
    expect(stepPath(paths, 'd/a.wav', -1)).toBeNull();
    expect(stepPath(paths, 'd/c.wav', 1)).toBeNull();
  });

  it('does nothing in a folder of one file or for a file not listed', () => {
    expect(stepPath(['d/a.wav'], 'd/a.wav', 1)).toBeNull();
    expect(stepPath(paths, 'd/x.wav', 1)).toBeNull();
  });
});
