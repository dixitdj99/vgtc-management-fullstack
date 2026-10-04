package com.vgtc.terminal.util

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

/** Shared spoken guidance and short, distinct sensor feedback. */
class TerminalFeedback(context: Context) {
    private val prefs = Prefs(context)
    private val handler = Handler(Looper.getMainLooper())
    private var tone = runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 85) }.getOrNull()
    private var ready = false
    private var pending: Pair<String, String>? = null
    private var tts: TextToSpeech? = null
    private var lastRejected = 0L
    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
            pending?.let { speak(it.first, it.second) }
            pending = null
        }
    }
    fun speak(english: String, hindi: String) {
        if (!ready) { pending = english to hindi; return }
        val locale = Locale(if (prefs.language == "hi") "hi" else "en", "IN")
        if ((tts?.setLanguage(locale) ?: TextToSpeech.LANG_NOT_SUPPORTED) < 0) return
        tts?.setSpeechRate(0.85f)
        tts?.setPitch(1.0f)
        tts?.speak(if (prefs.language == "hi") hindi else english, TextToSpeech.QUEUE_FLUSH, null, "guidance")
    }
    fun accepted() { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 160) }
    fun rejected() {
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastRejected < 1800) return
        lastRejected = now
        repeat(3) { index -> handler.postDelayed({ tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 80) }, index * 150L) }
    }
    fun close() { handler.removeCallbacksAndMessages(null); tts?.stop(); tts?.shutdown(); tone?.release(); tone = null }
}
