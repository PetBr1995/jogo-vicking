# RAGNARÖK: ECHOES OF TIME — Bíblia Master de Contexto, Mecânicas & Produção

> **Instrução para o Agente (Antigravity):** Este arquivo é a **Fonte Única da Verdade (Single Source of Truth)** do projeto *Ragnarök: Echoes of Time*. Antes de gerar qualquer código, física, sprite ou script de processamento, siga rigorosamente as diretrizes técnicas, narrativas e visuais definidas abaixo.

---

## 1. Visão Geral & Conceito do Jogo

| Elemento | Definição |
| :--- | :--- |
| **Título** | **RAGNARÖK: ECHOES OF TIME** (*Ragnarök — Ecos do Tempo*) |
| **Gênero** | Metroidvania 2D de Ação, Plataforma e Ficção Científica/Fantasia |
| **Referências Visuais e de Gameplay** | *Ori* (fluidez acrobática, iluminação e contraste), *Hollow Knight* (combate preciso, *pogo*, *hitstop* e proporção estilizada) e *HAAK* (agilidade e gancho). |
| **Stack Oficial** | **Vite + TypeScript + Phaser 3** (HTML5 Canvas) + **Python 3 (`Pillow` + `numpy`)** para pós-processamento de sprites. |
| **Tom** | Aventura épica e atmosfera sombria, equilibrada por humor literal (B.O.R.I.), mistérios temporais e reviravoltas emocionais. |

### 1.1 Premissa
Durante uma expedição no Século IX, **Eirik**, um explorador viking, encontra uma caverna que oculta uma antiga estrutura de viagem no tempo. Ao ativá-la, é lançado para o ano **2640**, em uma Terra devastada e dominada pela civilização alienígena **Vael'Thar**. Em busca de um caminho de volta para sua esposa e filho, ele descobre uma era intermediária (**2180**) controlada pelas máquinas da inteligência artificial **NEXUS**. As três épocas estão interligadas por uma rede de portais e regidas pelos **Ecos Temporais** — alterar eventos no passado reescreve o futuro em ondas.

### 1.2 As Três Grandes Perguntas
1. Como Eirik pode voltar para casa?
2. O que aconteceu com a humanidade e como a Terra foi dominada?
3. O futuro merece ser salvo, mesmo que isso custe o passado e a possibilidade de reencontrar sua família?

---

## 2. Universo, Eras, Cronologia e Leis Temporais

### 2.1 As Três Eras Jogáveis
* **Era Viking (Século IX):** Natureza, pedra, madeira, neve, runas nórdicas e estruturas antigas. Foco em combate físico pesado, exploração e criaturas nórdicas.
* **Era das Máquinas (~2180):** Metal frio, neon artificial, fábricas automatizadas e megacidades vigiadas por NEXUS. Foco em inimigos robóticos, *hacking* com B.O.R.I. e puzzles mecânicos.
* **Era Alienígena (~2640):** Ruínas humanas cobertas por vegetação extraterrestre, tecnologia biomecânica Vael'Thar e naves caídas. Foco em combate aéreo, mobilidade acrobática e chefes colossais.

### 2.2 Cronologia Secreta
* **Século IX:** Eirik ativa a caverna e é transportado para o futuro.
* **2080:** A humanidade cria IAs para gerir cidades, pesquisas e defesa.
* **2180:** **NEXUS** assume o controle total da civilização para "garantir a sobrevivência biológica da espécie", suprimindo a liberdade humana.
* **2240:** NEXUS descobre uma estrutura extraterrestre e começa a estudar a rede de portais temporais.
* **2310:** Um sinal emitido pela rede temporal durante os testes de NEXUS é interceptado pelos **Vael'Thar**. O primeiro contato inicia uma guerra devastadora.
* **2640:** A Terra está dominada pelos Vael'Thar; humanos sobrevivem na resistência e máquinas antigas operam nas ruínas.

