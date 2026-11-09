# Jogo Viking

Protótipo do personagem viking em pixel art, de perfil (Canvas 2D + Vite).
Recomeçado do zero, passo a passo: por enquanto **parado**, **andar**, **correr**, **pular** e **atacar**.

## Rodar

```bash
npm install
npm run dev
```

Abra http://localhost:5173

## Controles

| Tecla | Ação |
|---|---|
| ← → / A D | andar |
| ↑ ↓ / W S | mover em profundidade |
| Shift | correr |
| Espaço / K | pular |
| J | atacar |
| L | lançar raio (com a Runa do Trovão) |
| U | lançar onda de fogo (com a Runa do Fogo) |
| P / Esc | pausar / despausar (também pausa ao sair da aba) |
| B | mostrar a caixa do quadro e o ponto de apoio |

## Sprites

O viking é desenhado por código em `tools/make-viking.mjs`, em uma grade fixa
(cada quadro é uma célula de 64×64, pés sempre na mesma linha), então o jogo não
precisa recortar nada. Depois de mudar o desenho ou as poses, gere de novo:

```bash
node tools/make-viking.mjs
```

Saída: `public/assets/viking.png` (linha 0 = parado, 4 quadros; linha 1 = andar,
12 quadros; linha 2 = correr, 12 quadros; linha 3 = pular, 6 quadros; linha 4 = atacar, 7 quadros) e `public/assets/viking.json` (tamanho da célula, ponto de apoio e
o passo do andar).

As poses do andar ficam em `LEG` (ângulos de coxa e joelho em 8 poses-chave);
os quadros intermediários são interpolados, então dá para aumentar
`WALK_FRAMES` para deixar mais suave. A corrida usa o mesmo esquema com
`RUN_LEG` (e `RUN_AIR` para o momento com os dois pés no ar). O pulo tem uma
pose por momento em `jump`; a altura vem do jogo (`JUMP` em `src/player.js`). O ataque fica em `attack`
(tempo de cada quadro em `durations`, o impacto em `hitFrame`).

## Cenário

Um mundo de 4.000 px (`WORLD_WIDTH` em `src/scene.js`) num entardecer nórdico. A câmera
segue o viking com suavidade, olhando um pouco para o lado em que ele está virado, e para
nas pontas do mundo. O fundo tem camadas que se movem em velocidades diferentes (céu com
lua e estrelas, montanhas nevadas, colinas com floresta, pinheiros mais perto), e o chão
tem uma trilha de terra, grama e pedras presas ao mundo. Tudo em pixel art do mesmo
tamanho de pixel dos bonecos. Cores em `C` e velocidades das camadas em `buildLayers`
(`src/scene.js`); ajuste da câmera em `CAMERA` (`src/main.js`).

## Itens no chão

O viking pega itens passando por cima deles (`src/pickups.js`):

- **Coxa de carne assada:** recupera 3 de vida (sem passar do máximo). Algumas estão no
  caminho e cada saxão derrotado tem 40% de chance de deixar uma.
- **Runa da Fúria:** pedra com uma runa brilhando. Dá 10 s de **fúria berserker**: dano
  dobrado (o saxão cai em 3 golpes), golpes 45% e passos 30% mais rápidos, corpo pulsando em
  vermelho, brilho no chão, brasas subindo e uma barra laranja que diminui. Na fúria o **J
  arremessa o machado**: ele sai girando, acerta o saxão na ida e de novo na volta, faz a curva
  e volta para a mão do viking onde ele estiver. Enquanto o machado voa, o viking fica de mãos
  vazias e não pode golpear (`src/thrown-axe.js`, ajustes em `AXE_THROW`).

- **Runa do Trovão:** pedra com uma runa azul. Dá 3 **raios** (até 5). Com **L** o viking
  ergue o machado e lança para a frente um raio azul em zigue-zague; ao acertar o saxão cai
  um raio do céu nele, a tela pisca e treme, e ele perde 2 de vida. O raio para no primeiro
  inimigo ou some depois de uns 760 px. Ícones azuis no canto mostram os raios restantes
  (`src/bolt.js`, ajustes em `BOLT`).

