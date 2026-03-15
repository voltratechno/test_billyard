// HTTPS Server untuk Abdul Rohman Billiard Trainer
const https = require('https');
const fs = require('fs');
const path = require('path');

// Konfigurasi SSL
const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// State mesin (bisa diganti dengan komunikasi ke ESP32/Arduino)
let machineState = {
  isRunning: false,
  ballsRemaining: 9,
  mode: 'manual', // 'manual' or 'auto'
  lastCommand: null,
  pendingCommand: null // Untuk ESP32 polling
};

// Helper function untuk parsing POST body
function getPostData(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}

// Buat HTTPS server
const server = https.createServer(options, async (req, res) => {
  // Default ke index.html
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';

  // Handle API endpoints
  if (req.url.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // API: Fire single ball (Manual Mode)
      if (req.url === '/api/fire' && req.method === 'POST') {
        const data = await getPostData(req);

        console.log('=================================');
        console.log('🎱 MANUAL MODE - Fire Ball');
        console.log('=================================');
        console.log(`Jarak: ${data.distance} cm`);
        console.log(`PWM: ${data.pwm}`);
        console.log(`Sisa Bola: ${machineState.ballsRemaining - 1}`);
        console.log('=================================');

        // Simpan command untuk ESP32
        machineState.pendingCommand = {
          command: 'FIRE',
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        // Update state
        machineState.ballsRemaining = Math.max(0, machineState.ballsRemaining - 1);
        machineState.lastCommand = {
          type: 'fire',
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ballsRemaining: machineState.ballsRemaining,
          message: 'Ball fired successfully'
        }));
        return;
      }

      // API: Test PWM (untuk kalibrasi)
      if (req.url === '/api/test-pwm' && req.method === 'POST') {
        const data = await getPostData(req);

        console.log('=================================');
        console.log('🔧 TEST PWM - Calibration');
        console.log('=================================');
        console.log(`Jarak: ${data.distance} cm`);
        console.log(`PWM: ${data.pwm}`);
        console.log('=================================');
        console.log('→ Ukur jarak dengan meteran');
        console.log('→ Jika sudah pas, simpan pengaturan');
        console.log('=================================');

        // Simpan command untuk ESP32
        machineState.pendingCommand = {
          command: 'TEST_PWM',
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        machineState.lastCommand = {
          type: 'test-pwm',
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'PWM test sent successfully',
          distance: data.distance,
          pwm: data.pwm
        }));
        return;
      }

      // API: Auto Mode Start
      if (req.url === '/api/auto-start' && req.method === 'POST') {
        const data = await getPostData(req);

        console.log('=================================');
        console.log('🔄 AUTO MODE - Start');
        console.log('=================================');
        console.log(`Jumlah Bola: ${data.balls}`);
        console.log(`Jarak: ${data.distance} cm`);
        console.log(`PWM: ${data.pwm}`);
        console.log('=================================');

        // Simpan command untuk ESP32
        machineState.pendingCommand = {
          command: 'START_AUTO',
          balls: data.balls,
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        machineState.isRunning = true;
        machineState.mode = 'auto';
        machineState.lastCommand = {
          type: 'auto-start',
          balls: data.balls,
          distance: data.distance,
          pwm: data.pwm,
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Auto mode started',
          balls: data.balls,
          distance: data.distance,
          pwm: data.pwm
        }));
        return;
      }

      // API: Stop
      if (req.url === '/api/stop' && req.method === 'POST') {
        console.log('=================================');
        console.log('⏹️  STOP Command');
        console.log('=================================');

        // Simpan command untuk ESP32
        machineState.pendingCommand = {
          command: 'STOP',
          timestamp: new Date().toISOString()
        };

        machineState.isRunning = false;
        machineState.lastCommand = {
          type: 'stop',
          timestamp: new Date().toISOString()
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Machine stopped'
        }));
        return;
      }

      // API: Status (untuk sensor updates, balls remaining, etc.)
      if (req.url === '/api/status' && req.method === 'GET') {
        // TODO: Dapatkan data real-time dari ESP32/sensor
        // - ballsRemaining dari sensor
        // - isRunning dari mesin
        // - finished flag jika auto mode selesai

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          isRunning: machineState.isRunning,
          ballsRemaining: machineState.ballsRemaining,
          mode: machineState.mode,
          finished: !machineState.isRunning && machineState.mode === 'auto',
          lastCommand: machineState.lastCommand
        }));
        return;
      }

      // API: Reset Balls (untuk reset sisa bola ke 9)
      if (req.url === '/api/reset' && req.method === 'POST') {
        console.log('=================================');
        console.log('🔄 Reset Balls');
        console.log('=================================');

        // Simpan command untuk ESP32
        machineState.pendingCommand = {
          command: 'RESET',
          timestamp: new Date().toISOString()
        };

        machineState.ballsRemaining = 9;
        machineState.isRunning = false;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          ballsRemaining: machineState.ballsRemaining,
          message: 'Balls reset to 9'
        }));
        return;
      }

      // API: Get Pending Command (untuk ESP32 polling)
      if (req.url === '/api/get-pending-command' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });

        if (machineState.pendingCommand) {
          const command = machineState.pendingCommand;
          machineState.pendingCommand = null; // Clear setelah diambil
          res.end(JSON.stringify(command));
        } else {
          res.end(JSON.stringify({}));
        }
        return;
      }

      // API: Status Update dari ESP32
      if (req.url === '/api/status-update' && req.method === 'POST') {
        const data = await getPostData(req);

        // Update state dari ESP32
        if (data.ballsRemaining !== undefined) {
          machineState.ballsRemaining = data.ballsRemaining;
        }
        if (data.isRunning !== undefined) {
          machineState.isRunning = data.isRunning;
        }
        if (data.mode !== undefined) {
          machineState.mode = data.mode;
        }

        console.log('📊 Status Update from ESP32:', {
          ballsRemaining: machineState.ballsRemaining,
          isRunning: machineState.isRunning,
          mode: machineState.mode
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Status updated'
        }));
        return;
      }

      // API: Notification dari ESP32
      if (req.url === '/api/notification' && req.method === 'POST') {
        const data = await getPostData(req);

        console.log('📬 Notification from ESP32:', data);

        // Update state jika ada
        if (data.ballsRemaining !== undefined) {
          machineState.ballsRemaining = data.ballsRemaining;
        }

        // Kirim notifikasi ke web client jika menggunakan WebSocket/SSE
        // TODO: Implement WebSocket/SSE untuk real-time update ke web

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Notification received'
        }));
        return;
      }

      // 404 for unknown API endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
      return;

    } catch (error) {
      console.error('API Error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return;
    }
  }

  // Serve static files
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code, 'utf-8');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Dapatkan IP address lokal
const os = require('os');
const interfaces = os.networkInterfaces();
let localIP = 'localhost';

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      localIP = iface.address;
      break;
    }
  }
}

