import {
  drawsWaveform,
  formatSize,
  formatTime,
  WAVEFORM_LIMIT
} from '../mediautil';
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

// ACC-AUDIO-54: a file over 100 MB is not decoded for a waveform.
describe('the waveform limit', () => {
  it('is 100 MB', () => {
    expect(WAVEFORM_LIMIT).toBe(104857600);
  });

  it('draws a waveform up to the limit and skips it above', () => {
    expect(drawsWaveform(0)).toBe(true);
    expect(drawsWaveform(WAVEFORM_LIMIT)).toBe(true);
    expect(drawsWaveform(WAVEFORM_LIMIT + 1)).toBe(false);
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
