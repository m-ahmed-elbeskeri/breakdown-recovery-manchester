// The map on the customer's tracking page: their pickup, and the truck once
// it is on the way. Loaded lazily, so the 40 kB of Leaflet is only fetched by
// the one page that draws a map.
//
// Markers are inline SVG rather than Leaflet's default PNGs, which do not
// survive a bundler without extra configuration and would not be on-brand
// anyway. Tiles are OpenStreetMap's, with the attribution they ask for.

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapPoint {
  lat: number;
  lng: number;
}

const PIN = L.divIcon({
  className: '',
  html: `<svg viewBox="0 0 48 48" width="40" height="40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M24 46 C20.5 40.5 9 31 9 20 A15 15 0 1 1 39 20 C39 31 27.5 40.5 24 46 Z" fill="#f5c518" stroke="#0e151d" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="24" cy="20" r="5" fill="#0e151d"/>
  </svg>`,
  iconSize: [40, 40],
  iconAnchor: [20, 38],
});

const TRUCK = L.divIcon({
  className: '',
  html: `<div style="width:36px;height:36px;border-radius:50%;background:#0d2038;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#f5c518" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0M14 19a2 2 0 1 0 4 0 2 2 0 0 0-4 0"/>
      <path d="M2 17V6a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v11M14 9h4l3 4v4h-3M2 17h6M12 17h2"/>
    </svg>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

export default function TrackMap({
  pickup,
  driver,
}: {
  pickup: MapPoint | null;
  driver: MapPoint | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pickupMarker = useRef<L.Marker | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      pickupMarker.current = null;
      driverMarker.current = null;
    };
  }, []);

  const pickupLat = pickup?.lat;
  const pickupLng = pickup?.lng;
  const driverLat = driver?.lat;
  const driverLng = driver?.lng;

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    if (pickupLat !== undefined && pickupLng !== undefined) {
      const at: L.LatLngExpression = [pickupLat, pickupLng];
      if (pickupMarker.current) pickupMarker.current.setLatLng(at);
      else pickupMarker.current = L.marker(at, { icon: PIN, title: 'Your pickup' }).addTo(m);
    }

    if (driverLat !== undefined && driverLng !== undefined) {
      const at: L.LatLngExpression = [driverLat, driverLng];
      if (driverMarker.current) driverMarker.current.setLatLng(at);
      else driverMarker.current = L.marker(at, { icon: TRUCK, title: 'Your driver' }).addTo(m);
    } else if (driverMarker.current) {
      driverMarker.current.remove();
      driverMarker.current = null;
    }

    const points: L.LatLng[] = [];
    if (pickupLat !== undefined && pickupLng !== undefined)
      points.push(L.latLng(pickupLat, pickupLng));
    if (driverLat !== undefined && driverLng !== undefined)
      points.push(L.latLng(driverLat, driverLng));
    if (points.length === 2) {
      m.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 15 });
    } else if (points.length === 1) {
      m.setView(points[0], 14);
    }
  }, [pickupLat, pickupLng, driverLat, driverLng]);

  return (
    <div
      ref={el}
      className="h-64 sm:h-80 w-full bg-neutral-900 border-2 border-neutral-800"
      role="region"
      aria-label="Map showing your pickup and, once on the way, your driver"
    />
  );
}
