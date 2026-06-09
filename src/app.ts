import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import productRoutes from './routes/product.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { initializeDatabases } from './config/database';

const app: Application = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

// Ensure databases are connected on serverless environments
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await initializeDatabases();
    next();
  } catch (error) {
    next(error);
  }
});


app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
});

app.post('/api/admin/login', (req: Request, res: Response) => {
  const { id, password } = req.body;
  const expectedId = process.env.ADMIN_ID || 'patel';
  const expectedPassword = process.env.ADMIN_PASSWORD || 'pinshu42@';

  if (id === expectedId && password === expectedPassword) {
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: 'mock-admin-jwt-token-xyz',
      adminId: expectedId
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid Admin ID or password.'
    });
  }
});

app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.url}` });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled server exception:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'An unexpected server error occurred.'
  });
});

export default app;
