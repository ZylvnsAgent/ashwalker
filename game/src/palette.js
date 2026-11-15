// The look plan, in one place. Ember Yard at dusk: warm dark ground, rust containers,
// concrete walls, one ember-orange accent. Every colour in the game is one of these names;
// the same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#161009', // dusk sky / fog
  surface: '#241b12', // concrete
  hairline: '#3d2f1f', // rusted steel
  ink: '#f2e8d5', // warm off-white
  muted: '#a89a86', // dusty tan
  accent: '#ff9a3c', // ember orange
  site: '#3fae8a', // site marker green (A/B zones)
  enemy: '#e14b4b', // hostile red (enemy bots, damage)
};

export function shade(name) {
  return PALETTE[name];
}
