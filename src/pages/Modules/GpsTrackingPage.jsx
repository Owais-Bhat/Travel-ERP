import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MainLayout from '../../components/Layout/MainLayout';
import GlassCard from '../../components/Common/GlassCard';
import Button from '../../components/Common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import api from '../../lib/api';
import { MdMyLocation, MdContentCopy } from 'react-icons/md';

// Vite bundles leaflet's default marker icon paths incorrectly — point them
// at the CDN instead of trying to resolve local asset URLs.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export default function GpsTrackingPage() {
  const { profile } = useAuth();
  const notification = useNotification();

  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoute, setSelectedRoute] = useState(null);

  const loadRoutes = async () => {
    if (!profile?.institution_id) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/transport/routes');
      setRoutes(data || []);
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to load routes';
      setError(message);
      notification.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (profile) loadRoutes(); }, [profile]);

  const refreshLocation = async (route) => {
    try {
      const { data } = await api.get(`/transport/routes/${route.id}/location`);
      setRoutes(prev => prev.map(r => (r.id === route.id ? { ...r, last_lat: data.last_lat, last_lng: data.last_lng, last_ping_at: data.last_ping_at } : r)));
      if (selectedRoute?.id === route.id) setSelectedRoute(data);
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to refresh location');
    }
  };

  const generateLink = async (route) => {
    try {
      const { data } = await api.post(`/transport/routes/${route.id}/tracking-token`);
      const link = `${window.location.origin}/track/${data.tracking_token}`;
      navigator.clipboard?.writeText(link);
      notification.success('Driver tracking link copied! Send it to the driver\'s phone.');
    } catch (err) {
      notification.error(err.response?.data?.error || 'Failed to generate link');
    }
  };

  const hasLocation = (route) => route?.last_lat != null && route?.last_lng != null;

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Live GPS Bus Tracking</h1>
          <p className="text-white/50 text-sm mt-1">Generate a tracking link for a driver's phone, then watch live positions here.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-white/50">Loading...</div>
        ) : error ? (
          <GlassCard className="p-10 text-center">
            <p className="text-red-400 mb-3">{error}</p>
            <Button variant="secondary" onClick={loadRoutes}>Retry</Button>
          </GlassCard>
        ) : routes.length === 0 ? (
          <GlassCard className="p-10 text-center text-white/40">No transport routes yet. Add one under Transport first.</GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-1 space-y-3">
              {routes.map(r => (
                <GlassCard key={r.id} className={`p-4 cursor-pointer transition ${selectedRoute?.id === r.id ? 'ring-2 ring-blue-500/50' : ''}`} onClick={() => setSelectedRoute(r)}>
                  <div className="flex justify-between items-start mb-1">
                    <p className="text-white font-semibold">{r.route_name}</p>
                    <span className={`w-2 h-2 rounded-full mt-1.5 ${hasLocation(r) ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  </div>
                  <p className="text-white/40 text-xs mb-2">{r.vehicle_no || 'No vehicle assigned'}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); generateLink(r); }}>
                      <MdContentCopy className="inline mr-1 w-3.5 h-3.5" /> Link
                    </Button>
                    <Button variant="secondary" onClick={(e) => { e.stopPropagation(); refreshLocation(r); }}>
                      <MdMyLocation className="inline mr-1 w-3.5 h-3.5" /> Refresh
                    </Button>
                  </div>
                  {r.last_ping_at && <p className="text-white/30 text-[11px] mt-2">Last seen: {new Date(r.last_ping_at).toLocaleString()}</p>}
                </GlassCard>
              ))}
            </div>

            <div className="lg:col-span-2">
              <GlassCard className="p-2 h-[500px] overflow-hidden">
                {selectedRoute && hasLocation(selectedRoute) ? (
                  <MapContainer center={[Number(selectedRoute.last_lat), Number(selectedRoute.last_lng)]} zoom={14} style={{ height: '100%', width: '100%', borderRadius: '0.75rem' }}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[Number(selectedRoute.last_lat), Number(selectedRoute.last_lng)]}>
                      <Popup>{selectedRoute.route_name}</Popup>
                    </Marker>
                  </MapContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-white/40 text-sm text-center px-6">
                    {selectedRoute ? 'No location received yet for this route. Share the tracking link with the driver.' : 'Select a route to see its live location.'}
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
