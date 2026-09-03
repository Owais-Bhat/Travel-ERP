import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdAdd, MdEdit, MdDelete, MdClose, MdSearch, MdAssignmentReturn,
} from 'react-icons/md';
import { formatDate } from '../../utils/helpers';

const EMPTY_BOOK = { title: '', author: '', isbn: '', category: '', publisher: '', total_copies: 1, shelf_location: '' };

export default function LibraryPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [activeTab, setActiveTab] = useState('catalog');

  // ─── Catalog state ─────────────────────────────────────────────────
  const [books, setBooks] = useState([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState('');
  const [search, setSearch] = useState('');
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [bookForm, setBookForm] = useState(EMPTY_BOOK);
  const [bookSaving, setBookSaving] = useState(false);

  // ─── Issues state ──────────────────────────────────────────────────
  const [issues, setIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [issueFilter, setIssueFilter] = useState('issued');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueBook, setIssueBook] = useState(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [dueDate, setDueDate] = useState('');
  const [issueSaving, setIssueSaving] = useState(false);

  const loadBooks = async (query = search) => {
    if (!profile?.institution_id) return;
    setBooksLoading(true);
    setBooksError('');
    try {
      const { data } = await api.get('/library/books', { params: query ? { search: query } : {} });
      setBooks(data || []);
    } catch (err) {
      // Distinguish "nothing here yet" from "we could not load it" — falling
      // through to the empty state on a failed request hides real outages.
      const message = err.response?.data?.error || 'Failed to load catalog';
      setBooksError(message);
      notification.error(message);
    } finally {
      setBooksLoading(false);
    }
  };

  const loadIssues = async (status = issueFilter) => {
    if (!profile?.institution_id) return;
    setIssuesLoading(true);
    try {
      const { data } = await api.get('/library/issues', { params: status ? { status } : {} });
      setIssues(data || []);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load issues');
    } finally {
      setIssuesLoading(false);
    }
  };

  useEffect(() => { if (profile) loadBooks(); }, [profile]);
  useEffect(() => { if (profile && activeTab === 'issues') loadIssues(); }, [profile, activeTab]);

  // ─── Book CRUD ─────────────────────────────────────────────────────
  const openBookModal = (book = null) => {
    if (book) {
      setEditingBook(book);
      setBookForm({
        title: book.title || '', author: book.author || '', isbn: book.isbn || '',
        category: book.category || '', publisher: book.publisher || '',
        total_copies: book.total_copies || 1, shelf_location: book.shelf_location || '',
      });
    } else {
      setEditingBook(null);
      setBookForm(EMPTY_BOOK);
    }
    setShowBookModal(true);
  };

  const handleSaveBook = async () => {
    if (!bookForm.title.trim()) { notification.error('Title is required'); return; }
    setBookSaving(true);
    const payload = {
      title: bookForm.title.trim(),
      author: bookForm.author.trim(),
      isbn: bookForm.isbn.trim(),
      category: bookForm.category.trim(),
      publisher: bookForm.publisher.trim(),
      total_copies: parseInt(bookForm.total_copies, 10) || 1,
      shelf_location: bookForm.shelf_location.trim(),
    };
    try {
      const response = editingBook
        ? await api.put(`/library/books/${editingBook.id}`, payload)
        : await api.post('/library/books', payload);
      const saved = response.data;
      setBooks(prev => (editingBook ? prev.map(b => (b.id === saved.id ? saved : b)) : [...prev, saved]));
      notification.success(editingBook ? 'Book updated!' : 'Book added!');
      setShowBookModal(false);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save book');
    } finally {
      setBookSaving(false);
    }
  };

  const handleDeleteBook = async (book) => {
    if (!window.confirm(`Delete "${book.title}" from the catalog?`)) return;
    try {
      await api.delete(`/library/books/${book.id}`);
      setBooks(prev => prev.filter(b => b.id !== book.id));
      notification.success('Book deleted');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete book');
    }
  };

  // ─── Issue workflow ────────────────────────────────────────────────
  const openIssueModal = (book) => {
    setIssueBook(book);
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentResults([]);
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    setDueDate(twoWeeks.toISOString().slice(0, 10));
    setShowIssueModal(true);
  };

  const handleStudentSearch = async (val) => {
    setStudentSearch(val);
    setSelectedStudent(null);
    if (!val.trim() || val.length < 2) { setStudentResults([]); return; }
    try {
      const { data } = await api.get('/students', { params: { search: val, pageSize: 8, page: 1 } });
      setStudentResults(data?.data || []);
    } catch {
      setStudentResults([]);
    }
  };

  const handleIssueBook = async () => {
    if (!selectedStudent) { notification.error('Please select a student'); return; }
    if (!dueDate) { notification.error('Please set a due date'); return; }
    setIssueSaving(true);
    try {
      await api.post('/library/issues', { book_id: issueBook.id, student_id: selectedStudent.id, due_date: dueDate });
      setBooks(prev => prev.map(b => (b.id === issueBook.id ? { ...b, available_copies: b.available_copies - 1 } : b)));
      notification.success(`"${issueBook.title}" issued to ${selectedStudent.first_name}`);
      setShowIssueModal(false);
      if (activeTab === 'issues') loadIssues();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to issue book');
    } finally {
      setIssueSaving(false);
    }
  };

  const handleReturnBook = async (issue) => {
    try {
      const { data } = await api.post(`/library/issues/${issue.id}/return`);
      setIssues(prev => prev.map(i => (i.id === issue.id ? { ...i, ...data } : i)));
      setBooks(prev => prev.map(b => (b.id === issue.book_id ? { ...b, available_copies: b.available_copies + 1 } : b)));
      notification.success(
        data.fine_amount > 0 ? `Returned — ₹${data.fine_amount} overdue fine` : 'Book returned!'
      );
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to return book');
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-3xl font-bold text-white">Library</h1>

        <div className="flex gap-2 border-b border-white/10">
          {['catalog', 'issues'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg capitalize transition ${
                activeTab === tab
                  ? 'bg-white/10 text-white border-b-2 border-neon-cyan'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              {tab === 'catalog' ? 'Catalog' : 'Issued Books'}
            </button>
          ))}
        </div>

        {/* ─── CATALOG TAB ─────────────────────────────────────────── */}
        {activeTab === 'catalog' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 justify-between items-center">
              <div className="relative w-full sm:w-72">
                <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                <input
                  className="input-glass w-full pl-9"
                  placeholder="Search title, author, ISBN..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadBooks(search)}
                  onBlur={() => loadBooks(search)}
                />
              </div>
              <Button variant="primary" onClick={() => openBookModal()}>
                <MdAdd className="inline mr-1" /> Add Book
              </Button>
            </div>

            {booksLoading ? (
              <div className="text-center py-12 text-white/50">Loading catalog...</div>
            ) : booksError ? (
              <GlassCard className="p-10 text-center">
                <p className="text-red-300 font-semibold mb-1">Could not load the catalog</p>
                <p className="text-white/50 text-sm mb-4">{booksError}</p>
                <Button variant="secondary" size="sm" onClick={() => loadBooks(search)}>Retry</Button>
              </GlassCard>
            ) : books.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No books in the catalog yet.</GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {books.map(book => (
                  <GlassCard key={book.id} className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-bold text-base leading-tight">{book.title}</h3>
                      <div className="flex gap-1.5 shrink-0 ml-2">
                        <button onClick={() => openBookModal(book)} className="text-blue-400/70 hover:text-blue-400 transition">
                          <MdEdit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteBook(book)} className="text-red-400/60 hover:text-red-400 transition">
                          <MdDelete className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-white/60 text-sm mb-1">{book.author || 'Unknown author'}</p>
                    {book.category && (
                      <span className="inline-block px-2 py-0.5 text-xs bg-white/10 text-white/60 rounded mb-2">{book.category}</span>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
                      <span className={`text-sm font-semibold ${book.available_copies > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {book.available_copies}/{book.total_copies} available
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={book.available_copies < 1}
                        onClick={() => openIssueModal(book)}
                      >
                        Issue
                      </Button>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ISSUES TAB ──────────────────────────────────────────── */}
        {activeTab === 'issues' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {[{ v: 'issued', label: 'Currently Issued' }, { v: '', label: 'All' }, { v: 'returned', label: 'Returned' }].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => { setIssueFilter(opt.v); loadIssues(opt.v); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    issueFilter === opt.v ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40' : 'text-white/50 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {issuesLoading ? (
              <div className="text-center py-12 text-white/50">Loading...</div>
            ) : issues.length === 0 ? (
              <GlassCard className="p-10 text-center text-white/40">No records found.</GlassCard>
            ) : (
              <GlassCard className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-white/50">Book</th>
                        <th className="text-left py-3 px-4 text-white/50">Student</th>
                        <th className="text-left py-3 px-4 text-white/50">Issued</th>
                        <th className="text-left py-3 px-4 text-white/50">Due</th>
                        <th className="text-left py-3 px-4 text-white/50">Status</th>
                        <th className="text-center py-3 px-4 text-white/50">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map(issue => {
                        const overdue = issue.status === 'issued' && new Date(issue.due_date) < new Date();
                        return (
                          <tr key={issue.id} className="border-b border-white/5 hover:bg-white/3 transition">
                            <td className="py-3 px-4 text-white">{issue.book_title}</td>
                            <td className="py-3 px-4 text-white/70">
                              {issue.first_name} {issue.last_name}
                              <span className="text-white/40 text-xs block">{issue.admission_no}</span>
                            </td>
                            <td className="py-3 px-4 text-white/60">{formatDate(issue.issued_at)}</td>
                            <td className={`py-3 px-4 ${overdue ? 'text-red-400 font-semibold' : 'text-white/60'}`}>
                              {formatDate(issue.due_date)}
                            </td>
                            <td className="py-3 px-4">
                              <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                issue.status === 'returned'
                                  ? 'bg-gray-500/20 text-gray-400'
                                  : overdue ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                              }`}>
                                {issue.status === 'returned' ? `Returned${issue.fine_amount > 0 ? ` (₹${issue.fine_amount} fine)` : ''}` : overdue ? 'Overdue' : 'Issued'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {issue.status === 'issued' && (
                                <button
                                  onClick={() => handleReturnBook(issue)}
                                  className="text-blue-400/70 hover:text-blue-400 transition inline-flex items-center gap-1 text-xs font-semibold"
                                >
                                  <MdAssignmentReturn className="w-4 h-4" /> Return
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            )}
          </div>
        )}

        {/* ─── ADD/EDIT BOOK MODAL ─────────────────────────────────── */}
        {showBookModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">{editingBook ? 'Edit Book' : 'Add Book'}</h3>
                <button onClick={() => setShowBookModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-0">
                <Input label="Title" required value={bookForm.title} onChange={e => setBookForm(f => ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Author" value={bookForm.author} onChange={e => setBookForm(f => ({ ...f, author: e.target.value }))} />
                  <Input label="ISBN" value={bookForm.isbn} onChange={e => setBookForm(f => ({ ...f, isbn: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Category" value={bookForm.category} onChange={e => setBookForm(f => ({ ...f, category: e.target.value }))} />
                  <Input label="Publisher" value={bookForm.publisher} onChange={e => setBookForm(f => ({ ...f, publisher: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Total Copies" type="number" min="1"
                    value={bookForm.total_copies}
                    onChange={e => setBookForm(f => ({ ...f, total_copies: e.target.value }))}
                  />
                  <Input label="Shelf Location" value={bookForm.shelf_location} onChange={e => setBookForm(f => ({ ...f, shelf_location: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={bookSaving} onClick={handleSaveBook}>
                  {editingBook ? 'Update Book' : 'Add Book'}
                </Button>
                <Button variant="secondary" onClick={() => setShowBookModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}

        {/* ─── ISSUE BOOK MODAL ────────────────────────────────────── */}
        {showIssueModal && createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <GlassCard className="w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-bold text-lg">Issue "{issueBook?.title}"</h3>
                <button onClick={() => setShowIssueModal(false)} className="text-white/40 hover:text-white/70">
                  <MdClose className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4 relative">
                <label className="block text-sm font-medium mb-2">Student <span className="text-red-400 ml-1">*</span></label>
                {selectedStudent ? (
                  <div className="flex items-center gap-2 p-2.5 bg-white/5 rounded-lg border border-white/10">
                    <span className="text-white text-sm flex-1">
                      {selectedStudent.first_name} {selectedStudent.last_name}
                      <span className="text-white/40 ml-2 text-xs">{selectedStudent.admission_no} &middot; {selectedStudent.class_name}</span>
                    </span>
                    <button onClick={() => { setSelectedStudent(null); setStudentSearch(''); }} className="text-white/40 hover:text-white/70">
                      <MdClose className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <MdSearch className="absolute left-3 top-3 w-4 h-4 text-white/40" />
                      <input
                        className="input-glass w-full pl-9"
                        placeholder="Search by name or admission no..."
                        value={studentSearch}
                        onChange={e => handleStudentSearch(e.target.value)}
                      />
                    </div>
                    {studentResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-gray-900/95 border border-white/10 rounded-lg overflow-hidden shadow-xl">
                        {studentResults.map(s => (
                          <button
                            key={s.id}
                            className="w-full text-left px-4 py-2.5 hover:bg-white/10 text-sm text-white/80 transition"
                            onClick={() => { setSelectedStudent(s); setStudentResults([]); }}
                          >
                            {s.first_name} {s.last_name}
                            <span className="text-white/40 ml-2 text-xs">{s.admission_no} &middot; {s.class_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <Input label="Due Date" type="date" required value={dueDate} onChange={e => setDueDate(e.target.value)} />

              <div className="flex gap-2 pt-2">
                <Button variant="primary" loading={issueSaving} onClick={handleIssueBook}>Issue Book</Button>
                <Button variant="secondary" onClick={() => setShowIssueModal(false)}>Cancel</Button>
              </div>
            </GlassCard>
          </div>,
          document.body
        )}
      </div>
    </MainLayout>
  );
}
