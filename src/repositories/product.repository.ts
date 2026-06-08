import { Model } from 'mongoose';
import { getMongoShardAConnection, pgPool } from '../config/database';
import { ProductSchema, IProductDocument } from '../schemas/product.schema';
import { cloudinaryService } from '../services/cloudinary.service';
import { IProduct } from '../types';

export class ProductRepository {

  /**
   * Helper to retrieve Mongoose model for Shard A (MongoDB)
   */
  private getShardAModel(): Model<IProductDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IProductDocument>('Product', ProductSchema);
  }

  /**
   * Insert product data into correct storage shard.
   * - shard_a: MongoDB Atlas
   * - shard_b: Cloudinary Raw JSON
   * - shard_c: Neon PostgreSQL (products_sz)
   */
  public async create(
    shardName: 'shard_a' | 'shard_b' | 'shard_c', 
    productId: string,
    productData: IProduct
  ): Promise<IProduct> {
    
    const productPayload = {
      ...productData,
      _id: productId
    };

    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        const doc = new ProductModel(productPayload);
        const saved = await doc.save();
        return saved.toObject();
      }
      
      case 'shard_b': {
        // Save product configuration as a raw JSON file in Cloudinary
        console.log(`Writing product JSON file to Cloudinary for Shard B...`);
        const secureUrl = await cloudinaryService.uploadProductJson(productId, productPayload);
        
        // Return the product. The lookup table will store the JSON URL in `mongodb_collection`
        return {
          ...productPayload,
          _id: productId
        };
      }
      
      case 'shard_c': {
        // Save product as a row in Neon PostgreSQL
        console.log(`Writing product record to Neon PostgreSQL products_sz for Shard C...`);
        const query = `
          INSERT INTO products_sz (product_id, name, price, description, category, image_url, stock, slug, is_featured, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING *;
        `;
        const values = [
          productId,
          productPayload.name,
          productPayload.price,
          productPayload.description || '',
          productPayload.category,
          productPayload.imageUrl || '',
          productPayload.stock,
          productPayload.slug || '',
          productPayload.isFeatured || false
        ];
        
        const result = await pgPool.query(query, values);
        const row = result.rows[0];
        
        return {
          _id: row.product_id,
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          imageUrl: row.image_url,
          stock: row.stock,
          slug: row.slug,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }
      
      default:
        throw new Error(`Invalid Shard location specified: ${shardName}`);
    }
  }

  /**
   * Fetch product from its correct storage engine.
   * @param locationUrl Used specifically by Shard B to locate and fetch the Cloudinary JSON file.
   */
  public async getById(
    shardName: 'shard_a' | 'shard_b' | 'shard_c', 
    productId: string,
    locationUrl?: string
  ): Promise<IProduct | null> {
    
    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        const doc = await ProductModel.findById(productId).exec();
        return doc ? doc.toObject() : null;
      }
      
      case 'shard_b': {
        if (!locationUrl) {
          throw new Error('Cloudinary JSON URL is missing for Shard B retrieval.');
        }
        return await cloudinaryService.downloadProductJson(locationUrl);
      }
      
      case 'shard_c': {
        const query = `SELECT * FROM products_sz WHERE product_id = $1;`;
        const result = await pgPool.query(query, [productId]);
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        return {
          _id: row.product_id,
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          imageUrl: row.image_url,
          stock: row.stock,
          slug: row.slug,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }
    }
  }

  /**
   * Update product details in its storage shard.
   * @param locationUrl Used by Shard B to overwrite the JSON file.
   */
  public async update(
    shardName: 'shard_a' | 'shard_b' | 'shard_c', 
    productId: string, 
    updates: Partial<IProduct>,
    locationUrl?: string
  ): Promise<IProduct | null> {
    
    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        const updatedDoc = await ProductModel.findByIdAndUpdate(productId, updates, { new: true }).exec();
        return updatedDoc ? updatedDoc.toObject() : null;
      }
      
      case 'shard_b': {
        if (!locationUrl) {
          throw new Error('Cloudinary JSON URL is missing for Shard B update.');
        }
        // Fetch current file data
        const currentData = await cloudinaryService.downloadProductJson(locationUrl);
        const mergedData = {
          ...currentData,
          ...updates,
          updatedAt: new Date()
        };
        // Re-upload to overwrite the file on Cloudinary
        await cloudinaryService.uploadProductJson(productId, mergedData);
        return mergedData;
      }
      
      case 'shard_c': {
        // Construct dynamic UPDATE query for Postgres
        const keys = Object.keys(updates).filter(k => updates[k as keyof IProduct] !== undefined);
        if (keys.length === 0) return this.getById(shardName, productId);

        const setClause = keys.map((key, i) => {
          const dbKey = key === 'imageUrl' ? 'image_url' : key === 'isFeatured' ? 'is_featured' : key;
          return `${dbKey} = $${i + 1}`;
        }).join(', ');

        const values = keys.map(key => updates[key as keyof IProduct]);
        values.push(productId); // Final parameter is product_id

        const query = `
          UPDATE products_sz
          SET ${setClause}, updated_at = NOW()
          WHERE product_id = $${values.length}
          RETURNING *;
        `;

        const result = await pgPool.query(query, values);
        if (result.rows.length === 0) return null;
        
        const row = result.rows[0];
        return {
          _id: row.product_id,
          name: row.name,
          price: parseFloat(row.price),
          description: row.description,
          category: row.category,
          imageUrl: row.image_url,
          stock: row.stock,
          slug: row.slug,
          isFeatured: row.is_featured,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        };
      }
    }
  }

  /**
   * Delete product data from its storage engine.
   */
  public async delete(
    shardName: 'shard_a' | 'shard_b' | 'shard_c', 
    productId: string
  ): Promise<void> {
    
    switch (shardName) {
      case 'shard_a': {
        const ProductModel = this.getShardAModel();
        await ProductModel.findByIdAndDelete(productId).exec();
        break;
      }
      
      case 'shard_b': {
        // Delete JSON file from Cloudinary
        await cloudinaryService.deleteProductJson(productId);
        break;
      }
      
      case 'shard_c': {
        // Delete row from Postgres
        const query = `DELETE FROM products_sz WHERE product_id = $1;`;
        await pgPool.query(query, [productId]);
        break;
      }
    }
  }

  /**
   * Gathers category counts across all three storage layers in parallel.
   */
  public async getCategoryCountsAcrossShards(): Promise<{ category: string; count: number }[]> {
    const categoryMap: { [key: string]: number } = {};

    // 1. Query Shard A (MongoDB)
    const taskA = this.getShardAModel().aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]).exec();

    // 2. Query Shard B (Cloudinary - since we store lookups in Postgres, we can count category from lookups or download. 
    // Wait, since categories are Mongo/SQL specific, let's also aggregate categories for Shard C (Postgres) directly:
    const taskC = pgPool.query(`
      SELECT category, COUNT(*) as count 
      FROM products_sz 
      GROUP BY category;
    `);

    // Wait! Since Shard B items are stored on Cloudinary and we don't store category in the lookup table, how do we get Shard B category counts?
    // We can read all J-R records from Postgres lookup and fetch them, or since J-R is J-R products, we can get J-R products counts from categories if we fetch them.
    // However, the number of J-R products is small or we can retrieve category maps. 
    // Alternatively, let's check: can we count categories by getting J-R products details or querying J-R documents?
    // Actually, J-R products are listed in Postgres lookup table. We can select all J-R product IDs from lookup table, fetch J-R documents concurrently, and count their categories!
    // Since fetch is concurrent and cached, this is extremely fast.
    const taskB = (async () => {
      // Find all product IDs for Shard B
      const res = await pgPool.query("SELECT product_id, mongodb_collection FROM product_shard_lookup WHERE shard_name = 'shard_b'");
      const shardBDetails = res.rows;
      const downloads = shardBDetails.map(async (row) => {
        try {
          return await cloudinaryService.downloadProductJson(row.mongodb_collection);
        } catch {
          return null;
        }
      });
      const docs = await Promise.all(downloads);
      const counts: { [key: string]: number } = {};
      docs.forEach(doc => {
        if (doc && doc.category) {
          counts[doc.category] = (counts[doc.category] || 0) + 1;
        }
      });
      return Object.keys(counts).map(cat => ({ category: cat, count: counts[cat] }));
    })();

    const [resA, resC, resB] = await Promise.all([taskA, taskC, taskB]);

    // Merge Shard A
    resA.forEach(item => {
      categoryMap[item._id] = (categoryMap[item._id] || 0) + item.count;
    });

    // Merge Shard B
    resB.forEach(item => {
      categoryMap[item.category] = (categoryMap[item.category] || 0) + item.count;
    });

    // Merge Shard C
    resC.rows.forEach(row => {
      categoryMap[row.category] = (categoryMap[row.category] || 0) + parseInt(row.count, 10);
    });

    return Object.keys(categoryMap).map(cat => ({
      category: cat,
      count: categoryMap[cat]
    }));
  }

  /**
   * Fetch all low stock products (stock <= threshold) across shards in parallel.
   */
  public async getLowStockAcrossShards(threshold: number): Promise<IProduct[]> {
    // 1. Fetch from Shard A (MongoDB)
    const taskA = this.getShardAModel().find({ stock: { $lte: threshold } }).exec();

    // 2. Fetch from Shard C (Postgres)
    const taskC = pgPool.query(`
      SELECT * FROM products_sz 
      WHERE stock <= $1;
    `, [threshold]);

    // 3. Fetch from Shard B (Cloudinary)
    const taskB = (async () => {
      const res = await pgPool.query("SELECT product_id, mongodb_collection FROM product_shard_lookup WHERE shard_name = 'shard_b'");
      const downloads = res.rows.map(async (row) => {
        try {
          return await cloudinaryService.downloadProductJson(row.mongodb_collection);
        } catch {
          return null;
        }
      });
      const docs = await Promise.all(downloads);
      return docs.filter(doc => doc !== null && doc.stock <= threshold) as IProduct[];
    })();

    const [resA, resC, resB] = await Promise.all([taskA, taskC, taskB]);

    const lowStockList: IProduct[] = [];

    // Add Mongo docs
    resA.forEach(doc => lowStockList.push(doc.toObject()));

    // Add Cloudinary docs
    resB.forEach(doc => lowStockList.push(doc));

    // Add Postgres docs
    resC.rows.forEach(row => {
      lowStockList.push({
        _id: row.product_id,
        name: row.name,
        price: parseFloat(row.price),
        description: row.description,
        category: row.category,
        imageUrl: row.image_url,
        stock: row.stock,
        slug: row.slug,
        isFeatured: row.is_featured,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    });

    return lowStockList;
  }
}