- **Runa do Fogo:** pedra com uma runa vermelha em forma de chama. Dá 3 **ondas de fogo**
  (até 5). Com **U** o viking crava o machado no chão e uma fileira de chamas corre para a
  frente pelo chão (uns 600 px), atravessando **todos** os saxões na linha: cada um leva 1 de
  dano e **pega fogo** por 3 s, perdendo mais 1 de vida a cada segundo, com chamas pelo corpo
  e brasas subindo. Ícones laranja no canto mostram as ondas restantes (`src/fire.js`,
  ajustes em `FIRE`).

Enquanto lança um poder, ele **percorre o corpo inteiro do viking** (`AURA` em
`src/player.js`): no raio, contorno azul brilhante, arcos elétricos estalando pelo corpo e
faíscas; no fogo, contorno laranja, chamas por todo o corpo e brasas. Os dois têm brilho no
chão e somem aos poucos logo depois do golpe.

Os itens flutuam devagar, com sombra e brilho; ao pegar aparece um texto subindo. Posições
em `PLACES` (`src/main.js`), quantidades em `PICKUP` e `FURY` (`src/player.js`).

## Inimigo

O **guerreiro saxão** (`tools/make-enemy.mjs` → `public/assets/saxon.png`) usa o mesmo
corpo e o mesmo andar do viking. Vários saxões patrulham em grupos pelo caminho (`ENEMY_PLACES` em `src/main.js`); quando o viking chega perto, vêm até ele e se espalham levemente em profundidade para cercá-lo a distância de lança sem se sobrepor. O machado tira 1 de 5 de vida (e pode acertar vários de uma vez): eles piscam branco, são empurrados e mostram a barra de vida. Quando os saxões próximos são derrotados, uma nova **onda** de 2 a 3 saxões entra pelas bordas da tela (`spawnWave`).

Ele também ataca: puxa a lança para trás, segura um instante (o aviso) e estoca. Acertá-lo
durante o aviso cancela o golpe. Para desviar, pule ou saia da linha dele. O viking tem 8 de
vida (barra no topo da tela): ao ser atingido, pisca branco, é empurrado e fica 1 s
invencível piscando. Sem vida, aparece "O viking caiu" e Enter recomeça. Ajustes em `LIFE`
(`src/player.js`).
Distâncias e velocidades em `AI` e `HURT` (`src/enemy.js`); alcance do machado em
`AXE_REACH` (`src/main.js`).

## Arte pintada (em andamento)

O visual final vai ser pintado (artista ou IA) numa grade fixa, sem recorte. A
especificação e as guias de desenho estão em `docs/arte/` (`ESPECIFICACAO.md`,
`guia-viking.png`, `guia-saxon.png`). Quando `public/assets/viking-art.png` ou
`saxon-art.png` existirem, o jogo usa a arte nova sozinho (com os movimentos novos
"levou golpe" e queda); senão, usa os bonecos gerados por código. Guias e
`*-art.json`: `node tools/make-guides.mjs`.

## Estrutura

- `tools/pixel-art.mjs` — partes comuns de desenho: formas, contorno, pernas, ciclo do andar, gravar a sprite sheet
- `tools/make-viking.mjs` — desenha o viking e as poses dele
- `tools/make-enemy.mjs` — desenha o saxão
- `tools/make-guides.mjs` — guias de desenho e descrição da arte pintada
- `src/player.js` — movimento (aceleração, frenagem), corrida, pulo, ataque e vida do viking
- `src/enemy.js` — patrulha, perseguição, estocada, golpe recebido e vida do saxão
- `src/white.js` — cópia de uma cor só da sprite sheet (branco no golpe, vermelho na fúria)
- `src/scene.js` — o cenário: céu, montanhas, florestas e chão, com rolagem em camadas
- `src/pickups.js` — carne e runas no chão, e os textos que sobem
- `src/bolt.js` — o raio lançado, o raio que cai do céu e a eletricidade pelo corpo
- `src/fire.js` — a onda de fogo, as chamas em pixel art e o fogo pelo corpo
- `src/thrown-axe.js` — o machado arremessado na fúria, que vai e volta
- `src/main.js` — loop do jogo, câmera, poeira, tremor de tela, acertos, barra de vida e derrota
