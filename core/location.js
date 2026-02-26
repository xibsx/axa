/* ===== SAMS Location Module ===== */

class SamsLocation {
    constructor() {
        this.currentPosition = null;
        this.watchId = null;
    }
    
    // Get current position
    async getCurrentPosition(options = {}) {
        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
        
        const opts = { ...defaultOptions, ...options };
        
        return new Promise((resolve, reject) => {
            if(!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: position.timestamp
                    };
                    resolve(this.currentPosition);
                },
                (error) => {
                    reject(this.handleLocationError(error));
                },
                opts
            );
        });
    }
    
    // Watch position changes
    watchPosition(callback, options = {}) {
        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        };
        
        const opts = { ...defaultOptions, ...options };
        
        this.watchId = navigator.geolocation.watchPosition(
            (position) => {
                const pos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                this.currentPosition = pos;
                callback(pos);
            },
            (error) => {
                callback(null, this.handleLocationError(error));
            },
            opts
        );
        
        return this.watchId;
    }
    
    // Stop watching
    stopWatching() {
        if(this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
    }
    
    // Calculate distance between two points (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI/180;
        const φ2 = lat2 * Math.PI/180;
        const Δφ = (lat2-lat1) * Math.PI/180;
        const Δλ = (lon2-lon1) * Math.PI/180;
        
        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c; // Distance in meters
    }
    
    // Check if point is inside circle (radius)
    isInRadius(pointLat, pointLon, centerLat, centerLon, radius, buffer = 5) {
        const distance = this.calculateDistance(pointLat, pointLon, centerLat, centerLon);
        return distance <= (radius + buffer);
    }
    
    // Check if point is inside polygon (rectangle from 4 points)
    isInPolygon(point, polygon) {
        // Ray casting algorithm
        let inside = false;
        for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lat, yi = polygon[i].lng;
            const xj = polygon[j].lat, yj = polygon[j].lng;
            
            const intersect = ((yi > point.lng) !== (yj > point.lng)) &&
                (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
            if(intersect) inside = !inside;
        }
        return inside;
    }
    
    // Get address from coordinates (reverse geocoding)
    async getAddress(lat, lng) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
            );
            const data = await response.json();
            return data.display_name;
        } catch(error) {
            console.error('Reverse geocoding failed:', error);
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }
    
    // Format coordinates for display
    formatCoordinates(lat, lng, format = 'dd') {
        if(format === 'dms') {
            return this.toDMS(lat, lng);
        }
        return `${lat.toFixed(6)}°, ${lng.toFixed(6)}°`;
    }
    
    // Convert to Degrees Minutes Seconds
    toDMS(lat, lng) {
        const latDir = lat >= 0 ? 'N' : 'S';
        const lngDir = lng >= 0 ? 'E' : 'W';
        
        const latAbs = Math.abs(lat);
        const lngAbs = Math.abs(lng);
        
        const latDeg = Math.floor(latAbs);
        const latMin = Math.floor((latAbs - latDeg) * 60);
        const latSec = ((latAbs - latDeg - latMin/60) * 3600).toFixed(2);
        
        const lngDeg = Math.floor(lngAbs);
        const lngMin = Math.floor((lngAbs - lngDeg) * 60);
        const lngSec = ((lngAbs - lngDeg - lngMin/60) * 3600).toFixed(2);
        
        return `${latDeg}°${latMin}'${latSec}"${latDir} ${lngDeg}°${lngMin}'${lngSec}"${lngDir}`;
    }
    
    // Handle location errors
    handleLocationError(error) {
        const errors = {
            1: 'Permission denied. Please enable location access.',
            2: 'Position unavailable. Check GPS.',
            3: 'Location request timed out.'
        };
        return errors[error.code] || 'Unknown location error';
    }
    
    // Check if location is accurate enough
    isAccurate(accuracy, threshold = 20) {
        return accuracy <= threshold;
    }
    
    // Get cached location
    getCachedLocation() {
        return this.currentPosition;
    }
}

// Initialize
const Location = new SamsLocation();
