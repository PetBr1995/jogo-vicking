# Mago

Vilão que ataca de longe. Frágil, fica parado atirando orbes arcanos.

- Folha-modelo: `docs/arte/personagens/mago/modelo.png` (original `.webp` na mesma pasta)
- Folha do jogo: `public/assets/mago-art.png` + `mago-art.json`, gerada por `node tools/make-enemy-sheet.mjs mago`
- Estado: **arte provisória** (vinda do modelo; dano e queda improvisados por código)
- Prompts gerais dos vilões: [../PROMPTS-VILOES.md](../PROMPTS-VILOES.md)

## Visual

Mago encapuzado, baixinho, com capuz marrom-acinzentado e o rosto em sombra preta com **olhos brancos
brilhantes**. Barba comprida cinza-clara. Roupão marrom-escuro surrado, cinto de corda, cajado de
madeira torta com uma gema azul-arroxeada brilhando. Efeitos: espiral azul, onda branca de corte e
explosão roxa.

## Comportamento no jogo (já implementado)

| | |
|---|---|
| Vida | 3 golpes |
| Distância | para longe do viking (≈300 px) e atira dali |
| Ataque | no 3º quadro da linha de ataque sai um **orbe arcano** roxo que voa reto |
| Dano ao viking | 1 de vida; o orbe pode ser desviado pulando |
| Tempo entre disparos | 1,8 a 2,8 s |
| Velocidade | patrulha 55, perseguição 90 (lento) |

## Linhas de sprite

| Linha | Movimento | Estado |
|---|---|---|
| 1 | Parado | ✅ do modelo |
| 2 | Andar | ✅ do modelo |
| 3 | Correr | ✅ do modelo |
| 4 | Ataque (quadro do disparo: o 3º) | ✅ do modelo |
| 5 | Levar dano (2) | ⚠️ improvisado por código |
| 6 | Cair (5) | ⚠️ improvisado por código |
| , | Orbe arcano (projétil) | ⚠️ desenhado por código, pode virar sprite |

## Prompts

Use o **PROMPT BASE** de [PROMPTS-VILOES.md](../PROMPTS-VILOES.md) com este `[PERSONAGEM]`:
```
um MAGO encapuzado baixinho: capuz marrom-acinzentado com o rosto em sombra
preta e olhos brancos brilhantes, barba comprida cinza-clara, roupão marrom
surrado com cinto de corda, cajado de madeira torta com uma gema azul-arroxeada
brilhando
```

Os blocos de Parado, Andar, Correr, Levar dano e Cair estão em PROMPTS-VILOES.md.

**Ataque do mago**
```
ATAQUE MÁGICO, 6 quadros: 1) segurar o cajado de lado, gema brilhando,
2) apontar o cajado para frente, olhos acendendo, espiral azul se formando,
3) LANÇAR: o braço à frente, o orbe de energia roxa e branca sai da ponta do
cajado, 4) o orbe se afasta deixando faíscas, 5) recolher o cajado, fumaça
roxa, 6) voltar à postura parada. O feitiço cabe DENTRO do quadro.
```

**Orbe arcano (projétil), efeito sem personagem**
```
Gere uma linha de sprite sheet de um EFEITO, sem personagem: um ORBE de
energia arcana roxa e branca, brilhante, com rastro de faíscas para trás
(voando para a direita), em pintura 2D com contorno escuro fino, no estilo do
mago anexo. 6 quadros em loop, o orbe pulsando, fundo transparente, nada
cruza a divisa dos quadros, o orbe ocupa no máximo 60% do quadro.
```

**Explosão do orbe (quando acerta)**
```
Gere uma linha de sprite sheet de EFEITO, sem personagem: EXPLOSÃO de energia
arcana roxa e branca, 6 quadros: faísca, bola cresce, explosão máxima, anel de
energia, faíscas caindo, fumaça roxa sumindo. Fundo transparente, nada cruza
a divisa.
```

## Para colocar no jogo depois de gerar

1. Salve as imagens em `docs/arte/personagens/mago/` (`idle.png`, `walk.png`, ...) e me avise.
2. Eu atualizo `tools/make-enemy-sheet.mjs` para ler as linhas novas e rodo o comando acima.
