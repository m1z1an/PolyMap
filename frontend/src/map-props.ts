import type { Coordinates, Shape, Place } from './model';

export type MapProps = {
  campus: Shape[]; floor: Shape[]; lines: Shape[];
  places: Place[]; selected?: string;
  focus: { points: Coordinates[]; zoom: number };
  onPlace: (id: string) => void;
};

export function placeShapes(places: Place[]): Shape[] {
  return places.map(place => ({
    type: 'Feature', id: place.id, geometry: { type: 'Point', coordinates: place.position },
    properties: { place: place.id },
  }));
}
