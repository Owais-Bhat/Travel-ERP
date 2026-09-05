import { useRef, useState } from 'react';
import { MdCameraAlt } from 'react-icons/md';
import Avatar from './Avatar';
import { useNotification } from '../../hooks/useNotification';

/**
 * Circular photo preview with a camera-icon button overlaid at the
 * bottom-right — tap to pick a file, uploads immediately (no separate
 * "save" step), and calls onUploaded(photo_url) once the server confirms.
 */
export default function PhotoUpload({ name, src, onUpload, size = 'xl' }) {
  const inputRef = useRef(null);
  const notification = useNotification();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const photoUrl = await onUpload(file);
      if (!photoUrl) setPreview(null);
    } catch (err) {
      setPreview(null);
      notification.error(err.response?.data?.error || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <Avatar name={name} src={preview || src} size={size} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-500 hover:bg-blue-400 text-white flex items-center justify-center transition disabled:opacity-50"
        title="Upload photo"
      >
        {uploading ? (
          <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        ) : (
          <MdCameraAlt className="w-3.5 h-3.5" />
        )}
      </button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
    </div>
  );
}
