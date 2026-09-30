import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { CategoryModel } from '../models/Category';

const MOCK_CATEGORIES = [
  { _id: 'c1', name: 'Invoices & Receipts', slug: 'invoices-receipts', colorCode: '#059669', createdSource: 'SYSTEM' },
  { _id: 'c2', name: 'Alerts & Security', slug: 'alerts-security', colorCode: '#DC2626', createdSource: 'SYSTEM' },
  { _id: 'c3', name: 'Orders & Delivery', slug: 'orders-delivery', colorCode: '#D97706', createdSource: 'SYSTEM' },
  { _id: 'c4', name: 'Financial Statements', slug: 'financial-statements', colorCode: '#7C3AED', createdSource: 'SYSTEM' },
  { _id: 'c5', name: 'General', slug: 'general', colorCode: '#6B7280', createdSource: 'SYSTEM' }
];

export class CategoryController {
  public static async getCategories(_req: Request, res: Response) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.json({ success: true, count: MOCK_CATEGORIES.length, data: MOCK_CATEGORIES });
      }
      const categories = await CategoryModel.find({}).sort({ name: 1 });
      res.json({ success: true, count: categories.length, data: categories });
    } catch (error: any) {
      res.json({ success: true, count: MOCK_CATEGORIES.length, data: MOCK_CATEGORIES });
    }
  }

  public static async createCategory(req: Request, res: Response) {
    try {
      const { name, colorCode } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Category name is required' });

      if (mongoose.connection.readyState !== 1) {
        return res.status(201).json({
          success: true,
          data: { _id: `c_${Date.now()}`, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), colorCode: colorCode || '#3B82F6', createdSource: 'USER' }
        });
      }

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
