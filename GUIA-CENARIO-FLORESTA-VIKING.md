# 🌲 Guia de Criação de Cenário: Floresta Viking 2.5D (Beat 'em Up)

Este documento contém todas as especificações técnicas, camadas, resoluções, perspectiva e prompts prontos para gerar as artes do cenário do jogo.

---

## 🗺️ 1. Estrutura de Camadas em Parallax

Para termos profundidade real e sensação cinematográfica ao andar, o cenário é dividido em **4 camadas horizontais** + **1 folha de objetos soltos (props)**:

| Camada | Nome | Conteúdo Visual | Fator de Parallax | Resolução Recomendada |
| :--- | :--- | :--- | :--- | :--- |
| **Camada 1** | **Céu e Montanhas (Fundo Distante)** | Céu nórdico crepuscular/tempestuoso, silhuetas de montanhas com neve e pinheiros distantes em tons frios/azulado-escuros. | `0.15x` *(quase estático)* | `2048 x 540` px (ou 16:9) |
| **Camada 2** | **Floresta Média (Midground)** | Troncos e copas de pinheiros nórdicos intermediários, névoa suave entre as árvores, pedras rúnicas antigas ao longe. | `0.45x` *(velocidade média)* | `2048 x 540` px (ou 16:9) |
| **Camada 3** | **Pista de Chão 2.5D (Área Caminhável)** ⭐ | **A camada principal do jogo!**<br>- **Limite Superior**: Linha de troncos grossos/barranco que barra o jogador no topo (`Y ≈ 280`).<br>- **Piso**: Terra batida, raízes de pinheiro, musgo, pedras e pequenas manchas de neve.<br>- **Limite Inferior**: Borda do chão próxima à tela (`Y ≈ 460`). | `1.0x` *(velocidade real do jogador)* | `2048 x 540` px (ou `2560 x 720` px) |
| **Camada 4** | **Primeiro Plano (Foreground Overlay)** *(Opcional)* | Galhos de pinheiro e troncos grossos nas bordas superiores/cantos da tela, desfocados ou escuros, dando a impressão de câmera espiando através da mata. | `1.30x` *(passa rápido)* | `2048 x 540` px (com transparência PNG) |

---

## 🪵 2. Folha de Objetos Soltos (Props / Elementos de Interação)

Gere uma ou duas imagens contendo vários objetos distribuídos em um fundo sólido contrastante (como fizemos com os sprites do Eirik), para recortarmos e espalharmos pelo mapa:

- **Tochas e Postes de Madeira Nórdicos**: Suportes de madeira rústicos com fogo aceso (animaremos luz e partículas de fogo no jogo).
- **Pedras Rúnicas (Monólitos)**: Pedras antigas talhadas com símbolos rúnicos brilhantes ou entalhados.
- **Barris e Caixotes de Madeira**: Objetos clássicos de beat 'em up para no futuro quebrarmos com golpes de machado.
- **Troncos Caídos e Tocos Cortados**: Elementos para o chão com musgo e neve acumulada.
- **Escudos e Machados Fincados no Chão**: Restos de batalhas passadas, dando ambientação à floresta.

---

## 📐 3. Especificações Técnicas e Proporções

- **Altura da Janela do Jogo**: O jogo roda em altura padrão de `540px` (mundo `1200 x 540` px ou mais longo).
- **Proporção do Personagem**:
  - Altura do Viking em tela: **52px** (escala calibrada em grade de `128 x 128` px).
  - Posição dos pés no chão: Linha base em `Y = 117` px no canvas do sprite.
- **Faixa de Chão 2.5D (Profundidade)**:
  - `Y Mínimo (Fundo do chão)`: `280px`
  - `Y Máximo (Frente do chão)`: `460px`
  - **Altura total da pista caminhável**: cerca de `180px` no centro-inferior da imagem.
- **Ângulo de Câmera**:
  - Perspectiva **2.5D Beat 'em up** (visão lateral com leve inclinação de 15° a 20° de cima para baixo, similar a *Castle Crashers*, *Golden Axe*, *Streets of Rage 4* e *TMNT: Shredder's Revenge*).
- **Formato**:
  - Imagens em formato PNG ou JPG de alta qualidade, de preferência em proporção `16:9` ou panorâmicas (`21:9`).

---

## 🎨 4. Prompts Prontos para Geradores de IA (Midjourney, DALL-E, Leonardo, Ideogram)

### Prompt 1: Camada 1 — Céu e Montanhas Distantes
```text
2D side-scrolling beat 'em up background layer, deep ancient Viking Nordic forest background, distant snowy mountain peaks, dense pine tree silhouettes in cold dark blue atmosphere, twilight overcast cloudy sky, fantasy Norse mythology, clean side view, seamless horizontal game art style, atmospheric perspective --ar 16:9 --v 6.1
```

### Prompt 2: Camada 2 — Floresta Média com Névoa
```text
2D side-scrolling game midground layer, Scandinavian pine forest with mist between dark tree trunks, mossy rocks and distant ancient stone ruins, cold blue and dark teal mood, side view, video game background layer, clean separation, stylized semi-realistic game art --ar 16:9 --v 6.1
```

### Prompt 3: Camada 3 — Pista de Chão Caminhável 2.5D (Walkable Ground Track)
```text
2D side-scrolling beat 'em up walkable ground track, Viking forest dirt path with gnarled roots, dark mud, moss, patches of snow and small stones, viewed from a slight top-down 2.5D beat 'em up angle, upper border enclosed by thick tree trunks and rocky slope, lower edge clear, clean game art texture, side-scroller floor --ar 16:9 --v 6.1
```

### Prompt 4: Folha de Props e Objetos Nórdicos (Spritesheet de Props)
```text
2D video game asset spritesheet, Viking props collection isolated on solid dark background: wooden torch stands with burning fire, ancient carved Nordic runestones with glowing runes, wooden storage barrels, rustic wooden crates, mossy fallen tree log, round Viking shields stuck in snow, top-tier beat 'em up props, clean edges --ar 16:9 --v 6.1
```

### Prompt 5: Cenário Completo em Imagem Única (Caso prefira gerar tudo junto para fatiarmos)
```text
2D side-scrolling beat 'em up game level environment, deep dark Viking pine forest with 2.5D walkable dirt ground in the lower half, distant misty snowy mountains in the upper background, ancient runestones, wooden torches with fire, cold atmospheric lighting, Norse mythology aesthetic, wide panoramic view --ar 16:9 --v 6.1
```

---

## 🚀 5. Próximos Passos ao Chegar em Casa

1. Gere as imagens usando os prompts acima (ou variações no seu estilo preferido).
2. Pode gerar em **camadas separadas** ou em uma **imagem panorâmica completa única**.
3. Envie as imagens aqui na conversa.
4. O assistente irá:
   - Extrair e recortar as camadas transparentes;
   - Configurar o sistema de **Parallax contínuo** no Phaser 3;
   - Alinhar a pista de colisão 2.5D exatamente com os pés do Viking;
   - Distribuir os props no cenário com ordenação de profundidade (*Y-sorting*).
