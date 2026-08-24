// ============================================================
// INTEGRACIÓN CON HOME ASSISTANT
// ============================================================
// Este módulo maneja la comunicación bidireccional en tiempo real
// con Home Assistant mediante su API WebSocket.
// Home Assistant actúa como la única fuente de verdad para:
// - Estado de dispositivos (luces, puertas, etc.)
// - Medicaciones y horarios
// - Rutinas personalizadas
// - Perfiles de accesibilidad activos
// - Configuraciones generales (velocidad de escaneo, manos libres, etc.)
//
// NOTA: Requiere que Home Assistant esté accesible en la misma red local
// y que el usuario haya configurado correctamente la URL y el token de acceso.

(() => {
    // Configuración - EL USUARIO DEBE EDITAR ESTOS VALORES
    const HA_CONFIG = {
        // URL de tu instancia de Home Assistant (ej: "http://192.168.1.100:8123")
        // ¡Importante: No incluir la barra final!
        url: "http://192.168.1.100:8123", // <-- CAMBIAR ESTO

        // Token de larga duración de Home Assistant
        // Para obtenerlo: Ve a HA → Perfil de usuario → Tokens de larga duración → Crear token
        token: "TU_TOKEN_DE_HOME_ASSISTANT_AQUI", // <-- CAMBIAR ESTO

        // Prefijo para todas las entidades que gestionaremos
        entityPrefix: "casaconecta_",

        // Intervalo de reconexión en segundos
        reconnectInterval: 5,

        // Timeout para peticiones REST (en ms)
        restTimeout: 5000
    };

    // Estado interno de la integración
    let ws = null;
    let isConnected = false;
    let isConnecting = false;
    let messageId = 1;
    const pendingMessages = new Map(); // Para respuestas de WebSocket
    const entityStateListeners = new Map(); // Para escuchadores de cambios de estado
    const initialStateFetched = new Set(); // Para evitar solicitudes duplicadas

    /**
     * Inicia la conexión con Home Assistant
     */
    function connect() {
        if (isConnected || isConnecting) return;

        isConnecting = true;
        console.log(`[HA] Conectando a Home Assistant: ${HA_CONFIG.url}`);

        try {
            ws = new WebSocket(`ws://${HA_CONFIG.url.replace(/^https?:\/\//, '')}/api/websocket`);

            ws.onopen = () => {
                console.log('[HA] WebSocket conectado');
                isConnecting = false;
                // Esperamos el mensaje de auth requerido
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'auth_required') {
                    // Enviar credenciales de autenticación
                    ws.send(JSON.stringify({
                        type: 'auth',
                        access_token: HA_CONFIG.token
                    }));
                }
                else if (data.type === 'auth_ok') {
                    console.log('[HA] Autenticación exitosa');
                    isConnected = true;
                    isConnecting = false;
                    // Ahora podemos suscribirnos a eventos y obtener estados iniciales
                    subscribeToStateChanges();
                    fetchAllInitialStates();
                }
                else if (data.type === 'result') {
                    // Respuesta a una solicitud que enviamos
                    const pending = pendingMessages.get(data.id);
                    if (pending) {
                        pendingMessages.delete(data.id);
                        if (data.success) {
                            pending.resolve(data.result);
                        } else {
                            pending.reject(new Error(data.error || 'Error desconocido'));
                        }
                    }
                }
                else if (data.type === 'event' && data.event.event_type === 'state_changed') {
                    // Un entidad cambió de estado
                    const { entity_id, new_state } = data.event.data;
                    if (entity_id && entity_id.startsWith(HA_CONFIG.entityPrefix)) {
                        handleStateChange(entity_id, new_state);
                    }
                }
                else if (data.type === 'auth_invalid') {
                    console.error('[HA] Autenticación fallida: Token inválido');
                    isConnected = false;
                    isConnecting = false;
                    handleConnectionError('Token de autenticación inválido');
                }
                else {
                    // Otros mensajes que podríamos querer manejar
                    // console.debug('[HA] Mensaje recibido:', data);
                }
            };

            ws.onclose = () => {
                console.log('[HA] WebSocket desconectado');
                isConnected = false;
                isConnecting = false;
                // Intentamos reconectar después de un intervalo
                setTimeout(connect, HA_CONFIG.reconnectInterval * 1000);
            };

            ws.onerror = (error) => {
                console.error('[HA] Error de WebSocket:', error);
                // El cierre se manejará en onclose
            };
        } catch (error) {
            console.error('[HA] Error al crear WebSocket:', error);
            isConnecting = false;
            setTimeout(connect, HA_CONFIG.reconnectInterval * 1000);
        }
    }

    /**
     * Envía un mensaje mediante WebSocket y retorna una promesa
     * @param {Object} messageData -Datos del mensaje a enviar
     * @returns {Promise<any>} -Promesa que se resuelve con el resultado
     */
    function sendMessage(messageData) {
        return new Promise((resolve, reject) => {
            if (!isConnected || !ws || ws.readyState !== WebSocket.OPEN) {
                reject(new Error('No conectado a Home Assistant'));
                return;
            }

            const id = messageId++;
            const message = {
                id,
                ...messageData
            };

            pendingMessages.set(id, { resolve, reject });
            ws.send(JSON.stringify(message));
        });
    }

    /**
     * Suscribe el cliente a los eventos de cambio de estado
     */
    function subscribeToStateChanges() {
        sendMessage({
            type: 'subscribe_events',
            event_type: 'state_changed'
        }).catch(error => {
            console.error('[HA] Error al suscribirse a eventos:', error);
        });
    }

    /**
     * Obtiene el estado inicial de todas las entidades que nos interesan
     */
    async function fetchAllInitialStates() {
        try {
            // Obtener todos los estados
            const states = await callRestAPI('/states');

            // Filtrar solo nuestras entidades y procesarlas
            const ourEntities = states.filter(state =>
                state.entity_id && state.entity_id.startsWith(HA_CONFIG.entityPrefix)
            );

            for (const state of ourEntities) {
                handleStateChange(state.entity_id, state);
                initialStateFetched.add(state.entity_id);
            }

            console.log(`[HA] Estados iniciales obtenidos: ${ourEntities.length} entidades`);
        } catch (error) {
            console.error('[HA] Error al obtener estados iniciales:', error);
        }
    }

    /**
     * Maneja un cambio de estado de una entidad
     * @param {string} entityId -ID de la entidad
     * @param {Object|null} newState -Nuevo estado (null si la entidad fue eliminada)
     */
    function handleStateChange(entityId, newState) {
        // Notificar a todos los escuchadores registrados para esta entidad
        const listeners = entityStateListeners.get(entityId) || [];
        listeners.forEach(listener => {
            try {
                listener(newState);
            } catch (error) {
                console.error(`[HA] Error en escuchador para ${entityId}:`, error);
            }
        });

        // También podríamos actualizar cachés internos aquí si fuera necesario
        // Por ahora, dejamos que cada módulo maneje su propia lógica de escucho
    }

    /**
     * Registra un escuchador para cambios en una entidad específica
     * @param {string} entityId -ID de la entidad a observar
     * @param {Function} callback -Función a llamar cuando cambie el estado
     * @returns {Function} -Función para eliminar el escuchador
     */
    function onStateChange(entityId, callback) {
        if (!entityStateListeners.has(entityId)) {
            entityStateListeners.set(entityId, new Set());
        }
        const listeners = entityStateListeners.get(entityId);
        listeners.add(callback);

        // Devolver una función para remover el escuchador
        return () => {
            listeners.delete(callback);
            if (listeners.size === 0) {
                entityStateListeners.delete(entityId);
            }
        };
    }

    /**
     * Obtiene el estado actual de una entidad mediante REST
     * @param {string} entityId -ID de la entidad
     * @returns {Promise<Object|null>} -Promesa que se resuelve con el estado o null si no existe
     */
    async function getState(entityId) {
        try {
            const result = await callRestAPI(`/states/${entityId}`);
            return result || null;
        } catch (error) {
            if (error.message && error.message.includes('404')) {
                return null; // Entidad no existe aún
            }
            throw error;
        }
    }

    /**
     * Establece el estado de una entidad (llama a los servicios apropiados de HA)
     * @param {string} entityId -ID de la entidad
     * @param {Object} state -Nuevo estado a establecer
     * @returns {Promise<void>}
     */
    async function setState(entityId, state) {
        // Determinar el tipo de entidad y el servicio correspondiente
        const domain = entityId.split('.')[0];

        let serviceData = { entity_id: entityId };

        // Mapear tipos comunes de estado a servicios de HA
        switch (domain) {
            case 'switch':
            case 'light':
                serviceData = { ...state };
                // Para luces/switches, usualmente solo necesitamos el estado
                break;
            case 'input_boolean':
                serviceData = { ...state };
                break;
            case 'input_number':
                serviceData = { ...state };
                break;
            case 'input_text':
                serviceData = { ...state };
                break;
            case 'input_time':
                serviceData = { ...state };
                break;
            case 'input_select':
                serviceData = { ...state };
                break;
            default:
                // Para otros dominios, intentamos con el servicio genérico
                // o lanzamos un error si no sabemos cómo manejarlo
                console.warn(`[HA] Dominio desconocido para setState: ${domain}`);
                // Aún así intentamos, quizás HA lo acepte
                serviceData = { ...state };
        }

        try {
            await callRestAPI(`/services/${domain}/turn_on`, serviceData);
            // Nota: Este enfoque asume que todos pueden ser controlados con turn_on/turn_off
            // En la realidad, deberíamos ser más específicos según el dominio y el atributo
            // Pero para comenzar, esto cubre muchos casos comunes
        } catch (error) {
            // Si falla turn_on, intentar con servicios específicos según el atributo
            // Esta es una simplificación; en producción deberíamos ser más precisos
            console.warn(`[HA] Falló turn_on para ${entityId}, intentando enfoque alternativo:`, error);
            // Por ahora, lanzamos el error para que se maneje arriba
            throw error;
        }
    }

    /**
     * Llama a la API REST de Home Assistant
     * @param {string} endpoint -Endpoint de la API (ej: "/states" o "/services/light/turn_on")
     * @param {Object} [data] -Datos a enviar (para peticiones POST)
     * @returns {Promise<any>} -Promesa que se resuelve con la respuesta
     */
    function callRestAPI(endpoint, data = null) {
        const url = `${HA_CONFIG.url}/api${endpoint}`;
        const options = {
            method: data ? 'POST' : 'GET',
            headers: {
                'Authorization': `Bearer ${HA_CONFIG.token}`,
                'Content-Type': 'application/json'
            },
            timeout: HA_CONFIG.restTimeout
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        return new Promise((resolve, reject) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                reject(new Error(`Timeout al conectar con Home Assistant: ${endpoint}`));
            }, HA_CONFIG.restTimeout);

            fetch(url, {
                ...options,
                signal: controller.signal
            })
            .then(response => {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    return response.text().then(text => {
                        throw new Error(`Error HA ${response.status}: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                clearTimeout(timeoutId);
                resolve(data);
            })
            .catch(error => {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    reject(new Error(`Timeout al conectar con Home Assistant: ${endpoint}`));
                } else {
                    reject(error);
                }
            });
        });
    }

    /**
     * Maneja errores de conexión (por ejemplo, token inválido)
     * @param {string} message -Mensaje de error
     */
    function handleConnectionError(message) {
        console.error(`[HA] Error de conexión: ${message}`);
        // Aquí podríamos mostrar una notificación en la UI si quisiera
        // Por ahora, solo lo logueamos
    }

    /**
     * Inicia el proceso de conexión
     * Esta función debe llamarse una sola vez al cargar la aplicación
     */
    function init() {
        // Solo iniciar si no estamos ya conectados o conectando
        if (!isConnected && !isConnecting) {
            connect();
        }
    }

    /**
     * Fuerza una reconexión inmediatamente
     */
    function reconnect() {
        if (ws) {
            ws.close();
        }
        setTimeout(connect, 1000); // Pequeña pausa antes de reconectar
    }

    /**
     * Verifica si estamos conectados a Home Assistant
     * @returns {boolean}
     */
    function isHAConnected() {
        return isConnected;
    }

    // Exponer la API pública
    window.HAIntegration = {
        init,
        reconnect,
        isConnected: () => isConnected,
        onStateChange,
        getState,
        setState,
        // Para depuración
        _getConnectionStatus: () => ({ isConnected, isConnecting, wsReadyState: ws ? ws.readyState : null })
    };

    // Inicializar automáticamente cuando se cargue el script
    // Pero solo si HA_CONFIG tiene valores válidos (no los placeholders)
    setTimeout(() => {
        if (HA_CONFIG.url !== "http://192.168.1.100:8123" &&
            HA_CONFIG.token !== "TU_TOKEN_DE_HOME_ASSISTANT_AQUI") {
            init();
        } else {
            console.warn('[HA] Integración con Home Assistant no configurada. Por favor edite ha-integration.js con su URL y token.');
        }
    }, 1000);
})();