const down = new Set();
const pressed = new Set(); // keys pressed this frame

addEventListener('keydown', (e) => {
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => down.delete(e.code));
addEventListener('blur', () => down.clear());

export const input = {
  isDown: (...codes) => codes.some((c) => down.has(c)),
  wasPressed: (...codes) => codes.some((c) => pressed.has(c)),
  has: (...codes) => codes.some((c) => down.has(c)),
  endFrame: () => pressed.clear(),
};
