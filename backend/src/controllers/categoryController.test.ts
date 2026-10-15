import test from 'node:test';
import assert from 'node:assert/strict';
import { CategoryController } from './categoryController';
import { CategoryModel } from '../models/Category';

function response() {
  return { code: 200, payload: null as any, status(code: number) { this.code = code; return this; }, json(payload: any) { this.payload = payload; return this; } };
}
test('rename preserves the category ID and validates name before database writes', async (t) => {
  const id = '507f1f77bcf86cd799439011';
  t.mock.method(CategoryModel, 'findOne', async () => null);
  let updatedId = '';
  const update = t.mock.method(CategoryModel, 'findByIdAndUpdate', async (categoryId: string, change: any) => {
    updatedId = categoryId;
    return { _id: categoryId, ...change.$set };
  });
  const res = Object.assign(Object.create(null), response());
  await CategoryController.renameCategory(Object.assign(Object.create(null), { params: { id }, body: { name: 'Meals' } }), res);
  assert.equal(updatedId, id);
  assert.equal(res.payload.data.name, 'Meals');
  assert.equal(res.payload.data._id, id);
  const invalidResponse = Object.assign(Object.create(null), response());
  await CategoryController.renameCategory(Object.assign(Object.create(null), { params: { id }, body: { name: ' ' } }), invalidResponse);
  assert.equal(invalidResponse.code, 400);
  assert.equal(update.mock.callCount(), 1);
});
