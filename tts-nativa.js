// ============================================================
// VOZ DE SALIDA NATIVA (Android) — que la app realmente hable
// ============================================================
// El mismo problema que tuvimos con el micrófono (WebView no tiene el mismo
// soporte que Chrome) pasa también con la síntesis de voz de salida
// (window.speechSynthesis): dentro del WebView es poco confiable — a veces
// no dice nada, o falla en silencio sin avisar ningún error. Acá reemplazamos
// eso por el plugin nativo @capacitor-community/text-to-speech, que usa
// directamente el motor de texto-a-voz de Android (el mismo que usa
// TalkBack o Google Assistant).

(function() {
    var TTS = null;
    var yaInicializado = false;

    function esNativo() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }
    function pluginTTS() {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech;
    }

    function inicializarTTSNativo() {
        if (!esNativo() || yaInicializado) return;
        yaInicializado = true;
        TTS = pluginTTS();
        if (!TTS) {
            console.warn('⚠️ Plugin de voz de salida nativo no disponible en este build.');
            return;
        }
        window.hablar = hablarNativo;
        console.log('✅ Síntesis de voz nativa activada (la app ya debería hablar bien)');
    }

    function hablarNativo(texto, alTerminar) {
        if (!texto || texto.trim() === '') { if (alTerminar) alTerminar(); return; }
        // seguimos guardando todo en el panel de subtítulos, igual que en la web
        if (typeof registrarSubtitulo === 'function') registrarSubtitulo(texto);

        window.bloqueadoPorHablaNativo = true;
        TTS.speak({
            text: texto,
            lang: 'es-ES',
            rate: 0.9,
            pitch: 1.0,
            volume: ((typeof config !== 'undefined' && config.volumenVoz) || 80) / 100,
            queueStrategy: 0 // 0 = Flush: si había algo sonando, lo corta y dice esto
        }).then(function() {
            window.bloqueadoPorHablaNativo = false;
            if (alTerminar) alTerminar();
        }).catch(function(e) {
            console.error('Error al hablar (TTS nativo):', e);
            window.bloqueadoPorHablaNativo = false;
            if (alTerminar) alTerminar();
        });
    }

    window.addEventListener('DOMContentLoaded', inicializarTTSNativo);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        inicializarTTSNativo();
    }
})();
