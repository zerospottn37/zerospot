// Vercel Edge Middleware
// Handles automatic subdomain routing for admin.zero-spot.in vs www.zero-spot.in
export default function middleware(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('host') || '').toLowerCase();

  // Route requests coming from admin.zero-spot.in
  if (host.startsWith('admin.')) {
    // Preserve API requests to the serverless function
    if (url.pathname.startsWith('/api/')) {
      return;
    }

    // Map admin root to admin.html
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/admin.html';
      return Response.rewrite(url);
    }

    // Map /login to admin-login.html
    if (url.pathname === '/login' || url.pathname === '/admin-login') {
      url.pathname = '/admin-login.html';
      return Response.rewrite(url);
    }

    // Map /admin to admin.html
    if (url.pathname === '/admin') {
      url.pathname = '/admin.html';
      return Response.rewrite(url);
    }
  }
}
