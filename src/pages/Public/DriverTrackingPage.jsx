import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';

export default function DriverTrackingPage() {
  const { token } = useParams();
  const [status, setStatus] = useState('idle'); // idle | tracking | error
  const [lastSent, setLastSent] = useState(null);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);

  const sendPosition = async (position) => {
    const { latitude, longitude } = position.coords;
    try {
      await api.post(`/bus-tracking/${token}`, { lat: latitude, lng: longitude });
      setLastSent(new Date());
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send location');
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported on this device.');
      return;
    }
    setStatus('tracking');
    watchIdRef.current = navigator.geolocation.watchPosition(
      sendPosition,
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setStatus('idle');
  };

  useEffect(() => () => stopTracking(), []);

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="max-w-sm w-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
        <h1 className="text-xl font-bold text-white mb-2">Bus Location Sharing</h1>
        <p className="text-white/50 text-sm mb-6">Keep this page open while driving. Your phone's location is shared with the school so parents can see the bus live.</p>

        {status === 'idle' ? (
          <button onClick={startTracking} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-3 transition">
            Start Sharing Location
          </button>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-emerald-400 text-sm font-semibold">Sharing live</p>
            </div>
            {lastSent && <p className="text-white/40 text-xs mb-4">Last sent: {lastSent.toLocaleTimeString()}</p>}
            <button onClick={stopTracking} className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg py-3 transition">
              Stop Sharing
            </button>
          </>
        )}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
      </div>
    </div>
  );
}
