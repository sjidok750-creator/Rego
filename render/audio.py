"""Sound design for the Dabotap video, synthesized from the render timeline.

    python3 render/audio.py stone        # -> output/audio_stone.wav (+ video/dabotap_stone.mp4)
    python3 render/audio.py brick        # -> output/audio_brick.wav (+ video/dabotap_brick.mp4)

If the silent render output/dabotap_<mode>_video.mp4 exists, the soundtrack is
muxed onto it as video/dabotap_<mode>.mp4.

Reads output/timeline_<mode>.json (written by render.mjs) so every sound lands
on the exact frame of its event:
  * a Korean temple bell (범종) at the opening and closing cards — the low hum
    is two partials a fraction of a hertz apart, giving the slow beating
    (맥놀이) these bells are known for
  * smaller bells at each phase banner
  * a lift sound when each member is raised, a touch-down sound when it lands,
    both scaled by the member's mass (stone: grind + thud, brick: plastic clicks)
  * a low drone bed, a swell under the lay-down yard, a rush into the exploded
    view, and clicks as the stack collapses back together.
"""
import json
import math
import sys
import wave
from pathlib import Path

import numpy as np

SR = 48000
ROOT = Path(__file__).resolve().parent.parent
rng = np.random.default_rng(751)


def band_noise(dur, lo, hi, tilt=0.0):
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    mask = ((f >= lo) & (f <= hi)).astype(float)
    if tilt:
        mask *= np.where(f > 1, (f / max(lo, 1)) ** tilt, 0)
    out = np.fft.irfft(spec * mask, n)
    return out / (np.max(np.abs(out)) + 1e-9)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-t / decay)


