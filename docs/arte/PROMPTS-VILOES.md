# Prompts dos vilões

Prompts para gerar as sprites dos inimigos. O viking tem o arquivo [PROMPTS-VIKING.md](PROMPTS-VIKING.md).
Cada vilão novo tem um arquivo próprio com a ficha, o comportamento no jogo e os prompts dele:

| Vilão | Papel | Arquivo |
|---|---|---|
| **Saxão** (lanceiro) | inimigo básico, corpo a corpo | [PROMPT BASE + saxão](#saxão-lanceiro) (abaixo) |
| **Mago** | longe, lança orbes arcanos, frágil | [personagens/mago.md](personagens/mago.md) |
| **Templário** | pesado, muita vida, golpe forte | [personagens/templario.md](personagens/templario.md) |
| **Fada** | voa, rápida, lança faíscas | [personagens/fada.md](personagens/fada.md) |

Anexe sempre a folha-modelo do personagem (`docs/arte/personagens/<nome>/modelo.png`) como referência.
Antes de gerar uma linha, confira nos arquivos dos personagens o que o jogo já usa.

---

## O que o jogo precisa de cada vilão

Cada vilão é uma folha de 6 colunas. Linhas (cada uma com **6 quadros**, salvo dano):

| Linha | Movimento | Quadros | Observação |
|---|---|---|---|
| 1 | **Parado** (idle), em loop | 6 | respirando |
| 2 | **Andar** (patrulha), em loop | 6 | ciclo de passos |
| 3 | **Correr** (perseguir), em loop | 6 | mais inclinado |
| 4 | **Ataque** | 6 | o quadro do golpe causa o dano (veja o arquivo de cada um) |
| 5 | **Levar dano** | 2 | recuo curto |
| 6 | **Cair / derrotado** | 5 | cai de costas e fica no chão |

As folhas-modelo que você gerou têm **parado, andar, correr, pulo e ataque**. O jogo usa parado,
andar, correr e ataque. O **pulo não é usado**. **Dano e queda não existem nos modelos**: hoje eles
são **improvisados por código** (o personagem parado inclinado e caindo de costas). Gere essas duas
linhas para ficar bom de verdade.

Todos viram o rosto para a **direita** no desenho. O jogo espelha sozinho para o outro lado.

---

## PROMPT BASE (vilões)

```
Gere uma SPRITE SHEET em pixel art / pintura 2D de [PERSONAGEM] em visão
lateral (de perfil, virado para a direita).

REFERÊNCIA ANEXA: copie exatamente o personagem da imagem: o mesmo rosto, as
roupas, as cores, as proporções (cabeça grande, corpo pequeno), o contorno
escuro grosso e o estilo de pintura. Mesma qualidade e mesma pegada.

FORMATO DA GRADE:
- [N] quadros por linha, lado a lado, sem espaço entre eles.
- Fundo TRANSPARENTE (PNG com alpha), sem sombra no chão.
- Os PÉS do personagem sempre no mesmo ponto em todos os quadros.
- Nada pode passar das bordas do quadro nem invadir o vizinho, incluindo
  efeitos mágicos, arcos de golpe e poeira. Deixe folga nas laterais.
- Mesmo ângulo de câmera, mesma escala e mesma iluminação em todos os quadros.
- O corpo NÃO muda de tamanho nem de forma entre as linhas.

LINHA PEDIDA: [MOVIMENTO]

Entregue UMA imagem por linha.
```

Troque `[N]` por 6 (ou 2 para dano, 5 para queda), `[PERSONAGEM]` pelo nome com a descrição curta e
`[MOVIMENTO]` por um dos blocos abaixo.

## [MOVIMENTO] para qualquer vilão

**Parado**
```
PARADO (idle), 6 quadros em loop: respirando de leve, a roupa e os detalhes
mexendo um pouco. O último quadro volta suavemente ao primeiro.
```

**Andar**
```
ANDANDO, 6 quadros em loop: passos calmos de patrulha, o corpo balançando
de leve, a roupa acompanhando. O último quadro leva ao primeiro sem salto.
```

**Correr**
```
CORRENDO, 6 quadros em loop: ciclo de corrida completo, corpo inclinado
para a frente, roupa e capa voando para trás. O último quadro leva ao primeiro.
```

**Levar dano**
```
LEVAR DANO, 2 quadros (em vez de 6): 1) corpo jogado para trás, expressão
de dor, olhos apertados, 2) recuo máximo, joelho dobrado, quase caindo.
```

**Cair / derrotado**
```
CAIR E FICAR NO CHÃO, 5 quadros: 1) desequilibrando para trás, 2) pés
saindo do chão, 3) no ar, caindo de costas, 4) batendo no chão com poeira,
5) deitado de costas, imóvel, de olhos fechados ou apagados. O último quadro
é a pose final e fica parada.
```

O **ataque** é diferente em cada vilão: veja o arquivo dele.

---

## Saxão (lanceiro)

Já existe no jogo (`public/assets/saxon-art.png`). Referências: `docs/arte/guia-saxon.png` e
`docs/arte/sheet-enemy.png`. Anexe uma delas.

Estilo para colar em `[PERSONAGEM]`:
```
um SOLDADO SAXÃO lanceiro: capacete de ferro, escudo redondo de madeira, lança,
túnica e cores terrosas, expressão carrancuda
```

**Ataque do saxão**
```
ATAQUE DE LANÇA, 6 quadros: 1) postura firme, 2) puxar a lança para trás
(aviso do golpe), 3) segurar um instante, 4) ESTOCADA para a frente com a
lança esticada, 5) recolher a lança, 6) voltar à postura.
```

O jogo usa o **quadro 4** como o do golpe (o dano acontece quando a estocada sai).
