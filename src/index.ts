/**
 * Face Manager Service
 * Main server entry point
 */

import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeFirebase } from './config/firebase';
import apiRoutes from './routes/api';
import imageRoutes from './routes/images';

// Load environment variables
dotenv.config();

// Initialize Firebase
initializeFirebase();

const app: Express = express();
const PORT = process.env.PORT || 8082;

// Parse CORS origins from environment
const corsOrigins = process.env.CORS_ORIGINS?.split(',') || [
  'http://localhost:8000',  // UI Studio
  'http://localhost:8357',
  'http://localhost:8083',
  'https://infitwin.web.app',
  'https://infitwin.firebaseapp.com'
];

// Middleware - Allow all origins in production for now
const isProduction = process.env.NODE_ENV === 'production' || process.env.PORT === '8080';
app.use(cors({
  origin: isProduction ? true : corsOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Logging middleware
app.use((req: Request, res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'Face Manager Service',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api', imageRoutes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Face Manager Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test UI: http://localhost:8083 (run 'npm run test-ui')`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`👤 Test User ID: ${process.env.TEST_USER_ID}`);
});