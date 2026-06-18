export const en = {
  appName: 'IVY USA',
  notificationCenter: 'Notification Center',
  settings: 'Settings',

  tab: {
    notifications: 'Notifications',
    chat: 'Chat',
    orders: 'Orders',
  },

  notifications: {
    empty: 'No notifications yet.',
    filters: {
      all: 'All',
      payment: 'Payment',
      shipping: 'Shipping',
      event: 'Event',
      review: 'Review',
    },
  },

  chat: {
    welcome:
      "Hi! Welcome to IVY USA. How can we help you today? Pick a topic below or type your question.",
    aiDisclosure: 'This chat is AI-powered for faster assistance.',
    inputPlaceholder: 'Type a message…',
    send: 'Send',
    connectAgent: 'Connect to an agent',
    consent: {
      title: 'Privacy notice',
      body: 'Under the CCPA, we process your messages to provide support. Do you consent to continue?',
      accept: 'Accept',
      decline: 'Decline',
    },
    scenarios: {
      delivery: 'Delivery Status',
      cancelRefund: 'Cancel / Refund',
      productHelp: 'Product Help',
      contact: 'Contact Support',
      affiliate: 'Affiliate',
      myOrders: 'My Orders',
    },
    productHelp: {
      usage: 'Usage',
      ingredients: 'Ingredients',
      exchange: 'Exchange · Return',
      restock: 'Restock alert',
      back: 'Back',
    },
    templates: {
      cancelRefund: 'I would like to cancel or request a refund for my order.',
      usage: 'How do I use this product?',
      ingredients: 'What are the ingredients in this product?',
      exchange: 'I would like to exchange or return an item.',
      restock: 'Please notify me when this product is back in stock.',
    },
  },

  auth: {
    title: 'Verify your identity',
    body: 'To access this information, please sign in or look up a guest order.',
    signIn: 'Sign in',
    guestLookup: 'Guest order lookup',
    orderNumber: 'Order number',
    email: 'Email',
    submit: 'Look up order',
    cancel: 'Cancel',
  },

  contact: {
    title: 'Contact Support',
    phone: '1588-0000',
    hours: 'Mon–Fri 10:00–18:00',
    email: 'help@ivy.com',
    chatAgent: 'Chat with an agent',
  },

  affiliate: {
    title: 'Affiliate Program',
    steps: [
      'Apply to join the program',
      'Review takes 1–3 business days',
      'Earn 10% commission on referrals',
    ],
    apply: 'Apply now',
    pending: 'Your application is under review.',
    approved: 'You are an approved affiliate!',
  },

  orders: {
    subtabs: {
      payments: 'Payments',
      shipping: 'Shipping',
      inquiries: 'Inquiries',
    },
    empty: 'No orders found.',
    ask: 'Ask about this order',
    track: 'Track',
    detail: 'Order detail',
    items: 'Items',
    total: 'Total',
    writeReview: 'Write a review',
    back: 'Back',
  },

  review: {
    title: 'Write a review',
    rating: 'Your rating',
    placeholder: 'Share your experience…',
    submit: 'Submit review',
    thanks: 'Thanks for your review!',
  },

  prefs: {
    title: 'Notification preferences',
    channels: {
      in_app: 'In-app',
      email: 'Email',
      sms: 'SMS',
      web_push: 'Web push',
    },
    categories: {
      payment: 'Payment',
      shipping: 'Shipping',
      event: 'Event',
      review: 'Review',
    },
    alwaysOn: 'Always on',
    ccpa: 'CCPA: Do not sell or share my personal information',
  },

  common: {
    loading: 'Loading…',
    error: 'Something went wrong.',
    retry: 'Retry',
  },
};

export type Translation = typeof en;
