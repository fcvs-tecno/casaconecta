// ============================================================
// VOZ NATIVA (Android) — reconocimiento de voz confiable en la app empaquetada
// ============================================================
// El reconocimiento de voz del navegador (webkitSpeechRecognition, usado en
// index.html) no funciona de forma confiable dentro de un WebView empaquetado
// como app nativa — es una limitación de Android, no de nuestro código. Este
// archivo reemplaza esa parte por el plugin @capacitor-community/speech-recognition,
// que usa directamente el reconocedor de voz nativo de Android (el mismo que usa
// el teclado de Google cuando tocás el micrófono para dictar un mensaje).
//
// Si la app corre como página web normal (GitHub Pages, Chrome), este archivo
// no hace nada: index.html sigue usando el camino del navegador como hasta ahora.

(function() {
    var SR = null;
    var manosLibresNativo = false;
    var permisoOtorgado = false;
    var yaInicializado = false;

    function esNativo() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }
    function plugin() {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SpeechRecognition;
    }

    async function inicializarVozNativa() {
        if (!esNativo() || yaInicializado) return;
        yaInicializado = true;
        SR = plugin();
        if (!SR) { console.warn('⚠️ Plugin de voz nativo no disponible en este build.'); return; }

        try {
            var disponible = await SR.available();
            if (!disponible.available) {
                console.warn('⚠️ Este dispositivo no tiene reconocimiento de voz instalado (revisar Google app / Servicios de Google).');
                return;
            }

            var permiso = await SR.checkPermissions();
            if (permiso.speechRecognition !== 'granted') {
                permiso = await SR.requestPermissions();
            }
            permisoOtorgado = (permiso.speechRecognition === 'granted');

            // Reemplazamos las funciones que ya usa el resto de la app (el botón del
            // micrófono, el comando de voz "silencio", el toggle de Configuración,
            // etc.) para que sigan funcionando igual sin tener que tocar esa lógica.
            window.vozSoportada = true;
            window.contextoSeguro = true;
            window.toggleVozEscucha = toggleVozEscuchaNativa;
            window.activarEscuchaContinua = activarEscuchaContinuaNativa;
            window.detenerEscuchaVoz = detenerEscuchaVozNativa;
            window.toggleManosLibres = function() {
                if (manosLibresNativo) detenerEscuchaVozNativa(); else activarEscuchaContinuaNativa();
            };

            var fab = document.getElementById('voice-fab');
            if (fab) fab.classList.remove('unsupported');

            console.log('✅ Reconocimiento de voz nativo inicializado (permiso: ' + permiso.speechRecognition + ')');

            // Si ya estaba en modo manos libres de una sesión anterior, lo retomamos.
            if (config.manosLibres && permisoOtorgado) {
                setTimeout(activarEscuchaContinuaNativa, 1200);
            } else if (!config.manosLibres && typeof mostrarOverlayBienvenida === 'function') {
                setTimeout(mostrarOverlayBienvenida, 900);
            }
        } catch (e) {
            console.error('No se pudo inicializar el reconocimiento de voz nativo:', e);
        }
    }

    function toggleVozEscuchaNativa() {
        if (config.vibracionActiva && navigator.vibrate) navigator.vibrate(30);
        if (!permisoOtorgado) {
            mostrarTranscript('⚠️ Falta el permiso de micrófono. Activalo en Ajustes del celular → Apps → CasaConecta → Permisos.');
            ocultarTranscriptDelay(5000);
            return;
        }
        if (manosLibresNativo) { detenerEscuchaVozNativa(); } else { activarEscuchaContinuaNativa(); }
    }

    function activarEscuchaContinuaNativa() {
        if (!permisoOtorgado) {
            mostrarTranscript('⚠️ Falta el permiso de micrófono. Activalo en Ajustes del celular → Apps → CasaConecta → Permisos.');
            ocultarTranscriptDelay(5000);
            return;
        }
        manosLibresNativo = true;
        window.manosLibres = true;
        cambiarConfigSilencioso('manosLibres', true);
        renderScreen();
        hablar('Escucha continua activada', function() { cicloEscuchaNativa(); });
    }

    function detenerEscuchaVozNativa() {
        manosLibresNativo = false;
        window.manosLibres = false;
        cambiarConfigSilencioso('manosLibres', false);
        if (SR && window.escuchandoVoz) { SR.stop().catch(function() {}); }
        window.escuchandoVoz = false;
        actualizarUIVoz();
        hablar('Escucha detenida');
        mostrarTranscript('🎤 Micrófono apagado');
        ocultarTranscriptDelay(1500);
        renderScreen();
    }

    // El plugin nativo escucha UNA frase por vez (no tiene modo "continuo" como el
    // navegador). Simulamos la escucha continua reiniciándolo automáticamente
    // después de cada frase reconocida, igual que hacíamos con hablar()/pausas
    // en la versión web.
    async function cicloEscuchaNativa() {
        if (!manosLibresNativo || !SR) return;
        window.escuchandoVoz = true;
        actualizarUIVoz();
        mostrarTranscript('🎤 Escuchando...');
        ocultarTranscriptDelay(2500);
        try {
            var resultado = await SR.start({ language: 'es-ES', maxResults: 1, popup: false, partialResults: false });
            window.escuchandoVoz = false;
            actualizarUIVoz();
            var texto = resultado && resultado.matches && resultado.matches[0];
            if (texto) {
                mostrarTranscript('🗣️ "' + texto + '"');
                procesarComandoVoz(texto);
            }
        } catch (e) {
            window.escuchandoVoz = false;
            actualizarUIVoz();
            // es normal que tire error por silencio/timeout; seguimos el ciclo igual
        }
        esperarYReiniciarCiclo();
    }

    // Antes de volver a escuchar, esperamos a que la app termine de hablar
    // (window.bloqueadoPorHablaNativo lo maneja tts-nativa.js): si no, el micrófono
    // podría "escucharse a sí mismo" diciendo la confirmación y confundirlo con una orden.
    function esperarYReiniciarCiclo() {
        if (!manosLibresNativo) return;
        if (window.bloqueadoPorHablaNativo) {
            setTimeout(esperarYReiniciarCiclo, 200);
        } else {
            setTimeout(cicloEscuchaNativa, 300);
        }
    }

    window.addEventListener('DOMContentLoaded', function() {
        // se ejecuta después de que index.html ya corrió su propio script principal
        inicializarVozNativa();
    });
    // por si DOMContentLoaded ya pasó para cuando este script cargó (va al final del body)
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        inicializarVozNativa();
    }
})();