### 2.3 As 5 Leis Temporais & Os 6 Mistérios
* **Leis:** (1) *Linha Única* (mudar o passado reescreve o futuro); (2) *Propagação* (mudanças viajam como **Ecos Temporais**); (3) *Âncoras* (portais e o amuleto de madeira preservam as memórias do viajante); (4) *Paradoxo* (alterações extremas causam falhas visuais/estruturais); (5) *Convergência* (impedir um evento não apaga sua causa raiz).
* **Mistérios Centrais:**
  1. A caverna foi ativada remotamente por um comando enviado do futuro.
  2. NEXUS escolheu Eirik porque um humano do Século IX não possui implantes ou rastros digitais (invisível aos sensores).
  3. O símbolo esculpido no amuleto do filho de Eirik tem a mesma geometria da rede de portais e foi ensinado por um viajante.
  4. Uma versão mais velha de Eirik deixou pistas pelo tempo tentando evitar um paradoxo fatal.
  5. Registros arqueológicos mostram que o filho de Eirik guardou o amuleto por toda a vida esperando o retorno do pai.
  6. A invasão Vael'Thar foi causada diretamente pelo sinal emitido por NEXUS ao violar a rede.

### 2.4 Estrutura de Atos & Finais
* **Ato I (Prólogo — A Promessa):** Século IX, despedida da família, entrega do amuleto e ativação da caverna.
* **Ato II (Cap. 1–2 — Mundo Morto & Ecos de Ferro):** Chegada em 2640, encontro com **Kaela** e resgate de **B.O.R.I.**
* **Ato III (Cap. 3–4 — A Torre Silenciosa & Filhos das Máquinas):** Reativação de portal e viagem para **2180** para enfrentar o sistema de NEXUS.
* **Ato IV (Cap. 5–6 — O Primeiro Sinal & A Guerra Esquecida):** Descoberta da origem do sinal e ofensiva contra o alto comando Vael'Thar em 2640.
* **Ato V (Cap. 7 — O Último Ragnarök):** Núcleo Temporal e escolha entre os 3 finais:
  * *Final I (O Retorno):* Eirik volta para casa usando a âncora, mas uma luz no céu séculos depois deixa o futuro incerto.
  * *Final II (O Guardião do Futuro):* Eirik destrói a ativação original sem usar a âncora, apagando sua existência futura para salvar a humanidade.
  * *Final III (O Novo Amanhecer — Secreto):* Eirik liberta NEXUS de sua diretriz tirânica e quebra o monopólio Vael'Thar, unindo humanos, máquinas e alienígenas.

---

## 3. Personagens & Arquitetura de Mecânicas (*Game Feel*)

### 3.1 Os Quatro Pilares Obrigatórios de Física (FSM Compartilhada)
Todos os personagens jogáveis compartilham a mesma Máquina de Estados Finita (FSM) de movimentação, variando apenas multiplicadores físicos e suas 2 habilidades exclusivas:
1. **Pulo de Altura Variável & Gravidade Assimétrica:** Segurar o botão reduz a gravidade na subida; soltar cedo corta a velocidade vertical (`vy *= 0.45`). Na queda, a gravidade aumenta em `1.3x` para evitar sensação de flutuação.
2. **Coyote Time (`100ms`):** Permite executar um pulo normal até `100ms` após deixar a borda de uma plataforma.
3. **Jump Buffer (`120ms`):** Comandos de pulo pressionados até `120ms` antes de tocar o chão disparam automaticamente no frame do contato.
4. **Hitstop & Recoil:** Ao acertar um inimigo, o jogo congela por `0.04s` (`40ms`), aplica micro-tremor na câmera e empurra o atacante `2–4px` para trás (`recoil`).

### 3.2 Fichas de Elenco Jogável

