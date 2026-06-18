export class ProductShardRouter {
  
  /**
   * Determine the correct shard name based on the starting character of the product name.
   * - A–I => shard_a (MongoDB Atlas)
   * - J–R => shard_b (Cloudinary raw JSONs)
   * - S-Z => shard_c (MongoDB products_sz)
   */
  public static getShardNameByName(productName: string): 'shard_a' | 'shard_b' | 'shard_c' {
    if (!productName || productName.trim().length === 0) {
      return 'shard_a'; // Fallback
    }

    const firstChar = productName.trim().toUpperCase().charAt(0);

    if (firstChar >= 'A' && firstChar <= 'I') {
      return 'shard_a';
    } else if (firstChar >= 'J' && firstChar <= 'R') {
      return 'shard_b';
    } else if (firstChar >= 'S' && firstChar <= 'Z') {
      return 'shard_c';
    }

    // Default fallback
    return 'shard_a';
  }
}
