require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const productStore = require('./services/productStore');

const app = express();
const PORT = process.env.PORT || 5000;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);

  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

function getAdminCredentials() {
  return {
    adminId: process.env.ADMIN_ID || 'patel',
    adminPassword: process.env.ADMIN_PASSWORD || 'pinshu42@',
    adminSecret: process.env.ADMIN_SECRET || 'lifeline-admin-secret'
  };
}

function createAdminToken(adminId) {
  const { adminSecret } = getAdminCredentials();
  const payload = {
    adminId,
    exp: Date.now() + TOKEN_TTL_MS
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', adminSecret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${encodedPayload}.${signature}`;
}

function verifyAdminToken(token) {
  const { adminSecret } = getAdminCredentials();

  if (!token || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  const expectedSignature = crypto
    .createHmac('sha256', adminSecret)
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  if (providedSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    if (!payload.exp || payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

async function requireDatabase(req, res, next) {
  try {
    await productStore.initializeDatabase();
    next();
  } catch (error) {
    console.error('Database initialization failed:', error);
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
}

function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = verifyAdminToken(token);

  if (!payload) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  req.admin = payload;
  next();
}

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'LifeLine backend is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'API is running' });
});

app.post('/api/admin/login', (req, res) => {
  const credentials = getAdminCredentials();
  const { id, password } = req.body;

  if (id !== credentials.adminId || password !== credentials.adminPassword) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = createAdminToken(credentials.adminId);

  res.json({
    success: true,
    message: 'Login successful',
    token,
    adminId: credentials.adminId,
    expiresInMs: TOKEN_TTL_MS
  });
});

app.get('/api/products', requireDatabase, async (req, res) => {
  try {
    const products = await productStore.getAllProducts();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, message: 'Error fetching products' });
  }
});

app.get('/api/products/:slug', requireDatabase, async (req, res) => {
  try {
    const product = await productStore.getProductBySlug(req.params.slug);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ success: false, message: 'Error fetching product' });
  }
});

app.post('/api/products', requireDatabase, requireAdminAuth, async (req, res) => {
  try {
    const { name, price, image, slug, category } = req.body;
    const newProduct = await productStore.createProduct({ name, price, image, slug, category });
    res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    console.error('Error adding product:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A medicine with this slug already exists. Slug must be unique.'
      });
    }

    res.status(500).json({ success: false, message: `Error adding product: ${error.message}` });
  }
});

app.delete('/api/products/:id', requireDatabase, requireAdminAuth, async (req, res) => {
  try {
    const product = await productStore.deleteProduct(req.params.id);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Error deleting product' });
  }
});

module.exports = {
  app,
  initializeDatabase: productStore.initializeDatabase,
  PORT
};
