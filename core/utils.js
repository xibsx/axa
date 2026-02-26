/* ===== SAMS Utility Functions ===== */

const Utils = {
    // Format date
    formatDate(date, format = 'short') {
        const d = new Date(date);
        
        if(format === 'short') {
            return d.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        }
        
        if(format === 'long') {
            return d.toLocaleDateString('en-GB', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
        }
        
        if(format === 'time') {
            return d.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        if(format === 'datetime') {
            return d.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        return d.toISOString();
    },
    
    // Format relative time (e.g., "2 hours ago")
    timeAgo(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60,
            second: 1
        };
        
        for(const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if(interval >= 1) {
                return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
            }
        }
        
        return 'just now';
    },
    
    // Generate random ID
    generateId(prefix = '') {
        return prefix + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },
    
    // Validate email
    isValidEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    // Validate WhatsApp number
    isValidWhatsApp(number) {
        const re = /^\+[1-9]\d{1,14}$/;
        return re.test(number);
    },
    
    // Validate passkey
    isValidPasskey(passkey) {
        return passkey && 
               passkey.length >= 4 && 
               passkey.length <= 6 && 
               /^\d+$/.test(passkey);
    },
    
    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if(!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // Copy to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch(err) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            return true;
        }
    },
    
    // Download file
    downloadFile(content, filename, type = 'application/json') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },
    
    // Parse query string
    getQueryParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        for(const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },
    
    // Store data with expiry
    setWithExpiry(key, value, ttl) {
        const item = {
            value: value,
            expiry: new Date().getTime() + ttl
        };
        localStorage.setItem(key, JSON.stringify(item));
    },
    
    // Get data with expiry check
    getWithExpiry(key) {
        const itemStr = localStorage.getItem(key);
        if(!itemStr) return null;
        
        const item = JSON.parse(itemStr);
        const now = new Date().getTime();
        
        if(now > item.expiry) {
            localStorage.removeItem(key);
            return null;
        }
        
        return item.value;
    },
    
    // Group array by key
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if(!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    },
    
    // Sort array by date
    sortByDate(array, field = 'timestamp', ascending = false) {
        return array.sort((a, b) => {
            const dateA = new Date(a[field]);
            const dateB = new Date(b[field]);
            return ascending ? dateA - dateB : dateB - dateA;
        });
    },
    
    // Calculate percentage
    calculatePercentage(part, total) {
        if(total === 0) return 0;
        return Math.round((part / total) * 100);
    },
    
    // Truncate text
    truncate(text, length = 50, suffix = '...') {
        if(text.length <= length) return text;
        return text.substring(0, length) + suffix;
    },
    
    // Capitalize first letter
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    },
    
    // Safe JSON parse
    safeJSONParse(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch {
            return fallback;
        }
    },
    
    // Check if device is mobile
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    // Get device info
    getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            online: navigator.onLine,
            screen: `${window.screen.width}x${window.screen.height}`,
            memory: navigator.deviceMemory || 'unknown'
        };
    }
};
