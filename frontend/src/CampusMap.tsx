import { useEffect, useRef } from 'react';
import { Map, Camera, GeoJSONSource, Layer, type CameraRef } from '@maplibre/maplibre-react-native';
import { collection } from './model';
import { campusCenter, mapLayers, mapStyle } from './map-style';
import { placeShapes, type MapProps } from './map-props';

export default function CampusMap({ campus, floor, lines, places, focus, onPlace }: MapProps) {
  const camera = useRef<CameraRef>(null);
  useEffect(() => {
    const [center, ...rest] = focus.points;
    if (!center) return;
    if (!rest.length) {
      camera.current?.easeTo({ center, zoom: focus.zoom, duration: 320 });
      return;
    }
    const xs = focus.points.map(point => point[0]);
    const ys = focus.points.map(point => point[1]);
    camera.current?.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 380 });
  }, [focus]);

  return <Map style={{ flex: 1 }} mapStyle={mapStyle} attribution={false} logo={false}>
    <Camera ref={camera} initialViewState={{ center: campusCenter, zoom: 15.4 }} />
    {Object.entries({ campus, floor, route: lines, places: placeShapes(places) }).map(([id, features]) =>
      <GeoJSONSource key={id} id={id} data={collection(features)} onPress={event => {
        const place = event.nativeEvent.features[0]?.properties?.place;
        if (typeof place === 'string') onPlace(place);
      }}>
        {mapLayers.filter(layer => 'source' in layer && layer.source === id).map(layer =>
          <Layer key={layer.id} {...layer} />)}
      </GeoJSONSource>)}
  </Map>;
}
