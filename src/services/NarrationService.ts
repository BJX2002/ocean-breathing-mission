import narrationCues from '../data/narrationCues.json';
import { experiencePreferences, type NarrationVoice } from '../state/ExperiencePreferences';

export type NarrationCueId = keyof typeof narrationCues;

export interface NarrationCallbacks {
  readonly automatic?: boolean;
  /** Distinguishes separate visits to the same automatically narrated screen. */
  readonly automaticKey?: string;
  readonly onStart?: () => void;
  readonly onComplete?: () => void;
  readonly onError?: () => void;
  readonly onStop?: () => void;
}

const LANGUAGE_TAGS: Readonly<Record<NarrationVoice, string>> = {
  can: 'zh-HK',
  pth: 'zh-CN',
  eng: 'en-US',
};

class NarrationService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentStopCallback: (() => void) | null = null;
  private readonly automaticStarts = new Set<string>();
  private pendingGestureCleanup: (() => void) | null = null;
  private readonly preloadedAudio = new Map<string, HTMLAudioElement>();
  private readonly playbackListeners = new Set<(playing: boolean) => void>();

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

  /** Start a fresh playthrough without carrying auto-play history from the previous run. */
  resetAutomaticStarts(): void {
    this.stop();
    this.automaticStarts.clear();
  }

  play(cue: NarrationCueId, callbacks: NarrationCallbacks = {}): boolean {
    const automaticKey = callbacks.automaticKey ?? cue;
    if (callbacks.automatic === true && this.automaticStarts.has(automaticKey)) return false;
    this.stop();
    const voice = experiencePreferences.getVoice();
    if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
      return this.playRecordedAudio(cue, voice, callbacks);
    }
    return this.playSpeechFallback(cue, voice, callbacks);
  }

  stop(): void {
    const wasPlaying = this.isPlaying();
    const onStop = this.currentStopCallback;
    this.currentStopCallback = null;
    this.pendingGestureCleanup?.();
    this.pendingGestureCleanup = null;
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
    onStop?.();
    if (wasPlaying) this.notifyPlaybackChange();
  }

  isPlaying(): boolean {
    return this.currentAudio !== null || this.currentUtterance !== null;
  }

  onPlaybackChange(listener: (playing: boolean) => void): () => void {
    this.playbackListeners.add(listener);
    listener(this.isPlaying());
    return () => this.playbackListeners.delete(listener);
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
    audio.playbackRate = experiencePreferences.getNarrationSpeed();
    let started = false;
    let finished = false;
    const automaticKey = callbacks.automaticKey ?? cue;
    let clearGestureRetry = (): void => undefined;
    const finish = (success: boolean): void => {
      if (finished) return;
      finished = true;
      clearGestureRetry();
      if (this.currentAudio === audio) {
        this.currentAudio = null;
        this.currentStopCallback = null;
        this.notifyPlaybackChange();
      }
      if (success) callbacks.onComplete?.();
      else callbacks.onError?.();
    };
    audio.addEventListener(
      'playing',
      () => {
        if (started) return;
        started = true;
        if (callbacks.automatic === true) this.automaticStarts.add(automaticKey);
        callbacks.onStart?.();
      },
      { once: true },
    );
    audio.addEventListener('ended', () => finish(true), { once: true });
    audio.addEventListener(
      'error',
      () => {
        if (this.currentAudio === audio) {
          this.currentAudio = null;
          this.currentStopCallback = null;
          this.notifyPlaybackChange();
        }
        if (!this.playSpeechFallback(cue, voice, callbacks, started)) finish(false);
      },
      { once: true },
    );
    this.currentAudio = audio;
    this.currentStopCallback = callbacks.onStop ?? null;
    this.notifyPlaybackChange();
    const queueGestureRetry = (): void => {
      if (typeof window === 'undefined' || finished || this.currentAudio !== audio) {
        finish(false);
        return;
      }
      this.pendingGestureCleanup?.();
      const retry = (): void => {
        clearGestureRetry();
        if (finished || this.currentAudio !== audio) return;
        // Keep this call synchronous inside the trusted gesture for iPad Safari.
        void audio.play().catch(() => finish(false));
      };
      clearGestureRetry = (): void => {
        window.removeEventListener('pointerdown', retry, true);
        window.removeEventListener('keydown', retry, true);
        if (this.pendingGestureCleanup === clearGestureRetry) this.pendingGestureCleanup = null;
      };
      this.pendingGestureCleanup = clearGestureRetry;
      window.addEventListener('pointerdown', retry, true);
      window.addEventListener('keydown', retry, true);
    };
    void audio.play().catch(() => {
      if (callbacks.automatic === true && !started) queueGestureRetry();
      else finish(false);
    });
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
    const automaticKey = callbacks.automaticKey ?? cue;
    utterance.lang = language;
    utterance.rate = experiencePreferences.getNarrationSpeed();
    utterance.pitch = 1;
    if (matchingVoice !== undefined) utterance.voice = matchingVoice;
    this.currentUtterance = utterance;
    this.currentStopCallback = callbacks.onStop ?? null;
    this.notifyPlaybackChange();
    utterance.onstart = () => {
      if (callbacks.automatic === true) this.automaticStarts.add(automaticKey);
      if (!alreadyStarted) callbacks.onStart?.();
    };
    utterance.onend = () => {
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      this.currentStopCallback = null;
      this.notifyPlaybackChange();
      callbacks.onComplete?.();
    };
    utterance.onerror = () => {
      if (this.currentUtterance !== utterance) return;
      this.currentUtterance = null;
      this.currentStopCallback = null;
      this.notifyPlaybackChange();
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

  private notifyPlaybackChange(): void {
    const playing = this.isPlaying();
    for (const listener of this.playbackListeners) listener(playing);
  }
}

export const narrationService = new NarrationService();
