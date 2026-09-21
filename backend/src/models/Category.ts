import { Schema, model, Document } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  slug: string;
  colorCode: string;
  createdSource: 'SYSTEM' | 'USER';
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    colorCode: { type: String, default: '#3B82F6' },
    createdSource: { type: String, enum: ['SYSTEM', 'USER'], default: 'SYSTEM' }
  },
  { timestamps: true }
);

export const CategoryModel = model<ICategory>('Category', CategorySchema);