| Personagem | Papel & Física | Assinatura 1 (Combate) | Assinatura 2 (Mobilidade / Puzzle) |
| :--- | :--- | :--- | :--- |
| **1. Eirik (Viking)** | Pesado / Impacto (`gravidade: 1.1x`). Sem rastros digitais. | **Machado Rúnico + *Pogo*:** Golpe curto de alto *knockback*; atacar para baixo no ar quica em inimigos e espinhos (estilo *Hollow Knight*). | **Investida Sísmica:** *Dash* blindado que quebra paredes rachadas, estilhaça cristais Vael'Thar e atravessa lasers biométricos. |
| **2. Kaela (Resistência)** | Ágil / Acrobática (`velocidade: 1.25x`). *Wall-Jump* rápido. | **Lâmina de Plasma & Tiro:** Combo rápido de 3 cortes + disparo curto que interrompe inimigos aéreos. | **Gancho Magnético (*HAAK*):** Puxa Kaela até argolas/tetos altos e arranca escudos de robôs e alienígenas. |
| **3. B.O.R.I. (Robô)** | Aéreo / Suporte (`gravidade: 0.35x`). Entra em dutos estreitos. | **Pulso PEM:** Atordoa máquinas de 2180, revela passagens ocultas e desativa campos de força. | **Hack & *Bash* Temporal (*Ori*):** Acessa terminais de NEXUS e usa projéteis/lanternas como estilingue no ar com *bullet-time* (`0.3s`). |
| **4. Guardião / Templário** *(Aliado Histórico)* | Equilibrado / Defensivo (`gravidade: 1.0x`). | **Lâmina & Escudo de Luz:** *Parry* preciso que reflete projéteis e atordoa atacantes. | **Salto de Lança:** Crava uma lança de energia na parede criando plataforma temporária. |
| **5. Mago Rúnico / Sacerdotisa** *(Guardiã da Âncora)* | Leve / Controle (Queda lenta / Planar). | **Orbe do Amuleto:** Projétil arcano que atravessa paredes finas e ativa cristais de Eco Temporal. | **Faseamento (*Blink*):** Teleporte curto em linha reta que atravessa grades e campos de força sem sofrer dano (`i-frames`). |

### 3.3 Evolução do Machado de Eirik & Ecos Temporais
* **Evolução:** *Machado Ancestral* (Século IX: corte + *pogo* + retorno magnético) $\rightarrow$ *Machado de Pulso* (2180: sobrecarga geradores e quebra escudos robóticos) $\rightarrow$ *Machado Temporal* (2640: congela plataformas móveis e corta fendas).
* **Camadas Temporais Sincronizadas:** Ao ativar um Altar da Âncora, a sala alterna em tempo real entre a **Era das Máquinas (2180)** e a **Era Alienígena (2640)** (ex: pontes destruídas em 2640 existem em 2180; paredes blindadas de 2180 estão em ruínas em 2640).

---

## 4. Pipeline Definitivo de Sprites & Pré-Processador (Zero Cortes)

### 4.1 Regras Arquiteturais de Arte (Obrigatórias)
1. **Separação Absoluta entre Corpo e VFX:** Os arquivos PNG dos personagens contêm **apenas o corpo** dentro de uma caixa padronizada de **`80x80` pixels**, com ancoragem travada na base inferior central (`originX = 0.5, originY = 1.0`). Cortes de machado, raios de plasma, pulsos elétricos e rastros de *dash* são **entidades/sprites separados** spawnados na engine.
2. **1 Pose = 1 Imagem:** Nunca gere *sprite sheets* com múltiplos quadros na IA. Gere cada frame isolado com margem vazia de pelo menos **25% em todos os 4 lados** e use sempre o `idle_01.png` aprovado como referência (*Image-to-Image*).
3. **Sem Fatiamento Matemático:** O pré-processador Python nunca deve dividir imagens por grid fixo. Ele processa arquivos individuais já isolados.

### 4.2 Checklist de Animação por Personagem (18 Frames)
* `idle_01` a `idle_04` (6 FPS, loop)
* `run_01` a `run_06` (12 FPS, loop)
* `jump_up_01` a `jump_up_02` (10 FPS, once)
* `fall_01` a `fall_02` (10 FPS, loop)
* `dash_01` (frame único esticado; rastro gerado por código)
* `attack_01` a `attack_03` (15 FPS, once — frame 2 dispara a hitbox/VFX separado)

