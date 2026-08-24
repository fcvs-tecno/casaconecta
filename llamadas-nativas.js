// ============================================================
// LLAMADAS DIRECTAS (Android) — sin pasar por el marcador
// ============================================================
// En la versión web, "llamarContacto" abre el marcador del celular con el
// número ya cargado (usando tel:), pero el navegador SIEMPRE exige que la
// persona toque el botón "Llamar" — es una protección de seguridad de todos
// los navegadores para que ninguna página pueda marcar números por su cuenta
// (evita fraudes con números de tarifa alta, por ejemplo). Esa restricción no
// se puede saltear desde el navegador, ni siquiera dentro de un WebView.
//
// Acá sí podemos: al ser una app nativa, con el permiso de "Realizar llamadas"
// concedido, Android puede iniciar la llamada directamente sin mostrar el
// marcador. Usamos el plugin nativo call-number para eso.

(function() {
    var permisoConcedido = null; // null = todavía no se sabe, true/false luego del primer intento

    function esNativo() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }
    function pluginLlamadas() {
        return window.plugins && window.plugins.CallNumber;
    }

    function llamarContactoNativo(id) {
        var contacto = (window.contactosEmergencia || []).find(function(c) { return c.id === id; });
        if (!contacto) return;
        var telLimpio = (contacto.telefono || '').replace(/[^\d+]/g, '');
        if (!telLimpio) {
            mostrarTranscript('⚠️ ' + contacto.nombre + ' no tiene un teléfono válido cargado');
            ocultarTranscriptDelay(3000);
            return;
        }

        var CN = pluginLlamadas();
        if (!CN) {
            // el plugin no cargó por algún motivo: recurrimos al camino web como respaldo
            hablar('Llamando a ' + contacto.nombre);
            vibrar('accion');
            window.location.href = 'tel:' + telLimpio;
            return;
        }

        hablar('Llamando a ' + contacto.nombre);
        vibrar('accion');
        // bypassAppChooser=true: llama directo con la app de teléfono del sistema,
        // sin preguntar "¿con qué app querés llamar?" cada vez.
        CN.callNumber(
            function() {
                permisoConcedido = true;
                console.log('📞 Llamada iniciada directamente a', contacto.nombre);
            },
            function(error) {
                console.error('No se pudo llamar directamente:', error);
                if (error === 20 || (typeof error === 'string' && error.indexOf('PERMISSION') !== -1)) {
                    permisoConcedido = false;
                    mostrarTranscript('⚠️ Falta el permiso de "Realizar llamadas". Activalo en Ajustes del celular → Apps → CasaConecta → Permisos.');
                    ocultarTranscriptDelay(5000);
                } else {
                    // como respaldo, abrimos el marcador igual (mejor eso que nada)
                    mostrarTranscript('⚠️ No se pudo llamar directo, abriendo el marcador...');
                    ocultarTranscriptDelay(2500);
                    window.location.href = 'tel:' + telLimpio;
                }
            },
            telLimpio,
            true
        );
    }

    function inicializarLlamadasNativas() {
        if (!esNativo()) return; // en la web, llamarContacto() sigue usando tel: como hasta ahora
        if (!pluginLlamadas()) {
            console.warn('⚠️ Plugin de llamada directa no disponible en este build.');
            return;
        }
        window.llamarContacto = llamarContactoNativo;
        console.log('✅ Llamadas directas nativas activadas (sin pasar por el marcador)');
    }

    window.addEventListener('DOMContentLoaded', inicializarLlamadasNativas);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        inicializarLlamadasNativas();
    }
})();
