const styles = [
  {
    id: "curious-companion",
    name: "Curious companion",
    direction: "Use a curious, direct-to-listener voice. Open with one genuine question, then guide the listener through a few carefully qualified observations. Avoid rhetorical questions after the opening.",
  },
  {
    id: "field-notes",
    name: "Field notes",
    direction: "Use a concise, observant field-notes style. Prefer short sentences and clearly separate what the supplied record says from any tentative general context.",
  },
  {
    id: "museum-audio",
    name: "Museum audio guide",
    direction: "Use a calm, polished museum-audio-guide voice. Build a clear progression from the supplied place name to its mapped category and then to carefully qualified general context.",
  },
  {
    id: "storyteller",
    name: "Measured storyteller",
    direction: "Use a warm storyteller's cadence with varied sentence lengths and a gentle narrative arc. Do not invent a scene, character, event, quotation, legend, or visitor experience.",
  },
  {
    id: "thoughtful-conversation",
    name: "Thoughtful conversation",
    direction: "Sound like a thoughtful local-guide conversation: approachable, informal, and personal without pretending to have visited or to know local facts not supplied.",
  },
  {
    id: "reflective",
    name: "Reflective",
    direction: "Use a reflective, unhurried voice, with simple language and one restrained moment of perspective. Do not invent sensory details, emotions experienced by real people, or historical meaning.",
  },
];

let nextStyleIndex = 0;

export function getNextNarrationStyle() {
  const style = styles[nextStyleIndex % styles.length];
  nextStyleIndex += 1;
  return style;
}
