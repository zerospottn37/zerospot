const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 4000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  const isAdminDomain = host.startsWith('admin.');

  // 1. API Reverse Proxy to Backend Server (Port 4000)
  if (req.url.startsWith('/api/')) {
    const proxyOptions = {
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${BACKEND_PORT}`,
      },
    };

    const proxyReq = http.request(proxyOptions, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      console.error('[Proxy Error to Backend]', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend Gateway Error', message: err.message }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // 2. Clean URL handling & .html removal
  let [rawPath, rawQuery] = req.url.split('?');
  const queryStr = rawQuery ? `?${rawQuery}` : '';

  // Redirect any direct request with .html extension to clean URL (e.g. /appointment.html -> /appointment)
  if (rawPath.endsWith('.html') && rawPath !== '/index.html') {
    const cleanUrl = rawPath.replace(/\.html$/, '') + queryStr;
    res.writeHead(301, { Location: cleanUrl });
    res.end();
    return;
  }

  // 3. Subdomain & Route Resolution
  let targetFile = '';

  if (isAdminDomain) {
    // Admin Subdomain: admin.zero-spot.in
    if (rawPath === '/' || rawPath === '' || rawPath === '/admin') {
      targetFile = 'admin.html';
    } else if (rawPath === '/login' || rawPath === '/admin-login') {
      targetFile = 'admin-login.html';
    }
  }

  // Default routes if not already assigned
  if (!targetFile) {
    if (rawPath === '/' || rawPath === '') {
      targetFile = 'index.html';
    } else if (rawPath === '/admin') {
      targetFile = 'admin.html';
    } else if (rawPath === '/admin-login') {
      targetFile = 'admin-login.html';
    } else if (rawPath === '/login') {
      targetFile = 'login.html';
    } else if (rawPath === '/appointment' || rawPath === '/book') {
      targetFile = 'appointment.html';
    } else if (rawPath === '/customer' || rawPath === '/app') {
      targetFile = 'customer-app.html';
    } else if (rawPath === '/partner') {
      targetFile = 'partner-app.html';
    } else if (rawPath === '/pay') {
      targetFile = 'pay.html';
    } else if (rawPath === '/terms') {
      targetFile = 'terms.html';
    } else {
      // Check if file exists as-is, or with .html appended
      const cleanRelPath = rawPath.replace(/^\//, '');
      const directPath = path.join(__dirname, cleanRelPath);
      const htmlPath = path.join(__dirname, cleanRelPath + '.html');

      if (fs.existsSync(directPath) && fs.statSync(directPath).isFile()) {
        targetFile = cleanRelPath;
      } else if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
        targetFile = cleanRelPath + '.html';
      }
    }
  }

  if (!targetFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const filePath = path.join(__dirname, targetFile);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=86400'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🌐 ZeroSpot Website & Admin Server Running`);
  console.log(`📡 Main Site:   http://localhost:${PORT}`);
  console.log(`🛡️ Admin Site:  http://localhost:${PORT}/admin`);
  console.log(`🔗 Clean URLs:  Active (.html extensions stripped)`);
  console.log(`🔄 Proxying:    /api/* -> http://127.0.0.1:${BACKEND_PORT}`);
  console.log(`=========================================`);
});
