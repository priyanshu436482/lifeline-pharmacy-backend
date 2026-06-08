import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';

export class ProductController {
  private productService = new ProductService();

  public createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, price, description, category, stock, isFeatured, image } = req.body;

      if (!name || !price || !category || stock === undefined || !image) {
        res.status(400).json({ success: false, message: 'Name, price, category, stock, and image are required.' });
        return;
      }

      const productPayload = {
        name,
        price: Number(price),
        description,
        category,
        stock: Number(stock),
        isFeatured: Boolean(isFeatured),
        slug: ''
      };

      const product = await this.productService.createProduct(productPayload, image);
      res.status(201).json({ success: true, data: product });
    } catch (error: any) {
      console.error('Controller error in createProduct:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal Server Error' });
    }
  };

  public getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ success: false, message: 'Product ID is required.' });
        return;
      }

      const product = await this.productService.getProductById(id);
      res.status(200).json({ success: true, data: product });
    } catch (error: any) {
      console.error('Controller error in getProductById:', error);
      res.status(404).json({ success: false, message: error.message || 'Product not found.' });
    }
  };

  public updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, price, description, category, stock, isFeatured, image } = req.body;

      if (!id) {
        res.status(400).json({ success: false, message: 'Product ID is required.' });
        return;
      }

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (price !== undefined) updates.price = Number(price);
      if (description !== undefined) updates.description = description;
      if (category !== undefined) updates.category = category;
      if (stock !== undefined) updates.stock = Number(stock);
      if (isFeatured !== undefined) updates.isFeatured = Boolean(isFeatured);

      const product = await this.productService.updateProduct(id, updates, image);
      res.status(200).json({ success: true, data: product });
    } catch (error: any) {
      console.error('Controller error in updateProduct:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to update product.' });
    }
  };

  public deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ success: false, message: 'Product ID is required.' });
        return;
      }

      await this.productService.deleteProduct(id);
      res.status(200).json({ success: true, message: 'Product successfully deleted.' });
    } catch (error: any) {
      console.error('Controller error in deleteProduct:', error);
      res.status(500).json({ success: false, message: error.message || 'Failed to delete product.' });
    }
  };

  public searchProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const q = req.query.q as string;
      const category = req.query.category as string;
      const productId = req.query.productId as string;
      const page = parseInt(req.query.page as string || '1', 10);
      const limit = parseInt(req.query.limit as string || '10', 10);

      const results = await this.productService.searchProducts({ q, category, productId, page, limit });
      res.status(200).json({
        success: true,
        data: results.products,
        pagination: {
          page,
          limit,
          total: results.total
        }
      });
    } catch (error: any) {
      console.error('Controller error in searchProducts:', error);
      res.status(500).json({ success: false, message: 'Failed to search/load products list.' });
    }
  };
}
