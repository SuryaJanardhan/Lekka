const palette = ['#0f766e', '#dc2626', '#2563eb', '#d97706', '#9333ea', '#db2777', '#65a30d', '#0891b2', '#7c2d12', '#475569', '#4f46e5', '#be123c'];

export function categoryColors(categories: Array<{ _id: unknown }>): Map<string, string> {
  const sorted = [...categories].sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return new Map(sorted.map((category, index) => [String(category._id), palette[index] || `hsl(${Math.round(index * 137.508) % 360}, 65%, 42%)`]));
}
