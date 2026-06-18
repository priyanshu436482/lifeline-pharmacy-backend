import { IProduct } from '../types';

export function pgRowToProduct(row: Record<string, unknown>): IProduct {
  return {
    _id: row.product_id as string,
    name: row.name as string,
    price: parseFloat(String(row.price)),
    description: row.description as string,
    category: row.category as string,
    imageUrl: row.image_url as string,
    stock: row.stock as number,
    slug: row.slug as string,
    isFeatured: row.is_featured as boolean,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
