export interface IProduct {
  _id?: any;
  name: string;
  price: number;
  description?: string;
  category: string;
  imageUrl?: string;
  stock: number;
  slug?: string;
  isFeatured?: boolean;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IShardLookup {
  product_id: string;
  product_name: string;
  shard_name: 'shard_a' | 'shard_b' | 'shard_c';
  mongodb_collection: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface IUser {
  user_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  password_hash?: string;
  avatar_url?: string;
  google_id?: string;
  auth_provider?: string;
  created_at?: Date;
  updated_at?: Date;
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface IOrder {
  order_id: string;
  user_id: string;
  total_amount: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  shipping_address: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface IOrderItem {
  order_item_id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price_per_unit: number;
}

export interface ICart {
  cart_id: string;
  user_id: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ICartItem {
  cart_item_id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
}

export type TransactionType = 'restock' | 'sale' | 'adjustment' | 'return';

export interface IInventoryTransaction {
  transaction_id: string;
  product_id: string;
  quantity_change: number;
  transaction_type: TransactionType;
  reference_id?: string;
  created_at?: Date;
}

export interface IDashboardStats {
  totalProducts: number;
  totalOrders: number;
  totalRevenue: number;
  lowStockAlerts: number;
  categoryAnalytics: { category: string; count: number }[];
  recentInventoryTransactions: any[];
}
