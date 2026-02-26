/* ===== SAMS Server ===== */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(helmet({
    contentSecurityPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});
app.use('/api/', limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'web')));
app.use('/core', express.static(path.join(__dirname, 'core')));
app.use('/data', express.static(path.join(__dirname, 'data')));

// ===== DATA PATHS =====
const DATA_ROOT = path.join(__dirname, 'data', 'json');
const BACKUP_ROOT = path.join(DATA_ROOT, 'backup');

// Ensure directories exist
fs.ensureDirSync(DATA_ROOT);
fs.ensureDirSync(BACKUP_ROOT);

// ===== API ROUTES =====

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// ===== AUTHENTICATION =====

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { regNumber, email, passkey } = req.body;
        
        // Find user in JSON structure
        const user = await findUser(regNumber);
        
        if(!user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        if(user.email !== email) {
            return res.status(401).json({ error: 'Email mismatch' });
        }
        
        if(user.passkey !== passkey) {
            return res.status(401).json({ error: 'Invalid passkey' });
        }
        
        // Check passkey expiry
        const expiry = new Date(user.passkeyExpiry);
        if(expiry < new Date()) {
            return res.status(401).json({ error: 'Passkey expired' });
        }
        
        res.json({
            success: true,
            user: {
                regNumber: user.regNumber,
                name: user.name,
                email: user.email,
                college: user.college,
                course: user.course,
                role: user.role
            }
        });
    } catch(error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const userData = req.body;
        
        // Generate user ID
        userData.id = uuidv4();
        userData.createdAt = new Date().toISOString();
        userData.verified = false;
        
        // Save user
        const userPath = path.join(DATA_ROOT, 'colleges', userData.college, userData.course, 'users', `${userData.regNumber}.json`);
        await fs.ensureDir(path.dirname(userPath));
        await fs.writeJson(userPath, userData, { spaces: 2 });
        
        res.json({ 
            success: true, 
            message: 'Registration successful. Verify WhatsApp code.',
            regNumber: userData.regNumber
        });
    } catch(error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Verify WhatsApp code
app.post('/api/verify', async (req, res) => {
    const { regNumber, code } = req.body;
    
    // Mock verification (in production, check against stored code)
    if(code === '123456') {
        const user = await findUser(regNumber);
        if(user) {
            user.verified = true;
            await saveUser(user);
            return res.json({ success: true });
        }
    }
    
    res.status(400).json({ error: 'Invalid code' });
});

// ===== ATTENDANCE =====

// Submit attendance
app.post('/api/attendance', async (req, res) => {
    try {
        const { regNumber, eventId, timestamp, location } = req.body;
        
        // Find user
        const user = await findUser(regNumber);
        if(!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Load attendance file
        const attendancePath = path.join(DATA_ROOT, 'colleges', user.college, user.course, 'attendance.json');
        let attendance = await fs.readJson(attendancePath).catch(() => ({ events: [] }));
        
        // Find event
        let event = attendance.events.find(e => e.eventId === eventId);
        if(!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        // Check if already signed
        const alreadySigned = event.attendees.some(a => a.regNumber === regNumber);
        if(alreadySigned) {
            return res.status(400).json({ error: 'Already signed' });
        }
        
        // Add attendance
        event.attendees.push({
            regNumber,
            name: user.name,
            signTime: timestamp,
            location,
            verified: true
        });
        
        event.signedCount = event.attendees.length;
        
        // Save
        await fs.writeJson(attendancePath, attendance, { spaces: 2 });
        
        res.json({ success: true });
    } catch(error) {
        console.error('Attendance error:', error);
        res.status(500).json({ error: 'Failed to save attendance' });
    }
});

// Get user attendance
app.get('/api/attendance/:regNumber', async (req, res) => {
    try {
        const { regNumber } = req.params;
        
        const user = await findUser(regNumber);
        if(!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const attendancePath = path.join(DATA_ROOT, 'colleges', user.college, user.course, 'attendance.json');
        const attendance = await fs.readJson(attendancePath).catch(() => ({ events: [] }));
        
        // Filter user's attendance
        const userAttendance = attendance.events.map(event => ({
            eventId: event.eventId,
            name: event.name,
            date: event.date,
            signed: event.attendees.some(a => a.regNumber === regNumber),
            signTime: event.attendees.find(a => a.regNumber === regNumber)?.signTime
        }));
        
        res.json(userAttendance);
    } catch(error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to fetch attendance' });
    }
});

// ===== EVENTS =====

// Create event
app.post('/api/events', async (req, res) => {
    try {
        const eventData = req.body;
        eventData.eventId = uuidv4();
        eventData.createdAt = new Date().toISOString();
        eventData.attendees = [];
        eventData.signedCount = 0;
        
        // Save to course events
        const eventsPath = path.join(DATA_ROOT, 'colleges', eventData.college, eventData.course, 'events.json');
        let events = await fs.readJson(eventsPath).catch(() => ({ events: [] }));
        
        events.events.push(eventData);
        await fs.writeJson(eventsPath, events, { spaces: 2 });
        
        // Also add to attendance file
        const attendancePath = path.join(DATA_ROOT, 'colleges', eventData.college, eventData.course, 'attendance.json');
        let attendance = await fs.readJson(attendancePath).catch(() => ({ events: [] }));
        attendance.events.push({
            eventId: eventData.eventId,
            name: eventData.name,
            date: eventData.date,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            location: eventData.location,
            attendees: []
        });
        await fs.writeJson(attendancePath, attendance, { spaces: 2 });
        
        res.json({ success: true, eventId: eventData.eventId });
    } catch(error) {
        console.error('Event creation error:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// Get events for course
app.get('/api/events/:college/:course', async (req, res) => {
    try {
        const { college, course } = req.params;
        const eventsPath = path.join(DATA_ROOT, 'colleges', college, course, 'events.json');
        const events = await fs.readJson(eventsPath).catch(() => ({ events: [] }));
        res.json(events.events);
    } catch(error) {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// ===== JSON BACKUP =====

// Download full JSON backup
app.get('/api/backup/download', async (req, res) => {
    try {
        const backupName = `sams-backup-${new Date().toISOString().split('T')[0]}.zip`;
        const backupPath = path.join(BACKUP_ROOT, backupName);
        
        // Create zip archive
        const output = fs.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        archive.pipe(output);
        archive.directory(DATA_ROOT, 'json');
        await archive.finalize();
        
        output.on('close', () => {
            res.download(backupPath, backupName, (err) => {
                if(err) console.error('Download error:', err);
                // Clean up after download
                fs.remove(backupPath);
            });
        });
    } catch(error) {
        console.error('Backup error:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// List available backups
app.get('/api/backup/list', async (req, res) => {
    try {
        const files = await fs.readdir(BACKUP_ROOT);
        const backups = await Promise.all(files.map(async file => {
            const stat = await fs.stat(path.join(BACKUP_ROOT, file));
            return {
                name: file,
                size: stat.size,
                created: stat.birthtime
            };
        }));
        res.json(backups.sort((a, b) => b.created - a.created));
    } catch(error) {
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// ===== COLLEGES & COURSES =====

// Get all colleges
app.get('/api/colleges', async (req, res) => {
    try {
        const collegesPath = path.join(DATA_ROOT, 'Colleges.json');
        const colleges = await fs.readJson(collegesPath).catch(() => ({ colleges: [] }));
        res.json(colleges.colleges);
    } catch(error) {
        res.status(500).json({ error: 'Failed to fetch colleges' });
    }
});

// Get courses for college
app.get('/api/courses/:college', async (req, res) => {
    try {
        const { college } = req.params;
        const collegePath = path.join(DATA_ROOT, 'colleges', college);
        const courses = await fs.readdir(collegePath).catch(() => []);
        
        const courseData = await Promise.all(courses.map(async course => {
            const infoPath = path.join(collegePath, course, 'course-info.json');
            const info = await fs.readJson(infoPath).catch(() => ({}));
            return {
                name: course,
                ...info
            };
        }));
        
        res.json(courseData);
    } catch(error) {
        res.status(500).json({ error: 'Failed to fetch courses' });
    }
});

// ===== UTILITY FUNCTIONS =====

// Find user by registration number
async function findUser(regNumber) {
    // Search through all colleges and courses
    const colleges = await fs.readdir(path.join(DATA_ROOT, 'colleges')).catch(() => []);
    
    for(const college of colleges) {
        const courses = await fs.readdir(path.join(DATA_ROOT, 'colleges', college)).catch(() => []);
        
        for(const course of courses) {
            const userPath = path.join(DATA_ROOT, 'colleges', college, course, 'users', `${regNumber}.json`);
            if(await fs.pathExists(userPath)) {
                return await fs.readJson(userPath);
            }
        }
    }
    
    return null;
}

// Save user
async function saveUser(user) {
    const userPath = path.join(DATA_ROOT, 'colleges', user.college, user.course, 'users', `${user.regNumber}.json`);
    await fs.writeJson(userPath, user, { spaces: 2 });
}

// ===== SERVE FRONTEND =====

// All other routes go to index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'web', 'index.html'));
});

// ===== START SERVER =====
app.listen(PORT, () => {
    console.log(`🚀 SAMS Server running on port ${PORT}`);
    console.log(`📁 Data directory: ${DATA_ROOT}`);
    console.log(`💾 Backup directory: ${BACKUP_ROOT}`);
    console.log(`🌐 http://localhost:${PORT}`);
});
