import { pgPool } from '../config/database';
import { IShardLookup } from '../types';

export class LookupRepository {
  
  public async createLookup(lookup: IShardLookup): Promise<IShardLookup> {
    const query = `
      INSERT INTO product_shard_lookup (product_id, product_name, shard_name, mongodb_collection, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *;
    `;
    
    const values = [
      lookup.product_id,
      lookup.product_name,
      lookup.shard_name,
      lookup.mongodb_collection
    ];

    const result = await pgPool.query(query, values);
    return result.rows[0];
  }

  public async getLookupById(productId: string): Promise<IShardLookup | null> {
    const query = `
      SELECT * FROM product_shard_lookup
      WHERE product_id = $1;
    `;
    
    const result = await pgPool.query(query, [productId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  }

  public async getLookupByName(productName: string): Promise<IShardLookup[]> {
    const query = `
      SELECT * FROM product_shard_lookup
      WHERE product_name = $1;
    `;
    
    const result = await pgPool.query(query, [productName]);
    return result.rows;
  }

  public async updateLookup(productId: string, name: string, shardName: string, collection: string): Promise<void> {
    const query = `
      UPDATE product_shard_lookup
      SET product_name = $1, shard_name = $2, mongodb_collection = $3, updated_at = NOW()
      WHERE product_id = $4;
    `;
    
    await pgPool.query(query, [name, shardName, collection, productId]);
  }

  public async deleteLookup(productId: string): Promise<void> {
    const query = `
      DELETE FROM product_shard_lookup
      WHERE product_id = $1;
    `;
    
    await pgPool.query(query, [productId]);
  }

  public async countAll(): Promise<number> {
    const query = `SELECT COUNT(*) FROM product_shard_lookup;`;
    const result = await pgPool.query(query);
    return parseInt(result.rows[0].count, 10);
  }

  public async getAll(limit: number, offset: number): Promise<IShardLookup[]> {
    const query = `
      SELECT * FROM product_shard_lookup
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await pgPool.query(query, [limit, offset]);
    return result.rows;
  }

  public async searchLookups(searchQuery: string, limit: number, offset: number): Promise<IShardLookup[]> {
    const query = `
      SELECT * FROM product_shard_lookup
      WHERE product_name ILIKE $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3;
    `;
    
    const result = await pgPool.query(query, [`%${searchQuery}%`, limit, offset]);
    return result.rows;
  }

  public async countSearch(searchQuery: string): Promise<number> {
    const query = `
      SELECT COUNT(*) FROM product_shard_lookup
      WHERE product_name ILIKE $1;
    `;
    
    const result = await pgPool.query(query, [`%${searchQuery}%`]);
    return parseInt(result.rows[0].count, 10);
  }
}
