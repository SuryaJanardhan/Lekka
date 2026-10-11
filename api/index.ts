import app, { connectDatabase } from '../backend/src/server';

export default async function handler(req: any, res: any) {
  await connectDatabase();
  return app(req, res);
}
