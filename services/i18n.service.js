// ============================================
// FILE: services/i18n.service.js
// Internationalization Service
// VERSION: 1.0
// ============================================

class I18nService {
  constructor() {
    this.defaultLocale = 'en';
    this.supportedLocales = ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi'];
    
    // Translation dictionaries
    this.translations = {
      en: {
        // Common
        'common.welcome': 'Welcome',
        'common.hello': 'Hello',
        'common.goodbye': 'Goodbye',
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.ok': 'OK',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.create': 'Create',
        'common.search': 'Search',
        'common.loading': 'Loading...',
        'common.error': 'Error',
        'common.success': 'Success',
        
        // Auth
        'auth.login': 'Log In',
        'auth.signup': 'Sign Up',
        'auth.logout': 'Log Out',
        'auth.email': 'Email',
        'auth.password': 'Password',
        'auth.forgotPassword': 'Forgot Password?',
        'auth.resetPassword': 'Reset Password',
        'auth.verifyEmail': 'Verify Email',
        'auth.invalidCredentials': 'Invalid email or password',
        'auth.accountCreated': 'Account created successfully',
        'auth.emailSent': 'Email sent successfully',
        
        // Navigation
        'nav.home': 'Home',
        'nav.feed': 'Feed',
        'nav.explore': 'Explore',
        'nav.notifications': 'Notifications',
        'nav.messages': 'Messages',
        'nav.profile': 'Profile',
        'nav.settings': 'Settings',
        'nav.live': 'Live',
        'nav.events': 'Events',
        'nav.groups': 'Groups',
        
        // Posts
        'post.create': 'Create Post',
        'post.whatsOnMind': "What's on your mind?",
        'post.like': 'Like',
        'post.comment': 'Comment',
        'post.share': 'Share',
        'post.save': 'Save',
        'post.report': 'Report',
        'post.delete': 'Delete Post',
        'post.edit': 'Edit Post',
        'post.comments': 'Comments',
        'post.noComments': 'No comments yet',
        'post.writeComment': 'Write a comment...',
        
        // Profile
        'profile.followers': 'Followers',
        'profile.following': 'Following',
        'profile.posts': 'Posts',
        'profile.blogs': 'Blogs',
        'profile.follow': 'Follow',
        'profile.unfollow': 'Unfollow',
        'profile.editProfile': 'Edit Profile',
        'profile.bio': 'Bio',
        
        // Notifications
        'notif.liked': 'liked your post',
        'notif.commented': 'commented on your post',
        'notif.followed': 'started following you',
        'notif.mentioned': 'mentioned you',
        'notif.newMessage': 'sent you a message',
        'notif.goingLive': 'is going live',
        'notif.eventReminder': 'Event starting soon',
        
        // Time
        'time.now': 'just now',
        'time.minutesAgo': '{n} minutes ago',
        'time.hoursAgo': '{n} hours ago',
        'time.daysAgo': '{n} days ago',
        'time.weeksAgo': '{n} weeks ago',
        'time.monthsAgo': '{n} months ago',
        'time.yearsAgo': '{n} years ago',
        
        // Errors
        'error.notFound': 'Not found',
        'error.unauthorized': 'Unauthorized',
        'error.forbidden': 'Access denied',
        'error.serverError': 'Server error',
        'error.networkError': 'Network error',
        'error.tryAgain': 'Please try again',
        
        // Settings
        'settings.account': 'Account',
        'settings.privacy': 'Privacy',
        'settings.notifications': 'Notifications',
        'settings.appearance': 'Appearance',
        'settings.language': 'Language',
        'settings.darkMode': 'Dark Mode',
        'settings.deleteAccount': 'Delete Account'
      },
      
      es: {
        // Common
        'common.welcome': 'Bienvenido',
        'common.hello': 'Hola',
        'common.goodbye': 'Adiós',
        'common.yes': 'Sí',
        'common.no': 'No',
        'common.ok': 'OK',
        'common.cancel': 'Cancelar',
        'common.save': 'Guardar',
        'common.delete': 'Eliminar',
        'common.edit': 'Editar',
        'common.create': 'Crear',
        'common.search': 'Buscar',
        'common.loading': 'Cargando...',
        'common.error': 'Error',
        'common.success': 'Éxito',
        
        // Auth
        'auth.login': 'Iniciar Sesión',
        'auth.signup': 'Registrarse',
        'auth.logout': 'Cerrar Sesión',
        'auth.email': 'Correo electrónico',
        'auth.password': 'Contraseña',
        'auth.forgotPassword': '¿Olvidaste tu contraseña?',
        'auth.resetPassword': 'Restablecer contraseña',
        'auth.verifyEmail': 'Verificar correo',
        'auth.invalidCredentials': 'Correo o contraseña inválidos',
        'auth.accountCreated': 'Cuenta creada exitosamente',
        'auth.emailSent': 'Correo enviado exitosamente',
        
        // Navigation
        'nav.home': 'Inicio',
        'nav.feed': 'Feed',
        'nav.explore': 'Explorar',
        'nav.notifications': 'Notificaciones',
        'nav.messages': 'Mensajes',
        'nav.profile': 'Perfil',
        'nav.settings': 'Configuración',
        'nav.live': 'En vivo',
        'nav.events': 'Eventos',
        'nav.groups': 'Grupos',
        
        // Posts
        'post.create': 'Crear publicación',
        'post.whatsOnMind': '¿Qué estás pensando?',
        'post.like': 'Me gusta',
        'post.comment': 'Comentar',
        'post.share': 'Compartir',
        'post.save': 'Guardar',
        'post.report': 'Reportar',
        'post.delete': 'Eliminar publicación',
        'post.edit': 'Editar publicación',
        'post.comments': 'Comentarios',
        'post.noComments': 'Sin comentarios aún',
        'post.writeComment': 'Escribe un comentario...',
        
        // Profile
        'profile.followers': 'Seguidores',
        'profile.following': 'Siguiendo',
        'profile.posts': 'Publicaciones',
        'profile.blogs': 'Blogs',
        'profile.follow': 'Seguir',
        'profile.unfollow': 'Dejar de seguir',
        'profile.editProfile': 'Editar perfil',
        'profile.bio': 'Biografía',
        
        // Notifications
        'notif.liked': 'le gustó tu publicación',
        'notif.commented': 'comentó en tu publicación',
        'notif.followed': 'comenzó a seguirte',
        'notif.mentioned': 'te mencionó',
        'notif.newMessage': 'te envió un mensaje',
        'notif.goingLive': 'está en vivo',
        'notif.eventReminder': 'Evento próximo',
        
        // Settings
        'settings.account': 'Cuenta',
        'settings.privacy': 'Privacidad',
        'settings.notifications': 'Notificaciones',
        'settings.appearance': 'Apariencia',
        'settings.language': 'Idioma',
        'settings.darkMode': 'Modo oscuro',
        'settings.deleteAccount': 'Eliminar cuenta'
      },
      
      fr: {
        // Common
        'common.welcome': 'Bienvenue',
        'common.hello': 'Bonjour',
        'common.goodbye': 'Au revoir',
        'common.yes': 'Oui',
        'common.no': 'Non',
        'common.ok': 'OK',
        'common.cancel': 'Annuler',
        'common.save': 'Enregistrer',
        'common.delete': 'Supprimer',
        'common.edit': 'Modifier',
        'common.create': 'Créer',
        'common.search': 'Rechercher',
        'common.loading': 'Chargement...',
        'common.error': 'Erreur',
        'common.success': 'Succès',
        
        // Auth
        'auth.login': 'Se connecter',
        'auth.signup': "S'inscrire",
        'auth.logout': 'Se déconnecter',
        'auth.email': 'E-mail',
        'auth.password': 'Mot de passe',
        'auth.forgotPassword': 'Mot de passe oublié ?',
        
        // Navigation
        'nav.home': 'Accueil',
        'nav.feed': 'Fil',
        'nav.explore': 'Explorer',
        'nav.notifications': 'Notifications',
        'nav.messages': 'Messages',
        'nav.profile': 'Profil',
        'nav.settings': 'Paramètres',
        
        // Posts
        'post.create': 'Créer une publication',
        'post.like': "J'aime",
        'post.comment': 'Commenter',
        'post.share': 'Partager',
        
        // Profile
        'profile.followers': 'Abonnés',
        'profile.following': 'Abonnements',
        'profile.follow': "S'abonner",
        'profile.unfollow': 'Se désabonner'
      },
      
      de: {
        'common.welcome': 'Willkommen',
        'common.hello': 'Hallo',
        'common.goodbye': 'Auf Wiedersehen',
        'auth.login': 'Anmelden',
        'auth.signup': 'Registrieren',
        'nav.home': 'Startseite',
        'nav.feed': 'Feed',
        'post.like': 'Gefällt mir',
        'post.comment': 'Kommentieren',
        'profile.followers': 'Follower',
        'profile.following': 'Folge ich'
      },
      
      pt: {
        'common.welcome': 'Bem-vindo',
        'common.hello': 'Olá',
        'auth.login': 'Entrar',
        'auth.signup': 'Cadastrar',
        'nav.home': 'Início',
        'nav.feed': 'Feed',
        'post.like': 'Curtir',
        'post.comment': 'Comentar',
        'profile.followers': 'Seguidores',
        'profile.following': 'Seguindo'
      },
      
      zh: {
        'common.welcome': '欢迎',
        'common.hello': '你好',
        'auth.login': '登录',
        'auth.signup': '注册',
        'nav.home': '首页',
        'nav.feed': '动态',
        'post.like': '点赞',
        'post.comment': '评论',
        'profile.followers': '粉丝',
        'profile.following': '关注'
      },
      
      ja: {
        'common.welcome': 'ようこそ',
        'common.hello': 'こんにちは',
        'auth.login': 'ログイン',
        'auth.signup': '登録',
        'nav.home': 'ホーム',
        'post.like': 'いいね',
        'profile.followers': 'フォロワー'
      },
      
      ko: {
        'common.welcome': '환영합니다',
        'common.hello': '안녕하세요',
        'auth.login': '로그인',
        'auth.signup': '가입',
        'nav.home': '홈',
        'post.like': '좋아요',
        'profile.followers': '팔로워'
      },
      
      ar: {
        'common.welcome': 'أهلاً بك',
        'common.hello': 'مرحباً',
        'auth.login': 'تسجيل الدخول',
        'auth.signup': 'إنشاء حساب',
        'nav.home': 'الرئيسية',
        'post.like': 'إعجاب',
        'profile.followers': 'المتابعون'
      },
      
      hi: {
        'common.welcome': 'स्वागत है',
        'common.hello': 'नमस्ते',
        'auth.login': 'लॉग इन',
        'auth.signup': 'साइन अप',
        'nav.home': 'होम',
        'post.like': 'लाइक',
        'profile.followers': 'फॉलोअर्स'
      }
    };

    console.log('🌍 i18n Service initialized');
    console.log(`   Supported locales: ${this.supportedLocales.join(', ')}`);
  }

