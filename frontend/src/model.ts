import type { Feature, FeatureCollection, Geometry } from 'geojson';

export type Coordinates = [number, number];
export type Shape = Feature<Geometry, { category?: string; level_id?: string; restriction?: string; place?: string }>;
export type Floor = { id: string; name: string; ordinal: number; geometry: Shape[] };
export type Building = { id: string; name: string; position: Coordinates | null; floors: Floor[] };
export type Place = {
  id: string; name: string; short: string; alternate: string; category: string;
  level: string | null; building: string | null; unit: string | null;
  position: Coordinates; address?: string; description?: string;
};
export type Node = [
  id: string, position: Coordinates, floor: string | null, building: string | null,
  weight: number, tags: string[], neighbors: string[],
];
export type Bundle = {
  revision: string; defaultStart: string; campus: Shape[]; buildings: Building[];
  places: Place[]; nodes: Node[]; connections: [string, string][];
};
export type Snapshot = { version: string; data: Bundle };
export const collection = (features: Shape[]): FeatureCollection<Geometry, Shape['properties']> =>
  ({ type: 'FeatureCollection', features });

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function searchPlaces(places: Place[], buildings: Building[], input: string, activeBuilding: string | null) {
  const query = normalize(input);
  const names = new Map(buildings.map(building => [building.id, normalize(building.name)]));
  return places.flatMap(place => {
    const fields = [place.name, place.short, place.alternate].map(normalize);
    const body = [...fields, names.get(place.building ?? '')].join(' ');
    if (!query || !query.split(' ').every(word => body.includes(word))) return [];
    const rank = fields.includes(query) ? 0 : fields.some(field => field.startsWith(query)) ? 2 : 4;
    return [{ place, rank: rank + (place.building === activeBuilding ? 0 : 1) }];
  }).sort((a, b) => a.rank - b.rank || a.place.name.localeCompare(b.place.name, 'ru', { numeric: true }))
    .slice(0, 30).map(result => result.place);
}
