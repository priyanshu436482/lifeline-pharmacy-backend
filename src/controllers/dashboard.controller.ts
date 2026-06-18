import { Request, Response } from 'express';
import { Model } from 'mongoose';
import { getMongoShardAConnection } from '../config/database';
import { OrderSchema, IOrderDocument } from '../schemas/order.schema';
import { TransactionSchema, IInventoryTransactionDocument } from '../schemas/transaction.schema';
import { LookupSchema, IShardLookupDocument } from '../schemas/lookup.schema';
import { ProductRepository } from '../repositories/product.repository';
import { LookupRepository } from '../repositories/lookup.repository';

export class DashboardController {
  private productRepository = new ProductRepository();
  private lookupRepository = new LookupRepository();

  private getOrderModel(): Model<IOrderDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IOrderDocument>('Order', OrderSchema);
  }

  private getTransactionModel(): Model<IInventoryTransactionDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IInventoryTransactionDocument>('InventoryTransaction', TransactionSchema, 'inventory_transactions');
  }

  private getLookupModel(): Model<IShardLookupDocument> {
    const conn = getMongoShardAConnection();
    return conn.model<IShardLookupDocument>('ProductLookup', LookupSchema);
  }

  public getStatsSummary = async (req: Request, res: Response): Promise<void> => {
    try {
      const OrderModel = this.getOrderModel();
      const TransactionModel = this.getTransactionModel();
      const LookupModel = this.getLookupModel();

      // 1. Resolve MongoDB Stats (Orders & Revenue)
      const orderCountQuery = OrderModel.countDocuments().exec();
      
      const revenueQuery = OrderModel.aggregate([
        { $match: { payment_status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } }
      ]).exec();

      // 2. Resolve recent transactions (with details)
      const recentTxnsQuery = TransactionModel.find()
        .sort({ created_at: -1 })
        .limit(10)
        .exec();

      // 3. Resolve Multi-Cloud stats (MongoDB + Cloudinary products)
      const totalProductsCount = this.lookupRepository.countAll();
      const lowStockProducts = this.productRepository.getLowStockAcrossShards(5);
      const categoryAnalytics = this.productRepository.getCategoryCountsAcrossShards();

      const [
        orderCount,
        revenueRes,
        recentTxns,
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

      const totalRevenue = revenueRes.length > 0 ? revenueRes[0].total : 0;

      // Join inventory logs with product names (simulated or via quick map lookup)
      const recentTransactionsWithNames = await Promise.all(
        recentTxns.map(async (txn) => {
          const lookup = await LookupModel.findOne({ product_id: txn.product_id }).exec();
          return {
            transaction_id: txn.transaction_id,
            product_id: txn.product_id,
            product_name: lookup ? lookup.product_name : 'Unknown Product',
            quantity_change: txn.quantity_change,
            transaction_type: txn.transaction_type,
            reference_id: txn.reference_id,
            created_at: txn.created_at
          };
        })
      );

      res.status(200).json({
        success: true,
        data: {
          totalProducts: productsCount,
          totalOrders: orderCount,
          totalRevenue: totalRevenue,
          lowStockAlerts: lowStockList.length,
          categoryAnalytics: categoriesList,
          recentInventoryTransactions: recentTransactionsWithNames,
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
      
      const TransactionModel = this.getTransactionModel();
      const newTxn = new TransactionModel({
        transaction_id: txnId,
        product_id: productId,
        quantity_change: Number(quantity),
        transaction_type: 'restock',
        reference_id: 'admin_restock'
      });
      await newTxn.save();

      res.status(200).json({
        success: true,
        message: 'Product stock updated and logged successfully.',
        data: {
          productId,
          newStock
        }
      });
    } catch (error: any) {
      console.error('Controller error in restockProduct:', error);
      res.status(500).json({ success: false, message: 'Failed to update product stock.' });
    }
  };
}
