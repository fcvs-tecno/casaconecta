// Controles y registro para dispositivos de monitoreo de salud
window.SaludControles = {
    registro: {
        glucosa: [],
        presion: [],
        peso: [],
        temperatura: [],
        saturacion: []
    },
    
    // Registrar lecturas
    registrarGlucosa: function(valor, unidades = 'mg/dL') {
        var lectura = {
            valor: parseFloat(valor),
            unidades: unidades,
            timestamp: new Date().toISOString()`n        };
        
        var registros = JSON.parse(localStorage.getItem('registrosGlucosa') || '[]');
        registros.push(lectura);
        if (registros.length > 50) registros.shift(); // mantener últimos 50
        localStorage.setItem('registrosGlucosa', JSON.stringify(registros));
        
        // Verificar rangos y generar alertas si es necesario
        var valorNum = parseFloat(valor);
        if (valorNum < 70) {
            generarAlertaTeleassistance(
                '🚨 Hipoglucemia detectada: ' + valorNum + ' ' + unidades,
                'Nivel de glucosa peligrosamente bajo - requiere atención inmediata',
                'critico'
            );
        } else if (valorNum > 180) {
            generarAlertaTeleassistance(
                '⚠️ Hiperglucemia detectada: ' + valorNum + ' ' + unidades,
                'Nivel de glucosa elevado - considerar ajuste de medicación',
                'advertencia'
            );
        }
        
        return lectura;
    },
    
    registrarPresion: function(sistolica, diastolica, pulso) {
        var lectura = {
            sistolica: parseInt(sistolica),
            diastolica: parseInt(diastolica),
            pulso: parseInt(pulso),
            timestamp: new Date().toISOString()`n        };
        
        var registros = JSON.parse(localStorage.getItem('registrosPresion') || '[]');
        registros.push(lectura);
        if (registros.length > 50) registros.shift();
        localStorage.setItem('registrosPresion', JSON.stringify(registros));
        
        // Verificar rangos de presión
        var sys = parseInt(sistolica);
        var dia = parseInt(diastolica);
        
        if (sys < 90 || sys > 180 || dia < 60 || dia > 110) {
            generarAlertaTeleassistance(
                '🚨 Presión arterial fuera de rango: ' + sys + '/' + dia + ' mmHg',
                'Lectura de presión arterial requiere revisión médica',
                'critico'
            );
        }
        
        return lectura;
    },
    
    registrarPeso: function(peso, unidades = 'kg') {
        var lectura = {
            valor: parseFloat(peso),
            unidades: unidades,
            timestamp: new Date().toISOString()`n        };
        
        var registros = JSON.parse(localStorage.getItem('registrosPeso') || '[]');
        registros.push(lectura);
        if (registros.length > 20) registros.shift(); // peso se mide con menos frecuencia
        localStorage.setItem('registrosPeso', JSON.stringify(registros));
        
        return lectura;
    },
    
    // Obtener tendencias y promedios
    obtenerPromedioGlucosa: function(dias = 1) {
        var registros = JSON.parse(localStorage.getItem('registrosGlucosa') || '[]');
        var haceDias = new Date();
        haceDias.setDate(haceDias.getDate() - dias);
        
        var filtrados = registros.filter(r => new Date(r.timestamp) >= haceDias);
        if (filtrados.length === 0) return null;
        
        var suma = filtrados.reduce((acc, r) => acc + r.valor, 0);
        return suma / filtrados.length;
    },
    
    obtenerTendenciaPeso: function(semanas = 1) {
        var registros = JSON.parse(localStorage.getItem('registrosPeso') || '[]');
        var haceSemanas = new Date();
        haceSemanas.setDate(haceSemanas.getDate() - (semanas * 7));
        
        var filtrados = registros.filter(r => new Date(r.timestamp) >= haceSemanas);
        if (filtrados.length < 2) return 'insuficientes datos';
        
        // Regresión lineal simple para tendencia
        var n = filtrados.length;
        var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        filtrados.forEach((r, idx) => {
            var x = idx; // días en orden
            var y = r.valor;
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        
        var pendiente = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return pendiente; // positiva = aumentando, negativa = disminuyendo
    }
};