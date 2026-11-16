export type CharacterId = 'eirik' | 'kaela' | 'bori';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  role: string;
  color: number;
  outlineColor: number;
  eyeColor: number;
  width: number;
  height: number;
  speed: number;
  accelGrounded: number;
  accelAir: number;
  dragGrounded: number;
  dragAir: number;
  jumpForce: number;
  gravityMult: number;
  fallGravityMult: number;
}

export const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  eirik: {
    id: 'eirik',
    name: 'Eirik',
    role: 'Viking · Pesado',
    color: 0xdf5435,      // Vermelho/ferro guerreiro
    outlineColor: 0x4a1910,
    eyeColor: 0x38bdf8,
    width: 44,
    height: 64,
    speed: 260,
    accelGrounded: 2200,
    accelAir: 1400,
    dragGrounded: 1900,
    dragAir: 700,
    jumpForce: -520,
    gravityMult: 1.1,     // Mais pesado
    fallGravityMult: 1.3,
  },
  kaela: {
    id: 'kaela',
    name: 'Kaela',
    role: 'Resistência · Ágil',
    color: 0x06b6d4,      // Ciano plasma
    outlineColor: 0x083344,
    eyeColor: 0xec4899,
    width: 36,
    height: 58,
    speed: 340,           // 1.25x mais rápida
    accelGrounded: 2800,
    accelAir: 1900,
    dragGrounded: 2400,
    dragAir: 900,
    jumpForce: -490,
    gravityMult: 1.0,     // Ágil equilibrada
    fallGravityMult: 1.3,
  },
  bori: {
    id: 'bori',
    name: 'B.O.R.I.',
    role: 'Robô · Suporte',
    color: 0xf59e0b,      // Dourado/âmbar tecnológico
    outlineColor: 0x451a03,
    eyeColor: 0x22d3ee,   // Olho óptico ciano
    width: 38,
    height: 38,
    speed: 290,
    accelGrounded: 2000,
    accelAir: 1800,
    dragGrounded: 1600,
    dragAir: 1100,
    jumpForce: -360,
    gravityMult: 0.35,    // Baixa gravidade / flutuação
    fallGravityMult: 1.2,
  },
};
