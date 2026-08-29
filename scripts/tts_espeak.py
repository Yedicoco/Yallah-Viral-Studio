# Synthèse vocale de secours via espeak-ng (bibliothèque embarquée espeakng-loader).
# Appel : python3 scripts/tts_espeak.py "<texte>" <voix> <sortie.wav> [vitesse_mots_min]
# Écrit un WAV PCM 16 bits mono 22050 Hz. Aucune dépendance externe.

import ctypes
import sys
import wave

import espeakng_loader

AUDIO_OUTPUT_SYNCHRONOUS = 1
POS_CHARACTER = 1


def synth(text: str, voice: str, out_path: str, words_per_minute: int = 178) -> float:
    lib = ctypes.CDLL(espeakng_loader.get_library_path())

    samples = []

    @ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    def callback(wav, numsamples, _events):
        if wav and numsamples > 0:
            samples.extend(wav[i] for i in range(numsamples))
        return 0

    rate = lib.espeak_Initialize(
        AUDIO_OUTPUT_SYNCHRONOUS, 0, espeakng_loader.get_data_path().encode(), 0
    )
    if rate < 0:
        raise RuntimeError("espeak_Initialize a échoué")

    lib.espeak_SetVoiceByName(voice.encode())
    lib.espeak_SetSynthCallback(callback)
    # NB : le contrôle de débit fin est assuré côté Node via FFmpeg atempo
    # (voir lib/tts.mjs) — fiable et indépendant du moteur de synthèse.

    payload = text.encode("utf-8")
    lib.espeak_Synth(payload, len(payload) + 1, 0, POS_CHARACTER, 0, 0, None, None)
    lib.espeak_Synchronize()
    lib.espeak_Terminate()

    duration = len(samples) / rate if rate else 0.0
    with wave.open(out_path, "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(rate)
        frames = b"".join(int(sample & 0xFFFF).to_bytes(2, "little") for sample in samples)
        wav_file.writeframes(frames)
    return duration


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("usage: tts_espeak.py <texte> <voix> <sortie.wav> [wpm]", file=sys.stderr)
        sys.exit(2)
    text_arg, voice_arg, out_arg = sys.argv[1], sys.argv[2], sys.argv[3]
    wpm_arg = int(sys.argv[4]) if len(sys.argv) > 4 else 178
    seconds = synth(text_arg, voice_arg, out_arg, wpm_arg)
    print(f"{seconds:.3f}")
