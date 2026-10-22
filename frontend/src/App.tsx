import React, { useState, useEffect } from 'react';
import { Layers, ShoppingBag, AlertTriangle, RotateCw, Plus, ArrowUpRight, ArrowDownRight, Search, CheckCircle2, Box, Trash2 } from 'lucide-react';

const API_URL = 'http://localhost:8080/api';

interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  last_movement_at?: string;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'low'>('all');

  // Stock Adjustment Modal
  const [selectedProd, setSelectedProd] = useState<Product | null>(null);
  const [adjType, setAdjType] = useState<'in' | 'out'>('in');
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjNote, setAdjNote] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Create Order State
  const [customer, setCustomer] = useState('');
  const [orderItems, setOrderItems] = useState<{ sku: string; qty: number }[]>([{ sku: '', qty: 1 }]);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);

  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/products?search=${search}`);
      if (!res.ok) throw new Error('Gagal mengambil data produk');
      const data = await res.json();
      setProducts(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Koneksi server terputus');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const formatRupiah = (num: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  const filteredProducts = products.filter(p => {
    if (filter === 'active') return p.is_active;
    if (filter === 'inactive') return !p.is_active;
    if (filter === 'low') return p.stock <= 10;
    return true;
  });

  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.is_active).length;
  const totalStockValue = products.reduce((acc, p) => acc + (p.price * p.stock), 0);
  const lowStockCount = products.filter(p => p.stock <= 10).length;

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProd) return;
    setSaving(true);
    setAdjError(null);

    try {
      const res = await fetch(`${API_URL}/products/${selectedProd.id}/stock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: adjType, qty: adjQty, note: adjNote })
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.error?.code === 'INSUFFICIENT_STOCK') {
          setAdjError(`Stok tidak mencukupi! Stok tersedia: ${data.error.available}`);
          return;
        }
        throw new Error(data.error?.message || 'Gagal mengubah stok');
      }

      setSelectedProd(null);
      setAdjNote('');
      setAdjQty(1);
      fetchProducts();
    } catch (err: any) {
      setAdjError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    setOrderSuccess(null);

    if (!customer.trim()) {
      setOrderError('Nama pelanggan wajib diisi');
      return;
    }

    const validItems = orderItems.filter(i => i.sku && i.qty > 0);
    if (validItems.length === 0) {
      setOrderError('Pilih minimal 1 SKU dan jumlah barang');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, items: validItems })
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409 && data.error?.code === 'INSUFFICIENT_STOCK') {
          setOrderError(`Gagal: SKU ${data.error.sku} stok kurang (Tersedia: ${data.error.available})`);
          return;
        }
        throw new Error(data.error?.message || 'Gagal membuat pesanan');
      }

      setOrderSuccess(`Pesanan #${data.id} berhasil dibuat! Total: ${formatRupiah(data.total)}`);
      setCustomer('');
      setOrderItems([{ sku: '', qty: 1 }]);
      fetchProducts();
    } catch (err: any) {
      setOrderError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans antialiased pb-12">
      {/* Top Navbar */}
      <header className="bg-slate-950 border-b border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-md shadow-indigo-500/20">
              <Layers size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">StockFlow <span className="text-xs font-semibold uppercase px-2 py-0.5 bg-indigo-950 text-indigo-400 border border-indigo-800/60 rounded">Enterprise</span></h1>
              <p className="text-xs text-slate-400">Warehouse Inventory & Order Engine</p>
            </div>
          </div>
          <button 
            onClick={fetchProducts} 
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-medium transition"
          >
            <RotateCw size={14} className={loading ? 'animate-spin text-indigo-400' : ''} /> Refresh Sync
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-6 space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-850 bg-slate-800/50 border border-slate-800 p-4 rounded-xl">
            <div className="flex justify-between items-start text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase">Total SKU</span>
              <Box size={16} className="text-slate-500" />
            </div>
            <p className="text-2xl font-bold text-white tracking-tight">{totalProducts}</p>
            <span className="text-[11px] text-slate-500">Item terdaftar</span>
          </div>

          <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-xl">
            <div className="flex justify-between items-start text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase">Item Aktif</span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400 tracking-tight">{activeProducts}</p>
            <span className="text-[11px] text-slate-500">Siap dijual</span>
          </div>

          <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-xl">
            <div className="flex justify-between items-start text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase">Valuasi Stok</span>
              <span className="text-indigo-400 text-xs font-bold">IDR</span>
            </div>
            <p className="text-2xl font-bold text-indigo-300 tracking-tight">{formatRupiah(totalStockValue)}</p>
            <span className="text-[11px] text-slate-500">Total aset gudang</span>
          </div>

          <div className="bg-slate-800/50 border border-slate-800 p-4 rounded-xl">
            <div className="flex justify-between items-start text-slate-400 mb-2">
              <span className="text-xs font-semibold tracking-wider uppercase">Peringatan Stok</span>
              <AlertTriangle size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-400 tracking-tight">{lowStockCount}</p>
            <span className="text-[11px] text-amber-500/80">Stok menipis (≤ 10)</span>
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table Products (Left Side - 2 Cols) */}
          <div className="lg:col-span-2 bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari SKU atau nama produk..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-1 bg-slate-900 p-1 border border-slate-800 rounded-lg text-xs font-medium w-full sm:w-auto justify-center">
                {(['all', 'active', 'inactive', 'low'] as const).map(f => (
                  <button 
                    key={f} 
                    onClick={() => setFilter(f)} 
                    className={`px-3 py-1 rounded-md capitalize transition ${filter === f ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {f === 'low' ? 'Low Stock' : f}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="text-center py-16 text-slate-500 text-xs">Memuat katalog inventaris...</div>
            ) : error ? (
              <div className="p-4 bg-red-950/40 border border-red-800/60 text-red-400 rounded-lg text-xs flex items-center justify-between">
                <span>{error}</span>
                <button onClick={fetchProducts} className="underline font-semibold">Coba Lagi</button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-800/80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Nama Barang</th>
                      <th className="p-3">Harga Unit</th>
                      <th className="p-3">Stok</th>
                      <th className="p-3 text-right">Opsi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {filteredProducts.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-10 text-slate-500">Tidak ada produk ditemukan</td></tr>
                    ) : (
                      filteredProducts.map(p => (
                        <tr key={p.id} className="hover:bg-slate-900/60 transition">
                          <td className="p-3 font-mono font-bold text-indigo-400">{p.sku}</td>
                          <td className="p-3 font-medium text-slate-200">{p.name}</td>
                          <td className="p-3 text-slate-300">{formatRupiah(p.price)}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                              p.stock <= 10 
                                ? 'bg-amber-950/40 border-amber-800/60 text-amber-400' 
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}>
                              {p.stock} pcs
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <button 
                              onClick={() => setSelectedProd(p)}
                              className="px-2.5 py-1 bg-indigo-950 hover:bg-indigo-900 border border-indigo-800/80 text-indigo-300 rounded text-[11px] font-medium transition"
                            >
                              Adjust
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Create Sales Order Form (Right Side) */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 h-fit">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <ShoppingBag size={18} className="text-indigo-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">Buat Sales Order Baru</h2>
            </div>

            {orderError && (
              <div className="p-3 bg-red-950/40 border border-red-800/60 text-red-400 rounded-lg text-xs font-medium">
                {orderError}
              </div>
            )}
            {orderSuccess && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 rounded-lg text-xs font-medium">
                {orderSuccess}
              </div>
            )}

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Nama Customer</label>
                <input 
                  type="text" 
                  required
                  placeholder="contoh: PT Mandiri Jaya" 
                  value={customer}
                  onChange={e => setCustomer(e.target.value)}
                  className="w-full p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Daftar Item</label>
                {orderItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select 
                        value={item.sku} 
                        onChange={e => {
                        const updated = [...orderItems];
                        updated[idx].sku = e.target.value;
                        setOrderItems(updated);
                        }}
                        className="w-[calc(100%-4.5rem)] p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                        <option value="">-- Pilih Barang --</option>
                        {products.map(p => (
                        <option key={p.sku} value={p.sku}>{p.sku} - {p.name} (Stok: {p.stock})</option>
                        ))}
                    </select>

                    <input 
                        type="number" 
                        min="1"
                        value={item.qty}
                        onChange={e => {
                        const updated = [...orderItems];
                        updated[idx].qty = parseInt(e.target.value) || 1;
                        setOrderItems(updated);
                        }}
                        className="w-14 p-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 text-center focus:outline-none focus:border-indigo-500 shrink-0"
                    />

                    {orderItems.length > 1 && (
                        <button 
                        type="button" 
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                        className="p-1.5 text-slate-500 hover:text-red-400 transition shrink-0"
                        >
                        <Trash2 size={14} />
                        </button>
                    )}
                </div>
                ))}
                <button 
                  type="button" 
                  onClick={() => setOrderItems([...orderItems, { sku: '', qty: 1 }])}
                  className="text-xs text-indigo-400 font-semibold hover:text-indigo-300 flex items-center gap-1 pt-1"
                >
                  <Plus size={14} /> Tambah Barang Lain
                </button>
              </div>

              <button 
                type="submit" 
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs shadow-md shadow-indigo-600/20 transition"
              >
                Proses Sales Order
              </button>
            </form>
          </div>
        </div>

        {/* Modal Adjust Stock */}
        {selectedProd && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white">Adjust Stok - <span className="font-mono text-indigo-400">{selectedProd.sku}</span></h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedProd.name} (Stok Sekarang: {selectedProd.stock})</p>
              </div>

              {adjError && (
                <div className="p-3 bg-red-950/40 border border-red-800/60 text-red-400 rounded-lg text-xs font-medium">
                  {adjError}
                </div>
              )}

              <form onSubmit={handleAdjustStock} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setAdjType('in')}
                    className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${adjType === 'in' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    <ArrowDownRight size={16} /> Stok Masuk
                  </button>
                  <button 
                    type="button"
                    onClick={() => setAdjType('out')}
                    className={`p-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${adjType === 'out' ? 'bg-amber-950/60 text-amber-400 border-amber-800/80' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                  >
                    <ArrowUpRight size={16} /> Stok Keluar
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Jumlah (Qty)</label>
                  <input 
                    type="number" 
                    min="1"
                    required
                    value={adjQty}
                    onChange={e => setAdjQty(parseInt(e.target.value) || 1)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Catatan / Alasan</label>
                  <input 
                    type="text" 
                    placeholder="contoh: Restok vendor / Barang rusak" 
                    value={adjNote}
                    onChange={e => setAdjNote(e.target.value)}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-3 border-t border-slate-800">
                  <button 
                    type="button" 
                    onClick={() => setSelectedProd(null)} 
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition"
                  >
                    {saving ? 'Menyimpan...' : 'Simpan Penyesuaian'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}