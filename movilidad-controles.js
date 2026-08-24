// Controles específicos para dispositivos de movilidad y posición
window.MovilidadControles = {
    // Camas eléctricas
    ajustarAlturaCama: function(nivel) {
        // nivel: 0-100 (porcentaje de altura)
        ofrecerDeshacer(
            'Altura de cama ajustada a ' + nivel + '%',
            function() {
                var estadoAnterior = deviceStates['cama_altura'] || 50;
                deviceStates['cama_altura'] = nivel;
                renderScreen();
                guardarDatos();
                hablar('Altura de cama ajustada a ' + nivel + ' por ciento');
            }
        );
    },

    ajustarInclinacionCabecera: function(angulo) {
        // angulo: 0-90 grados
        ofrecerDeshacer(
            'Inclinación de cabecera ajustada a ' + angulo + '°',
            function() {
                var estadoAnterior = deviceStates['cama_inclinacion'] || 0;
                deviceStates['cama_inclinacion'] = angulo;
                renderScreen();
                guardarDatos();
                hablar('Inclinación de cabecera ajustada a ' + angulo + ' grados');
            }
        );
    },

    ajustarInclinacionPiernas: function(angulo) {
        // angulo: 0-90 grados
        ofrecerDeshacer(
            'Inclinación de piernas ajustada a ' + angulo + '°',
            function() {
                var estadoAnterior = deviceStates['cama_piernas_inclinacion'] || 0;
                deviceStates['cama_piernas_inclinacion'] = angulo;
                renderScreen();
                guardarDatos();
                hablar('Inclinación de piernas ajustada a ' + angulo + ' grados');
            }
        );
    },

    // Grúas de traslado
    operarGrua: function(direccion) {
        // direccion: 'arriba', 'abajo', 'izquierda', 'derecha', 'adelante', 'atras'
        var acciones = {
            'arriba': 'Subiendo',
            'abajo': 'Bajando',
            'izquierda': 'Moviendo izquierda',
            'derecha': 'Moviendo derecha',
            'adelante': 'Moviendo adelante',
            'atras': 'Moviendo atrás'
        };
        ofrecerDeshacer(
            'Operando grúa: ' + (acciones[direccion] || direccion),
            function() {
                var estadoAnterior = deviceStates['grua_estado'] || 'detenido';
                deviceStates['grua_estado'] = direccion;
                renderScreen();
                guardarDatos();
                hablar('Grúa: ' + (acciones[direccion] || direccion));
                
                // Resetear después de un corto tiempo (simulando movimiento limitado)
                setTimeout(() => {
                    if (deviceStates['grua_estado'] === direccion) {
                        deviceStates['grua_estado'] = 'detenido';
                        renderScreen();
                        guardarDatos();
                    }
                }, 3000);
            }
        );
    }
};