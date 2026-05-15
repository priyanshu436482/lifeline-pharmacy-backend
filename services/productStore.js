const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const initialProducts = require('../data/initialProducts');

const LOCAL_PRODUCTS_PATH = path.join(__dirname, '../data/products.local.json');

let cachedConnection = null;
let connectionPromise = null;
let seedPromise = null;
let useFileStorage = false;

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

async function readLocalProducts() {
  try {
    const raw = await fs.readFile(LOCAL_PRODUCTS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeLocalProducts(products) {
  await fs.writeFile(LOCAL_PRODUCTS_PATH, JSON.stringify(products, null, 2), 'utf8');
}

async function seedLocalProducts() {
  const now = new Date().toISOString();
  const products = initialProducts.map((product) => ({
    _id: generateId(),
    ...product,
    createdAt: now,
    updatedAt: now
  }));

  await writeLocalProducts(products);
  console.log('Local product store seeded (MongoDB unavailable)');
  return products;
}

async function ensureLocalProducts() {
  const existing = await readLocalProducts();
  if (existing) {
    return existing;
  }
  return seedLocalProducts();
}

async function seedDatabase() {
  const count = await Product.countDocuments();

  if (count === 0) {
    await Product.insertMany(initialProducts);
    console.log('Database seeded successfully');
  }
}

function enableFileStorage(reason) {
  if (!useFileStorage) {
    console.warn(`Using local file storage for products: ${reason}`);
    useFileStorage = true;
    cachedConnection = null;
    connectionPromise = null;
    seedPromise = null;
  }
}

async function initializeDatabase() {
  if (useFileStorage) {
    await ensureLocalProducts();
    return null;
  }

  if (cachedConnection) {
    return cachedConnection;
  }

  if (!process.env.MONGO_URI) {
    enableFileStorage('MONGO_URI is not set');
    await ensureLocalProducts();
    return null;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGO_URI)
      .then((mongooseInstance) => {
        cachedConnection = mongooseInstance;
        console.log('Connected to MongoDB');
        return mongooseInstance;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  try {
    await connectionPromise;

    if (!seedPromise) {
      seedPromise = seedDatabase().catch((error) => {
        seedPromise = null;
        throw error;
      });
    }

    await seedPromise;
    return cachedConnection;
  } catch (error) {
    enableFileStorage(error.message);
    await ensureLocalProducts();
    return null;
  }
}

async function getAllProducts() {
  await initializeDatabase();

  if (useFileStorage) {
    const products = await readLocalProducts();
    return [...products].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  return Product.find().sort({ createdAt: -1 });
}

async function getProductBySlug(slug) {
  await initializeDatabase();

  if (useFileStorage) {
    const products = await readLocalProducts();
    return products.find((product) => product.slug === slug) || null;
  }

  return Product.findOne({ slug });
}

async function createProduct({ name, price, image, slug, category }) {
  await initializeDatabase();

  if (useFileStorage) {
    const products = await readLocalProducts();
    const duplicate = products.find((product) => product.slug === slug);

    if (duplicate) {
      const error = new Error('Duplicate slug');
      error.code = 11000;
      throw error;
    }

    const now = new Date().toISOString();
    const product = {
      _id: generateId(),
      name,
      price: Number(price),
      image,
      slug,
      category,
      createdAt: now,
      updatedAt: now
    };

    products.unshift(product);
    await writeLocalProducts(products);
    return product;
  }

  const newProduct = new Product({
    name,
    price: Number(price),
    image,
    slug,
    category
  });

  await newProduct.save();
  return newProduct;
}

async function deleteProduct(id) {
  await initializeDatabase();

  if (useFileStorage) {
    const products = await readLocalProducts();
    const index = products.findIndex((product) => product._id === id);

    if (index === -1) {
      return null;
    }

    const [removed] = products.splice(index, 1);
    await writeLocalProducts(products);
    return removed;
  }

  return Product.findByIdAndDelete(id);
}

function isUsingFileStorage() {
  return useFileStorage;
}

module.exports = {
  initializeDatabase,
  getAllProducts,
  getProductBySlug,
  createProduct,
  deleteProduct,
  isUsingFileStorage
};
