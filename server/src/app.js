import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { doubleCsrf } from 'csrf-csrf';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import userRoutes from './routes/users.js';
import settingRoutes from './routes/settings.js';

const app = express();

const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  // Keep this stable across restarts and separate from the JWT signing key.
  getSecret: () => process.env.CSRF_SECRET,
  // Bind a token to the browser's authenticated session. Unauthenticated
  // requests share only a pre-auth identifier; login/register are exempt.
  getSessionIdentifier: (req) => req.cookies?.token || 'anonymous',
  cookieName: 'csrfToken',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token']
});

app.use(morgan('dev'));
// The browser must be allowed to send the auth cookie on cross-origin XHR,
// so CORS is locked to the client origin AND credentials are enabled.
app.use(cors({ origin: 'http://localhost:5175', credentials: true }));
app.use(express.json());
// Parse HTML-form bodies too. A classic CSRF payload is an auto-submitting
// <form> (application/x-www-form-urlencoded), so the endpoints must understand it.
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// The browser's application client asks for this masked token and sends it in
// a header on writes. The signed cookie stays HttpOnly and cannot be read by
// the attacker's page.
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: generateCsrfToken(req, res) });
});

// GET/HEAD/OPTIONS are safe. Login and registration establish a session, so
// they must remain available before the client has obtained a CSRF token.
const csrfExemptAuthPaths = new Set(['/api/auth/login', '/api/auth/register']);
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || csrfExemptAuthPaths.has(req.path)) {
    return next();
  }
  return doubleCsrfProtection(req, res, next);
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingRoutes);

// Not found
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

export default app;
