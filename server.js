require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Product = require('./models/Product');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('Error connecting to MongoDB:', err));

// Initial products data to seed the database
const initialProducts = [
  { name: 'Paracetamol 500mg Tablets', price: 45, image: 'https://assets.sayacare.in/api/images/product_image/large_image/23/74/Paracetamol-500-mg-Tablet_1.webp', slug: 'paracetamol', category: 'medicines' },
  { name: 'Cetirizine 10mg Tablets', price: 32, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdbGd8wGr-4oQJ-YxgJ48pAYKmlgRZDbm2Ag&s', slug: 'cetirizine', category: 'medicines' },
  { name: 'Dolo 650 Tablet', price: 28, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQSrN0aAuPlRxIrUvrQ_NEbvxN7njwUkAFD0w&s', slug: 'dolo-650', category: 'medicines' },
  { name: 'bicasol capsule', price: 199, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQKivHb-LgF9lqImWrpsd6NWPwtnsfO_eNogg&s', slug: 'vitamin-d3', category: 'healthcare' },
  { name: 'Supradyn Daily Tablet', price: 899, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJ_IoWLs5J7lCvHC29u2SDbYjXsFgC4v40gg&s', slug: 'bp-monitor', category: 'healthcare' },
  { name: 'limcee tablet ', price: 299, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSrrL_6QbycbF-8FvtgN1DA_dqkpW5DWvWERA&s', slug: 'cbc-test', category: 'lab-tests' },
  { name: 'Hand Sanitizer 500ml', price: 149, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSDTHfxY4nJoGA06sf6jjbHGg4XA8_2E87pCw&s', slug: 'hand-sanitizer', category: 'personal-care' },
  { name: 'Multivitamin Daily Capsules', price: 349, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_69s4eM4qlVDAHiGGaP81dfSE1_mZcKpIfw&s', slug: 'multivitamin', category: 'healthcare' },
  { name: 'Amoxicillin 500mg Capsules', price: 85, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSSQPJP4jA2W_QMOi0q8RXfLCzA5gnJAZJPig&s', slug: 'amoxicillin', category: 'medicines' },
  { name: 'Omega-3 Fish Oil Softgels', price: 425, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTnj1gHm0F36pNc8KPqZ_zEBW-s5I7ybnfp8A&s', slug: 'omega-3', category: 'healthcare' },
  { name: 'Dytor 40 Tablet', price: 449, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkunjI9Emvgwa5-3m0eY-pk_RnJHsi7AiiSQ&s', slug: 'thyroid-test', category: 'lab-tests' },
  { name: 'Face Mask Pack of 5', price: 199, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQHV05OsNg2wNPpoSZZEAcQ4RKThjORHPPupw&s', slug: 'face-mask', category: 'personal-care' },
  { name: 'Ibuprofen 400 Tablet', price: 60, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ0P-TawDsoseugG1-JM5zDKEgN5f2hs5Eexw&s', slug: 'ibuprofen', category: 'medicines' },
  { name: 'Crocin Advance Tablet', price: 35, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrgC4yFIiN3KQ6Yjxy1OXUw6BAosifrVubGA&s', slug: 'crocin-advance', category: 'medicines' },
  { name: 'Combiflam Tablet', price: 50, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTzB_imXN5B01swYJaixUNOd6QqpYLIWtNOUg&s', slug: 'combiflam', category: 'medicines' },
  { name: 'Aspirin Tablet', price: 25, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIMewbTqH8mxZzgczPVhvtW6P6zWNvFgRHog&s', slug: 'aspirin', category: 'medicines' },
  { name: 'Levocetirizine Tablet', price: 40, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQUInt6zJDarUQB2S1gIhMPuF0CH7_SAarIFw&s', slug: 'levocetirizine', category: 'medicines' },
  { name: 'Montelukast Tablet', price: 75, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS1HGAntWN964Y2JG4uI6-1taEpeQH8j4whfw&s', slug: 'montelukast', category: 'medicines' },
  { name: 'Allegra 120 Tablet', price: 120, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTeDZyoloTW0sBksqLY9A-VwGZJBGvECavEhQ&s', slug: 'allegra-120', category: 'medicines' },
  { name: 'Sinarest Tablet', price: 55, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRGxLCBT06BfGT5-gvTOJ0AynxYcaWZNwrsUw&s', slug: 'sinarest', category: 'medicines' },
  { name: 'Azithromycin 500 Tablet', price: 110, image: 'http://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTgAVliyLRVLWEdAbTMOI_q7ejB70KAMKf4hA&s', slug: 'azithromycin', category: 'medicines' },
  { name: 'Ciprofloxacin 500 Tablet', price: 95, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcREWBZzNjFiBGcjjuRD37_x4kS7pVJwyfv53A&s', slug: 'ciprofloxacin', category: 'medicines' },
  { name: 'Doxycycline Capsule', price: 80, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR9_j8_pyqjneFedot8LYEx2EnEWk3Qk1bJHw&s', slug: 'doxycycline', category: 'medicines' },
  { name: 'Vitamin B Complex Tablet', price: 65, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ5lNGLDCipdftp-KRlC6prCoRzq9i7QcBA-w&s', slug: 'vitamin-b-complex', category: 'healthcare' },
  { name: 'Vitamin C Tablet', price: 45, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMndr4NisGPxo7XbTjE_vKcek2ZAfPY9gz5A&s', slug: 'vitamin-c', category: 'healthcare' },
  { name: 'Calcium + Vitamin D3 Tablet', price: 150, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR12dbKuuuOWXPljBo3krpkwSO0Bv-WkVh0hQ&s', slug: 'calcium-d3', category: 'healthcare' },
  { name: 'Zincovit Tablet', price: 95, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTE2jycOhSgyvssMLzLg6tg4_MBMdzb6fQg4w&s', slug: 'zincovit', category: 'healthcare' },
  { name: 'Dettol Antiseptic Liquid', price: 120, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR909YZndR0XlrKnyMHTJqyvBiTDSphgLf0yg&s', slug: 'dettol', category: 'personal-care' },
  { name: 'Savlon Antiseptic Cream', price: 85, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSf3HpV6ySo2jK15aTPZndjo-x83Q6mRGjGgQ&s', slug: 'savlon', category: 'personal-care' },
  { name: 'Betadine Ointment', price: 90, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQrk0sw5FnvgLX-4lO8WDSZSnRxaztH-AANJA&s', slug: 'betadine', category: 'personal-care' },
  { name: 'Digene Antacid Tablet', price: 45, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSMDWlisRAQEoUd8mYvwvtbXVrzUePS1SABZA&s', slug: 'digene', category: 'medicines' },
  { name: 'ORS Electrolyte Powder', price: 30, image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIMewbTqH8mxZzgczPVhvtW6P6zWNvFgRHog&s', slug: 'ors', category: 'healthcare' }
];

// Seed function to populate database
const seedDB = async () => {
  try {
    const count = await Product.countDocuments();
    if (count === 0) {
      await Product.insertMany(initialProducts);
      console.log('Database seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// GET all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching products' });
  }
});

// GET single product by slug
app.get('/api/products/:slug', async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug });
    if (product) {
      res.json(product);
    } else {
      res.status(404).json({ message: 'Product not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching product' });
  }
});

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { id, password } = req.body;
  if (id === 'patel' && password === 'pinshu42@') {
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// POST a new product (Admin only - simplified for now)
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, image, slug, category } = req.body;
    const newProduct = new Product({ name, price, image, slug, category });
    await newProduct.save();
    res.status(201).json({ success: true, product: newProduct });
  } catch (error) {
    console.error('Error adding product:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A medicine with this slug already exists. Slug must be unique.' });
    }
    res.status(500).json({ success: false, message: 'Error adding product: ' + error.message });
  }
});

// DELETE a product by ID (Admin only)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (product) {
      res.json({ success: true, message: 'Product deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Product not found' });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ success: false, message: 'Error deleting product' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  await seedDB();
});

// Test comment to trigger nodemon