def bell(f0, dur, gain=1.0, hum_beat=0.55):
    """Inharmonic bell. f0 = strike tone; the hum sits well below it."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    partials = [
        (0.38, 1.0, 16.0), (0.38 + hum_beat / f0, 0.85, 16.0),  # hum pair -> 맥놀이
        (1.0, 0.55, 8.0), (1.0 + 0.8 / f0, 0.45, 8.0),
        (1.65, 0.34, 5.0), (2.45, 0.24, 3.4), (3.51, 0.15, 2.4), (4.93, 0.09, 1.5), (6.8, 0.05, 0.9),
    ]
    y = np.zeros(n)
    for ratio, amp, dec in partials:
        y += amp * np.sin(2 * np.pi * f0 * ratio * t + rng.uniform(0, 6.28)) * np.exp(-t / dec)
    strike = band_noise(0.12, 60, 900) * env(int(0.12 * SR), 0.002, 0.03)
    y[: strike.size] += 0.6 * strike
    y *= np.clip(t / 0.004, 0, 1)
    return gain * y / np.max(np.abs(y))


def thud(mass, dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 52 + 48 * np.exp(-t / 0.05)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.12 + 0.05 * min(mass, 20) ** 0.3))
    grit = band_noise(dur, 90, 1800) * env(n, 0.001, 0.035)
    rattle = band_noise(dur, 1200, 5000) * env(n, 0.004, 0.02) * 0.25
    return body + 0.5 * grit + rattle


def grind(dur=0.5):
    n = int(dur * SR)
    return band_noise(dur, 180, 1400) * env(n, 0.06, 0.16)


def click(bright=1.0):
    dur = 0.18
    n = int(dur * SR)
    t = np.arange(n) / SR
    tick = band_noise(dur, 2500, 9000) * env(n, 0.0005, 0.006)
    ping = np.sin(2 * np.pi * (1100 + 500 * bright) * t) * np.exp(-t / 0.018)
    knock = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.03)
    return tick + 0.35 * ping + 0.5 * knock


def rush(dur, rising=True):
    n = int(dur * SR)
    out = np.zeros(n)
    seg = 4096
    noise = rng.standard_normal(n + seg)
    for i in range(0, n, seg // 2):
        k = i / n
        cut = 300 + 5000 * (k if rising else 1 - k)
        chunk = noise[i: i + seg]
        spec = np.fft.rfft(chunk * np.hanning(chunk.size))
        f = np.fft.rfftfreq(chunk.size, 1 / SR)
        spec *= 1 / (1 + (f / cut) ** 4)
        y = np.fft.irfft(spec, chunk.size)
        end = min(n, i + seg)
        out[i:end] += y[: end - i]
    t = np.arange(n) / n
    return out / (np.max(np.abs(out)) + 1e-9) * np.sin(np.pi * t) ** 1.5


def place(mix, sig, t, gain, pan=0.0):
    i = int(t * SR)
    if i >= mix.shape[1] or gain <= 0:
        return
    j = min(mix.shape[1], i + sig.size)
    l, r = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
    mix[0, i:j] += sig[: j - i] * gain * l * 1.41
    mix[1, i:j] += sig[: j - i] * gain * r * 1.41


def drone(dur, bright):
    n = int(dur * SR)
    t = np.arange(n) / SR
    base = [55.0, 82.41, 110.0] if not bright else [110.0, 164.81, 220.0, 329.63]
    out = np.zeros((2, n))
    for k, f in enumerate(base):
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (0.05 + 0.013 * k) * t + k)
        for ch, det in enumerate((-0.18, 0.18)):
            out[ch] += np.sin(2 * np.pi * (f + det) * t + k) * lfo / (k + 1.5)
    fade = np.clip(t / 4.0, 0, 1) * np.clip((dur - t) / 5.0, 0, 1)
    return out * fade


def reverb(x, seconds=2.2, wet=0.22):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.empty_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t / (seconds / 6.9))
        ir[: int(0.012 * SR)] = 0
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(x.shape[1] + n)))
        y = np.fft.irfft(np.fft.rfft(x[ch], size) * np.fft.rfft(ir, size), size)[: x.shape[1]]
        out[ch] = x[ch] + wet * y
    return out


def main(mode):
    tl = json.loads((ROOT / f'output/timeline_{mode}.json').read_text())
    T = tl['timing']
    dur = tl['duration'] + 0.5
    mix = np.zeros((2, int(dur * SR)))
    brick = mode == 'brick'

    mix += 0.05 * drone(dur, brick)
    place(mix, bell(196.0, 14.0), 0.35, 0.55)
    for ps in tl['phases'][1:]:
        place(mix, bell(392.0, 6.0, hum_beat=0.9), ps + 0.2, 0.2)

    for ev in tl['lifts']:
        pan = math.sin(ev['part'] * 1.7) * 0.35
        if brick:
            place(mix, click(1.3), ev['t'] + 0.05, 0.1, pan)
        else:
            place(mix, grind(), ev['t'], 0.035 + 0.02 * min(1.0, ev['mass'] / 5), pan)
    for ev in tl['landings']:
        pan = math.sin(ev['part'] * 1.7) * 0.5
        g = 0.12 + 0.1 * math.log10(1 + ev['mass'] * 10) / 2.3
        if brick:
            place(mix, click(0.8), ev['t'] - 0.01, g * 0.9, pan)
            place(mix, click(0.6), ev['t'] + 0.035, g * 0.35, -pan)
        else:
            place(mix, thud(ev['mass']), ev['t'] - 0.01, g, pan)

    place(mix, rush(3.5, rising=False), T['disEnd'] - 0.3, 0.07)
    place(mix, rush(3.0, rising=True), T['explode'] - 0.2, 0.12)
    for ev in tl['reassembly']:
        place(mix, click(1.0) if brick else thud(ev['mass'] * 0.3, 0.5), ev['t'] - 0.05, 0.07)
    place(mix, bell(196.0, 12.0), T['assembled'] + 0.3, 0.5)

    mix = reverb(mix, wet=0.18 if brick else 0.28)
    mix = np.tanh(mix * 1.6) / 1.6
    mix *= 0.89 / np.max(np.abs(mix))
    pcm = (mix.T * 32767).astype('<i2')
    out = ROOT / f'output/audio_{mode}.wav'
    with wave.open(str(out), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('wrote', out, f'{dur:.1f}s')

    silent = ROOT / f'output/dabotap_{mode}_video.mp4'
    if silent.exists():
        import subprocess
        import imageio_ffmpeg
        final = ROOT / f'video/dabotap_{mode}.mp4'
        final.parent.mkdir(exist_ok=True)
        subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error', '-i', str(silent), '-i', str(out),
            '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
            '-movflags', '+faststart', str(final)], check=True)
        print('wrote', final)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'stone')
