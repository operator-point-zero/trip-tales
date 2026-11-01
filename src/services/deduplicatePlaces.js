const NEARBY_DUPLICATE_DISTANCE_METERS = 50;

const normalizePlaceName = (name) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const distanceInMeters = (first, second) => {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lon - first.lon);
  const firstLatitude = radians(first.lat);
  const secondLatitude = radians(second.lat);
  const haversine = Math.min(1, Math.max(0,
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2
  ));
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

const placeDataScore = (place) =>
  (place.types?.length || 0) +
  (place.vicinity ? 2 : 0) +
  (place.photos?.length || 0) * 2 +
  (place.sourceReferences?.length || 0) * 2;

const mergeDuplicatePlace = (first, second) => {
  const preferred = placeDataScore(second) > placeDataScore(first) ? second : first;
  const other = preferred === first ? second : first;
  return {
    ...preferred,
    types: [...new Set([...(preferred.types || []), ...(other.types || [])])],
    photos: [...new Set([...(preferred.photos || []), ...(other.photos || [])])],
    sourceReferences: [...new Set([...(preferred.sourceReferences || []), ...(other.sourceReferences || [])])],
    vicinity: preferred.vicinity || other.vicinity || null,
  };
};

export function deduplicatePlaces(places) {
  const results = [];
  const placeIdIndexes = new Map();
  const nameIndexes = new Map();

  for (const place of places) {
    const nameKey = normalizePlaceName(place.locationName);
    const nearbyIndexes = nameIndexes.get(nameKey) || [];
    const duplicateIndex =
      (place.placeId ? placeIdIndexes.get(place.placeId) : undefined) ??
      nearbyIndexes.find((index) => distanceInMeters(results[index], place) <= NEARBY_DUPLICATE_DISTANCE_METERS);

    if (duplicateIndex !== undefined) {
      const previousPlaceId = results[duplicateIndex].placeId;
      results[duplicateIndex] = mergeDuplicatePlace(results[duplicateIndex], place);
      if (previousPlaceId) placeIdIndexes.set(previousPlaceId, duplicateIndex);
      if (place.placeId) placeIdIndexes.set(place.placeId, duplicateIndex);
      if (!nearbyIndexes.includes(duplicateIndex)) {
        nameIndexes.set(nameKey, [...nearbyIndexes, duplicateIndex]);
      }
      continue;
    }

    const index = results.push(place) - 1;
    if (place.placeId) placeIdIndexes.set(place.placeId, index);
    nameIndexes.set(nameKey, [...nearbyIndexes, index]);
  }

  return results;
}
