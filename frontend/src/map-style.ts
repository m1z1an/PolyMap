import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { collection, type Coordinates } from './model';

export const campusCenter: Coordinates = [30.3759, 60.0076];
const empty = collection([]);
export const mapStyle = {
  version: 8, sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#e8eee5" } }],
} satisfies StyleSpecification;
export const mapLayers: LayerSpecification[] = [
  { id: 'campus-fill', type: 'fill', source: 'campus', paint: {
    'fill-color': ['match', ['get', 'category'],
      'water', '#acd6df', ['forest', 'grass', 'grass.stadion', 'tree'], '#c8dec2',
      ['road.main', 'road.pedestrian.main', 'road.pedestrian.second', 'road.dirt'], '#faf9f1',
      '#c4cdc0'],
  }},
  { id: 'campus-edge', type: 'line', source: 'campus', filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'line-color': '#8a9e90', 'line-width': 0.65, 'line-opacity': 0.6 }},
  { id: 'floor-fill', type: 'fill', source: 'floor', paint: {
    'fill-color': ['match', ['get', 'category'],
      ['walkway', 'corridor'], '#f4eedc', ['stairs', 'elevator', 'escalator'], '#c9dcd3',
      ['restroom', 'restroom.male', 'restroom.female'], '#c9e5ed',
      ['room', 'classroom'], '#fcfbf5', '#dce9df'],
    'fill-outline-color': '#789186',
  }},
  { id: 'floor-line', type: 'line', source: 'floor', filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': '#637c6e', 'line-width': 1.2 }},
  { id: 'route-line', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#147b5c', 'line-width': 5 }},
  { id: 'route-point', type: 'circle', source: 'route', filter: ['==', ['geometry-type'], 'Point'],
    paint: { 'circle-radius': 5, 'circle-color': '#147b5c', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }},
  { id: 'place-point', type: 'circle', source: 'places', paint: {
    'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 7, 3],
    'circle-color': '#174f3e', 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff',
  }},
];

export const webStyle: StyleSpecification = {
  ...mapStyle,
  sources: Object.fromEntries(['campus', 'floor', 'route', 'places'].map(key => [key, { type: 'geojson', data: empty }])),
  layers: [...mapStyle.layers, ...mapLayers],
};
