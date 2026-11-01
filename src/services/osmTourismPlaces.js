const TOURISM_TYPES = new Set([
  "attraction",
  "museum",
  "artwork",
  "viewpoint",
  "gallery",
  "zoo",
  "aquarium",
  "theme_park",
]);

const ARCHITECTURAL_BUILDINGS = new Set([
  "castle",
  "cathedral",
  "chapel",
  "church",
  "mosque",
  "temple",
  "synagogue",
  "palace",
  "historic",
  "monument",
  "wayside_shrine",
]);

const NATIONAL_HERITAGE_PATTERN =
  /national[\s_-]+(park|monument|heritage)|world[\s_-]+heritage|protected[\s_-]+(area|landscape)|nature[\s_-]+reserve/i;

export function getOsmTourismPlaceTypes(tags = {}) {
  if (tags.shop || tags.office || tags.craft || tags.industrial || tags.commercial) {
    return [];
  }

  const types = [];
  if (TOURISM_TYPES.has(tags.tourism)) {
    types.push("tourist_attraction");
    if (tags.tourism === "museum") types.push("museum", "cultural_site");
    if (tags.tourism === "artwork" || tags.tourism === "gallery") types.push("art_gallery", "cultural_site");
    if (tags.tourism === "zoo" || tags.tourism === "aquarium" || tags.tourism === "theme_park") {
      types.push("family_attraction");
    }
    if (tags.tourism === "viewpoint") types.push("viewpoint");
  }

  if (tags.historic) types.push("historic_site");
  if (tags.heritage) types.push("heritage_site");
  if (tags.architectural_style) types.push("architectural_site");
  if (ARCHITECTURAL_BUILDINGS.has(tags.building)) types.push("architectural_site");

  if (tags.amenity === "place_of_worship") types.push("religious_site", "cultural_site");
  if (tags.amenity === "arts_centre" || tags.amenity === "theatre" || tags.amenity === "library") {
    types.push("cultural_site");
  }
  if (tags.leisure === "park" || tags.leisure === "garden") types.push("park");
  if (tags.leisure === "nature_reserve") types.push("nature_reserve", "national_or_protected_site");
  if (tags.boundary === "national_park") types.push("national_or_protected_site", "nature_reserve");
  if (tags.boundary === "protected_area" || tags.protect_class) {
    types.push("national_or_protected_site");
  }

  const designation = [tags.designation, tags.protect_class].filter(Boolean).join(" ");
  if (designation && NATIONAL_HERITAGE_PATTERN.test(designation)) {
    types.push("national_or_protected_site", "heritage_site");
  }

  return [...new Set(types)];
}

export function isOsmTourismPlace(tags = {}) {
  return getOsmTourismPlaceTypes(tags).length > 0;
}
