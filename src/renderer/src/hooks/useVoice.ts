import { useEffect, useRef } from 'react'
import { dueCues } from '@shared/cues'
import type { TimerEvent } from '@shared/schedule'
import type { VoiceSettings } from '@shared/voice'

/**
 * Chromium loads voices asynchronously: the first getVoices() call usually
 * comes back empty. We keep the chosen one once it shows up.
 */
function usePreferredVoice() {
  const voice = useRef<SpeechSynthesisVoice | null>(null)

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) return

    const pick = () => {
      const voices = synth.getVoices()
      voice.current =
        voices.find((v) => v.lang === 'en-US') ??
        voices.find((v) => v.lang.startsWith('en')) ??
        null
    }

    pick()
    synth.addEventListener('voiceschanged', pick)
    return () => synth.removeEventListener('voiceschanged', pick)
  }, [])

  return voice
}

/**
 * Speaks alerts at the right moment, once per occurrence.
 *
 * `active` shuts everything off outside a match and while paused — nothing is
 * worse than an overlay talking to itself in the main menu.
 */
export function useVoice(
  events: TimerEvent[],
  settings: VoiceSettings,
  active: boolean,
  matchId: string | null
): void {
  const spoken = useRef(new Set<string>())
  const preferredVoice = usePreferredVoice()

  // New match, alerts reset. Without this, an event sharing a timestamp with
  // the previous match would count as already spoken.
  useEffect(() => {
    spoken.current.clear()
  }, [matchId])

  useEffect(() => {
    const synth = window.speechSynthesis
    if (!active || !synth) return

    for (const cue of dueCues(events, settings, spoken.current)) {
      spoken.current.add(cue.key)

      const utterance = new SpeechSynthesisUtterance(cue.text)
      utterance.lang = 'en-US'
      utterance.rate = settings.rate
      utterance.volume = settings.volume
      if (preferredVoice.current) utterance.voice = preferredVoice.current

      synth.speak(utterance)
    }
  }, [events, settings, active, preferredVoice])

  // Shut up immediately on pause, hide, or leaving the match.
  useEffect(() => {
    if (!active) window.speechSynthesis?.cancel()
  }, [active])
}
