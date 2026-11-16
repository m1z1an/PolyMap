import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../public/polymap.css';
import { campusCenter, webStyle } from './map-style';
import { collection } from './model';
import { placeShapes, type MapProps } from './map-props';

export default function CampusMap(props: MapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const onPlace = useRef(props.onPlace);
  onPlace.current = props.onPlace;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: container.current, style: webStyle, center: campusCenter, zoom: 15.4,
        maxZoom: 23, pitchWithRotate: false, dragRotate: false,
      });
    } catch {
      setFailed(true);
      return;
    }
    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    instance.on('load', () => setReady(true));
    instance.on('click', 'place-point', event => {
      const id = event.features?.[0]?.properties.place;
      if (id) onPlace.current(id);
    });
    instance.on('click', 'floor-fill', event => {
      if (instance.queryRenderedFeatures(event.point, { layers: ['place-point'] }).length) return;
      const id = event.features?.[0]?.properties.place;
      if (id) onPlace.current(id);
    });
    const resize = new ResizeObserver(() => instance.resize());
    resize.observe(container.current);
    return () => {
      resize.disconnect();
      instance.remove();
      map.current = null;
    };
  }, []);

  const { campus, floor, lines, places, selected, focus } = props;
  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    for (const [source, shapes] of Object.entries({ campus, floor, route: lines, places: placeShapes(places) })) {
      instance.getSource<GeoJSONSource>(source)?.setData(collection(shapes));
    }
    for (const marker of markers.current) marker.remove();
    markers.current = places.filter(place => !place.level || /^\d/.test(place.short || place.name) || place.id === selected)
      .map(place => {
        const label = document.createElement('button');
        label.type = 'button';
        label.className = `map-marker ${place.level ? 'map-room' : 'map-building'} ${place.id === selected ? 'map-selected' : ''}`;
        label.textContent = place.short || place.name;
        label.setAttribute('aria-label', place.name);
        label.addEventListener('click', event => { event.stopPropagation(); onPlace.current(place.id); });
        return new maplibregl.Marker({ element: label, anchor: 'center' }).setLngLat(place.position).addTo(instance);
      });
  }, [ready, campus, floor, lines, places, selected]);

  useEffect(() => {
    if (!ready || !map.current || !focus.points.length) return;
    const [first, ...rest] = focus.points;
    if (!rest.length) {
      map.current.easeTo({ center: first, zoom: focus.zoom, duration: 320 });
      return;
    }
    const bounds = rest.reduce((box, point) => box.extend(point), new maplibregl.LngLatBounds(first, first));
    map.current.fitBounds(bounds, { padding: 62, maxZoom: focus.zoom, duration: 380 });
  }, [focus, ready]);

  return <div aria-label="Интерактивная карта Политеха" style={{ position: 'absolute', inset: 0 }}>
    <div ref={container} style={{ height: '100%', width: '100%' }} />
    {failed && <div className="map-error">Для отображения карты нужен WebGL. Поиск и расчёт маршрута доступны в панели.</div>}
  </div>;
}
