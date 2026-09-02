import { useCallback, useState } from 'react';
import {
  MdBook, MdAdd, MdSchool, MdEventSeat, MdPayments,
  MdLibraryBooks, MdEdit, MdDelete,
} from 'react-icons/md';
import MainLayout from '../../components/Layout/MainLayout';
import PageHeader from '../../components/Common/PageHeader';
import StatCard from '../../components/Common/StatCard';
import Surface from '../../components/Common/Surface';
import DataTable from '../../components/Common/DataTable';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Select from '../../components/Common/Select';
import Modal from '../../components/Common/Modal';
import Badge from '../../components/Common/Badge';
import { Reveal, Stagger, StaggerItem } from '../../components/Common/Motion';
import { useResource, useEndpoint } from '../../hooks/useResource';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';

const LEVELS = ['certificate', 'diploma', 'undergraduate', 'postgraduate', 'doctorate', 'short_course'];
const MODES = ['full_time', 'part_time', 'online', 'hybrid', 'distance'];
const STATUSES = ['draft', 'active', 'closed', 'archived'];

const EMPTY_PROGRAM = {
  name: '', code: '', level: 'certificate', department: '', mode: 'full_time',
  duration_months: '12', tuition_fee: '', seats_total: '', eligibility: '', description: '',
  status: 'active',
};

const EMPTY_COURSE = { title: '', code: '', subject: '', credits: '', semester: '', teacher_id: '' };

