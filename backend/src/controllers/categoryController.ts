import { Request, Response } from 'express';
import { CategoryModel } from '../models/Category';
import { Types } from 'mongoose';

export class CategoryController {
  public static async renameCategory(req: Request, res: Response) {
    try {
      if (!Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'Invalid category ID' });
      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name || name.length > 80) return res.status(400).json({ success: false, error: 'Category name must contain 1 to 80 characters' });
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || req.params.id;
      const existing = await CategoryModel.findOne({ _id: { $ne: req.params.id }, $or: [{ slug }, { name }] });
      if (existing) return res.status(409).json({ success: false, error: 'Category already exists' });
      const category = await CategoryModel.findByIdAndUpdate(req.params.id, { $set: { name, slug, createdSource: 'USER' } }, { new: true, runValidators: true });
      if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
      res.json({ success: true, data: category });
    } catch (error: any) {
      res.status(error.code === 11000 ? 409 : 500).json({ success: false, error: error.code === 11000 ? 'Category already exists' : error.message });
    }
  }

  public static async getCategories(_req: Request, res: Response) {
    try {
      const categories = await CategoryModel.find({}).sort({ name: 1 });
      res.json({ success: true, count: categories.length, data: categories });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message, data: [] });
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
