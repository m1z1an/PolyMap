import { type Bundle, type Node, type Place, type Coordinates, type Shape } from './model';

export type Segment = { floor: string | null; building: string | null; points: Coordinates[] };
export type Route = { segments: Segment[]; meters: number; minutes: number };
export type Options = { asphalt: boolean; serviceRoute: boolean };

function distance(a: Coordinates, b: Coordinates) {
  const lat = (b[1] - a[1]) * Math.PI / 180;
  const lon = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(lat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(lon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, h)));
}

class Queue {
  private items: [string, number][] = [];
  push(item: [string, number]) {
    let i = this.items.length;
    this.items.push(item);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent][1] <= item[1]) break;
      this.items[i] = this.items[parent];
      i = parent;
    }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0];
    const tail = this.items.pop();
    if (!tail || this.items.length === 0) return first;
    let i = 0;
    while (i * 2 + 1 < this.items.length) {
      let child = i * 2 + 1;
      if (this.items[child + 1]?.[1] < this.items[child][1]) child++;
      if (this.items[child][1] >= tail[1]) break;
      this.items[i] = this.items[child];
      i = child;
    }
    this.items[i] = tail;
    return first;
  }
}

export function createRouter(data: Bundle) {
  const nodes = new Map(data.nodes.map(node => [node[0], node]));
  const associated = new Map<string, string[]>();
  for (const [place, node] of data.connections) {
    if (!nodes.has(node)) continue;
    const list = associated.get(place) ?? [];
    list.push(node);
    associated.set(place, list);
  }
  function endpoints(place: Place) {
    const exact = associated.get(place.id);
    if (exact?.length) return exact;
    let nearest: Node | undefined;
    let best = Infinity;
    for (const node of data.nodes) {
      if (node[2] !== place.level) continue;
      const meters = distance(place.position, node[1]);
      if (meters < best) {
        best = meters;
        nearest = node;
      }
    }
    return nearest && best <= (place.level ? 20 : 80) ? [nearest[0]] : [];
  }
  return (from: Place, to: Place, options: Options): Route | null => {
    if (from.id === to.id) return null;
    const targets = new Set(endpoints(to));
    if (!targets.size) return null;
    const queue = new Queue();
    const costs = new Map<string, number>();
    const parents = new Map<string, string>();
    for (const id of endpoints(from)) {
      costs.set(id, 0);
      queue.push([id, 0]);
    }
    let next: [string, number] | undefined;
    while ((next = queue.pop())) {
      const [id, cost] = next;
      if (cost !== costs.get(id)) continue;
      const node = nodes.get(id)!;
      if (targets.has(id)) {
        const path = [node];
        let parent = parents.get(id);
        while (parent) {
          path.push(nodes.get(parent)!);
          parent = parents.get(parent);
        }
        path.reverse();
        const segments: Segment[] = [];
        let meters = 0;
        let seconds = 0;
        for (let i = 0; i < path.length; i++) {
          const [, point, floor, building] = path[i];
          const last = segments.at(-1);
          if (last?.floor === floor && last.building === building) last.points.push(point);
          else segments.push({ floor, building, points: [point] });
          if (i > 0) {
            const length = distance(path[i - 1][1], point);
            meters += length;
            seconds += length / (building ? 2 / 3.6 : 4 / 3.6);
          }
        }
        return { segments, meters: Math.round(meters), minutes: Math.ceil(seconds / 60) };
      }
      const penalty = (options.asphalt && node[5].includes('dirt')) ||
        (!options.serviceRoute && node[5].includes('service')) ? 1000 : 0;
      for (const neighbor of node[6]) {
        const target = nodes.get(neighbor);
        if (!target) continue;
        const costToNeighbor = cost + distance(node[1], target[1]) * node[4] + penalty;
        if (costToNeighbor >= (costs.get(neighbor) ?? Infinity)) continue;
        costs.set(neighbor, costToNeighbor);
        parents.set(neighbor, id);
        queue.push([neighbor, costToNeighbor]);
      }
    }
    return null;
  };
}

export function routeShapes(route: Route | null, floor: string | null): Shape[] {
  return (route?.segments ?? []).filter(segment => segment.floor === floor).map(segment => ({
    type: 'Feature',
    geometry: segment.points.length === 1
      ? { type: 'Point', coordinates: segment.points[0] }
      : { type: 'LineString', coordinates: segment.points },
    properties: {},
  }));
}
