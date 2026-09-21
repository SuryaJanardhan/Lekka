import { Request, Response } from 'express';
import { CategoryModel } from '../models/Category.js';

export class CategoryController {
  public static async getCategories(_req: Request, res: Response) {
    try {
      const categories = await CategoryModel.find({}).sort({ name: 1 });
      res.json({ success: true, count: categories.length, data: categories });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public static async createCategory(req: Request, res: Response) {
    try {
      const { name, colorCode } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Category name is required' });

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const existing = await CategoryModel.findOne({ slug });
      if (existing) return res.status(400).json({ success: false, error: 'Category already exists' });

      const category = new CategoryModel({
        name,
        slug,
        colorCode: colorCode || '#3B82F6',
        createdSource: 'USER'
      });

      await category.save();
      res.status(201).json({ success: true, data: category });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
}
