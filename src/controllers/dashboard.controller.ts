import { Request, Response } from 'express';
import { pgPool } from '../config/database';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';

export class DashboardController {
  private productRepository = new ProductRepository();
  private lookupRepository = new LookupRepository();

  public getStatsSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      // 1. Resolve PostgreSQL Stats (Orders & Revenue)
      const orderCountQuery = pgPool.query('SELECT COUNT(*) FROM orders');
      const revenueQuery = pgPool.query("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'completed'");
      const recentTxnsQuery = pgPool.query(`
        SELECT t.*, l.product_name 
        FROM inventory_transactions t
        LEFT JOIN product_shard_lookup l ON t.product_id = l.product_id
        ORDER BY t.created_at DESC
        LIMIT 10
      `);

      // 2. Resolve Multi-Cloud stats (Mongo + Cloudinary + Postgres products)
      const totalProductsCount = this.lookupRepository.countAll();
      const lowStockProducts = this.productRepository.getLowStockAcrossShards(5);
      const categoryAnalytics = this.productRepository.getCategoryCountsAcrossShards();

      const [
        orderCountRes,
        revenueRes,
        recentTxnsRes,
        productsCount,
        lowStockList,
        categoriesList
      ] = await Promise.all([
        orderCountQuery,
        revenueQuery,
        recentTxnsQuery,
        totalProductsCount,
        lowStockProducts,
        categoryAnalytics
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalProducts: productsCount,
          totalOrders: parseInt(orderCountRes.rows[0].count, 10),
          totalRevenue: parseFloat(revenueRes.rows[0].total),
          lowStockAlerts: lowStockList.length,
          categoryAnalytics: categoriesList,
          recentInventoryTransactions: recentTxnsRes.rows,
          lowStockProducts: lowStockList.map(p => ({
            id: p._id,
            name: p.name,
            stock: p.stock,
            category: p.category
          }))
        }
      });
    } catch (error: any) {
      console.error('Controller error in getStatsSummary:', error);
      res.status(500).json({ success: false, message: 'Failed to retrieve admin stats metrics.' });
    }
  };

  public restockProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { productId, quantity } = req.body;

      if (!productId || !quantity || Number(quantity) <= 0) {
        res.status(400).json({ success: false, message: 'Product ID and a positive restock quantity are required.' });
        return;
      }

      const lookup = await this.lookupRepository.getLookupById(productId);
      if (!lookup) {
        res.status(404).json({ success: false, message: 'Product shard mapping not found.' });
        return;
      }

      const product = await this.productRepository.getById(lookup.shard_name, productId, lookup.mongodb_collection);
      if (!product) {
        res.status(404).json({ success: false, message: 'Product data not found in sharded cluster.' });
        return;
      }

      const newStock = product.stock + Number(quantity);
      await this.productRepository.update(lookup.shard_name, productId, { stock: newStock }, lookup.mongodb_collection);

      const txnId = `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await pgPool.query(
        `INSERT INTO inventory_transactions (transaction_id, product_id, quantity_change, transaction_type, reference_id) 
         VALUES ($1, $2, $3, 'restock', 'admin_restock')`,
        [txnId, productId, Number(quantity)]
      );

      res.status(200).json({
        success: true,
        message: 'Product stock updated and logged successfully.',
        data: {
          productId,
          previousStock: product.stock,
          newStock
        }
      });
    } catch (error: any) {
      console.error('Controller error in restockProduct:', error);
      res.status(500).json({ success: false, message: error.message || 'Restock action failed.' });
    }
  };
}