  /**
   * Get translation for a key
   */
  t(key, locale = this.defaultLocale, params = {}) {
    const translations = this.translations[locale] || this.translations[this.defaultLocale];
    let text = translations[key] || this.translations[this.defaultLocale][key] || key;

    // Replace parameters
    Object.entries(params).forEach(([param, value]) => {
      text = text.replace(`{${param}}`, value);
    });

    return text;
  }

  /**
   * Get all translations for a locale
   */
  getTranslations(locale) {
    return this.translations[locale] || this.translations[this.defaultLocale];
  }

  /**
   * Check if locale is supported
   */
  isSupported(locale) {
    return this.supportedLocales.includes(locale);
  }

  /**
   * Get supported locales
   */
  getSupportedLocales() {
    return this.supportedLocales.map(code => ({
      code,
      name: this.getLocaleName(code),
      nativeName: this.getNativeLocaleName(code)
    }));
  }

  /**
   * Get locale name in English
   */
  getLocaleName(code) {
    const names = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      ar: 'Arabic',
      hi: 'Hindi'
    };
    return names[code] || code;
  }

  /**
   * Get locale name in native language
   */
  getNativeLocaleName(code) {
    const names = {
      en: 'English',
      es: 'Español',
      fr: 'Français',
      de: 'Deutsch',
      pt: 'Português',
      zh: '中文',
      ja: '日本語',
      ko: '한국어',
      ar: 'العربية',
      hi: 'हिन्दी'
    };
    return names[code] || code;
  }

  /**
   * Detect locale from Accept-Language header
   */
  detectLocale(acceptLanguage) {
    if (!acceptLanguage) return this.defaultLocale;
    
    const languages = acceptLanguage
      .split(',')
      .map(lang => {
        const [code, q = '1'] = lang.trim().split(';q=');
        return { code: code.split('-')[0], quality: parseFloat(q) };
      })
      .sort((a, b) => b.quality - a.quality);

    for (const { code } of languages) {
      if (this.isSupported(code)) {
        return code;
      }
    }

    return this.defaultLocale;
  }

  /**
   * Format relative time
   */
  formatRelativeTime(date, locale = this.defaultLocale) {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return this.t('time.now', locale);
    if (minutes < 60) return this.t('time.minutesAgo', locale, { n: minutes });
    if (hours < 24) return this.t('time.hoursAgo', locale, { n: hours });
    if (days < 7) return this.t('time.daysAgo', locale, { n: days });
    if (weeks < 4) return this.t('time.weeksAgo', locale, { n: weeks });
    if (months < 12) return this.t('time.monthsAgo', locale, { n: months });
    return this.t('time.yearsAgo', locale, { n: years });
  }

  /**
   * Format number for locale
   */
  formatNumber(num, locale = this.defaultLocale) {
    return new Intl.NumberFormat(locale).format(num);
  }

  /**
   * Format date for locale
   */
  formatDate(date, locale = this.defaultLocale, options = {}) {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      ...options
    }).format(new Date(date));
  }
}

module.exports = new I18nService();
