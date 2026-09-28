import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import AppLayout from '@/components/AppLayout';

const PRODUCT_IMAGE_BUCKET = 'product-images';

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    if (!user) return;
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleAddProduct(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setError('Please enter a product name.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      let imageUrl: string | null = null;

      if (imageFile) {
        const ext = imageFile.name.split('.').pop() || 'jpg';
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from(PRODUCT_IMAGE_BUCKET)
          .upload(path, imageFile, { contentType: imageFile.type || 'image/jpeg' });
        if (uploadError) throw new Error(`Image upload failed: ${uploadError.message}`);
        const { data: publicUrlData } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
        imageUrl = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase.from('products').insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim(),
        image_url: imageUrl,
      });
      if (insertError) throw new Error(insertError.message);

      setName('');
      setDescription('');
      setImageFile(null);
      setImagePreview(null);
      await loadProducts();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add product.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    const { error } = await supabase.from('products').delete().eq('id', product.id);
    if (!error) {
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    }
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Products</h1>
          <p className="mt-1 text-sm text-gray-500">Add the products you advertise so you can reference them when creating campaign runs.</p>
        </div>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 px-5 py-4">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Couldn't add product</p>
              <p className="mt-0.5 text-xs text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* Add product form */}
        <form onSubmit={handleAddProduct} className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-base font-semibold text-gray-900">Add a product</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Product name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rhino Hanger"
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Product photo (optional)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImageChange}
                className="mt-1.5 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="e.g. Heavy-duty tactical steel hanger for outdoor and tactical gear."
              className="mt-1.5 w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
            />
          </div>
          {imagePreview && (
            <div className="mt-4 flex items-center gap-3">
              <img src={imagePreview} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <span className="text-xs text-gray-500">{imageFile?.name}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={saving}
            className={`mt-5 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              saving ? 'cursor-not-allowed bg-gray-100 text-gray-400' : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Adding...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add product
              </>
            )}
          </button>
        </form>

        {/* Product list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900" />
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-400">No products added yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <div key={product.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex h-40 items-center justify-center bg-gray-50">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <svg className="h-10 w-10 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{product.name}</p>
                    <button
                      onClick={() => handleDelete(product)}
                      className="flex-shrink-0 text-xs font-medium text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  {product.description && (
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2">{product.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
