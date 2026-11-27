let audioCtx: AudioContext | null = null;

/**
 * Plays a gentle procedural paper-turn rustle via Web Audio API.
 * Strictly off by default; only runs when settings.sound === true.
 */
export function playPageTurnSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }

    const duration = 0.18;
    const sampleRate = audioCtx.sampleRate;
    const bufferSize = Math.floor(sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const t = i / bufferSize;
      const env = Math.sin(Math.PI * t) * Math.pow(1 - t, 0.7);
      data[i] = (Math.random() * 2 - 1) * env * 0.22;
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1450, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(750, audioCtx.currentTime + duration);
    filter.Q.value = 1.4;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.16, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
  } catch {
    // Ignore audio errors if blocked by browser autoplay policy
  }
}