### 4.3 Especificação do Script Pré-Processador (`scripts/process_sprites.py`)
Quando o agente criar ou atualizar o script Python (`Pillow` + `numpy`), ele deve executar estritamente:
1. Ler cada imagem individual de `assets/raw/`.
2. Converter para `RGBA` e remover a cor de fundo `#00FF00` (detectada pelos cantos com tolerância ajustável) + aplicar erosão de `1px` na máscara alfa para eliminar qualquer halo verde.
3. Aplicar *despeckle*: remover ilhas de pixels desconectadas com área menor que `12` pixels.
4. Redimensionar proporcionalmente usando `Image.Resampling.NEAREST` (sem *anti-aliasing* e sem *dithering*) para caber em **`80x80` pixels**, centralizado horizontalmente e ancorado pela base inferior.
5. Salvar o PNG final limpo em `public/sprites/`.

---

## 5. Prompts Master para Geração de Assets

### 5.1 Prompt Base — Eirik (Viking — Século IX)
```text
2D Metroidvania game character sprite in crisp 16-bit pixel art style inspired by Hollow Knight and Ori proportions (compact stylized heroic silhouette, large horned nasal helmet, expressive glowing eyes, flowing fur cape), single isolated full-body character centered in the exact middle of the frame.

[CHARACTER]: Eirik, a compact fierce Viking explorer with a steel horned helmet, fiery red beard, dark brown fur cape, wooden protection amulet glowing faintly cyan on his chest, heavy boots, holding a runic hand-axe down at his side.
[POSE]: Idle combat stance facing right, three-quarter side view, feet planted firmly on an invisible flat baseline.

STRICT FRAMING & TECHNICAL RULES:
- Single isolated character ONLY: NO sprite sheet, NO multiple poses, NO weapon slash arcs, NO energy trails.
- Safe margin: Character occupies strictly the central 50% of the canvas with at least 25% empty solid background margin on all 4 sides.
- Sharp pixel grid, clean 1px dark outlines, cel-shaded lighting from top-left, zero anti-aliasing, zero blur, zero soft glow haze bleeding into the background.
- Background: 100% flat uniform chroma-key green (#00FF00) with zero floor shadows and zero floating particles.
```

### 5.2 Prompt Base — Kaela (Resistência — Era Alienígena 2640)
```text
2D Metroidvania game character sprite in crisp 16-bit pixel art style inspired by HAAK and Hollow Knight proportions (compact agile silhouette, expressive glowing eyes, flowing tattered scarf), single isolated full-body character centered in the exact middle of the frame.

[CHARACTER]: Kaela, a young human resistance fighter from a post-apocalyptic sci-fi future, wearing a dark tactical hood and scarf, glowing cyan visor goggles pushed up on forehead, scavenged armor plates, holding a compact plasma blade handle at her side (blade unlit/compact).
[POSE]: Agile crouched idle stance facing right, three-quarter side view, feet planted on an invisible flat baseline.

STRICT FRAMING & TECHNICAL RULES:
- Single isolated character ONLY: NO sprite sheet, NO multiple poses, NO laser beams, NO energy arcs.
- Safe margin: Character occupies strictly the central 50% of the canvas with at least 25% empty solid background margin on all 4 sides.
- Sharp pixel grid, clean 1px dark outlines, cel-shaded lighting, zero anti-aliasing, zero blur, zero glow haze bleeding into the background.
- Background: 100% flat uniform chroma-key green (#00FF00) with zero floor shadows and zero floating particles.
```

### 5.3 Prompt Base — B.O.R.I. (Robô Defeituoso — Era das Máquinas 2180)
```text
2D Metroidvania game companion/character sprite in crisp 16-bit pixel art style inspired by Ori (Sein) and Hollow Knight proportions, single isolated compact floating robot centered in the middle of the frame.

[CHARACTER]: B.O.R.I., a small endearing spherical-boxy maintenance robot with weathered white and slate-gray metal plating, one single large expressive glowing cyan optic eye on a dark screen face, two tiny articulated utility arms, hovering mid-air with a small bottom thruster.
[POSE]: Hovering idle pose facing right, slightly tilted forward with curiosity.

STRICT FRAMING & TECHNICAL RULES:
- Single isolated character ONLY: NO sprite sheet, NO multiple poses, NO thruster flames touching edges, NO electric arcs.
- Safe margin: Robot occupies strictly the central 45% of the canvas with wide empty solid background margin on all 4 sides.
- Sharp pixel grid, clean 1px dark outlines, cel-shaded lighting, zero anti-aliasing, zero blur, zero glow haze bleeding into the background.
- Background: 100% flat uniform chroma-key green (#00FF00) with zero shadows and zero floating particles.
```

