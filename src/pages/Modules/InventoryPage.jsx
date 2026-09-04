import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdAdd, MdEdit, MdDelete, MdClose, MdWarning, MdArrowUpward, MdArrowDownward } from 'react-icons/md';

const EMPTY_ITEM = { name: '', category: '', unit: 'pcs', reorder_level: 0, location: '' };

export default function InventoryPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemSaving, setItemSaving] = useState(false);

  const [showStockModal, setShowStockModal] = useState(false);
  const [stockItem, setStockItem] = useState(null);
  const [stockType, setStockType] = useState('in');
  const [stockQty, setStockQty] = useState('');
  const [stockNote, setStockNote] = useState('');
  const [stockSaving, setStockSaving] = useState(false);

  const loadItems = async () => {
    if (!profile?.institution_id) return;
    setItemsLoading(true);
    setItemsError('');
    try {
      const { data } = await api.get('/inventory/items');
      setItems(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load inventory';
      setItemsError(message);
      notification.error(message);
    } finally {
      setItemsLoading(false);
    }
  };

  useEffect(() => { if (profile) loadItems(); }, [profile]);

  const openItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemForm({
        name: item.name || '', category: item.category || '', unit: item.unit || 'pcs',
        reorder_level: item.reorder_level || 0, location: item.location || '',
      });
    } else {
      setEditingItem(null);
      setItemForm(EMPTY_ITEM);
    }
    setShowItemModal(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name.trim()) { notification.error('Item name is required'); return; }
    setItemSaving(true);
    const payload = {
      name: itemForm.name.trim(), category: itemForm.category.trim(), unit: itemForm.unit.trim() || 'pcs',
      reorder_level: parseInt(itemForm.reorder_level, 10) || 0, location: itemForm.location.trim(),
    };
    try {
      const response = editingItem
        ? await api.put(`/inventory/items/${editingItem.id}`, payload)
        : await api.post('/inventory/items', payload);
      const saved = response.data;
      setItems(prev => (editingItem ? prev.map(i => (i.id === saved.id ? { ...i, ...saved } : i)) : [...prev, saved]));
      notification.success(editingItem ? 'Item updated!' : 'Item added!');
      setShowItemModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save item');
    } finally {
      setItemSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from inventory?`)) return;
    try {
      await api.delete(`/inventory/items/${item.id}`);
      setItems(prev => prev.filter(i => i.id !== item.id));
      notification.success('Item deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete item');
    }
  };

  const openStockModal = (item, type) => {
    setStockItem(item);
    setStockType(type);
    setStockQty('');
    setStockNote('');
    setShowStockModal(true);
  };

  const handleStockSubmit = async () => {
    const qty = parseInt(stockQty, 10);
    if (!qty || qty < 1) { notification.error('Enter a valid quantity'); return; }
    setStockSaving(true);
    try {
      const { data } = await api.post('/inventory/transactions', {
        item_id: stockItem.id, type: stockType, quantity: qty, note: stockNote.trim(),
      });
      setItems(prev => prev.map(i => (i.id === stockItem.id ? { ...i, quantity: data.newQuantity } : i)));
      notification.success(`Stock ${stockType === 'in' ? 'added' : 'removed'}!`);
      setShowStockModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to update stock');
    } finally {
      setStockSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Inventory</h1>
          <Button variant="primary" onClick={() => openItemModal()}>
            <MdAdd className="inline mr-1" /> Add Item
          </Button>
        </div>

        {itemsLoading ? (
          <div className="text-center py-12 text-white/50">Loading inventory...</div>
        ) : itemsError ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-300 font-semibold mb-1">Could not load inventory</p>
            <p className="text-white/50 text-sm mb-4">{itemsError}</p>
            <Button variant="secondary" size="sm" onClick={loadItems}>Retry</Button>
          </GlassCard>
        ) : items.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No items in inventory yet.</GlassCard>
        ) : (
          <GlassCard className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/50">Item</th>
                    <th className="text-left py-3 px-4 text-white/50">Category</th>
                    <th className="text-left py-3 px-4 text-white/50">Quantity</th>
                    <th className="text-left py-3 px-4 text-white/50">Location</th>
                    <th className="text-center py-3 px-4 text-white/50">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const low = item.quantity <= item.reorder_level;
                    return (
                      <tr key={item.id} className="border-b border-white/5 hover:bg-white/3 transition">
                        <td className="py-3 px-4 text-white font-medium">{item.name}</td>
                        <td className="py-3 px-4 text-white/60">{item.category || '—'}</td>
                        <td className="py-3 px-4">
                          <span className={`font-semibold ${low ? 'text-red-400' : 'text-white'}`}>
                            {item.quantity} {item.unit}
                          </span>
                          {low && <MdWarning className="inline ml-1 w-4 h-4 text-red-400" title="Below reorder level" />}
                        </td>
                        <td className="py-3 px-4 text-white/60">{item.location || '—'}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openStockModal(item, 'in')} className="text-emerald-400/70 hover:text-emerald-400 transition" title="Stock in">
                              <MdArrowDownward className="w-4 h-4" />
                            </button>
                            <button onClick={() => openStockModal(item, 'out')} className="text-amber-400/70 hover:text-amber-400 transition" title="Stock out">
                              <MdArrowUpward className="w-4 h-4" />
                            </button>
                            <button onClick={() => openItemModal(item)} className="text-blue-400/70 hover:text-blue-400 transition">
                              <MdEdit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDeleteItem(item)} className="text-red-400/60 hover:text-red-400 transition">
                              <MdDelete className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        )}

        {/* ─── ADD/EDIT ITEM MODAL ─────────────────────────────────── */}
        {showItemModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{editingItem ? 'Edit Item' : 'Add Item'}</h3>
                <button onClick={() => setShowItemModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <Input label="Item Name" required value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Category" value={itemForm.category} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
                  <Input label="Unit" placeholder="pcs, box, kg..." value={itemForm.unit} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Reorder Level" type="number" min="0" value={itemForm.reorder_level} onChange={e => setItemForm(f => ({ ...f, reorder_level: e.target.value }))} />
                  <Input label="Location" value={itemForm.location} onChange={e => setItemForm(f => ({ ...f, location: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={itemSaving} onClick={handleSaveItem}>
                  {editingItem ? 'Update Item' : 'Add Item'}
                </Button>
                <Button variant="secondary" onClick={() => setShowItemModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── STOCK IN/OUT MODAL ──────────────────────────────────── */}
        {showStockModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">
                  Stock {stockType === 'in' ? 'In' : 'Out'} — {stockItem?.name}
                </h3>
                <button onClick={() => setShowStockModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <p className="text-white/50 text-sm mb-3">Current: {stockItem?.quantity} {stockItem?.unit}</p>
              <Input label="Quantity" type="number" min="1" required value={stockQty} onChange={e => setStockQty(e.target.value)} />
              <Input label="Note (optional)" value={stockNote} onChange={e => setStockNote(e.target.value)} />
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={stockSaving} onClick={handleStockSubmit}>
                  Confirm Stock {stockType === 'in' ? 'In' : 'Out'}
                </Button>
                <Button variant="secondary" onClick={() => setShowStockModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
