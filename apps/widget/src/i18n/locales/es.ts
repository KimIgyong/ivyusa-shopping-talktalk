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
    aiDisclosure: 'Este chat funciona con IA para brindarte una atención más rápida.',
    inputPlaceholder: 'Escribe un mensaje…',
    send: 'Enviar',
    connectAgent: 'Conectar con un agente',
    consent: {
      title: 'Aviso de privacidad',
      body: 'Conforme a la CCPA, procesamos tus mensajes para brindarte soporte. ¿Aceptas continuar?',
      accept: 'Aceptar',
      decline: 'Rechazar',
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

  common: {
    loading: 'Cargando…',
    error: 'Algo salió mal.',
    retry: 'Reintentar',
  },
};
