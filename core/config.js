/* ===== SAMS Configuration ===== */

const CONFIG = {
    // App Info
    appName: 'SAMS',
    version: '1.0.0',
    buildDate: '2026-02-26',
    
    // API Endpoints
    api: {
        whatsapp: 'https://wa-api.nior.space/api/send',
        base: window.location.hostname === 'localhost' 
            ? 'http://localhost:3000/api' 
            : 'https://sams.xibs.space/api'
    },
    
    // Default Settings
    defaults: {
        timezone: 'Africa/Dar_es_Salaam',
        locationRadius: 30, // meters
        locationBuffer: 5,   // meters tolerance
        passkeyExpiry: 30,   // days
        offlineWindow: 3,    // hours to accept offline signs
        maxCRsPerCourse: 4
    },
    
    // Feature Flags
    features: {
        offlineMode: true,
        whatsappVerification: true,
        anonymousComments: false,
        darkMode: true,
        jsonBackup: true
    },
    
    // Storage Keys
    storage: {
        user: 'sams_user',
        theme: 'sams_theme',
        offlineQueue: 'sams_offline_queue',
        pendingAttendance: 'sams_pending'
    },
    
    // Paths
    paths: {
        data: '/data/json/',
        backup: '/data/json/backup/',
        users: '/data/json/colleges/'
    },
    
    // Validation Rules
    validation: {
        passkeyMin: 4,
        passkeyMax: 6,
        passkeyPattern: /^\d+$/, // only digits
        whatsappPattern: /^\+[1-9]\d{1,14}$/
    },
    
    // Messages
    messages: {
        offline: 'You are offline. Changes will sync when connection restored.',
        locationRequired: 'Please enable location to sign attendance.',
        passkeyExpired: 'Your passkey has expired. Create a new one.',
        syncComplete: 'Sync complete!'
    }
};

// Freeze config to prevent modifications
Object.freeze(CONFIG);
