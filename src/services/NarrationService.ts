import narrationCues from '../data/narrationCues.json';
import { experiencePreferences, type NarrationVoice } from '../state/ExperiencePreferences';

export type NarrationCueId = keyof typeof narrationCues;

export interface NarrationCallbacks {
  readonly automatic?: boolean;
  readonly onStart?: () => void;
  readonly onComplete?: () => void;
  readonly onError?: () => void;
}

const LANGUAGE_TAGS: Readonly<Record<NarrationVoice, string>> = {
  can: 'zh-HK',
  pth: 'zh-CN',
  eng: 'en-US',
};

class NarrationService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private readonly automaticStarts = new Set<NarrationCueId>();
  private readonly preloadedAudio = new Map<string, HTMLAudioElement>();

  preload(cues: readonly NarrationCueId[]): void {
    if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return;
    const voice = experiencePreferences.getVoice();
    for (const cue of cues) {
      const url = this.audioUrl(cue, voice);
      if (this.preloadedAudio.has(url)) continue;
      const audio = new window.Audio(url);
      audio.preload = 'auto';
      audio.load();
      this.preloadedAudio.set(url, audio);
    }
  }

  play(cue: NarrationCueId, callbacks: NarrationCallbacks = {}): boolean {
    if (callbacks.automatic === true && this.automaticStarts.has(cue)) return false;
    this.stop();
    const voice = experiencePreferences.getVoice();
    if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
      return this.playRecordedAudio(cue, voice, callbacks);
    }
    return this.playSpeechFallback(cue, voice, callbacks);
  }

  stop(): void {
    if (this.currentAudio !== null) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute('src');
      this.currentAudio.load();
      this.currentAudio = null;
    }
    if (this.currentUtterance !== null && typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
      this.currentUtterance = null;
    }
  }

  isPlaying(): boolean {
    return this.currentAudio !== null || this.currentUtterance !== null;
  }

  private playRecordedAudio(
    cue: NarrationCueId,
    voice: NarrationVoice,
    callbacks: NarrationCallbacks,
  ): boolean {
    const url = this.audioUrl(cue, voice);
    const cached = this.preloadedAudio.get(url);
    const audio =
      cached === undefined ? new window.Audio(url) : (cached.cloneNode(true) as HTMLAudioElement);
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    let started = false;
    let finished = false;
    const finish = (success: boolean): void => {
      if (finished) return;
      finished = true;
      if (this.currentAudio === audio) this.currentAudio = null;
      if (success) callbacks.onComplete?.();
      else callbacks.onError?.();
    };
    audio.addEventListener(
      'playing',
      () => {
        if (started) return;
        started = true;
        if (callbacks.automatic === true) this.automaticStarts.add(cue);
        callbacks.onStart?.();
      },
      { once: true },
    );
    audio.addEventListener('ended', () => finish(true), { once: true });
    audio.addEventListener(
      'error',
      () => {
        if (this.currentAudio === audio) this.currentAudio = null;
        if (!this.playSpeechFallback(cue, voice, callbacks, started)) finish(false);
      },
      { once: true },
    );
    this.currentAudio = audio;
    void audio.play().catch(() => finish(false));
    return true;
  }

  private playSpeechFallback(
    cue: NarrationCueId,
    voice: NarrationVoice,
    callbacks: NarrationCallbacks,
    alreadyStarted = false,
  ): boolean {
    if (
      typeof window === 'undefined' ||
      window.speechSynthesis === undefined ||
      typeof SpeechSynthesisUtterance === 'undefined'
    ) {
      return false;
    }
    const language = LANGUAGE_TAGS[voice];
    const availableVoices = window.speechSynthesis.getVoices();
    const matchingVoice = availableVoices.find(
      (candidate) => candidate.lang.toLowerCase().replace('_', '-') === language.toLowerCase(),
    );
    if (availableVoices.length > 0 && matchingVoice === undefined) return false;
    const utterance = new SpeechSynthesisUtterance(narrationCues[cue][voice]);
    utterance.lang = language;
    utterance.rate = 1;
    utterance.pitch = 1;
    if (matchingVoice !== undefined) utterance.voice = matchingVoice;
    this.currentUtterance = utterance;
    utterance.onstart = () => {
      if (callbacks.automatic === true) this.automaticStarts.add(cue);
      if (!alreadyStarted) callbacks.onStart?.();
    };
    utterance.onend = () => {
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      callbacks.onComplete?.();
    };
    utterance.onerror = () => {
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      callbacks.onError?.();
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  private audioUrl(cue: NarrationCueId, voice: NarrationVoice): string {
    const base = typeof document === 'undefined' ? './' : document.baseURI;
    return new URL(`audio/narration/${voice}/${cue}.mp3`, base).href;
  }
}

export const narrationService = new NarrationService();
