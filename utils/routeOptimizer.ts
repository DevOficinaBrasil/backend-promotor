interface Coordenada {
  id: number;
  id_oficina: number;
  lat: number;
  lon: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calcula distância haversine entre dois pontos em km
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 2-opt: tenta inverter sub-rotas para reduzir distância total.
 * Mantém o primeiro e último ponto fixos.
 */
function twoOptImprove(path: Coordenada[]): { path: Coordenada[]; totalDist: number } {
  let improved = true;
  let best = [...path];

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const currentDist =
          haversine(best[i - 1].lat, best[i - 1].lon, best[i].lat, best[i].lon) +
          haversine(best[j].lat, best[j].lon, best[j + 1].lat, best[j + 1].lon);
        const newDist =
          haversine(best[i - 1].lat, best[i - 1].lon, best[j].lat, best[j].lon) +
          haversine(best[i].lat, best[i].lon, best[j + 1].lat, best[j + 1].lon);

        if (newDist < currentDist - 0.001) {
          const reversed = best.slice(i, j + 1).reverse();
          best = [...best.slice(0, i), ...reversed, ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }

  let totalDist = 0;
  for (let i = 0; i < best.length - 1; i++) {
    totalDist += haversine(best[i].lat, best[i].lon, best[i + 1].lat, best[i + 1].lon);
  }

  return { path: best, totalDist };
}

/**
 * Nearest Neighbor com início e fim fixos + 2-opt improvement.
 * Retorna a ordem otimizada e a distância total.
 */
export function optimizeRoute(
  pontos: Coordenada[],
  idOficinaInicio: number,
  idOficinaFim: number
): { order: { id: number; id_oficina: number; ordem: number }[]; totalDistanceKm: number } {
  const inicio = pontos.find((p) => p.id_oficina === idOficinaInicio);
  const fim = pontos.find((p) => p.id_oficina === idOficinaFim);

  if (!inicio || !fim) {
    throw new Error("Oficina de início ou fim não encontrada nas rotas.");
  }

  // Caso trivial: somente 2 pontos
  if (pontos.length <= 2) {
    const dist = haversine(inicio.lat, inicio.lon, fim.lat, fim.lon);
    const order = idOficinaInicio === idOficinaFim
      ? [{ id: inicio.id, id_oficina: inicio.id_oficina, ordem: 1 }]
      : [
          { id: inicio.id, id_oficina: inicio.id_oficina, ordem: 1 },
          { id: fim.id, id_oficina: fim.id_oficina, ordem: 2 },
        ];
    return { order, totalDistanceKm: Math.round(dist * 10) / 10 };
  }

  const intermediarios = pontos.filter(
    (p) => p.id_oficina !== idOficinaInicio && p.id_oficina !== idOficinaFim
  );
  const unvisited = new Set(intermediarios.map((p) => p.id_oficina));
  const path: Coordenada[] = [inicio];
  let current = inicio;
  let totalDist = 0;

  while (unvisited.size > 0) {
    let nearest: Coordenada | null = null;
    let nearestDist = Infinity;
    for (const p of intermediarios) {
      if (!unvisited.has(p.id_oficina)) continue;
      const d = haversine(current.lat, current.lon, p.lat, p.lon);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }
    if (nearest) {
      path.push(nearest);
      unvisited.delete(nearest.id_oficina);
      totalDist += nearestDist;
      current = nearest;
    }
  }

  totalDist += haversine(current.lat, current.lon, fim.lat, fim.lon);
  path.push(fim);

  // 2-opt local improvement
  const improved = twoOptImprove(path);

  return {
    order: improved.path.map((p, i) => ({
      id: p.id,
      id_oficina: p.id_oficina,
      ordem: i + 1,
    })),
    totalDistanceKm: Math.round(improved.totalDist * 10) / 10,
  };
}

interface OSRMRouteResponse {
  code: string;
  routes: {
    geometry: {
      type: string;
      coordinates: [number, number][];
    };
    distance: number; // meters
    duration: number; // seconds
    legs: {
      distance: number;
      duration: number;
    }[];
  }[];
  waypoints: {
    waypoint_index: number;
    location: [number, number];
  }[];
}

/**
 * Chama OSRM para obter rota real por ruas.
 * Usa a ordem já otimizada (Nearest Neighbor + 2-opt) como waypoints fixos.
 * Retorna a geometria GeoJSON e a distância real.
 */
export async function fetchOSRMRoute(
  orderedPontos: Coordenada[]
): Promise<{ geometry: { type: string; coordinates: [number, number][] }; distanceKm: number } | null> {
  if (orderedPontos.length < 2) return null;

  // OSRM espera lon,lat (não lat,lon)
  const coords = orderedPontos.map((p) => `${p.lon},${p.lat}`).join(";");
  const url = `https://rotasapi.oficinabrasil.com.br/route/v1/driving/${coords}?overview=full&geometries=geojson`;


  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error("OSRM HTTP error:", response.status);
      return null;
    }

    const data = (await response.json()) as OSRMRouteResponse;

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      console.error("OSRM response error:", data.code);
      return null;
    }

    const route = data.routes[0];
    return {
      geometry: route.geometry,
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    };
  } catch (error) {
    console.error("OSRM fetch error:", error);
    return null;
  }
}