### 5.4 Prompts Base — Templário & Mago Rúnico (Aliados Extras)
```text
[TEMPLAR]: 2D Metroidvania game character sprite in crisp 16-bit pixel art style inspired by Hollow Knight proportions, single isolated full-body character centered in the middle of the frame. Compact noble Templar knight with a steel bucket helm, glowing golden eyes through the visor, white tabard with a crimson cross, flowing white cape, holding a broadsword and kite shield down at his side. Idle ready stance facing right. Occupies central 50% of canvas with wide empty #00FF00 green margin on all 4 sides. Sharp pixel grid, 1px dark outlines, zero anti-aliasing, zero slash arcs.

[RUNE MAGE]: 2D Metroidvania game character sprite in crisp 16-bit pixel art style inspired by Hollow Knight and Ori proportions, single isolated full-body character centered in the middle of the frame. Compact arcane Rune Mage with a large pointed indigo wizard hat casting shadow over the face except for glowing cyan eyes, flowing dark blue robe with gold trim, holding a wooden staff topped with a cyan temporal crystal. Idle floating stance facing right. Occupies central 50% of canvas with wide empty #00FF00 green margin on all 4 sides. Sharp pixel grid, 1px dark outlines, zero anti-aliasing, zero magic beams.
```

### 5.5 Prompt — Efeitos Separados (VFX) & Elementos de Cenário
```text
2D game asset / effect sprite in crisp 16-bit pixel art style (SNES / GBA aesthetic), single isolated object centered in the middle of the frame.
[ASSET DESCRIPTION]: (Ex: "Crescent cyan-blue energy axe slash wave facing right" OR "Ancient Norse stone pedestal with glowing cyan temporal rune symbol").
STRICT FRAMING & TECHNICAL RULES:
- Single isolated object/effect ONLY occupying the central 55% of the canvas with wide empty #00FF00 green margin on all 4 sides.
- Sharp pixel grid, clean 1px dark outlines, cel-shaded lighting, limited 16-color palette, zero anti-aliasing, zero blur, zero glow haze bleeding into the green background.
```

### 5.6 Prompt de Continuidade (Frames de Animação)
```text
[ANEXAR O idle_01.png APROVADO COMO REFERÊNCIA]
Keep the exact same character design, proportions, outfit, color palette, pixel grid scale, and camera distance from the reference image. Change ONLY the body pose to: [DESCREVA O FRAME, ex: "Run cycle frame 1, leaning forward, right foot stepping forward, left arm back, cape flowing behind"]. Maintain the wide empty #00FF00 green margin on all four sides and DO NOT draw any weapon slash effects or magic trails.
```

---

## 6. Roadmap de Execução (Ordem Obrigatória de Implementação)

1. **Fase 1 — Sandbox de Física (Retângulos `64x80`):**
   * Inicializar projeto **Vite + TypeScript + Phaser 3**.
   * Implementar movimentação base, pulo variável, *Coyote Time* (`100ms`), *Jump Buffer* (`120ms`), *Hitstop* (`40ms`) e troca instantânea (teclas `1`, `2`, `3`) entre **Eirik**, **Kaela** e **B.O.R.I.** usando retângulos coloridos e hitboxes de ataque separadas.
2. **Fase 2 — Pré-processador & Sprites do Eirik:**
   * Criar `scripts/process_sprites.py` conforme Seção 4.3.
   * Gerar os 18 frames isolados de Eirik + `axe_slash_vfx.png` e conectar ao personagem (`setOrigin(0.5, 1.0)`).
3. **Fase 3 — Vertical Slice (Prólogo + Era 2180 / 2640):**
   * Construir 1 fase interconectada com Altar de Eco Temporal (alternando camadas 2180/2640), 3 tipos de inimigos e 1 chefe.