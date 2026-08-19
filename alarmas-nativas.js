// ============================================================
// ALARMAS NATIVAS (Android) — recordatorios de medicación 100% confiables
// ============================================================
// Este archivo SOLO hace algo cuando la app corre empaquetada como app nativa
// (con Capacitor). Si se abre como página web normal (GitHub Pages, Chrome),
// no hace nada y la app sigue funcionando como hasta ahora con el sistema de
// recordatorios dentro del navegador.
//
// La diferencia clave: acá usamos LocalNotifications.schedule(), que en Android
// programa una alarma real a nivel del SISTEMA OPERATIVO (AlarmManager). Esa
// alarma suena aunque la pantalla esté bloqueada, aunque la app esté cerrada
// del todo, y aunque el celular lleve horas sin tocarse — porque ya no depende
// de que el código JavaScript de la página esté corriendo.

(function() {
    var ID_TIPO_ACCION = 'RECORDATORIO_MEDICAMENTO';
    var yaInicializado = false;

    function esNativo() {
        return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    function pluginNotificaciones() {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications;
    }

    // Convierte el id de texto del medicamento (ej: "kx3f9a2b") en un entero de 32 bits
    // estable, porque Capacitor/Android exige que el id de la notificación sea numérico.
    function idNumerico(texto) {
        var hash = 0;
        for (var i = 0; i < texto.length; i++) {
            hash = ((hash << 5) - hash + texto.charCodeAt(i)) | 0;
        }
        return Math.abs(hash) % 2147483647 || 1;
    }

    async function inicializarNotificacionesNativas() {
        if (!esNativo() || yaInicializado) return;
        var LN = pluginNotificaciones();
        if (!LN) { console.warn('⚠️ App nativa pero el plugin LocalNotifications no está disponible.'); return; }
        yaInicializado = true;

        try {
            await LN.requestPermissions();

            await LN.registerActionTypes({
                types: [{
                    id: ID_TIPO_ACCION,
                    actions: [
                        { id: 'tomado', title: '✅ Ya lo tomé' },
                        { id: 'posponer', title: '⏰ En 10 min' }
                    ]
                }]
            });

            LN.addListener('localNotificationActionPerformed', function(evento) {
                var medId = evento.notification && evento.notification.extra && evento.notification.extra.medId;
                if (!medId) return;
                if (evento.actionId === 'tomado') {
                    if (typeof window.tomarMedicamento === 'function') window.tomarMedicamento(medId);
                } else if (evento.actionId === 'posponer') {
                    programarRecordatorioUnico(medId, 10);
                } else {
                    // tocaron el cuerpo de la notificación: solo abre la app, no hace falta nada más
                    var med = (window.medicamentos || []).find(function(m) { return m.id === medId; });
                    if (med && typeof window.mostrarRecordatorioMedicamento === 'function') window.mostrarRecordatorioMedicamento(med);
                }
            });

            // Si la notificación "llega" con la app abierta en primer plano, mostramos
            // también el cartel dentro de la app para que se vea igual que en modo web.
            LN.addListener('localNotificationReceived', function(notificacion) {
                var medId = notificacion.extra && notificacion.extra.medId;
                var med = (window.medicamentos || []).find(function(m) { return m.id === medId; });
                if (med && typeof window.mostrarRecordatorioMedicamento === 'function') window.mostrarRecordatorioMedicamento(med);
            });

            console.log('✅ Alarmas nativas de medicación inicializadas');
            await reprogramarTodasLasAlarmasNativas();
        } catch (e) {
            console.error('No se pudieron inicializar las notificaciones nativas:', e);
        }
    }

    // Programa (o reprograma) la alarma diaria de UN medicamento activo.
    async function programarAlarmaMedicamento(med) {
        var LN = pluginNotificaciones();
        if (!LN || !med || !med.activo) return;
        var partes = med.horario.split(':');
        var hora = parseInt(partes[0], 10);
        var minuto = parseInt(partes[1], 10);
        try {
            await LN.schedule({
                notifications: [{
                    id: idNumerico(med.id),
                    title: '⏰ Hora de tomar ' + med.nombre,
                    body: 'Dosis: ' + med.dosis + ' — Horario: ' + med.horario,
                    actionTypeId: ID_TIPO_ACCION,
                    extra: { medId: med.id },
                    schedule: {
                        on: { hour: hora, minute: minuto }, // se repite todos los días a esa hora, como una alarma de reloj
                        allowWhileIdle: true                 // que suene aunque el celular esté en reposo (Doze)
                    }
                }]
            });
        } catch (e) {
            console.error('No se pudo programar la alarma de', med.nombre, e);
        }
    }

    // Recordatorio único (no diario) para "posponer 10 min" — usa un id distinto
    // al de la alarma diaria para no pisarla.
    async function programarRecordatorioUnico(medId, minutosDespues) {
        var LN = pluginNotificaciones();
        var med = (window.medicamentos || []).find(function(m) { return m.id === medId; });
        if (!LN || !med) return;
        try {
            await LN.schedule({
                notifications: [{
                    id: idNumerico(med.id + '_posponer'),
                    title: '⏰ Hora de tomar ' + med.nombre,
                    body: 'Dosis: ' + med.dosis + ' (pospuesto)',
                    actionTypeId: ID_TIPO_ACCION,
                    extra: { medId: med.id },
                    schedule: {
                        at: new Date(Date.now() + minutosDespues * 60 * 1000),
                        allowWhileIdle: true
                    }
                }]
            });
        } catch (e) {
            console.error('No se pudo programar el recordatorio pospuesto:', e);
        }
    }

    async function cancelarAlarmaMedicamento(med) {
        var LN = pluginNotificaciones();
        if (!LN || !med) return;
        try { await LN.cancel({ notifications: [{ id: idNumerico(med.id) }, { id: idNumerico(med.id + '_posponer') }] }); }
        catch (e) { console.error('No se pudo cancelar la alarma:', e); }
    }

    // Recorre TODOS los medicamentos y deja las alarmas nativas sincronizadas con la
    // lista actual: cancela todo y vuelve a programar los que están activos. Se llama
    // al iniciar la app y cada vez que se agrega, edita o elimina un medicamento.
    async function reprogramarTodasLasAlarmasNativas() {
        var LN = pluginNotificaciones();
        if (!LN || !esNativo()) return;
        try {
            await LN.cancelAll();
            var lista = window.medicamentos || [];
            for (var i = 0; i < lista.length; i++) {
                if (lista[i].activo) await programarAlarmaMedicamento(lista[i]);
            }
            console.log('🔔 Alarmas nativas sincronizadas:', lista.filter(function(m) { return m.activo; }).length, 'medicamento(s) activo(s)');
        } catch (e) {
            console.error('No se pudieron sincronizar las alarmas nativas:', e);
        }
    }

    // Exponemos las funciones que necesita casaconecta (index.html) para llamarlas
    // después de agregar/eliminar un medicamento, sin que el resto del código
    // necesite saber si está corriendo nativo o no.
    window.alarmasNativas = {
        disponible: esNativo,
        inicializar: inicializarNotificacionesNativas,
        reprogramarTodas: reprogramarTodasLasAlarmasNativas,
        cancelar: cancelarAlarmaMedicamento
    };

    // Se auto-inicializa al cargar: como este script se carga DESPUÉS del script
    // principal de la app, `window.medicamentos` ya existe y está cargado para
    // cuando esto corre. Si no es una app nativa, esNativo() corta acá y no hace nada.
    inicializarNotificacionesNativas();
})();