const PORT = 4433;

server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🎱 ABDUL ROHMAN BILLIARD TRAINER');
  console.log('=================================');
  console.log('');
  console.log(`✅ Server berjalan!`);
  console.log('');
  console.log('📱 Akses dari HP/Laptop di jaringan yang sama:');
  console.log(`   https://${localIP}:${PORT}`);
  console.log('');
  console.log('💻 Akses dari komputer ini:');
  console.log(`   https://localhost:${PORT}`);
  console.log('');
  console.log('⚠️  Catatan: Browser akan menampilkan peringatan keamanan');
  console.log('   karena menggunakan sertifikat self-signed.');
  console.log('   Klik "Advanced" -> "Proceed to localhost" untuk melanjutkan.');
  console.log('');
  console.log('📡 API Endpoints:');
  console.log('   Web Client:');
  console.log('   POST /api/fire       - Fire single ball (manual mode)');
  console.log('   POST /api/test-pwm   - Test PWM for calibration');
  console.log('   POST /api/auto-start - Start auto mode');
  console.log('   POST /api/stop       - Stop machine');
  console.log('   POST /api/reset      - Reset balls to 9');
  console.log('   GET  /api/status     - Get machine status');
  console.log('');
  console.log('   ESP32:');
  console.log('   GET  /api/get-pending-command - Get command from server');
  console.log('   POST /api/status-update       - Update status from ESP32');
  console.log('   POST /api/notification         - Send notification from ESP32');
  console.log('=================================');
});
