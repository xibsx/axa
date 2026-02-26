/* ===== SAMS Authentication Module ===== */

class SamsAuth {
    constructor() {
        this.currentUser = null;
        this.loadUser();
    }
    
    // Load user from localStorage
    loadUser() {
        const saved = localStorage.getItem(CONFIG.storage.user);
        if(saved) {
            this.currentUser = JSON.parse(saved);
        }
    }
    
    // Login with reg + email + passkey
    async login(regNumber, email, passkey) {
        try {
            // Check offline first
            const localUser = await this.checkLocalUser(regNumber);
            if(localUser && localUser.passkey === passkey) {
                this.setUser(localUser);
                return { success: true, offline: true };
            }
            
            // If online, check server
            if(navigator.onLine) {
                const response = await fetch(`${CONFIG.api.base}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ regNumber, email, passkey })
                });
                
                if(response.ok) {
                    const user = await response.json();
                    this.setUser(user);
                    return { success: true };
                }
            }
            
            return { success: false, message: 'Invalid credentials' };
        } catch(error) {
            console.error('Login error:', error);
            return { success: false, message: 'Login failed' };
        }
    }
    
    // Offline login (passkey only)
    offlineLogin(regNumber, passkey) {
        const localUser = localStorage.getItem(`user_${regNumber}`);
        if(localUser) {
            const user = JSON.parse(localUser);
            if(user.passkey === passkey) {
                this.setUser(user);
                return { success: true };
            }
        }
        return { success: false, message: 'Invalid offline credentials' };
    }
    
    // Register new user
    async register(userData) {
        try {
            // Save locally for offline
            this.saveLocalUser(userData);
            
            // Send verification code via WhatsApp
            await this.sendVerificationCode(userData.whatsapp);
            
            return { success: true, message: 'Verification code sent' };
        } catch(error) {
            console.error('Registration error:', error);
            return { success: false, message: 'Registration failed' };
        }
    }
    
    // Verify WhatsApp code
    async verifyCode(regNumber, code) {
        if(navigator.onLine) {
            try {
                const response = await fetch(`${CONFIG.api.base}/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ regNumber, code })
                });
                
                if(response.ok) {
                    const user = await response.json();
                    this.setUser(user);
                    return { success: true };
                }
            } catch(error) {
                console.error('Verification error:', error);
            }
        }
        
        // Mock verification for demo
        if(code === '123456') {
            const user = JSON.parse(localStorage.getItem(`user_${regNumber}`));
            user.verified = true;
            this.saveLocalUser(user);
            this.setUser(user);
            return { success: true };
        }
        
        return { success: false, message: 'Invalid code' };
    }
    
    // Send WhatsApp verification
    async sendVerificationCode(whatsapp) {
        const code = Math.floor(100000 + Math.random() * 900000);
        localStorage.setItem(`verify_${whatsapp}`, code);
        
        if(navigator.onLine) {
            const url = `${CONFIG.api.whatsapp}?to=${whatsapp}&text=Your%20SAMS%20verification%20code:%20${code}`;
            await fetch(url);
        }
        
        // Store expiry (5 minutes)
        setTimeout(() => {
            localStorage.removeItem(`verify_${whatsapp}`);
        }, 300000);
        
        return code;
    }
    
    // Create passkey
    createPasskey(regNumber, passkey) {
        if(passkey.length < CONFIG.validation.passkeyMin || 
           passkey.length > CONFIG.validation.passkeyMax) {
            return { success: false, message: `Passkey must be ${CONFIG.validation.passkeyMin}-${CONFIG.validation.passkeyMax} digits` };
        }
        
        if(!CONFIG.validation.passkeyPattern.test(passkey)) {
            return { success: false, message: 'Passkey must contain only digits' };
        }
        
        const user = JSON.parse(localStorage.getItem(`user_${regNumber}`));
        user.passkey = passkey;
        
        // Set expiry (30 days)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + CONFIG.defaults.passkeyExpiry);
        user.passkeyExpiry = expiry.toISOString();
        
        this.saveLocalUser(user);
        
        return { success: true, expiry: user.passkeyExpiry };
    }
    
    // Check passkey expiry
    checkPasskeyExpiry(regNumber) {
        const user = JSON.parse(localStorage.getItem(`user_${regNumber}`));
        if(!user || !user.passkeyExpiry) return true;
        
        const expiry = new Date(user.passkeyExpiry);
        const now = new Date();
        
        return now > expiry;
    }
    
    // Forgot passkey - send temporary via WhatsApp
    async forgotPasskey(regNumber) {
        const user = JSON.parse(localStorage.getItem(`user_${regNumber}`));
        if(!user) return { success: false, message: 'User not found' };
        
        const tempPasskey = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Store temporary
        localStorage.setItem(`temp_${regNumber}`, tempPasskey);
        
        // Send via WhatsApp
        if(navigator.onLine) {
            const url = `${CONFIG.api.whatsapp}?to=${user.whatsapp}&text=Your%20temporary%20SAMS%20passkey:%20${tempPasskey}`;
            await fetch(url);
        }
        
        // Expire in 10 minutes
        setTimeout(() => {
            localStorage.removeItem(`temp_${regNumber}`);
        }, 600000);
        
        return { success: true, message: 'Temporary passkey sent' };
    }
    
    // Set current user
    setUser(user) {
        this.currentUser = user;
        localStorage.setItem(CONFIG.storage.user, JSON.stringify(user));
    }
    
    // Save user locally
    saveLocalUser(user) {
        localStorage.setItem(`user_${user.regNumber}`, JSON.stringify(user));
    }
    
    // Logout
    logout() {
        this.currentUser = null;
        localStorage.removeItem(CONFIG.storage.user);
    }
    
    // Check local user exists
    checkLocalUser(regNumber) {
        const user = localStorage.getItem(`user_${regNumber}`);
        return user ? JSON.parse(user) : null;
    }
    
    // Get current user
    getCurrentUser() {
        return this.currentUser;
    }
    
    // Check if user has role
    hasRole(role) {
        return this.currentUser && this.currentUser.role === role;
    }
}

// Initialize
const Auth = new SamsAuth();
