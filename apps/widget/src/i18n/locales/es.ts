import type { Translation } from './en';

export const es: Translation = {
  appName: 'IVY USA',
  notificationCenter: 'Centro de notificaciones',
  settings: 'Configuración',

  tab: {
    notifications: 'Notificaciones',
    chat: 'Chat',
    orders: 'Pedidos',
  },

  notifications: {
    empty: 'Aún no hay notificaciones.',
    filters: {
      all: 'Todas',
      payment: 'Pago',
      shipping: 'Envío',
      event: 'Evento',
      review: 'Reseña',
    },
  },

  chat: {
    welcome:
      '¡Hola! Te damos la bienvenida a IVY USA. ¿En qué podemos ayudarte hoy? Elige un tema abajo o escribe tu pregunta.',
    welcomeNamed:
      '¡Hola {{name}}! Bienvenido de nuevo a IVY USA. ¿En qué podemos ayudarte hoy? Elige un tema abajo o escribe tu pregunta.',
    aiDisclosure:
      'Este chat funciona con IA. Los mensajes que envías son procesados por un proveedor externo de IA en Estados Unidos para generar respuestas.',
    citations: 'Conocimiento consultado',
    inputPlaceholder: 'Escribe un mensaje…',
    send: 'Enviar',
    sendFailed: 'Lo sentimos, no se pudo enviar. Inténtalo de nuevo.',
    connectingAgent: 'Te estamos conectando con un agente de soporte. Espera un momento…',
    contactEmail: {
      title: '¿A qué correo enviamos la respuesta?',
      body: 'Estamos fuera del horario de atención, así que nuestro equipo responderá por correo.',
      placeholder: 'tu@ejemplo.com',
      submit: 'Guardar',
      failed: 'No se pudo guardar esa dirección. Revísala e inténtalo de nuevo.',
      privacy: 'Solo se usa para responder a esta consulta.',
    },
    typingAi: 'Escribiendo una respuesta…',
    typingAgent: 'Un agente está escribiendo una respuesta…',
    waitingForAgent: 'Esperando a un agente de soporte: su respuesta aparecerá aquí.',
    nextActions: {
      myOrders: 'Mis pedidos',
      shipping: 'Envío y entrega',
      returns: 'Devolver o cambiar',
      agent: 'Hablar con un agente',
    },
    connectAgent: 'Conectar con un agente',
    consent: {
      title: 'Aviso de privacidad',
      body: 'Conforme a la CCPA, procesamos tus mensajes para brindarte soporte y usamos analítica (Google Analytics) para entender el tráfico y mejorar el servicio. ¿Aceptas continuar?',
      accept: 'Aceptar',
      decline: 'Rechazar',
      versionLabel: 'Versión del aviso {{version}}',
      updated: 'Nuestro aviso de privacidad ha cambiado — revísalo y confirma tu elección de nuevo.',
      items: 'Qué recopilamos: tus mensajes de chat, las consultas de pedidos que solicitas y datos básicos del dispositivo.',
      purpose: 'Para qué: responder tus preguntas y brindarte soporte al cliente.',
      retention: 'Retención: los datos del chat se conservan hasta 365 días y luego se eliminan.',
      aiProcessor: 'IA: los mensajes son procesados por un proveedor externo de IA en Estados Unidos.',
      policyLink: 'Política de privacidad',
      privacyChoices: 'Opciones de privacidad y mis datos',
      saveError: 'No pudimos guardar tu elección. Inténtalo de nuevo.',
      retry: 'Reintentar',
    },
    scenarios: {
      delivery: 'Estado del envío',
      cancelRefund: 'Cancelar / Reembolsar',
      productHelp: 'Ayuda con el producto',
      contact: 'Contactar con soporte',
      affiliate: 'Afiliados',
      myOrders: 'Mis pedidos',
    },
    productHelp: {
      usage: 'Uso',
      ingredients: 'Ingredientes',
      exchange: 'Cambio · Devolución',
      restock: 'Aviso de reposición',
      back: 'Atrás',
    },
    templates: {
      cancelRefund: 'Me gustaría cancelar o solicitar un reembolso de mi pedido.',
      usage: '¿Cómo uso este producto?',
      ingredients: '¿Cuáles son los ingredientes de este producto?',
      exchange: 'Me gustaría cambiar o devolver un artículo.',
      restock: 'Avísenme cuando este producto vuelva a estar disponible.',
    },
  },

  auth: {
    title: 'Verifica tu identidad',
    body: 'Para acceder a esta información, inicia sesión o busca un pedido como invitado.',
    signIn: 'Iniciar sesión',
    guestLookup: 'Buscar pedido como invitado',
    orderNumber: 'Número de pedido',
    email: 'Correo electrónico',
    submit: 'Buscar pedido',
    cancel: 'Cancelar',
    waiting: 'Esperando a que inicies sesión…',
    lookupFailed: "No encontramos un pedido con ese número y correo. Revisa ambos e inténtalo de nuevo.",
    lookupThrottled: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
    useGuestInstead: 'Buscar por número de pedido',
  },

  contact: {
    title: 'Contactar con soporte',
    phone: '1588-0000',
    hours: 'Lun–Vie 10:00–18:00',
    email: 'help@ivy.com',
    chatAgent: 'Chatear con un agente',
  },

  affiliate: {
    title: 'Programa de afiliados',
    steps: [
      'Solicita unirte al programa',
      'La revisión tarda de 1 a 3 días hábiles',
      'Gana un 10 % de comisión por referidos',
    ],
    apply: 'Solicitar ahora',
    pending: 'Tu solicitud está en revisión.',
    approved: '¡Eres un afiliado aprobado!',
  },

  orders: {
    subtabs: {
      payments: 'Pagos',
      shipping: 'Envíos',
      inquiries: 'Consultas',
    },
    empty: 'No se encontraron pedidos.',
    ask: 'Preguntar sobre este pedido',
    askMessage: 'Tengo una pregunta sobre el pedido n.º {{orderNumber}}.',
    trackingSteps: ['En preparación', 'Enviado', 'En tránsito', 'Entregado'],
    track: 'Rastrear',
    detail: 'Detalle del pedido',
    items: 'Artículos',
    total: 'Total',
    writeReview: 'Escribir una reseña',
    back: 'Atrás',
  },

  review: {
    title: 'Escribir una reseña',
    rating: 'Tu valoración',
    placeholder: 'Comparte tu experiencia…',
    submit: 'Enviar reseña',
    thanks: '¡Gracias por tu reseña!',
    stars_one: '{{count}} estrella',
    stars_other: '{{count}} estrellas',
  },

  prefs: {
    title: 'Preferencias de notificación',
    channels: {
      in_app: 'En la app',
      email: 'Correo electrónico',
      sms: 'SMS',
      web_push: 'Notificaciones web',
    },
    categories: {
      payment: 'Pago',
      shipping: 'Envío',
      event: 'Evento',
      review: 'Reseña',
    },
    alwaysOn: 'Siempre activo',
    ccpa: 'CCPA: No vender ni compartir mi información personal',
  },

  privacy: {
    title: 'Privacidad y tus datos',
    consent: {
      title: 'Consentimiento de chat e IA',
      state: {
        granted: 'Consentimiento otorgado',
        declined: 'Consentimiento retirado',
        pending: 'Aún no se ha registrado ninguna elección',
      },
      grantedAt: 'El {{date}}',
      version: 'Versión del aviso {{version}}',
      pendingHint: 'Abre la pestaña de chat para revisar el aviso de privacidad y hacer tu elección.',
      withdraw: 'Retirar consentimiento',
      withdrawConfirm: 'Haz clic de nuevo para confirmar la retirada',
      withdrawHint: 'Si lo retiras, el chat y el procesamiento con IA se detienen hasta que vuelvas a consentir.',
      reconsent: 'Dar consentimiento de nuevo',
      saved: 'Tu elección de consentimiento se ha guardado.',
      error: 'No pudimos guardar tu elección. Inténtalo de nuevo.',
      unavailable: 'El estado del consentimiento no está disponible ahora. Comprueba tu conexión y vuelve a abrir el widget.',
    },
    optOutHint: 'Desactiva los mensajes por correo, SMS y push web de tu cuenta. Los avisos en la app siguen activos.',
    export: 'Descargar mis datos (JSON)',
    exporting: 'Preparando tu exportación…',
    delete: 'Eliminar mis datos',
    deleteConfirm: 'Haz clic de nuevo para confirmar — no se puede deshacer',
    deleteDone: 'Tus datos personales han sido anonimizados.',
    needVerified: 'Primero inicia sesión en tu cuenta de la tienda — esta acción requiere una identidad verificada.',
  },

  common: {
    loading: 'Cargando…',
    error: 'Algo salió mal.',
    crashTitle: 'Algo falló de nuestro lado.',
    crashBody:
      'El resto del widget sigue funcionando. Inténtalo de nuevo o cambia de pestaña y vuelve.',
    retry: 'Reintentar',
    close: 'Cerrar',
  },

  a11y: {
    supportWidget: 'Widget de soporte',
    openSupport: 'Abrir soporte',
    closeSupport: 'Cerrar soporte',
    close: 'Cerrar',
    messageThread: 'Hilo de mensajes',
    verifyIdentity: 'Verifica tu identidad',
    privacyNotice: 'Aviso de privacidad',
  },
};