const money = (value) => `₹${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const titleCase = (value) => String(value || '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function ProgramsPage() {
  const notification = useNotification();

  const [levelFilter, setLevelFilter] = useState('');
  const programs = useResource('/programs', { params: levelFilter ? { level: levelFilter } : {} });
  const summary = useEndpoint('/programs/summary');
  const teachers = useEndpoint('/teachers');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PROGRAM);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE);
  const [busy, setBusy] = useState(false);

  const teacherOptions = (Array.isArray(teachers.data) ? teachers.data : []).map((teacher) => ({
    value: teacher.id,
    label: [teacher.first_name, teacher.last_name].filter(Boolean).join(' '),
  }));

  const refreshAll = useCallback(() => {
    programs.reload();
    summary.reload();
  }, [programs, summary]);

  const openEditor = (program = null) => {
    setEditing(program);
    setForm(program ? {
      name: program.name || '',
      code: program.code || '',
      level: program.level || 'certificate',
      department: program.department || '',
      mode: program.mode || 'full_time',
      duration_months: String(program.duration_months ?? 12),
      tuition_fee: String(program.tuition_fee ?? ''),
      seats_total: String(program.seats_total ?? ''),
      eligibility: program.eligibility || '',
      description: program.description || '',
      status: program.status || 'active',
    } : EMPTY_PROGRAM);
    setEditorOpen(true);
  };

  const saveProgram = async () => {
    if (!form.name.trim()) {
      notification.error('Program name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_months: Number(form.duration_months) || 12,
        tuition_fee: Number(form.tuition_fee) || 0,
        seats_total: Number(form.seats_total) || 0,
      };
      if (editing) await api.put(`/programs/${editing.id}`, payload);
      else await api.post('/programs', payload);

      notification.success(editing ? 'Program updated' : 'Program created');
      setEditorOpen(false);
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to save program');
    } finally {
      setSaving(false);
    }
  };

  const deleteProgram = async (program) => {
    if (!window.confirm(`Delete "${program.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/programs/${program.id}`);
      notification.success('Program deleted');
      refreshAll();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to delete program');
    }
  };

  const openDetail = async (program) => {
    setDetail({ program, courses: [], stats: {} });
    try {
      const { data } = await api.get(`/programs/${program.id}`);
      setDetail(data);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to load program');
      setDetail(null);
    }
  };

  const addCourse = async () => {
    if (!courseForm.title.trim()) {
      notification.error('Course title is required');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/programs/${detail.program.id}/courses`, {
        ...courseForm,
        credits: Number(courseForm.credits) || 0,
        semester: courseForm.semester === '' ? null : Number(courseForm.semester),
        teacher_id: courseForm.teacher_id || null,
      });
      const { data } = await api.get(`/programs/${detail.program.id}`);
      setDetail(data);
      setCourseForm(EMPTY_COURSE);
      notification.success('Course added');
      programs.reload();
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to add course');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Program',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-semibold mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>{row.name}</p>
          <p className="text-xs mb-0 truncate" style={{ color: 'var(--neu-ink-muted)' }}>
            {[row.code, row.department].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      ),
    },
    { key: 'level', label: 'Level', render: (row) => <Badge tone="violet" dot={false}>{titleCase(row.level)}</Badge> },
    { key: 'mode', label: 'Mode', hideOnMobile: true, render: (row) => titleCase(row.mode) },
    { key: 'duration_months', label: 'Duration', align: 'right', render: (row) => `${row.duration_months} mo` },
    { key: 'tuition_fee', label: 'Tuition', align: 'right', render: (row) => money(row.tuition_fee) },
    {
      key: 'seats',
      label: 'Seats',
      align: 'right',
      render: (row) => {
        const total = Number(row.seats_total) || 0;
        const filled = Number(row.seats_filled) || 0;
        const pct = total > 0 ? Math.min(100, (filled / total) * 100) : 0;
        return (
          <div className="flex items-center gap-2 justify-end">
            <div className="neu-progress w-14">
              <div className="neu-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums" style={{ color: 'var(--neu-ink-muted)' }}>
              {filled}{total > 0 ? `/${total}` : ''}
            </span>
          </div>
        );
      },
    },
    { key: 'course_count', label: 'Courses', align: 'right', hideOnMobile: true },
    { key: 'status', label: 'Status', render: (row) => <Badge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="flex gap-1 justify-end">
          <Button
            size="xs"
            variant="ghost"
            icon={MdEdit}
            onClick={(event) => { event.stopPropagation(); openEditor(row); }}
            aria-label={`Edit ${row.name}`}
          />
          <Button
            size="xs"
            variant="ghost"
            icon={MdDelete}
            onClick={(event) => { event.stopPropagation(); deleteProgram(row); }}
            aria-label={`Delete ${row.name}`}
          />
        </div>
      ),
    },
  ];

  const totals = summary.data?.totals || {};

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 space-y-6 scene">
        <PageHeader
          title="Programs & Courses"
          subtitle="Degrees, diplomas and certificate tracks, and the courses inside them"
          icon={MdBook}
          actions={<Button variant="primary" icon={MdAdd} onClick={() => openEditor()}>New program</Button>}
        />

        <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StaggerItem>
            <StatCard label="Programs" value={Number(totals.total) || 0} icon={MdSchool} hint={`${Number(totals.active) || 0} active`} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Seats filled" value={Number(totals.seats_filled) || 0} tone="teal" icon={MdEventSeat} hint={`of ${Number(totals.seats_total) || 0}`} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Fill rate" value={Number(totals.fill_rate) || 0} suffix="%" decimals={1} tone="success" icon={MdEventSeat} />
          </StaggerItem>
          <StaggerItem>
            <StatCard label="Average tuition" value={Number(totals.average_fee) || 0} prefix="₹" tone="amber" icon={MdPayments} />
          </StaggerItem>
        </Stagger>

        <Reveal>
          <DataTable
            columns={columns}
            rows={programs.rows}
            loading={programs.loading}
            error={programs.error}
            search={programs.search}
            onSearchChange={programs.setSearch}
            searchPlaceholder="Search programs…"
            onRowClick={openDetail}
            pagination={programs.pagination}
            onPageChange={programs.setPage}
            toolbar={
              <Select
                wrapperClass="mb-0 w-44"
                value={levelFilter}
                onChange={(event) => setLevelFilter(event.target.value)}
                placeholder="All levels"
                options={LEVELS.map((level) => ({ value: level, label: titleCase(level) }))}
              />
            }
            empty={{
              icon: MdSchool,
              title: 'No programs yet',
              description: 'Programs are what admissions, scholarships and certifications all hang off.',
              action: <Button variant="primary" icon={MdAdd} onClick={() => openEditor()}>New program</Button>,
            }}
          />
        </Reveal>
      </div>

      {/* Editor */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'New program'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={saveProgram}>
              {editing ? 'Save changes' : 'Create program'}
            </Button>
          </>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Program name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="B.Sc. Computer Science" />
          <Input label="Code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="BSC-CS" />
          <Select
            label="Level"
            wrapperClass="mb-0"
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
            options={LEVELS.map((level) => ({ value: level, label: titleCase(level) }))}
          />
          <Select
            label="Mode"
            wrapperClass="mb-0"
            value={form.mode}
            onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}
            options={MODES.map((mode) => ({ value: mode, label: titleCase(mode) }))}
          />
          <Input label="Department" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          <Input label="Duration (months)" type="number" value={form.duration_months} onChange={(e) => setForm((f) => ({ ...f, duration_months: e.target.value }))} />
          <Input label="Tuition fee (₹)" type="number" value={form.tuition_fee} onChange={(e) => setForm((f) => ({ ...f, tuition_fee: e.target.value }))} hint="Used as the commission and scholarship base" />
          <Input label="Total seats" type="number" value={form.seats_total} onChange={(e) => setForm((f) => ({ ...f, seats_total: e.target.value }))} />
          <Select
            label="Status"
            wrapperClass="mb-0"
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={STATUSES.map((status) => ({ value: status, label: titleCase(status) }))}
          />
          <div className="sm:col-span-2">
            <label className="neu-label" htmlFor="program-eligibility">Eligibility</label>
            <textarea
              id="program-eligibility"
              className="neu-textarea"
              rows={2}
              value={form.eligibility}
              onChange={(e) => setForm((f) => ({ ...f, eligibility: e.target.value }))}
              placeholder="Minimum qualifications to apply"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="neu-label" htmlFor="program-description">Description</label>
            <textarea
              id="program-description"
              className="neu-textarea"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Detail + courses */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.program?.name || 'Program'}
        maxWidth="max-w-3xl"
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail?.program && (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Applications</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {Number(detail.stats?.applications) || 0}
                </p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Approved</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {Number(detail.stats?.approved) || 0}
                </p>
              </Surface>
              <Surface variant="inset" className="!p-3">
                <p className="text-xs mb-1" style={{ color: 'var(--neu-ink-muted)' }}>Seats</p>
                <p className="text-xl font-bold font-display mb-0" style={{ color: 'var(--neu-ink)' }}>
                  {detail.program.seats_filled}/{detail.program.seats_total || '∞'}
                </p>
              </Surface>
            </div>

            <div>
              <p className="neu-label">Courses</p>
              {detail.courses?.length ? (
                <div className="space-y-2">
                  {detail.courses.map((course) => (
                    <div
                      key={course.id}
                      className="flex items-center justify-between gap-3 p-3"
                      style={{ borderRadius: 'var(--neu-radius-sm)', boxShadow: 'var(--neu-inset-subtle)' }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium mb-0 truncate" style={{ color: 'var(--neu-ink)' }}>
                          {course.title}
                        </p>
                        <p className="text-xs mb-0" style={{ color: 'var(--neu-ink-muted)' }}>
                          {[course.code, course.subject, course.teacher_name].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {course.semester && <Badge tone="info" dot={false}>Sem {course.semester}</Badge>}
                        <span className="text-xs" style={{ color: 'var(--neu-ink-muted)' }}>
                          {Number(course.credits) || 0} cr
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--neu-ink-muted)' }}>
                  No courses in this program yet.
                </p>
              )}
            </div>

            <Surface variant="flat" className="!p-4 space-y-3">
              <p className="text-sm font-semibold mb-0" style={{ color: 'var(--neu-ink)' }}>
                <MdLibraryBooks className="inline w-4 h-4 mr-1.5" />
                Add a course
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <Input wrapperClass="mb-0" value={courseForm.title} onChange={(e) => setCourseForm((f) => ({ ...f, title: e.target.value }))} placeholder="Course title" />
                <Input wrapperClass="mb-0" value={courseForm.code} onChange={(e) => setCourseForm((f) => ({ ...f, code: e.target.value }))} placeholder="Code" />
                <Input wrapperClass="mb-0" value={courseForm.subject} onChange={(e) => setCourseForm((f) => ({ ...f, subject: e.target.value }))} placeholder="Subject" />
                <Select
                  wrapperClass="mb-0"
                  value={courseForm.teacher_id}
                  onChange={(e) => setCourseForm((f) => ({ ...f, teacher_id: e.target.value }))}
                  placeholder="Unassigned"
                  options={teacherOptions}
                />
                <Input wrapperClass="mb-0" type="number" value={courseForm.credits} onChange={(e) => setCourseForm((f) => ({ ...f, credits: e.target.value }))} placeholder="Credits" />
                <Input wrapperClass="mb-0" type="number" value={courseForm.semester} onChange={(e) => setCourseForm((f) => ({ ...f, semester: e.target.value }))} placeholder="Semester" />
              </div>
              <Button variant="primary" size="sm" icon={MdAdd} loading={busy} onClick={addCourse}>Add course</Button>
            </Surface>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
