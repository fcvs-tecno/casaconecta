// Service Worker de CasaConecta
// Objetivo: permitir que la app se instale como aplicación (ícono en el celular)
// y mostrar recordatorios como notificaciones reales del sistema operativo,
// con botones de acción, mientras la app siga corriendo (abierta o en segundo plano).
//
// IMPORTANTE - Límite real de los navegadores: si el navegador o la app están
// completamente cerrados (no solo en segundo plano) o el celular estuvo apagado,
// ningún código JavaScript puede ejecutarse, así que este recordatorio no puede
// dispararse. Para una garantía total incluso con la app cerrada del todo, hace
// falta notificaciones push desde un servidor, o convertir esto en una app nativa.

const CACHE_NAME = 'casaconecta-v1';
const ARCHIVOS_CACHE = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(event) {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(ARCHIVOS_CACHE).catch(function() { /* si falla el cache, no bloquea la instalación */ });
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

// Estrategia simple: intenta red primero (para tener siempre la última versión),
// si no hay conexión usa lo que haya en caché.
self.addEventListener('fetch', function(event) {
    event.respondWith(
        fetch(event.request).catch(function() {
            return caches.match(event.request);
        })
    );
});

// Cuando la página le pide al Service Worker que muestre una notificación real del sistema.
self.addEventListener('message', function(event) {
    if (event.data && event.data.tipo === 'mostrar-recordatorio') {
        var med = event.data.medicamento;
        self.registration.showNotification('⏰ Hora de tomar ' + med.nombre, {
            body: 'Dosis: ' + med.dosis + ' — Horario: ' + med.horario,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: 'medicamento-' + med.id,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
            data: { medId: med.id },
            actions: [
                { action: 'tomado', title: '✅ Ya lo tomé' },
                { action: 'posponer', title: '⏰ En 10 min' }
            ]
        });
    }
});

// Cuando la persona toca la notificación o uno de sus botones.
self.addEventListener('notificationclick', function(event) {
    var medId = event.notification.data && event.notification.data.medId;
    var accion = event.action || 'abrir';
    event.notification.close();

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(listaClientes) {
            for (var i = 0; i < listaClientes.length; i++) {
                var cliente = listaClientes[i];
                if ('focus' in cliente) {
                    cliente.postMessage({ tipo: 'recordatorio-accion', medId: medId, accion: accion });
                    return cliente.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow('./index.html?recordatorio=' + encodeURIComponent(medId) + '&accion=' + encodeURIComponent(accion));
            }
        })
    );
});
