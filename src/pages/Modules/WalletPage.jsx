import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdClose, MdSearch, MdDelete, MdAccountBalanceWallet, MdShoppingCart } from 'react-icons/md';

export default function WalletPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [student, setStudent] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const [items, setItems] = useState([]);
  const [cart, setCart] = useState([]);

  const [showTopup, setShowTopup] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', price: '' });
  const [saving, setSaving] = useState(false);

  const loadItems = async () => {
    try {
      const { data } = await api.get('/wallet/items/list');
      setItems(data || []);
    } catch {
      setItems([]);
    }
  };

  useEffect(() => { if (profile) loadItems(); }, [profile]);

  const searchStudents = async (val) => {
    setStudentSearch(val);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 10, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const loadWallet = async (s) => {
    setStudent(s);
    setStudentResults([]);
    setStudentSearch('');
    setCart([]);
    try {
      const { data } = await api.get(`/wallet/${s.id}`);
      setWallet(data.wallet);
      setTransactions(data.transactions);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load wallet');
    }
  };

  const handleTopup = async () => {
    if (!topupAmount || Number(topupAmount) <= 0) { notification.error('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await api.post(`/wallet/${student.id}/topup`, { amount: Number(topupAmount) });
      notification.success('Wallet topped up!');
      setShowTopup(false);
      setTopupAmount('');
      loadWallet(student);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to top up');
    } finally {
      setSaving(false);
    }
  };

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => (c.id === item.id ? { ...c, qty: c.qty + 1 } : c));
      return [...prev, { id: item.id, name: item.name, price: Number(item.price), qty: 1 }];
    });
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);

  const handlePurchase = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      await api.post(`/wallet/${student.id}/purchase`, { items: cart });
      notification.success('Purchase completed!');
      setCart([]);
      loadWallet(student);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Purchase failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!itemForm.name.trim() || !itemForm.price) { notification.error('Name and price required'); return; }
    setSaving(true);
    try {
      await api.post('/wallet/items', { name: itemForm.name, price: Number(itemForm.price) });
      notification.success('Item added!');
      setShowItemModal(false);
      setItemForm({ name: '', price: '' });
      loadItems();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Remove "${item.name}"?`)) return;
    try {
      await api.delete(`/wallet/items/${item.id}`);
      setItems(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to remove');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Canteen & Student Wallet</h1>
          <Button variant="secondary" onClick={() => setShowItemModal(true)}>
            <MdAdd className="inline mr-1" /> Manage Menu
          </Button>
        </div>

        <GlassCard className="p-4">
          <div className="relative">
            <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
            <input className="input-glass w-full pl-9" placeholder="Search student..." value={studentSearch} onChange={e => searchStudents(e.target.value)} />
          </div>
          {studentResults.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
              {studentResults.map(s => (
                <button key={s.id} onClick={() => loadWallet(s)} className="w-full text-left px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-white/80 transition">
                  {s.first_name} {s.last_name} · Class {s.class_name}
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {!student ? (
          <GlassCard className="p-10 text-center text-white/40">Search and select a student to manage their wallet.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <GlassCard className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-bold">{student.first_name} {student.last_name}</p>
                    <p className="text-white/40 text-xs">Class {student.class_name}</p>
                  </div>
                  <Button variant="primary" onClick={() => setShowTopup(true)}>
                    <MdAccountBalanceWallet className="inline mr-1 w-4 h-4" /> Top Up
                  </Button>
                </div>
                <p className="text-white/50 text-xs">Balance</p>
                <p className="text-3xl font-bold text-emerald-400">₹{Number(wallet?.balance || 0).toFixed(2)}</p>
              </GlassCard>

              <GlassCard className="p-4">
                <p className="text-white/70 text-sm font-semibold mb-2">Recent Transactions</p>
                {transactions.length === 0 ? (
                  <p className="text-white/40 text-sm text-center py-4">No transactions yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transactions.map(t => (
                      <div key={t.id} className="flex justify-between items-center text-sm">
                        <div>
                          <p className="text-white/70 capitalize">{t.type}</p>
                          <p className="text-white/30 text-xs">{new Date(t.created_at).toLocaleString()}</p>
                        </div>
                        <p className={t.type === 'topup' ? 'text-emerald-400' : 'text-red-400'}>{t.type === 'topup' ? '+' : '-'}₹{Number(t.amount).toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>

            <GlassCard className="p-5">
              <p className="text-white/70 text-sm font-semibold mb-3">Canteen Menu</p>
              {items.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-4">No items in menu yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {items.map(item => (
                    <button key={item.id} onClick={() => addToCart(item)} className="text-left bg-white/5 hover:bg-white/10 rounded-lg p-3 transition">
                      <p className="text-white text-sm font-semibold">{item.name}</p>
                      <p className="text-white/50 text-xs">₹{Number(item.price).toFixed(2)}</p>
                    </button>
                  ))}
                </div>
              )}

              {cart.length > 0 && (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-white/70 text-sm font-semibold mb-2">Cart</p>
                  {cart.map(c => (
                    <div key={c.id} className="flex justify-between text-sm text-white/60 mb-1">
                      <span>{c.name} x{c.qty}</span>
                      <span>₹{(c.price * c.qty).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-white font-bold mt-2 pt-2 border-t border-white/10">
                    <span>Total</span>
                    <span>₹{cartTotal.toFixed(2)}</span>
                  </div>
                  <Button variant="primary" loading={saving} onClick={handlePurchase} className="w-full mt-3">
                    <MdShoppingCart className="inline mr-1 w-4 h-4" /> Complete Purchase
                  </Button>
                </div>
              )}
            </GlassCard>
          </div>
        )}

        {showTopup && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-sm p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Top Up Wallet</h3>
                <button onClick={() => setShowTopup(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <Input label="Amount" type="number" required value={topupAmount} onChange={e => setTopupAmount(e.target.value)} />
              <div className="flex gap-2 pt-1">
                <Button variant="primary" loading={saving} onClick={handleTopup}>Top Up</Button>
                <Button variant="secondary" onClick={() => setShowTopup(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {showItemModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Manage Canteen Menu</h3>
                <button onClick={() => setShowItemModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                <input className="input-glass flex-1" placeholder="Item name" value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
                <input className="input-glass w-24" type="number" placeholder="Price" value={itemForm.price} onChange={e => setItemForm(f => ({ ...f, price: e.target.value }))} />
                <Button variant="primary" loading={saving} onClick={handleAddItem}>Add</Button>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between items-center bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white/70 text-sm">{item.name} — ₹{Number(item.price).toFixed(2)}</span>
                    <button onClick={() => handleDeleteItem(item)} className="text-red-400/60 hover:text-red-400"><MdDelete className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
