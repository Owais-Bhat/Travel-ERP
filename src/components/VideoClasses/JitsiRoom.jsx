import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MdClose } from 'react-icons/md';
import api from '../../lib/api';

let scriptPromise = null;
function loadJitsiScript(domain) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => { scriptPromise = null; reject(new Error('Failed to load Jitsi')); };
      document.body.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Full-screen embedded classroom for an in-app ("jitsi") video class.
 * videoClassId is only needed to self-mark attendance on join — pass null
 * for a caller (teacher/admin) that shouldn't auto-mark themselves present.
 */
export default function JitsiRoom({ domain, roomName, displayName, email, videoClassId, canSelfMarkAttendance, onClose }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    loadJitsiScript(domain).then(() => {
      if (cancelled || !containerRef.current) return;
      const jitsiApi = new window.JitsiMeetExternalAPI(domain, {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName, email },
        configOverwrite: { prejoinPageEnabled: true },
      });
      apiRef.current = jitsiApi;

      jitsiApi.addEventListener('videoConferenceJoined', () => {
        if (canSelfMarkAttendance && videoClassId) {
          api.post(`/video-classes/${videoClassId}/attendance`).catch(() => {});
        }
      });
      jitsiApi.addEventListener('readyToClose', () => onClose?.());
    });

    return () => {
      cancelled = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [domain, roomName, displayName, email, videoClassId, canSelfMarkAttendance, onClose]);

  return createPortal(
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className="flex justify-end p-2 bg-black/80">
        <button onClick={onClose} className="text-white/70 hover:text-white p-2" aria-label="Leave class">
          <MdClose className="w-6 h-6" />
        </button>
      </div>
      <div ref={containerRef} className="flex-1" />
    </div>,
    document.body
  );
}
