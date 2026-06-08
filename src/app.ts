import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import productRoutes from './routes/product.routes';
import dashboardRoutes from './routes/dashboard.routes';

const app: Application = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'UP', timestamp: new Date() });
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
