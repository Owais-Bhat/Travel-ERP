import { useState, useEffect, useCallback } from 'react';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import Input from '../../components/Common/Input';
import Modal from '../../components/Common/Modal';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import {
  MdAdd,
  MdArrowBack,
  MdPlayCircle,
  MdEdit,
  MdDelete,
  MdBook,
  MdVisibility,
  MdVisibilityOff,
  MdVideoLibrary,
  MdDescription,
} from 'react-icons/md';

// ─── helpers ──────────────────────────────────────────────────────────────────

function getYtEmbedUrl(url) {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

function CourseThumb({ url, title }) {
  if (url) {
    return (
      <img
        src={url}
        alt={title}
        className="w-full h-36 object-cover rounded-xl"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <div className="w-full h-36 rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-500/30 flex items-center justify-center">
      <MdBook className="w-12 h-12 text-white/30" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LmsPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  // view state: 'courses' | 'detail'
  const [view, setView] = useState('courses');
  const [activeCourse, setActiveCourse] = useState(null);

  // courses
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);

  // lessons for active course
  const [lessons, setLessons] = useState([]);
  const [loadingLessons, setLoadingLessons] = useState(false);

  // create course modal
  const [createCourseModal, setCreateCourseModal] = useState(false);
  const [courseForm, setCourseForm] = useState({
    title: '', description: '', subject: '', class_name: '',
  });
  const [savingCourse, setSavingCourse] = useState(false);

  // add/edit lesson modal
  const [lessonModal, setLessonModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const [lessonForm, setLessonForm] = useState({
    title: '', content: '', video_url: '', lesson_order: '',
  });
  const [savingLesson, setSavingLesson] = useState(false);

  // toggling publish
  const [togglingId, setTogglingId] = useState(null);

  // ── loaders ────────────────────────────────────────────────────────────────

  const loadCourses = useCallback(async () => {
    if (!profile?.institution_id) return;
    setLoadingCourses(true);
    try {
      const { data } = await api.get('/lms/courses');
      setCourses(data || []);
    } catch (err) {
      notification.error('Failed to load courses: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingCourses(false);
    }
  }, [profile?.institution_id]);

  const loadLessons = useCallback(async (courseId) => {
    if (!courseId) return;
    setLoadingLessons(true);
    try {
      const { data } = await api.get(`/lms/courses/${courseId}/lessons`);
      setLessons(data || []);
    } catch (err) {
      notification.error('Failed to load lessons: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingLessons(false);
    }
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  useEffect(() => {
    if (activeCourse) loadLessons(activeCourse.id);
  }, [activeCourse, loadLessons]);

  // ── navigate to course detail ──────────────────────────────────────────────

  const openCourse = (course) => {
    setActiveCourse(course);
    setView('detail');
  };

  const backToCourses = () => {
    setView('courses');
    setActiveCourse(null);
    setLessons([]);
    loadCourses(); // refresh lesson counts
  };

  // ── create course ──────────────────────────────────────────────────────────

  const handleCreateCourse = async () => {
    if (!courseForm.title || !courseForm.subject || !courseForm.class_name) {
      notification.error('Title, subject and class are required');
      return;
    }
    setSavingCourse(true);
    try {
      await api.post('/lms/courses', {
        title: courseForm.title,
        description: courseForm.description,
        subject: courseForm.subject,
        class_name: courseForm.class_name,
        is_published: false,
      });
      notification.success('Course created');
      setCreateCourseModal(false);
      setCourseForm({ title: '', description: '', subject: '', class_name: '' });
      loadCourses();
    } catch (err) {
      notification.error('Failed to create course: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingCourse(false);
    }
  };

  // ── toggle publish ─────────────────────────────────────────────────────────

  const togglePublish = async (course) => {
    setTogglingId(course.id);
    try {
      await api.put(`/lms/courses/${course.id}`, { is_published: !course.is_published });
      notification.success(course.is_published ? 'Course unpublished' : 'Course published');
      loadCourses();
      if (activeCourse?.id === course.id) {
        setActiveCourse({ ...activeCourse, is_published: !course.is_published });
      }
    } catch (err) {
      notification.error('Failed to update: ' + (err.response?.data?.error || err.message));
    } finally {
      setTogglingId(null);
    }
  };

  // ── add / edit lesson ──────────────────────────────────────────────────────

  const openAddLesson = () => {
    setEditingLesson(null);
    const nextOrder = lessons.length > 0
      ? Math.max(...lessons.map((l) => l.lesson_order || 0)) + 1
      : 1;
    setLessonForm({ title: '', content: '', video_url: '', lesson_order: String(nextOrder) });
    setLessonModal(true);
  };

  const openEditLesson = (lesson) => {
    setEditingLesson(lesson);
    setLessonForm({
      title: lesson.title || '',
      content: lesson.content || '',
      video_url: lesson.video_url || '',
      lesson_order: String(lesson.lesson_order || ''),
    });
    setLessonModal(true);
  };

  const handleSaveLesson = async () => {
    if (!lessonForm.title) {
      notification.error('Lesson title is required');
      return;
    }
    setSavingLesson(true);

    const payload = {
      title: lessonForm.title,
      content: lessonForm.content,
      video_url: lessonForm.video_url,
      lesson_order: parseInt(lessonForm.lesson_order, 10) || 1,
    };

    try {
      if (editingLesson) {
        await api.put(`/lms/lessons/${editingLesson.id}`, payload);
      } else {
        await api.post(`/lms/courses/${activeCourse.id}/lessons`, payload);
      }
      notification.success(editingLesson ? 'Lesson updated' : 'Lesson added');
      setLessonModal(false);
      loadLessons(activeCourse.id);
    } catch (err) {
      notification.error('Failed to save lesson: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingLesson(false);
    }
  };

  // ── delete lesson ──────────────────────────────────────────────────────────

  const handleDeleteLesson = async (lessonId) => {
    if (!window.confirm('Delete this lesson? This action cannot be undone.')) return;
    try {
      await api.delete(`/lms/lessons/${lessonId}`);
      notification.success('Lesson deleted');
      loadLessons(activeCourse.id);
    } catch (err) {
      notification.error('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <MainLayout>
      <div className="p-6 space-y-6">

        {/* ── COURSES VIEW ─────────────────────────────────────────────── */}
        {view === 'courses' && (
          <>
            <div className="flex flex-wrap justify-between items-center gap-3">
              <h1 className="text-3xl font-bold font-display text-white">Learning Management</h1>
              <Button variant="primary" size="sm" onClick={() => setCreateCourseModal(true)}>
                <MdAdd className="mr-1 inline" /> Create Course
              </Button>
            </div>

            {loadingCourses ? (
              <div className="flex items-center justify-center py-24">
                <div className="spinner" />
                <span className="ml-3 text-white/60">Loading courses…</span>
              </div>
            ) : courses.length === 0 ? (
              <GlassCard className="p-16 flex flex-col items-center gap-4">
                <MdBook className="w-16 h-16 text-white/20" />
                <p className="text-white/50 text-xl">No courses yet</p>
                <p className="text-white/30 text-sm">Create your first course to get started</p>
                <Button variant="primary" size="sm" onClick={() => setCreateCourseModal(true)}>
                  <MdAdd className="mr-1 inline" /> Create Course
                </Button>
              </GlassCard>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {courses.map((course) => (
                  <GlassCard key={course.id} className="p-0 overflow-hidden flex flex-col">
                    <div className="p-4 pb-0">
                      <CourseThumb url={course.thumbnail_url} title={course.title} />
                    </div>

                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-white font-bold text-base leading-snug">{course.title}</h3>
                        <span className={`flex-shrink-0 badge text-xs ${
                          course.is_published
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                        }`}>
                          {course.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>

                      <p className="text-white/50 text-xs mb-1">{course.subject} · {course.class_name}</p>

                      {course.description && (
                        <p className="text-white/50 text-xs mb-3 line-clamp-2">{course.description}</p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-white/40 mb-4 mt-auto">
                        <span className="flex items-center gap-1">
                          <MdVideoLibrary className="w-3.5 h-3.5" />
                          {Number(course.lesson_count) || 0} lesson(s)
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => openCourse(course)}
                        >
                          <MdPlayCircle className="mr-1 inline" /> Open
                        </Button>
                        <button
                          disabled={togglingId === course.id}
                          onClick={() => togglePublish(course)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                            course.is_published
                              ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                          title={course.is_published ? 'Unpublish' : 'Publish'}
                        >
                          {course.is_published
                            ? <MdVisibilityOff className="w-4 h-4" />
                            : <MdVisibility className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── COURSE DETAIL VIEW ───────────────────────────────────────── */}
        {view === 'detail' && activeCourse && (
          <>
            {/* Back + header */}
            <div className="flex flex-wrap justify-between items-start gap-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={backToCourses}
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition text-white"
                >
                  <MdArrowBack className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold font-display text-white">{activeCourse.title}</h1>
                  <p className="text-white/50 text-sm">{activeCourse.subject} · {activeCourse.class_name}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => togglePublish(activeCourse)}
                  disabled={togglingId === activeCourse.id}
                  className={`flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                    activeCourse.is_published
                      ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  }`}
                >
                  {activeCourse.is_published
                    ? <><MdVisibilityOff className="w-4 h-4" /> Unpublish</>
                    : <><MdVisibility className="w-4 h-4" /> Publish</>}
                </button>
                <Button variant="primary" size="sm" onClick={openAddLesson}>
                  <MdAdd className="mr-1 inline" /> Add Lesson
                </Button>
              </div>
            </div>

            {/* Course info card */}
            {activeCourse.description && (
              <GlassCard className="p-4">
                <p className="text-white/70 text-sm">{activeCourse.description}</p>
              </GlassCard>
            )}

            {/* Lessons list */}
            {loadingLessons ? (
              <div className="flex items-center justify-center py-20">
                <div className="spinner" />
                <span className="ml-3 text-white/60">Loading lessons…</span>
              </div>
            ) : lessons.length === 0 ? (
              <GlassCard className="p-14 flex flex-col items-center gap-3">
                <MdVideoLibrary className="w-12 h-12 text-white/20" />
                <p className="text-white/50 text-lg">No lessons yet</p>
                <p className="text-white/30 text-sm">Add the first lesson to this course</p>
                <Button variant="primary" size="sm" onClick={openAddLesson}>
                  <MdAdd className="mr-1 inline" /> Add Lesson
                </Button>
              </GlassCard>
            ) : (
              <div className="space-y-3">
                {lessons.map((lesson, idx) => {
                  const embedUrl = getYtEmbedUrl(lesson.video_url);
                  return (
                    <GlassCard key={lesson.id} className="p-0 overflow-hidden">
                      <div className="flex items-start gap-4 p-5">
                        {/* Order badge */}
                        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-sm">
                          {lesson.lesson_order ?? idx + 1}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="text-white font-semibold">{lesson.title}</h4>
                              <div className="flex items-center gap-2 mt-0.5 text-white/40 text-xs">
                                {lesson.video_url ? (
                                  <span className="flex items-center gap-1">
                                    <MdPlayCircle className="w-3.5 h-3.5 text-red-400" /> Video
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <MdDescription className="w-3.5 h-3.5 text-amber-400" /> Text
                                  </span>
                                )}
                                {lesson.content && (
                                  <span>· {lesson.content.slice(0, 60)}{lesson.content.length > 60 ? '…' : ''}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => openEditLesson(lesson)}
                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition"
                              >
                                <MdEdit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLesson(lesson.id)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition"
                              >
                                <MdDelete className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Embedded YouTube preview */}
                          {embedUrl && (
                            <div className="mt-3 rounded-xl overflow-hidden border border-white/10 max-w-[480px]">
                              <iframe
                                src={embedUrl}
                                title={lesson.title}
                                className="w-full h-[200px]"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create Course Modal ────────────────────────────────────────────── */}
      <Modal
        open={createCourseModal}
        onClose={() => setCreateCourseModal(false)}
        title="Create Course"
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateCourseModal(false)}>Cancel</Button>
            <Button variant="primary" loading={savingCourse} onClick={handleCreateCourse}>
              Create Course
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Input
            label="Course Title"
            required
            value={courseForm.title}
            onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
            placeholder="e.g. Mathematics – Class 10"
          />
          <Input
            label="Subject"
            required
            value={courseForm.subject}
            onChange={(e) => setCourseForm({ ...courseForm, subject: e.target.value })}
            placeholder="e.g. Mathematics"
          />
          <Input
            label="Class"
            required
            value={courseForm.class_name}
            onChange={(e) => setCourseForm({ ...courseForm, class_name: e.target.value })}
            placeholder="e.g. Class 10"
          />
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Description</label>
            <textarea
              className="textarea-glass"
              rows={3}
              placeholder="Brief description of the course…"
              value={courseForm.description}
              onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
            />
          </div>
        </div>
      </Modal>

      {/* ── Add / Edit Lesson Modal ────────────────────────────────────────── */}
      <Modal
        open={lessonModal}
        onClose={() => setLessonModal(false)}
        title={editingLesson ? 'Edit Lesson' : 'Add Lesson'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLessonModal(false)}>Cancel</Button>
            <Button variant="primary" loading={savingLesson} onClick={handleSaveLesson}>
              {editingLesson ? 'Update Lesson' : 'Add Lesson'}
            </Button>
          </>
        }
      >
        <div className="space-y-1">
          <Input
            label="Lesson Title"
            required
            value={lessonForm.title}
            onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
            placeholder="e.g. Introduction to Quadratic Equations"
          />
          <Input
            label="Lesson Order"
            type="number"
            value={lessonForm.lesson_order}
            onChange={(e) => setLessonForm({ ...lessonForm, lesson_order: e.target.value })}
            placeholder="1"
          />
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Content</label>
            <textarea
              className="textarea-glass"
              rows={5}
              placeholder="Write lesson content, notes, instructions…"
              value={lessonForm.content}
              onChange={(e) => setLessonForm({ ...lessonForm, content: e.target.value })}
            />
          </div>
          <Input
            label="YouTube Video URL (optional)"
            type="url"
            value={lessonForm.video_url}
            onChange={(e) => setLessonForm({ ...lessonForm, video_url: e.target.value })}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          {lessonForm.video_url && getYtEmbedUrl(lessonForm.video_url) && (
            <div className="rounded-xl overflow-hidden border border-white/10 mb-2 h-[180px]">
              <iframe
                src={getYtEmbedUrl(lessonForm.video_url)}
                title="Preview"
                className="w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      </Modal>
    </MainLayout>
  );
}
