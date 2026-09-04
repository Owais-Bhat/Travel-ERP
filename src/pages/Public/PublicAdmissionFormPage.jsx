import { useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

const EMPTY_FORM = {
  applicant_name: '', email: '', phone: '', dob: '', class_applying: '',
  parent_name: '', parent_phone: '', address: '', remarks: '',
};

export default function PublicAdmissionFormPage() {
  const { institutionId } = useParams();
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [applicationNo, setApplicationNo] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.applicant_name.trim() || !form.dob) {
      setError('Applicant name and date of birth are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const { data } = await api.post(`/admissions-public/${institutionId}`, form);
      setApplicationNo(data.application_no);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  if (applicationNo) {
    return (
      <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Application Submitted!</h1>
          <p className="text-slate-500 mb-4">Your application reference number is:</p>
          <p className="text-xl font-mono font-bold text-blue-600 mb-4">{applicationNo}</p>
          <p className="text-slate-400 text-sm">The institution will review your application and get in touch.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FB] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">Admission Application</h1>
        <p className="text-slate-500 text-sm">Fill in the details below to apply.</p>

        {error && <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div>
          <label className="block text-slate-600 text-sm mb-1">Applicant Name *</label>
          <input required className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.applicant_name} onChange={set('applicant_name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 text-sm mb-1">Date of Birth *</label>
            <input required type="date" className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.dob} onChange={set('dob')} />
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">Class Applying For</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.class_applying} onChange={set('class_applying')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 text-sm mb-1">Email</label>
            <input type="email" className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">Phone</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-slate-600 text-sm mb-1">Parent Name</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.parent_name} onChange={set('parent_name')} />
          </div>
          <div>
            <label className="block text-slate-600 text-sm mb-1">Parent Phone</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.parent_phone} onChange={set('parent_phone')} />
          </div>
        </div>
        <div>
          <label className="block text-slate-600 text-sm mb-1">Address</label>
          <textarea rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.address} onChange={set('address')} />
        </div>
        <div>
          <label className="block text-slate-600 text-sm mb-1">Additional Remarks</label>
          <textarea rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2" value={form.remarks} onChange={set('remarks')} />
        </div>

        <button type="submit" disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg py-2.5 transition">
          {submitting ? 'Submitting...' : 'Submit Application'}
        </button>
      </form>
    </div>
  );
}
