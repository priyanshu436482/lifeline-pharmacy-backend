import cloudinary from '../config/cloudinary';

export class CloudinaryService {
  
  /**
   * Upload an image file to Cloudinary and return the secure URL.
   */
  public async uploadImage(fileData: string, folder: string = 'products'): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(fileData, {
        folder: `lifeline-pharmacy/${folder}`,
        resource_type: 'image'
      });
      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary image upload error:', error);
      throw new Error('Failed to upload image to Cloudinary.');
    }
  }

  /**
   * Delete an image from Cloudinary.
   */
  public async deleteImage(imageUrl: string): Promise<void> {
    if (!imageUrl) return;

    try {
      const parts = imageUrl.split('/');
      const filenameWithExtension = parts.pop();
      const folderName = parts.pop();
      const parentFolder = parts.pop();

      if (!filenameWithExtension || !folderName || !parentFolder) return;

      const publicId = `${parentFolder}/${folderName}/${filenameWithExtension.split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      console.error('Cloudinary image delete error:', error);
    }
  }

  /**
   * Save a product document as a raw JSON file on Cloudinary (used for Shard B: J-R products).
   * Returns the secure URL of the uploaded JSON file.
   */
  public async uploadProductJson(productId: string, data: any): Promise<string> {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const base64Data = Buffer.from(jsonStr).toString('base64');
      const dataUri = `data:application/json;base64,${base64Data}`;

      const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'lifeline-pharmacy/products_jr',
        public_id: `${productId}.json`,
        resource_type: 'raw'
      });

      return result.secure_url;
    } catch (error) {
      console.error('Cloudinary JSON upload error:', error);
      throw new Error('Failed to upload sharded product JSON to Cloudinary.');
    }
  }

  /**
   * Read product JSON content directly from Cloudinary URL (used for Shard B: J-R products).
   */
  public async downloadProductJson(jsonUrl: string): Promise<any> {
    try {
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch JSON file. Status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Cloudinary JSON download error:', error);
      throw new Error('Failed to retrieve sharded product JSON from Cloudinary.');
    }
  }

  /**
   * Delete product JSON file from Cloudinary (used for Shard B: J-R products).
   */
  public async deleteProductJson(productId: string): Promise<void> {
    try {
      const publicId = `lifeline-pharmacy/products_jr/${productId}.json`;
      console.log(`Deleting raw JSON asset from Cloudinary: ${publicId}`);
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (error) {
      console.error('Cloudinary JSON delete error:', error);
    }
  }
}

export const cloudinaryService = new CloudinaryService();
